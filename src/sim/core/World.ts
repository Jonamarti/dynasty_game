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
import type { RNG } from './RNG.ts';
import type { WorldConfig } from './Config.ts';

export const BIOMES = ['water', 'beach', 'grass', 'forest', 'hills', 'rock'] as const;
export type Biome = (typeof BIOMES)[number];

export const BIOME_ID: Record<Biome, number> = {
  water: 0, beach: 1, grass: 2, forest: 3, hills: 4, rock: 5,
};

export class World {
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  readonly chunksX: number;
  readonly chunksY: number;

  /** Per-tile arrays, indexed by `y * width + x`. */
  readonly elevation: Float32Array;
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
  /** Tile count per region id, so the biggest landmass is easy to find. */
  readonly regionSizes = new Map<number, number>();

  /**
   * Every walkable tile touching water. Precomputed once because "where can I
   * drink?" is asked constantly, and scanning a box of tiles around each thirsty
   * person was measurably the most expensive thing in the think tick.
   */
  readonly shoreTiles: { x: number; y: number }[] = [];

  constructor(private readonly config: WorldConfig, rng: RNG) {
    this.width = config.width;
    this.height = config.height;
    this.chunkSize = config.chunkSize;
    this.chunksX = Math.ceil(this.width / this.chunkSize);
    this.chunksY = Math.ceil(this.height / this.chunkSize);

    const n = this.width * this.height;
    this.elevation = new Float32Array(n);
    this.moisture = new Float32Array(n);
    this.fertility = new Float32Array(n);
    this.biome = new Uint8Array(n);
    this.walkable = new Uint8Array(n);
    this.region = new Int32Array(n).fill(-1);

    this.generate(rng);
    this.findShores();
    this.findRegions();
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
        this.walkable[i] = biome === 'water' || biome === 'rock' ? 0 : 1;

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

  private classify(elev: number, moist: number): Biome {
    const water = this.config.waterLevel;
    if (elev < water) return 'water';
    if (elev < water + 0.04) return 'beach';
    if (elev > 0.78) return 'rock';
    if (elev > 0.62) return 'hills';
    return moist > 0.52 ? 'forest' : 'grass';
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
    return this.biomeAt(x, y) === 'water';
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

  /** True if any of the four neighbours is water — where people can drink. */
  isShore(x: number, y: number): boolean {
    return (
      this.isWater(x + 1, y) || this.isWater(x - 1, y) ||
      this.isWater(x, y + 1) || this.isWater(x, y - 1)
    );
  }

  countBiomes(): Record<Biome, number> {
    const counts = { water: 0, beach: 0, grass: 0, forest: 0, hills: 0, rock: 0 };
    for (let i = 0; i < this.biome.length; i++) counts[BIOMES[this.biome[i]!]!]++;
    return counts;
  }
}
