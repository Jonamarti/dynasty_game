/**
 * The tile world: terrain, biomes, walkability and water.
 *
 * Stored as parallel typed arrays rather than an array of Cell objects. Terrain
 * is read in the innermost loops (movement, pathing, foraging yield) and this
 * layout keeps those reads cache-friendly and makes a future WASM port a
 * memcpy rather than a rewrite.
 */
import { SimplexNoise } from './Noise.ts';
import { Soil } from './Soil.ts';
import { grassCapacity } from './Grass.ts';
import type { RNG } from './RNG.ts';
import type { WorldConfig } from './Config.ts';
import type { LocalGeographySource } from '../world/LocalGeography.ts';
import { classifyTerrain, classifyGeographicTerrain } from '../world/Habitat.ts';

export const BIOMES = ['water', 'beach', 'grass', 'forest', 'hills', 'rock', 'river'] as const;
export type Biome = (typeof BIOMES)[number];

export const BIOME_ID: Record<Biome, number> = {
  water: 0, beach: 1, grass: 2, forest: 3, hills: 4, rock: 5, river: 6,
};

/** Half-width of the box a tile's height is compared with, in tiles. */
export const PROMINENCE_RADIUS = 5;

export class World {
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  readonly chunksX: number;
  readonly chunksY: number;

  /** Per-tile arrays, indexed by `y * width + x`. */
  readonly elevation: Float32Array;
  /**
   * What has been dug out or piled up, added to `elevation` by `heightAt`
   * — M15 phase 25. All zero until phase 26 writes it; kept apart from
   * `elevation` so the generated land stays the thing the biomes were
   * classified from, and so a world nobody has dug is bit-identical.
   */
  readonly offset: Float32Array;
  /**
   * Counts every change to `offset`. The renderer bakes the terrain once and
   * redoes it when this moves, so a spade shows without the draw loop having
   * to compare two arrays of sixteen thousand tiles a frame.
   */
  earthVersion = 0;
  /**
   * How far each tile stands above the mean of the `PROMINENCE_RADIUS` box
   * round it, in elevation units (zero in a hollow). What `sightBonusAt` reads.
   * Computed once here and redone for a patch by `refreshProminence` when a
   * spade changes the ground (phase 26).
   */
  readonly prominence: Float32Array;
  readonly moisture: Float32Array;
  readonly fertility: Float32Array;
  /**
   * The ground as something that can be used up — M8.2.
   *
   * Separate from `fertility`, which stays exactly what it was: innate, never
   * written, and the thing berry bushes have grown out of since M2. Pointing
   * that array at a live value would have moved every bush in every saved seed,
   * and `determinism.test.ts` compares two runs of the *same* build, so nothing
   * would have caught it. See `Soil.ts`.
   */
  soil!: Soil;
  readonly biome: Uint8Array;
  readonly walkable: Uint8Array;
  /** Ground walkability below house-wall overlays. */
  readonly baseWalkable: Uint8Array;
  /** Transient wall mask reconstructed from completed buildings after load. */
  readonly houseWallBlocks: Uint8Array;

  /** Optional geographic water provenance. Omitted in classic play to keep its checkpoint shape stable. */
  declare readonly waterKind?: Uint8Array;
  /** Per-tile surface for rivers/lakes; salt water continues to use waterLevel. */
  declare readonly waterSurface?: Float32Array;

  /**
   * The sward, 0-1 per tile — M15 phase 23a. Read by herds (23c), the scythe
   * (23b) and the renderer; written by `advanceGrass` once a day and by
   * `graze`. No `RNG`: it starts at its capacity and is a pure function after.
   */
  readonly grass: Float32Array;
  /** The tallest the sward stands on each tile; static, see `Grass.ts`. */
  readonly grassCap: Float32Array;

  /**
   * Connected-component id for every walkable tile; -1 for water and rock.
   *
   * This exists because of a whole-band extinction that took a while to
   * understand. On some seeds a camp landed on a small islet or a pinched
   * headland: people could see berry bushes across the water, walked at them,
   * hit the shoreline and stopped dead. Greedy steering cannot route around an
   * obstacle it cannot see past, so they starved with the map full of food.
   *
   * Knowing which landmass a tile belongs to fixes the whole class of problem
   * at once — camps are only founded on land big enough to live on, and nobody
   * ever sets out for something they cannot walk to.
   */
  readonly region: Int32Array;
  /** Connected components that include walkable ground and swim-depth water. */
  readonly swimRegion: Int32Array;
  readonly swimRegionSizes = new Map<number, number>();
  /** Tile count per region id, so the biggest landmass is easy to find. */
  readonly regionSizes = new Map<number, number>();
  /** The next id `setWalkable` hands out; ids are never reused, so a stale one cannot alias. */
  private nextRegionId = 0;
  private swimRegionsDirty = true;
  private swimRegionEarthVersion = -1;

  /**
   * Every walkable tile touching water. Precomputed once because "where can I
   * drink?" is asked constantly, and scanning a box of tiles around each thirsty
   * person was measurably the most expensive thing in the think tick.
   */
  readonly shoreTiles: { x: number; y: number }[] = [];

  constructor(private readonly config: WorldConfig, rng: RNG, localGeography?: LocalGeographySource) {
    this.width = config.width;
    this.height = config.height;
    this.chunkSize = config.chunkSize;
    this.chunksX = Math.ceil(this.width / this.chunkSize);
    this.chunksY = Math.ceil(this.height / this.chunkSize);

    const n = this.width * this.height;
    this.elevation = new Float32Array(n);
    this.offset = new Float32Array(n);
    this.prominence = new Float32Array(n);
    this.moisture = new Float32Array(n);
    this.fertility = new Float32Array(n);
    this.biome = new Uint8Array(n);
    this.walkable = new Uint8Array(n);
    this.baseWalkable = new Uint8Array(n);
    this.houseWallBlocks = new Uint8Array(n);
    this.grass = new Float32Array(n);
    this.grassCap = new Float32Array(n);
    this.region = new Int32Array(n).fill(-1);
    this.swimRegion = new Int32Array(n).fill(-1);

    if (localGeography) this.generateFromGeography(localGeography);
    else this.generate(rng);
    this.baseWalkable.set(this.walkable);
    this.findShores();
    this.findRegions();
    this.findSwimRegions();
    this.refreshProminence(0, 0, this.width - 1, this.height - 1);
    for (let i = 0; i < n; i++) {
      this.grassCap[i] = grassCapacity(this, i);
      // A world is founded at the height its ground can hold: the first
      // summer is not a year of bare earth.
      this.grass[i] = this.grassCap[i]! * 0.8;
    }
  }

  /**
   * The height of a tile in elevation units — `elevation` plus whatever has
   * been dug or piled (phase 26). The one answer to "how high is it?", so that
   * the slope cost, the sight bonus and the shading all agree after a spade
   * has been at the ground.
   */
  heightAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    const i = this.index(Math.floor(x), Math.floor(y));
    return this.elevation[i]! + this.offset[i]!;
  }

  /**
   * Height at a point between tile centres, interpolated. A step is a fraction
   * of a tile, and the slope it climbs is only felt at the right size if the
   * ground under it rises smoothly: sampling whole tiles would charge the one
   * step that crosses a boundary the entire tile's rise and the others
   * nothing, which averages to a fraction of the true cost.
   */
  heightSmooth(x: number, y: number): number {
    const fx = Math.max(0, Math.min(this.width - 1.001, x - 0.5));
    const fy = Math.max(0, Math.min(this.height - 1.001, y - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const i = y0 * this.width + x0;
    const e = this.elevation;
    const o = this.offset;
    const top = (e[i]! + o[i]!) * (1 - tx) + (e[i + 1]! + o[i + 1]!) * tx;
    const j = i + this.width;
    const bottom = (e[j]! + o[j]!) * (1 - tx) + (e[j + 1]! + o[j + 1]!) * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /**
   * Redoes `prominence` for the tiles in a rectangle, inclusive. A box mean of
   * the full height field, so a change to one tile also moves everybody within
   * `PROMINENCE_RADIUS` of it: a caller that digs passes the dug rectangle
   * grown by that radius. One pass is a box sum per tile, the cost of
   * generation and no more.
   */
  refreshProminence(x0: number, y0: number, x1: number, y1: number): void {
    const R = PROMINENCE_RADIUS;
    for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.width - 1, x1); x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -R; dy <= R; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= this.height) continue;
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= this.width) continue;
            const j = yy * this.width + xx;
            sum += this.elevation[j]! + this.offset[j]!;
            n++;
          }
        }
        const i = y * this.width + x;
        this.prominence[i] = Math.max(0, this.elevation[i]! + this.offset[i]! - sum / n);
      }
    }
  }

  /**
   * Tiles of extra sight from standing here, M15 phase 25c: the part of the
   * land above its surroundings, in metres, times `heightSight`. Zero for any
   * tile that is not above its neighbourhood, so a meadow sees what it did.
   */
  sightBonusAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.prominence[this.index(Math.floor(x), Math.floor(y))]! *
      this.config.metresPerUnit * this.config.heightSight;
  }

  /** Metres per elevation unit, from the config: what the slope terms scale by. */
  get metresPerUnit(): number { return this.config.metresPerUnit; }

  /** The slope cost per metre of climb per tile; see `WorldConfig.slopeCost`. */
  get slopeCost(): number { return this.config.slopeCost; }

  /**
   * How much a step from one point to another is slowed or helped by the
   * ground, as a multiple of the flat speed (M15 phase 25b). Uphill is
   * `1 / (1 + slopeCost × g)` for a climb of `g` metres per tile; downhill is a
   * little quicker, never more than a quarter; and never below 0.4, which is
   * what keeps a slowed step above the stuck detector's `PROGRESS_THRESHOLD`
   * (0.25 of the speed asked for) so a hill cannot read as being stuck.
   */
  stepFactor(x: number, y: number, toX: number, toY: number): number {
    const k = this.config.slopeCost;
    if (k === 0) return 1;
    const run = Math.hypot(toX - x, toY - y);
    if (run < 1e-6) return 1;
    const g = (this.heightSmooth(toX, toY) - this.heightSmooth(x, y)) * this.config.metresPerUnit / run;
    if (g >= 0) return Math.max(0.4, 1 / (1 + k * g));
    return Math.min(1.25, 1 - k * g * 0.3);
  }

  /** The elevation of the water's surface: ground dug below it, beside water, floods (26d). */
  get waterLevel(): number {
    return this.config.waterLevel;
  }

  /** Wet-body duration after entering the shallows, in simulation ticks. */
  get wetTicks(): number { return this.config.wetTicks; }

  /** Shallows cutoff in elevation units; exposed for depth rendering. */
  get wadeDepth(): number { return this.config.wadeDepth; }

  /** Swimming cutoff in elevation units; exposed for depth rendering. */
  get swimDepth(): number { return this.config.swimDepth; }

  /** Cold need that kills a swimmer; exposed for the simulation's drown rule. */
  get drownAt(): number { return this.config.drownAt; }

  /** Heightfield below the water surface, in elevation units; off-map is zero. */
  depthAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    const i = this.index(Math.floor(x), Math.floor(y));
    const surface = this.waterKind?.[i] === 1 && this.waterSurface
      ? this.waterSurface[i]!
      : this.config.waterLevel;
    return Math.max(0, surface - this.heightAt(x, y));
  }

  /** Water shallow enough to walk through; equality belongs to swimming. */
  isShallow(x: number, y: number): boolean {
    return this.isWater(x, y) && this.depthAt(x, y) < this.config.wadeDepth;
  }

  /** Water tiles in the swim band; deeper water remains a future boat route. */
  isSwimTile(x: number, y: number): boolean {
    const depth = this.depthAt(x, y);
    return this.isWater(x, y) && depth >= this.config.wadeDepth && depth < this.config.swimDepth;
  }

  /** Walkable shallow-water tile, used by wading movement and fishing. */
  isWadeTile(x: number, y: number): boolean {
    return this.isShallow(x, y) && this.isWalkable(x, y);
  }

  /** How deep a hole must be, in elevation units, before it stops being ground you can walk on. */
  get pitDepth(): number {
    return this.config.pitDepth;
  }

  /** Metres above the sea at a tile (negative below it). */
  metresAt(x: number, y: number): number {
    return (this.heightAt(x, y) - this.config.waterLevel) * this.config.metresPerUnit;
  }

  /** The sward at a tile, 0 off the map. */
  grassAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.grass[this.index(Math.floor(x), Math.floor(y))]!;
  }

  /**
   * The nearest walkable tile within `radius` of (x, y) whose sward stands at
   * least `min` high, on the same landmass as the asker. A scan of a box of
   * tiles, not of an entity array: grass has no entities, and the box is
   * bounded by `radius`.
   */
  findTallGrass(x: number, y: number, radius: number, min: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let ty = Math.max(0, cy - radius); ty <= Math.min(this.height - 1, cy + radius); ty++) {
      for (let tx = Math.max(0, cx - radius); tx <= Math.min(this.width - 1, cx + radius); tx++) {
        const i = ty * this.width + tx;
        if (this.grass[i]! < min || this.walkable[i] !== 1) continue;
        const d = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy);
        if (d >= bestD || d > radius * radius) continue;
        if (!this.sameRegion(x, y, tx, ty)) continue;
        bestD = d;
        best = { x: tx, y: ty };
      }
    }
    return best;
  }

  /**
   * Takes `amount` of height off a tile and returns what was actually there to
   * take. Grazing, trampling and the scythe all go through here so the floor is
   * kept in one place.
   */
  graze(x: number, y: number, amount: number): number {
    if (!this.inBounds(x, y)) return 0;
    const i = this.index(Math.floor(x), Math.floor(y));
    const here = this.grass[i]!;
    const taken = Math.max(0, Math.min(amount, here));
    this.grass[i] = here - taken;
    return taken;
  }

  /** Flood-fills walkable tiles into connected landmasses. Four-connected. */
  private findRegions(): void {
    let nextId = 0;
    const queue: number[] = [];

    for (let start = 0; start < this.region.length; start++) {
      if (this.walkable[start] !== 1 || this.region[start] !== -1) continue;

      const id = nextId++;
      let size = 0;
      queue.length = 0;
      queue.push(start);
      this.region[start] = id;

      while (queue.length > 0) {
        const index = queue.pop()!;
        size++;
        const x = index % this.width;
        const y = (index - x) / this.width;

        if (x > 0) this.visit(index - 1, id, queue);
        if (x < this.width - 1) this.visit(index + 1, id, queue);
        if (y > 0) this.visit(index - this.width, id, queue);
        if (y < this.height - 1) this.visit(index + this.width, id, queue);
      }
      this.regionSizes.set(id, size);
    }
    this.nextRegionId = nextId;
  }

  /**
   * Ground walkability changes are recorded separately from derived house
   * walls, then the effective tile and its region labels are repaired in one
   * place. Digging updates the ground beneath a wall without opening it.
   *
   * **Blocking** a tile may cut its landmass in two: flood outward from each
   * walkable neighbour, one step per front in turn, merging fronts that touch.
   * A front that runs out of tiles while another is still going has found a
   * piece that is cut off, and that piece is relabelled with a fresh id. The
   * cost is the size of the smaller pieces, not of the island. **Unblocking**
   * joins whatever landmasses the tile touches into the largest of them,
   * relabelling the smaller ones. Ids are never reused and nothing iterates by
   * id after the founding spawn, so the labels a repair hands out cannot reach
   * a draw.
   */
  setWalkable(x: number, y: number, walkable: boolean): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.baseWalkable[i] = walkable ? 1 : 0;
    const now = this.baseWalkable[i] === 1 && this.houseWallBlocks[i] !== 1 ? 1 : 0;
    this.applyWalkability(i, now);
  }

  /** Toggle a house wall without overwriting terrain or earthwork walkability. */
  setHouseWall(x: number, y: number, blocked: boolean): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.houseWallBlocks[i] = blocked ? 1 : 0;
    const now = this.baseWalkable[i] === 1 && this.houseWallBlocks[i] !== 1 ? 1 : 0;
    this.applyWalkability(i, now);
  }

  private applyWalkability(i: number, now: number): void {
    if (this.walkable[i] === now) return;
    this.walkable[i] = now;
    this.swimRegionsDirty = true;
    this.boatVersion = -1;
    this.logboatVersion = -1;
    if (now === 1) this.joinRegions(i); else this.splitRegions(i);
  }

  isHouseWallBlocked(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.houseWallBlocks[this.index(x, y)] === 1;
  }

  /** The four walkable neighbours of a tile, as indices. */
  private walkableNeighbours(i: number): number[] {
    const out: number[] = [];
    const x = i % this.width;
    if (x > 0 && this.walkable[i - 1] === 1) out.push(i - 1);
    if (x < this.width - 1 && this.walkable[i + 1] === 1) out.push(i + 1);
    if (i >= this.width && this.walkable[i - this.width] === 1) out.push(i - this.width);
    if (i + this.width < this.walkable.length && this.walkable[i + this.width] === 1) out.push(i + this.width);
    return out;
  }

  private joinRegions(i: number): void {
    const around = this.walkableNeighbours(i);
    if (around.length === 0) {
      const id = this.nextRegionId++;
      this.region[i] = id;
      this.regionSizes.set(id, 1);
      return;
    }
    let target = this.region[around[0]!]!;
    for (const n of around) {
      const r = this.region[n]!;
      if ((this.regionSizes.get(r) ?? 0) > (this.regionSizes.get(target) ?? 0)) target = r;
    }
    this.region[i] = target;
    let size = (this.regionSizes.get(target) ?? 0) + 1;
    for (const n of around) {
      const r = this.region[n]!;
      if (r === target) continue;
      size += this.relabel(n, r, target);
      this.regionSizes.delete(r);
    }
    this.regionSizes.set(target, size);
  }

  /** Moves every tile of region `from` connected to `start` into `to`; returns how many. */
  private relabel(start: number, from: number, to: number): number {
    const queue = [start];
    this.region[start] = to;
    let count = 0;
    while (queue.length > 0) {
      const index = queue.pop()!;
      count++;
      for (const n of this.walkableNeighbours(index)) {
        if (this.region[n] !== from) continue;
        this.region[n] = to;
        queue.push(n);
      }
    }
    return count;
  }

  private splitRegions(i: number): void {
    const old = this.region[i]!;
    this.region[i] = -1;
    this.regionSizes.set(old, (this.regionSizes.get(old) ?? 1) - 1);
    const seeds = this.walkableNeighbours(i);
    if (seeds.length <= 1) {
      if ((this.regionSizes.get(old) ?? 0) <= 0) this.regionSizes.delete(old);
      return;
    }

    // One front per seed, each with the tiles it has seen. `owner` maps a tile
    // to the front that claimed it so two fronts that meet can be merged.
    interface Front { seen: number[]; queue: number[]; head: number; alive: boolean }
    const owner = new Map<number, number>();
    const fronts: Front[] = [];
    for (const s of seeds) {
      if (owner.has(s)) continue;
      owner.set(s, fronts.length);
      fronts.push({ seen: [s], queue: [s], head: 0, alive: true });
    }
    let live = fronts.length;
    const merge = (a: number, b: number): void => {
      const keep = fronts[a]!;
      const gone = fronts[b]!;
      for (const t of gone.seen) { owner.set(t, a); keep.seen.push(t); }
      for (let k = gone.head; k < gone.queue.length; k++) keep.queue.push(gone.queue[k]!);
      gone.alive = false;
      gone.seen = []; gone.queue = []; gone.head = 0;
      live--;
    };

    while (live > 1) {
      for (let f = 0; f < fronts.length && live > 1; f++) {
        const front = fronts[f]!;
        if (!front.alive) continue;
        if (front.head >= front.queue.length) {
          // This front has covered its whole piece and met no other: it is cut
          // off from the rest. Give it an id of its own.
          const id = this.nextRegionId++;
          for (const t of front.seen) this.region[t] = id;
          this.regionSizes.set(id, front.seen.length);
          this.regionSizes.set(old, (this.regionSizes.get(old) ?? 0) - front.seen.length);
          front.alive = false;
          live--;
          continue;
        }
        const index = front.queue[front.head++]!;
        for (const n of this.walkableNeighbours(index)) {
          const other = owner.get(n);
          if (other === undefined) {
            owner.set(n, f);
            front.seen.push(n);
            front.queue.push(n);
          } else if (other !== f) {
            merge(f, other);
          }
        }
      }
    }
    if ((this.regionSizes.get(old) ?? 0) <= 0) this.regionSizes.delete(old);
  }

  /**
   * Takes earth out of a tile — M15 phase 26a. `amount` is in elevation units
   * and lowers `offset`; a tile dug past `pitDepth` stops being walkable, and
   * the landmass labels and the sight bonus are repaired to match. Returns the
   * depth now dug (positive), so a caller can tell a scrape from a pit.
   */
  dig(x: number, y: number, amount: number): number {
    return this.moveEarth(x, y, -Math.max(0, amount));
  }

  /** Puts earth on a tile — the other half of `dig`, on the same terms. */
  pile(x: number, y: number, amount: number): number {
    return this.moveEarth(x, y, Math.max(0, amount));
  }

  /** How deep a tile is dug below the land it was generated as; negative when it stands piled. */
  depthDug(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return -this.offset[this.index(x, y)]!;
  }

  private moveEarth(x: number, y: number, delta: number): number {
    if (!this.inBounds(x, y) || delta === 0) return this.depthDug(x, y);
    const i = this.index(x, y);
    this.offset[i] = this.offset[i]! + delta;
    this.earthVersion++;
    const R = PROMINENCE_RADIUS;
    this.refreshProminence(Math.floor(x) - R, Math.floor(y) - R, Math.floor(x) + R, Math.floor(y) + R);
    // Land follows the pit-depth rule; water follows its depth band. Piling
    // earth can make a shallow-water tile walkable, and digging can make it too
    // deep to wade, so both land and swim regions observe this edit.
    const biome = BIOMES[this.biome[i]!]!;
    if (biome === 'water' || biome === 'river') {
      const before = this.walkable[i];
      this.setWalkable(Math.floor(x), Math.floor(y), this.isShallow(x, y));
      if (before !== this.walkable[i]) this.updateShore(Math.floor(x), Math.floor(y));
    } else if (biome !== 'rock') {
      const before = this.walkable[i];
      this.setWalkable(Math.floor(x), Math.floor(y), this.offset[i]! > -this.config.pitDepth);
      if (before !== this.walkable[i]) this.updateShore(Math.floor(x), Math.floor(y));
    }
    if (delta < 0) this.floodFrom(Math.floor(x), Math.floor(y));
    return -this.offset[i]!;
  }

  /**
   * The most tiles one dig step may turn to water. A bound, not a tuning knob:
   * the fill is a breadth-first walk over dug tiles that are below the water
   * level, so it ends by itself when the trench does; this only keeps a
   * pathological world (a whole basin dug through) from stalling a tick.
   */
  static readonly FLOOD_LIMIT = 512;

  /**
   * The water follows the trench — M15 phase 26d. A tile that is dug below the
   * water level and touches water is filled, and the fill goes on through the
   * connected tiles that are also below the level. No random draw, a fixed
   * neighbour order (so two builds fill the same tiles in the same order), and
   * a bound (`FLOOD_LIMIT`). A filled tile is water for good: it is `water`
   * biome, unwalkable (through `setWalkable`, so the landmass labels follow),
   * and the shore list is patched around it by `updateShore`.
   *
   * Returns how many tiles were filled. Tiles at or above the level never
   * flood, and rock never does; piling earth back does not drain water.
   */
  floodFrom(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    const level = this.config.waterLevel;
    const source = this.findAdjacentWaterSource(x, y);
    if (!source) return 0;
    const { kind: sourceKind, surface: sourceSurface } = source;
    const wet = (tx: number, ty: number): boolean => {
      if (!this.inBounds(tx, ty)) return false;
      const k = this.index(tx, ty);
      if (this.isWater(tx, ty) || BIOMES[this.biome[k]!] === 'rock') return false;
      return this.elevation[k]! + this.offset[k]! < sourceSurface - 1e-9;
    };
    const touchesWater = (tx: number, ty: number): boolean => this.isShore(tx, ty);
    if (!wet(x, y) || !touchesWater(x, y)) return 0;
    const queue: number[] = [this.index(x, y)];
    let filled = 0;
    while (queue.length > 0 && filled < World.FLOOD_LIMIT) {
      const k = queue.shift()!;
      const tx = k % this.width;
      const ty = Math.floor(k / this.width);
      if (!wet(tx, ty)) continue;
      this.biome[k] = sourceKind === 1 && sourceSurface > level ? BIOME_ID.river : BIOME_ID.water;
      if (this.waterKind) this.waterKind[k] = sourceKind;
      if (this.waterSurface) this.waterSurface[k] = sourceSurface;
      // A newly flooded cut may be shallow enough to wade. Deeper water keeps
      // using the swim-region path once the swimming phase registers it.
      this.setWalkable(tx, ty, this.isShallow(tx, ty));
      this.grass[k] = 0;
      filled++;
      this.updateShore(tx, ty);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (wet(tx + dx, ty + dy)) queue.push(this.index(tx + dx, ty + dy));
      }
    }
    if (filled > 0) this.earthVersion++;
    return filled;
  }

  /**
   * Brings `shoreTiles` up to date around one changed tile (M15 phase 26d),
   * instead of recomputing the list: a tile is a shore tile when it is walkable
   * and touches water, so a change to (x, y) can alter only (x, y) and its four
   * neighbours. Entries are removed in place and new ones appended, so the
   * list keeps the order everything downstream already iterates in.
   * `Simulation` rebuilds `shoreHash` from the list when `earthVersion` moves.
   */
  updateShore(x: number, y: number): void {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const tx = x + dx;
      const ty = y + dy;
      if (!this.inBounds(tx, ty)) continue;
      const should = this.walkable[this.index(tx, ty)] === 1 && this.isShore(tx, ty);
      const at = this.shoreTiles.findIndex(t => t.x === tx && t.y === ty);
      if (should && at < 0) this.shoreTiles.push({ x: tx, y: ty });
      else if (!should && at >= 0) this.shoreTiles.splice(at, 1);
    }
  }

  private visit(index: number, id: number, queue: number[]): void {
    if (this.walkable[index] !== 1 || this.region[index] !== -1) return;
    this.region[index] = id;
    queue.push(index);
  }

  /** Landmass id at a point, or -1 for water, rock and off-map. */
  regionAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return -1;
    return this.region[this.index(x, y)]!;
  }

  /** True if both points sit on the same walkable landmass. */
  sameRegion(ax: number, ay: number, bx: number, by: number): boolean {
    const a = this.regionAt(ax, ay);
    return a !== -1 && a === this.regionAt(bx, by);
  }

  /** Walkable tiles at freshwater edges, including wadeable freshwater itself. */
  get freshShore(): { x: number; y: number }[] {
    if (!this.waterKind) return this.shoreTiles;
    return this.shoreTiles.filter(({ x, y }) => this.hasWaterOfKind(x, y, 1));
  }

  /** Walkable tiles at saltwater edges, including wadeable saltwater itself. */
  get saltShore(): { x: number; y: number }[] {
    return this.shoreTiles.filter(({ x, y }) => this.hasWaterOfKind(x, y, 2));
  }

  isFreshShore(x: number, y: number): boolean { return this.hasWaterOfKind(x, y, 1); }
  isSaltShore(x: number, y: number): boolean { return this.hasWaterOfKind(x, y, 2); }

  /** True when this tile itself contains fresh water (classic islands stay potable). */
  isFreshWater(x: number, y: number): boolean {
    if (!this.isWater(x, y)) return false;
    return this.waterKind ? this.waterKind[this.index(Math.floor(x), Math.floor(y))] === 1 : true;
  }

  /** True when this tile itself contains salt water. */
  isSaltWater(x: number, y: number): boolean {
    if (!this.isWater(x, y)) return false;
    return this.waterKind?.[this.index(Math.floor(x), Math.floor(y))] === 2;
  }

  /** Natural potable water; wells remain a separate building source. */
  isDrinkingWater(x: number, y: number): boolean { return this.isFreshWater(x, y); }

  private hasWaterOfKind(x: number, y: number, kind: 1 | 2): boolean {
    const ownKind = (tx: number, ty: number): boolean => {
      if (!this.isWater(tx, ty)) return false;
      return this.waterKind ? this.waterKind[this.index(tx, ty)] === kind : kind === 1;
    };
    return (this.isShallow(x, y) && ownKind(x, y)) || ownKind(x + 1, y) || ownKind(x - 1, y) ||
      ownKind(x, y + 1) || ownKind(x, y - 1);
  }

  private findAdjacentWaterSource(x: number, y: number): { kind: number; surface: number } | null {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const tx = x + dx;
      const ty = y + dy;
      if (!this.inBounds(tx, ty)) {
        // Preserve classic island's historical map-edge water behavior. A
        // geographic map has explicit water classes and must not infer a
        // freshwater source from its local clipping boundary.
        if (!this.waterKind) return { kind: 1, surface: this.config.waterLevel };
        continue;
      }
      if (!this.isWater(tx, ty)) continue;
      const i = this.index(tx, ty);
      return {
        kind: this.waterKind ? this.waterKind[i]! : 1,
        surface: this.waterKind?.[i] === 1 && this.waterSurface ? this.waterSurface[i]! : this.config.waterLevel,
      };
    }
    return null;
  }

  /** A logboat can use rivers and lakes, plus salt water sheltered close to shore. */
  isLogboatTile(x: number, y: number): boolean {
    return this.isFreshWater(x, y) || (this.isSaltWater(x, y) && this.depthAt(x, y) <= this.swimDepth * 4);
  }

  /** Logboat routes add sheltered salt lanes; reed rafts retain their freshwater-only region. */
  private logboatRegions?: Int32Array;
  private logboatVersion = -1;
  sameLogboatRegion(ax: number, ay: number, bx: number, by: number): boolean {
    if (!this.inBounds(ax, ay) || !this.inBounds(bx, by)) return false;
    if (!this.logboatRegions || this.logboatVersion !== this.earthVersion) {
      const region = this.logboatRegions = new Int32Array(this.width * this.height).fill(-1);
      const queue: number[] = [];
      let id = 0;
      for (let start = 0; start < region.length; start++) {
        const sx = start % this.width, sy = Math.floor(start / this.width);
        if (region[start] !== -1 || !(this.isWalkable(sx, sy) || this.isLogboatTile(sx, sy))) continue;
        queue.length = 0; queue.push(start); region[start] = id;
        for (let head = 0; head < queue.length; head++) {
          const tile = queue[head]!, x = tile % this.width, y = Math.floor(tile / this.width);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx!, ny = y + dy!;
            if (!this.inBounds(nx, ny)) continue;
            const next = this.index(nx, ny);
            if (region[next] !== -1 || !(this.isWalkable(nx, ny) || this.isLogboatTile(nx, ny))) continue;
            region[next] = id; queue.push(next);
          }
        }
        id++;
      }
      this.logboatVersion = this.earthVersion;
    }
    const a = this.logboatRegions[this.index(ax, ay)]!;
    return a !== -1 && a === this.logboatRegions[this.index(bx, by)];
  }

  /** Derived boat connectivity is rebuilt after terrain changes, never saved.
   * Lazy allocation also supports worlds restored without a constructor. */
  private boatRegions?: Int32Array;
  private boatVersion = -1;
  isBoatTile(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.isFreshWater(x, y);
  }
  sameBoatRegion(ax: number, ay: number, bx: number, by: number): boolean {
    if (!this.inBounds(ax, ay) || !this.inBounds(bx, by)) return false;
    if (!this.boatRegions || this.boatVersion !== this.earthVersion) {
      const region = this.boatRegions = new Int32Array(this.width * this.height).fill(-1);
      const queue: number[] = [];
      let id = 0;
      for (let start = 0; start < region.length; start++) {
        const sx = start % this.width, sy = Math.floor(start / this.width);
        if (region[start] !== -1 || !(this.isWalkable(sx, sy) || this.isBoatTile(sx, sy))) continue;
        queue.length = 0; queue.push(start); region[start] = id;
        for (let head = 0; head < queue.length; head++) {
          const tile = queue[head]!, x = tile % this.width, y = Math.floor(tile / this.width);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx!, ny = y + dy!;
            if (!this.inBounds(nx, ny)) continue;
            const next = this.index(nx, ny);
            if (region[next] !== -1 || !(this.isWalkable(nx, ny) || this.isBoatTile(nx, ny))) continue;
            region[next] = id; queue.push(next);
          }
        }
        id++;
      }
      this.boatVersion = this.earthVersion;
    }
    const a = this.boatRegions[this.index(ax, ay)]!;
    return a !== -1 && a === this.boatRegions[this.index(bx, by)];
  }

  /** Swim-capable component id, or -1 for water too deep to swim or off-map. */
  swimRegionAt(x: number, y: number): number {
    this.ensureSwimRegions();
    if (!this.inBounds(x, y)) return -1;
    return this.swimRegion[this.index(x, y)]!;
  }

  /** True when both points connect by land/wading or swim-depth water. */
  sameSwimRegion(ax: number, ay: number, bx: number, by: number): boolean {
    const a = this.swimRegionAt(ax, ay);
    return a !== -1 && a === this.swimRegionAt(bx, by);
  }

  private ensureSwimRegions(): void {
    if (this.swimRegionsDirty || this.swimRegionEarthVersion !== this.earthVersion) this.findSwimRegions();
  }

  /** Full rebuild is lazy: digging/flooding is rare, route queries are not. */
  private findSwimRegions(): void {
    this.swimRegion.fill(-1);
    this.swimRegionSizes.clear();
    let id = 0;
    const queue: number[] = [];
    for (let start = 0; start < this.swimRegion.length; start++) {
      const sx = start % this.width, sy = Math.floor(start / this.width);
      if (this.swimRegion[start] !== -1 || (this.walkable[start] !== 1 && !this.isSwimTile(sx, sy))) continue;
      queue.length = 0;
      queue.push(start);
      this.swimRegion[start] = id;
      let head = 0;
      while (head < queue.length) {
        const current = queue[head++]!;
        const x = current % this.width, y = Math.floor(current / this.width);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const next = this.index(nx, ny);
          if (this.swimRegion[next] !== -1 || (this.walkable[next] !== 1 && !this.isSwimTile(nx, ny))) continue;
          this.swimRegion[next] = id;
          queue.push(next);
        }
      }
      this.swimRegionSizes.set(id++, queue.length);
    }
    this.swimRegionsDirty = false;
    this.swimRegionEarthVersion = this.earthVersion;
  }

  /** The id of the largest landmass, or -1 if there is no land at all. */
  largestRegion(): number {
    let best = -1;
    let bestSize = 0;
    for (const [id, size] of this.regionSizes) {
      if (size > bestSize) {
        bestSize = size;
        best = id;
      }
    }
    return best;
  }

  /** A random walkable tile on a landmass of at least `minSize` tiles. */
  randomWalkableInLargeRegion(rng: RNG, minSize: number, attempts = 600): { x: number; y: number } | null {
    for (let i = 0; i < attempts; i++) {
      const x = rng.int(0, this.width - 1);
      const y = rng.int(0, this.height - 1);
      const id = this.regionAt(x, y);
      if (id === -1) continue;
      if ((this.regionSizes.get(id) ?? 0) < minSize) continue;
      return { x, y };
    }
    return null;
  }

  private findShores(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.walkable[this.index(x, y)] === 1 && this.isShore(x, y)) {
          this.shoreTiles.push({ x, y });
        }
      }
    }
  }

  /**
   * Innate ground, humus and nutrient together: what a crop has to grow in.
   *
   * The one function fields, the planner and the panel all ask, so that "how
   * good is this ground" has a single answer. Out of bounds is zero, the same
   * way `fertilityAt` answers it.
   */
  effectiveFertilityAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.soil.effectiveFertility(this.index(x, y));
  }

  private generate(rng: RNG): void {
    // Separate noise fields get separate forks so that changing the number of
    // draws in one does not shift the others.
    const elevationNoise = new SimplexNoise(rng.fork());
    const moistureNoise = new SimplexNoise(rng.fork());

    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxDist = Math.min(cx, cy);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;

        // A radial falloff makes the landmass an island, so the playable area
        // has natural edges instead of the map simply stopping.
        const dx = (x - cx) / maxDist;
        const dy = (y - cy) / maxDist;
        const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 0.95);

        const raw = elevationNoise.fbm(x, y, 5, 2, 0.5, 0.018);
        const elev = raw * 0.75 + falloff * 0.45 - 0.1;
        const moist = moistureNoise.fbm(x, y, 3, 2, 0.5, 0.035);

        this.elevation[i] = elev;
        this.moisture[i] = moist;

        const biome = this.classify(elev, moist);
        this.biome[i] = BIOME_ID[biome];
        this.walkable[i] = biome === 'rock' || (biome === 'water' &&
          this.config.waterLevel - elev >= this.config.wadeDepth) ? 0 : 1;

        // Fertility drives berry regrowth and, much later, agriculture.
        this.fertility[i] =
          biome === 'grass' || biome === 'forest'
            ? Math.max(0, Math.min(1, moist * 0.7 + (1 - Math.abs(elev - 0.45)) * 0.3))
            : biome === 'beach'
              ? 0.15
              : 0;
      }
    }

    // Texture comes off the moisture field at a shifted offset rather than from
    // a noise object of its own. Two reasons, and the second is the one that
    // matters: sampling an existing `SimplexNoise` costs **no `RNG` draws at
    // all**, so adding soil to this world cannot move a single herd, person or
    // bush in any saved seed — where `new SimplexNoise(rng.fork())` here would
    // have consumed the fork `seedInitialForest` expects and replanted every
    // forest in the game. The offset is large enough that texture and moisture
    // are not visibly the same map, and the correlation that remains is true
    // anyway: wet hollows silt up and hold loam.
    this.soil = new Soil(
      this.width, this.fertility,
      (x, y) => moistureNoise.fbm(x + 811, y - 457, 3, 2, 0.5, 0.05)
    );
  }

  /**
   * Fill terrain from continuous global comarca profiles without drawing from
   * Simulation RNG. The classic generator remains the exact default path.
   */
  private generateFromGeography(geography: LocalGeographySource): void {
    const n = this.width * this.height;
    const waterKind = new Uint8Array(n);
    const waterSurface = new Float32Array(n);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        const sample = geography.sample(x + 0.5, y + 0.5);
        const elev = sample.elevation;
        const moist = sample.moisture;
        this.elevation[i] = elev;
        this.moisture[i] = moist;

        const biome = this.classifyGeographic(elev, moist, geography.kind);
        this.biome[i] = BIOME_ID[biome];
        if (biome === 'water') {
          waterKind[i] = 2;
          waterSurface[i] = this.config.waterLevel;
        }
        const hydro = geography.hydrologyAt?.(x + 0.5, y + 0.5) ?? null;
        if (hydro && Number.isFinite(hydro.surface) && hydro.surface > elev) {
          this.biome[i] = BIOME_ID.river;
          waterKind[i] = 1;
          waterSurface[i] = hydro.surface;
        }
        this.walkable[i] = this.biome[i] === BIOME_ID.rock || ((this.biome[i] === BIOME_ID.water || this.biome[i] === BIOME_ID.river) &&
          this.config.waterLevel - elev >= this.config.wadeDepth) ? 0 : 1;
        if (this.biome[i] === BIOME_ID.river) {
          this.walkable[i] = hydro!.surface - elev < this.config.wadeDepth ? 1 : 0;
        }
        // No source has local soil measurements: use its coarse wetness as a
        // transparent fertility proxy, independent of elevation-unit scale.
        this.fertility[i] = biome === 'grass' || biome === 'forest'
          ? Math.max(0, Math.min(1, moist))
          : biome === 'beach' ? 0.15 : 0;
      }
    }
    // Regional wetness is the only soil signal in the source data. Keep the
    // Soil-owned fertility array canonical, as in classic worlds.
    this.soil = new Soil(this.width, this.fertility, (x, y) => this.moisture[this.index(x, y)]!);
    Object.defineProperty(this, 'waterKind', { value: waterKind, enumerable: true, writable: true, configurable: true });
    Object.defineProperty(this, 'waterSurface', { value: waterSurface, enumerable: true, writable: true, configurable: true });
  }

  // The cutoffs live in `world/Habitat.ts`, shared with the resource profile (M15 step 1a): the profile has to
  // know which band an elevation falls in, and it must be the band painted here.
  private classify(elev: number, moist: number): Biome {
    return classifyTerrain(elev, moist, this.config.waterLevel);
  }

  private classifyGeographic(elev: number, moist: number, kind: LocalGeographySource['kind']): Biome {
    return classifyGeographicTerrain(elev, moist, kind, this.config.waterLevel, this.config.metresPerUnit);
  }

  index(x: number, y: number): number {
    return (y | 0) * this.width + (x | 0);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  biomeAt(x: number, y: number): Biome {
    if (!this.inBounds(x, y)) return 'water';
    return BIOMES[this.biome[this.index(x, y)]!]!;
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.walkable[this.index(x, y)] === 1;
  }

  isWater(x: number, y: number): boolean {
    return this.biomeAt(x, y) === 'water' || this.biomeAt(x, y) === 'river';
  }

  fertilityAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.fertility[this.index(x, y)]!;
  }

  chunkIndex(x: number, y: number): number {
    const cx = Math.min(this.chunksX - 1, Math.max(0, Math.floor(x / this.chunkSize)));
    const cy = Math.min(this.chunksY - 1, Math.max(0, Math.floor(y / this.chunkSize)));
    return cy * this.chunksX + cx;
  }

  /** A walkable tile near (x, y), spiralling outward. Null if the area is all water or rock. */
  findWalkableNear(x: number, y: number, maxRadius = 24): { x: number; y: number } | null {
    if (this.isWalkable(x, y)) return { x, y };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (this.isWalkable(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  /** A random walkable tile. Used for spawning; needs an RNG so it stays deterministic. */
  randomWalkable(rng: RNG, attempts = 400): { x: number; y: number } | null {
    for (let i = 0; i < attempts; i++) {
      const x = rng.int(0, this.width - 1);
      const y = rng.int(0, this.height - 1);
      if (this.isWalkable(x, y)) return { x, y };
    }
    return null;
  }

  /** True on a wadeable water tile or next to water — for drinking and shore work. */
  isShore(x: number, y: number): boolean {
    return (
      this.isShallow(x, y) ||
      this.isWater(x + 1, y) || this.isWater(x - 1, y) ||
      this.isWater(x, y + 1) || this.isWater(x, y - 1)
    );
  }

  countBiomes(): Record<Biome, number> {
    const counts: Record<Biome, number> = { water: 0, beach: 0, grass: 0, forest: 0, hills: 0, rock: 0, river: 0 };
    for (let i = 0; i < this.biome.length; i++) counts[BIOMES[this.biome[i]!]!]++;
    if (counts.river === 0) delete (counts as Partial<Record<Biome, number>>).river;
    return counts;
  }
}
