/**
 * Canvas 2D renderer.
 *
 * The terrain is drawn once into an offscreen canvas at construction and then
 * blitted each frame. Terrain is static and by far the largest number of draw
 * calls, so pre-rendering it turns a per-frame cost of tens of thousands of
 * fillRect calls into a single drawImage — which is the whole reason a 2D
 * canvas can carry this comfortably at 60fps.
 *
 * Everything here reads the simulation and never writes to it.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import { Interpolator, type Placed } from './Interpolator.ts';
import type { Inscription } from '../sim/entities/Inscription.ts';
import type { Person } from '../sim/entities/Person.ts';
import type { World } from '../sim/core/World.ts';
import { BIOMES, type Biome } from '../sim/core/World.ts';
import type { Season } from '../sim/core/TimeManager.ts';
import { WAYPOINT_AIM } from '../sim/systems/MovementSystem.ts';
import type { ResourceKind, ResourceNode } from '../sim/entities/ResourceNode.ts';
import type { ItemPile } from '../sim/entities/ItemPile.ts';
import type { Animal } from '../sim/entities/Animal.ts';
import type { Building } from '../sim/entities/Building.ts';
import type { Tree } from '../sim/entities/Tree.ts';
import type { TreeSpecies } from '../sim/entities/Tree.ts';
import { workProgressOf } from '../sim/core/Progress.ts';
import { expressionOf, type Expression } from '../sim/core/Mood.ts';
import { knowsPersonCondition } from '../sim/social/Knowledge.ts';
import { Camera, TILE } from './Camera.ts';
import { Floaters } from './Floaters.ts';
import {
  SpriteAtlas, BAND_COLORS, bandColorIndex, sizeClassOf, bodyScaleOf, hairVariantOf, hasBeardOf, heldItemFor,
} from './Sprites.ts';

const BIOME_COLORS: Record<Biome, [string, string]> = {
  // [base, speckle] — the speckle is dotted in per-tile to break up flat fields.
  // This is also spring and summer's palette: the two growing seasons keep
  // the ground's year-round colours, and only autumn and winter override it.
  water:  ['#24506f', '#2b5c7e'],
  beach:  ['#d6c493', '#c9b585'],
  grass:  ['#6b9c4a', '#628f43'],
  forest: ['#3c6b33', '#355f2d'],
  hills:  ['#8a8163', '#7d755a'],
  rock:   ['#6d6d72', '#636368'],
};

/**
 * Autumn and winter overrides for the biomes that actually carry vegetation.
 * Water, beach and rock do not green up in summer, so there is no reason for
 * them to turn gold or grey either — only `grass`, `forest` and `hills` are
 * redefined here, and everything else falls back to `BIOME_COLORS` year-round.
 * Winter's further "and then white" step is a frost overlay in
 * `prerenderTerrain`, not a fourth colour table, so it can scale smoothly with
 * `SeasonVisual.frost` instead of jumping between fixed palettes.
 */
const SEASON_BIOME_COLORS: Partial<Record<Season, Partial<Record<Biome, [string, string]>>>> = {
  autumn: {
    grass:  ['#9c8a3e', '#8f7d37'],
    forest: ['#6b5a2c', '#5c4d26'],
    hills:  ['#8f7a54', '#82704c'],
  },
  winter: {
    grass:  ['#8a8a7a', '#7d7d6f'],
    forest: ['#5f5f56', '#55554d'],
    hills:  ['#7d7a72', '#726f68'],
  },
};

/**
 * What the ground looks like right now, derived from `TimeManager` and
 * nothing else. `frost` (0-2) only rises in winter and drives the white
 * overlay in `prerenderTerrain`; `heat` (0-1) marks the driest stretch of
 * summer. Both are quantised on purpose: `sim.time.temperature` swings with
 * the time of day as well as the season, and a repaint of 16k tiles belongs
 * on a season or hard-freeze change, not on every sunrise.
 */
interface SeasonVisual {
  season: Season;
  frost: number;
  heat: number;
  key: string;
}

/**
 * Below this many pixels per tile, a person is drawn as a flat silhouette:
 * no face, no held item, one `drawImage` instead of up to four. Chosen the
 * same way the building-icon LOD at `if (scale > 20)` below was — a face two
 * or three pixels wide reads as noise, not detail.
 */
const PERSON_LOD_BELOW = 14;

const RESOURCE_COLORS: Record<ResourceKind, string> = {
  berries: '#c0392b',
  flint:   '#c8ccd0',
  sticks:  '#8b5a2b',
  reeds:   '#b3b76a',
  clay:    '#a97b5d',
  fish:    '#4a90a4',
  // Ripe cereal. Warmer and paler than the grass it stands in, so a stand of it
  // reads as a stand of something from across the valley.
  wild_grain: '#d8c169',
};

/**
 * How worked-out a node is, in the three steps a player can actually read.
 *
 * A continuous size was the old answer and it could not be read at all: at a
 * glance nothing distinguishes a bush at 40% from one at 60%, and judging it
 * meant comparing two bushes standing in different places. Three states, one
 * question — is it worth walking over there.
 */
export type NodeState = 'full' | 'picked' | 'spent';

/** Where the thresholds sit. `spent` matches `ResourceNode.depleted` exactly. */
export function nodeStateOf(node: ResourceNode): NodeState {
  if (node.amount < 1) return 'spent';
  return node.amount / node.def.maxAmount < 0.45 ? 'picked' : 'full';
}

/**
 * The drawn width of a node per state, in tiles, and the single source
 * `hitRadiusOf` reads so the click target matches the paint.
 */
const NODE_SIZES: Record<NodeState, number> = {
  full: 0.4,
  picked: 0.32,
  spent: 0.3,
};

/**
 * Kinds whose spent state is nothing whatsoever.
 *
 * `sticks` is a few fallen branches: pick them up and the ground is bare, which
 * is the owner's note verbatim. Everything else leaves something behind — a
 * bush, stubble, a pit, a scar, a ripple — and drawing that is the whole point
 * of the phase, so this set should stay very small.
 */
const SPENT_SHOWS_NOTHING: ReadonlySet<ResourceKind> = new Set<ResourceKind>(['sticks']);

/**
 * Whether a node is in the world but not on the screen — and therefore must not
 * be clickable either.
 *
 * One predicate for both reasons this can happen, and both call sites (this
 * renderer's node loop and `main.ts`'s picker) read it. They were already one
 * rule apart for snow; letting the spent-sticks rule become a second, separately
 * written condition is how a player ends up selecting bare grass and being
 * shown a stick pile that is not there.
 */
export function nodeIsHidden(node: ResourceNode, buried: (x: number, y: number) => boolean): boolean {
  if (node.def.groundLevel && buried(node.x, node.y)) return true;
  return node.amount < 1 && SPENT_SHOWS_NOTHING.has(node.kind);
}

/**
 * Foliage, so that a berry bush has a bush for its berries to be missing from.
 * Only `berries` needs one: every other kind is the thing itself.
 */
const BUSH_LEAF = '#41613a';

/**
 * What is left of a node once it has been worked: the frame the crop grew on,
 * the hole the clay came out of, the scar the flint was struck from.
 *
 * M9.6 phase 3. These are not shades of `RESOURCE_COLORS` — the point of the
 * owner's note is that a spent thing should not read as a small full one, and
 * a smaller, paler version of the same colour is exactly what "the same picture
 * made smaller" means.
 */
const SPENT_COLORS = {
  /** Leafless bramble. Grey-brown, so a stripped bush reads as bare wood. */
  twig: '#6b6152',
  /** The inside of a dug pit; darker than any ground it sits on. */
  pit: '#4a3a2e',
  /** Knapped-out chalk, the ghost of an outcrop. */
  scar: '#9aa0a6',
  /** Cut stubble and empty water alike: what is left, not what was taken. */
  stub: '#8a8f5c',
} as const;

/** [canopy, shadow side] per species; fruit is drawn over the top. This is
 * also spring and summer's palette — see `drawTree`. */
const TREE_COLORS: Record<TreeSpecies, [string, string]> = {
  oak:   ['#4a7a35', '#3a5f29'],
  pine:  ['#2f5c3a', '#25482e'],
  apple: ['#5d8a3f', '#496e31'],
  pear:  ['#638f46', '#4d7137'],
  plum:  ['#557f4a', '#43653a'],
  hazel: ['#6a9450', '#54763f'],
};

/** Every species but pine, one shared autumn palette — the note asked that
 * the canopy turn with the season, not that each species get its own hue. */
const AUTUMN_TREE_COLORS: [string, string] = ['#b8862f', '#96701f'];

/** Pine is the only conifer on the island; everything else drops its leaves. */
const EVERGREEN_SPECIES: ReadonlySet<TreeSpecies> = new Set(['pine']);

const FRUIT_COLORS: Record<string, string> = {
  apple: '#d8452f',
  pear: '#c8b23a',
  plum: '#7a3f8a',
  hazelnut: '#a8763f',
  // M8.1: the oak bears now. A duller brown than the hazel, because an acorn on
  // the branch should not read as something worth eating.
  acorn: '#8a6a34',
};

/**
 * Fallen fruit, whatever it fell from.
 *
 * One colour rather than a rotten shade per species on purpose: a heap of
 * anything gone over is brown, and six subtly different browns on the ground
 * would be the same mistake `RESOURCE_COLORS` made before the shapes went in.
 */
const ROTTEN_FRUIT = '#5c4526';

/**
 * What is currently selected, by id.
 *
 * Ids rather than object references so the renderer never has to import the UI's
 * selection type — rendering reads the simulation and is told what to highlight,
 * and nothing more.
 */
export interface Highlight {
  personId?: number;
  nodeId?: number;
  buildingId?: number;
  treeId?: number;
  pileId?: number;
  inscriptionId?: number;
  animalId?: number;
}

export class Renderer {
  readonly floaters = new Floaters();
  /** Who the player is currently commanding, outlined on the map. */
  commandedId: number | null = null;
  /** Tile the build cursor is hovering, or null when not in build mode. */
  buildGhost: { x: number; y: number; width: number; height: number; ok: boolean } | null = null;
  /**
   * Ring drawn around whichever bubble of the entity picker the cursor is over.
   *
   * A chooser that names three bushes without saying *which* bush is barely
   * better than the blind cycling it replaced, so hovering a bubble points at
   * the thing on the map.
   */
  hoverRing: { x: number; y: number; radius: number } | null = null;

  /**
   * Where moving things were on the previous step, so they can be drawn between
   * steps instead of teleporting once every `1 / tickRate` seconds.
   *
   * Owned by the renderer rather than by the loop because it is presentation
   * and nothing else — see the header of `Interpolator.ts`.
   */
  readonly interpolator = new Interpolator();

  /**
   * Every baked body, head, face and held-item cell a person can be drawn
   * from. Built once per `Renderer` instance — see `Sprites.ts`'s header —
   * and never rebuilt by `setSim`: unlike the terrain, nothing about it
   * depends on which world is loaded.
   */
  private readonly atlas = new SpriteAtlas();

  /**
   * Walk-cycle phase per person, presentation state exactly like
   * `interpolator` above: advanced by *drawn* distance (interpolated, so it
   * keeps pace with what is on screen) rather than by anything the
   * simulation tracks, and swept the same way `Interpolator` sweeps its own
   * tracks so a century of dead people does not accumulate here.
   */
  private readonly walkPhase = new Map<number, { x: number; y: number; distance: number; seen: number }>();
  private walkPhaseCapture = 0;

  /**
   * `expressionOf` and the `knowsCondition` check behind it are worth
   * computing once per simulation step, not once per render frame — the sim
   * steps a handful of times a second, the screen draws sixty times, and
   * nothing either reads changes any faster than a tick.
   */
  private readonly moodCache = new Map<number, { tick: number; expr: Expression }>();

  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  /** The `SeasonVisual.key` the current `terrain` canvas was baked for. */
  private seasonKey: string;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private sim: Simulation,
    private readonly camera: Camera
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    const visual = this.seasonVisual();
    this.terrain = this.prerenderTerrain(sim.world, visual);
    this.seasonKey = visual.key;
  }

  /**
   * Points the renderer at a different world.
   *
   * Exists for exactly one caller: the settings screen shown *before* a game
   * starts, where changing the map or the amount of food in it means the world
   * built at boot has to be thrown away and built again. The terrain is
   * pre-rendered once at construction, so it has to be re-rendered here or the
   * old island goes on being painted under the new one's people.
   *
   * Not a general "restart the game" seam, and deliberately not used as one.
   * Before the first step nothing has accumulated; a few minutes in, this
   * object's interpolator, the floaters, and half a dozen ids in `main.ts` are
   * all holding people from the old world. See `rebuildBeforeStart` there.
   */
  setSim(sim: Simulation): void {
    this.sim = sim;
    const visual = this.seasonVisual();
    this.terrain = this.prerenderTerrain(sim.world, visual);
    this.seasonKey = visual.key;
    this.interpolator.clear();
    // A new world restarts person ids from 1 (`resetPersonIds`), so anything
    // keyed by id from the old world is now about a stranger who happens to
    // share a number, exactly the case `interpolator.clear()` above exists
    // for.
    this.walkPhase.clear();
    this.moodCache.clear();
  }

  /**
   * Reads `sim.time` and nothing else — pure and cheap enough to call every
   * frame, unlike the terrain bake it decides whether to trigger.
   */
  private seasonVisual(): SeasonVisual {
    const season = this.sim.time.season;
    // Real accumulated snow (`Simulation.snowDepth`, M9.5 phase 2b) rather
    // than a temperature guess: a single mild day inside a hard winter must
    // not paint the ground bare while `isBuried` still says otherwise. 0-2,
    // the "and then white" step `prerenderTerrain`'s frost overlay paints in.
    const frost = Math.min(2, Math.floor(this.sim.snowDepth));
    // High summer only: the driest, hottest stretch gets dried patches.
    const heat = season === 'summer' && this.sim.time.temperature > 0.5 ? 1 : 0;
    return { season, frost, heat, key: `${season}:${frost}:${heat}` };
  }

  /**
   * One tile per TILE pixels, drawn once per season change rather than once
   * per session — see this class's `seasonKey` and `render`'s repaint check.
   * `visual.season` picks the base palette (`SEASON_BIOME_COLORS`, falling
   * back to spring/summer's `BIOME_COLORS`); `frost` and `heat` add a scatter
   * of season-specific texture on the same per-tile hash the speckle already
   * uses, on different bits so the two never land on the same tile.
   */
  private prerenderTerrain(world: World, visual: SeasonVisual): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = world.width * TILE;
    canvas.height = world.height * TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    const { season, frost, heat } = visual;

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const biome = BIOMES[world.biome[world.index(x, y)]!]!;
        const [base, speckle] = SEASON_BIOME_COLORS[season]?.[biome] ?? BIOME_COLORS[biome];
        ctx.fillStyle = base;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

        // A deterministic speckle from the tile coordinates: cheap texture that
        // does not need an art asset and does not shimmer between frames.
        const h = (x * 73856093) ^ (y * 19349663);
        if ((h & 7) === 0) {
          ctx.fillStyle = speckle;
          ctx.fillRect(x * TILE + ((h >> 3) & 3) * 4, y * TILE + ((h >> 5) & 3) * 4, 4, 4);
        }

        if (biome === 'water') continue;

        if (frost > 0) {
          // The "and then white" step: a translucent wash that thickens with
          // frost, so deep winter is whiter than its first frosty week
          // without a third colour table.
          ctx.fillStyle = `rgba(255,255,255,${frost * 0.28})`;
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          const mask = frost >= 2 ? 3 : 7;
          if (((h >> 9) & mask) === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(x * TILE + ((h >> 11) & 3) * 4, y * TILE + ((h >> 13) & 3) * 4, 3, 3);
          }
        } else if (season === 'spring' && (biome === 'grass' || biome === 'forest') && ((h >> 9) & 31) === 0) {
          ctx.fillStyle = ((h >> 14) & 1) === 0 ? '#e8d24a' : '#e88fc4';
          ctx.fillRect(x * TILE + ((h >> 11) & 3) * 4 + 2, y * TILE + ((h >> 13) & 3) * 4 + 2, 3, 3);
        } else if (season === 'autumn' && (biome === 'grass' || biome === 'forest') && ((h >> 9) & 15) === 0) {
          ctx.fillStyle = ((h >> 14) & 1) === 0 ? '#b5651d' : '#8a5a1f';
          ctx.fillRect(x * TILE + ((h >> 11) & 3) * 4, y * TILE + ((h >> 13) & 3) * 4, 5, 3);
        } else if (heat > 0 && biome === 'grass' && ((h >> 9) & 31) === 0) {
          ctx.fillStyle = '#b89a4a';
          ctx.fillRect(x * TILE + ((h >> 11) & 3) * 4, y * TILE + ((h >> 13) & 3) * 4, 4, 4);
        }
      }
    }
    return canvas;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.camera.setViewport(width, height);
  }

  /**
   * Draws one frame.
   *
   * `alpha` is how far the world is between the last completed simulation step
   * and the next one, and it is what turns five positions a second into sixty.
   * It comes from the fixed-step accumulator in `main.ts`, which was already
   * computing it and throwing it away.
   */
  render(highlight: Highlight | null, alpha = 1): void {
    const { ctx, camera, sim } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, camera.viewWidth, camera.viewHeight);

    const view = camera.visibleTiles();
    const scale = camera.scale;

    // Repaint the whole terrain canvas only when the season (or a hard
    // freeze threshold within winter) actually changes — a few times a game
    // year, not sixty times a second. See `seasonVisual` and
    // `prerenderTerrain`.
    const visual = this.seasonVisual();
    if (visual.key !== this.seasonKey) {
      this.terrain = this.prerenderTerrain(sim.world, visual);
      this.seasonKey = visual.key;
    }

    // --- Terrain: one blit of the visible slice ----------------------------
    const sx = Math.max(0, view.minX) * TILE;
    const sy = Math.max(0, view.minY) * TILE;
    const sw = Math.min(sim.world.width * TILE - sx, (view.maxX - view.minX + 1) * TILE);
    const sh = Math.min(sim.world.height * TILE - sy, (view.maxY - view.minY + 1) * TILE);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(
        this.terrain,
        sx, sy, sw, sh,
        camera.worldToScreenX(sx / TILE), camera.worldToScreenY(sy / TILE),
        (sw / TILE) * scale, (sh / TILE) * scale
      );
    }

    // --- Resource nodes ----------------------------------------------------
    for (const node of sim.nodes) {
      if (node.x < view.minX || node.x > view.maxX || node.y < view.minY || node.y > view.maxY) continue;
      // Buried under enough snow, or picked clean of the one thing it is —
      // not drawn, not clickable, one predicate for both. A cosmetic burial
      // the AI could still reach through would be a lie the player could catch
      // just by watching; an invisible stick pile that still takes clicks is
      // the same lie from the other end.
      if (nodeIsHidden(node, (x, y) => sim.isBuried(x, y))) continue;
      this.drawNode(node, highlight?.nodeId === node.id);
    }

    // --- Trees -------------------------------------------------------------
    // Under buildings and people: a hut in a clearing sits on the ground, and
    // somebody standing beneath a canopy should not be hidden by it.
    for (const tree of sim.trees) {
      if (tree.x < view.minX - 3 || tree.x > view.maxX + 3) continue;
      if (tree.y < view.minY - 3 || tree.y > view.maxY + 3) continue;
      this.drawTree(tree, highlight?.treeId === tree.id);
    }

    // --- Buildings ---------------------------------------------------------
    // Drawn under people so someone standing in a doorway is not hidden by it.
    for (const building of sim.buildings) {
      if (building.x > view.maxX || building.y > view.maxY) continue;
      if (building.x + building.def.width < view.minX) continue;
      if (building.y + building.def.height < view.minY) continue;
      this.drawBuilding(building, highlight?.buildingId === building.id);
    }

    // --- Dropped goods -----------------------------------------------------
    for (const pile of sim.piles) {
      if (pile.x < view.minX || pile.x > view.maxX) continue;
      if (pile.y < view.minY || pile.y > view.maxY) continue;
      if (sim.isBuried(pile.x, pile.y)) continue;
      const px = camera.worldToScreenX(pile.x);
      const py = camera.worldToScreenY(pile.y);
      const size = scale * 0.3;
      ctx.fillStyle = '#b08a52';
      ctx.fillRect(px - size / 2, py - size / 4, size, size * 0.55);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px - size / 2, py + size * 0.28, size, 2);
      if (highlight?.pileId === pile.id) {
        ctx.strokeStyle = '#7fd4ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - size / 2 - 3, py - size / 4 - 3, size + 6, size * 0.55 + 6);
      }

      // What is in it, close up only. The player's own eyes can read a pile a
      // few tiles away, not one across the valley — the same limit `Knowledge`
      // puts on everything else the UI is allowed to say.
      if (sim.player && Math.hypot(pile.x - sim.player.x, pile.y - sim.player.y) <= PILE_LABEL_RANGE) {
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(10, 12, 18, 0.8)';
        ctx.strokeText(pile.label, px, py + size * 0.28 + 12);
        ctx.fillStyle = 'rgba(240, 237, 232, 0.9)';
        ctx.fillText(pile.label, px, py + size * 0.28 + 12);
      }
    }

    // --- Records -----------------------------------------------------------
    // Above buildings, because a stone inside a library is the thing you are
    // looking for when you look at a library, and below people for the usual
    // reason. A half-cut one carries a progress bar: a carving that takes four
    // hundred ticks and shows nothing looks exactly like a game that has
    // stopped responding, which is the complaint `workProgressOf` exists for.
    for (const record of sim.inscriptions) {
      if (record.x < view.minX || record.x > view.maxX) continue;
      if (record.y < view.minY || record.y > view.maxY) continue;
      const px = camera.worldToScreenX(record.x);
      const py = camera.worldToScreenY(record.y);
      const size = scale * 0.34;
      const clay = record.def.id === 'clay';

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(px, py + size * 0.42, size * 0.5, size * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // A standing stone reads as upright; a tablet lies flat and pale.
      ctx.fillStyle = record.unfinished ? '#6d6a63' : (clay ? '#c2a678' : '#8d8a82');
      if (clay) ctx.fillRect(px - size * 0.5, py - size * 0.2, size, size * 0.6);
      else ctx.fillRect(px - size * 0.3, py - size * 0.6, size * 0.6, size);

      // The marks themselves, once there are any. Two strokes is enough to read
      // "there is writing on this" at a glance and from across the valley.
      if (record.techs.length > 0) {
        ctx.strokeStyle = clay ? '#6b5433' : '#4c4a45';
        ctx.lineWidth = Math.max(1, scale * 0.03);
        for (let i = 0; i < Math.min(3, record.techs.length + 1); i++) {
          const ly = py - size * (clay ? 0.02 : 0.4) + i * size * 0.18;
          ctx.beginPath();
          ctx.moveTo(px - size * 0.18, ly);
          ctx.lineTo(px + size * 0.18, ly);
          ctx.stroke();
        }
      }

      if (record.unfinished) {
        const barW = size * 1.1;
        const barY = py - size * 0.95;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(px - barW / 2 - 1, barY - 1, barW + 2, 5);
        ctx.fillStyle = '#c9b06a';
        ctx.fillRect(px - barW / 2, barY, barW * record.cutProgress, 3);
      }

      if (highlight?.inscriptionId === record.id) {
        ctx.strokeStyle = '#7fd4ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - size * 0.6, py - size * 0.8, size * 1.2, size * 1.5);
      }
    }

    // --- Animals -----------------------------------------------------------
    // Under people, like buildings: a hunter standing over a kill should be the
    // figure you can see.
    // Culled on the drawn position rather than the simulation one, so nothing
    // pops out of the view half a step before it leaves it.
    for (const animal of sim.animals) {
      if (!animal.alive) continue;
      const at = this.interpolator.at('animal', animal, alpha);
      if (at.x < view.minX || at.x > view.maxX) continue;
      if (at.y < view.minY || at.y > view.maxY) continue;
      this.drawAnimal(animal, highlight?.animalId === animal.id, at);
    }

    // --- People ------------------------------------------------------------
    for (const person of sim.livingPeople()) {
      const at = this.interpolator.at('person', person, alpha);
      if (at.x < view.minX || at.x > view.maxX || at.y < view.minY || at.y > view.maxY) continue;
      this.drawPerson(person, highlight?.personId === person.id, at);
    }

    // --- Build ghost -------------------------------------------------------
    if (this.buildGhost) {
      const g = this.buildGhost;
      const px = camera.worldToScreenX(g.x - 0.5);
      const py = camera.worldToScreenY(g.y - 0.5);
      ctx.fillStyle = g.ok ? 'rgba(120, 220, 150, 0.28)' : 'rgba(230, 100, 100, 0.28)';
      ctx.fillRect(px, py, g.width * scale, g.height * scale);
      ctx.strokeStyle = g.ok ? '#7ddc96' : '#e66464';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, g.width * scale, g.height * scale);
    }

    // --- Picker hover ------------------------------------------------------
    // Over everything but the night overlay, since it answers a question the
    // player is asking right now.
    if (this.hoverRing) {
      const px = camera.worldToScreenX(this.hoverRing.x);
      const py = camera.worldToScreenY(this.hoverRing.y);
      ctx.strokeStyle = '#ffd35c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(8, this.hoverRing.radius * scale), 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- Night overlay -----------------------------------------------------
    const darkness = (1 - sim.time.daylight) * 0.55;
    if (darkness > 0.02) {
      ctx.fillStyle = 'rgba(10, 16, 40, ' + darkness.toFixed(3) + ')';
      ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    }

    // Floaters last, over the night overlay: an action label that dims with
    // nightfall is exactly the label you most need to read.
    this.floaters.draw(ctx, camera);
  }

  /**
   * A resource node, shaped by kind rather than one square recoloured, and by
   * *state* rather than by size.
   *
   * Two passes made this what it is. The first gave every kind its own outline,
   * because `sticks` and `clay` are the two closest browns in `RESOURCE_COLORS`
   * with dropped-item piles adding a third, and shape is legible where colour
   * alone was not. The second is M9.6 phase 3, and it is the owner's note: a
   * stripped bush was the same five berries drawn smaller, so the only way to
   * tell a full bush from an empty one was to judge its size against a bush
   * standing somewhere else on the screen. Depletion is now a different
   * *picture* — bare twigs, cut stubble, a dug pit, a knapped scar — and for
   * `sticks`, which is a few fallen branches and nothing else, it is no picture
   * at all: `nodeIsHidden` takes an empty one out of the frame *and* out of the
   * picker, so there is never an invisible thing in the grass to click on.
   *
   * Three states rather than a slider, because the question a player is asking
   * is "is it worth walking over there", and that has three answers.
   *
   * Every point below stays within `size / 2` of the centre, and `size` is one
   * of the three constants in `NODE_SIZES` that `hitRadiusOf`'s `'node'` case
   * reads, so what is painted and what is clickable cannot drift apart.
   */
  private drawNode(node: ResourceNode, selected: boolean): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(node.x);
    const py = camera.worldToScreenY(node.y);
    const state = nodeStateOf(node);
    const spent = state === 'spent';
    const size = scale * NODE_SIZES[state];
    ctx.fillStyle = RESOURCE_COLORS[node.kind];

    switch (node.kind) {
      case 'sticks':
        // Two crossed branches, and one once it has been picked over. An empty
        // one never reaches here at all — see `nodeIsHidden`.
        ctx.strokeStyle = RESOURCE_COLORS.sticks;
        ctx.lineWidth = Math.max(1.5, size * 0.16);
        ctx.beginPath();
        ctx.moveTo(px - size * 0.45, py - size * 0.32);
        ctx.lineTo(px + size * 0.45, py + size * 0.32);
        if (state === 'full') {
          ctx.moveTo(px - size * 0.45, py + size * 0.32);
          ctx.lineTo(px + size * 0.45, py - size * 0.32);
        }
        ctx.stroke();
        break;
      case 'flint': {
        // An angular shard: flint is the one resource that should look sharp.
        // Spent, it is the only *permanent* emptiness in this game — flint has
        // `regrowPerTick: 0` — so it becomes a scar and stays one. That is
        // `ResourceNode`'s own argument for depleting rather than vanishing: a
        // band should be able to see the ground it has used up.
        if (spent) {
          ctx.fillStyle = SPENT_COLORS.scar;
          ctx.beginPath();
          ctx.ellipse(px, py, size * 0.42, size * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          for (let i = -1; i <= 1; i++) {
            ctx.fillRect(px + i * size * 0.22 - 1, py - size * 0.06, 2, size * 0.12);
          }
          break;
        }
        ctx.beginPath();
        ctx.moveTo(px, py - size * 0.5);
        ctx.lineTo(px + size * 0.45, py - size * 0.05);
        ctx.lineTo(px + size * 0.22, py + size * 0.5);
        ctx.lineTo(px - size * 0.28, py + size * 0.38);
        ctx.lineTo(px - size * 0.45, py - size * 0.12);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'clay':
        // A low, rounded mound — the one node that is not angular at all — and
        // a hole in the ground once it has been dug out, with the spoil still
        // heaped on the near lip.
        if (spent) {
          ctx.fillStyle = SPENT_COLORS.pit;
          ctx.beginPath();
          ctx.ellipse(px, py, size * 0.44, size * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = RESOURCE_COLORS.clay;
          ctx.beginPath();
          ctx.ellipse(px, py + size * 0.3, size * 0.4, size * 0.12, 0, 0, Math.PI);
          ctx.fill();
          break;
        }
        ctx.beginPath();
        ctx.ellipse(px, py + size * 0.08, size * 0.48, size * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'reeds': {
        // Upright blades: reeds stand, they do not sit like the others. Cut,
        // what is left is stubble — the same three blades, a hand tall.
        ctx.strokeStyle = spent ? SPENT_COLORS.stub : RESOURCE_COLORS.reeds;
        ctx.lineWidth = Math.max(1, size * 0.1);
        const top = spent ? size * 0.2 : size * 0.48;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(px + i * size * 0.24, py + size * 0.45);
          ctx.lineTo(px + i * size * 0.32, py - top);
          ctx.stroke();
        }
        break;
      }
      case 'berries': {
        // The bush is drawn first and always, and the fruit is drawn on it.
        // That is the owner's note in one shape: what a stripped bush loses is
        // its berries, not its size.
        if (spent) {
          // Bare bramble: three canes out of a common root and no mass at all.
          ctx.strokeStyle = SPENT_COLORS.twig;
          ctx.lineWidth = Math.max(1, size * 0.08);
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(px, py + size * 0.42);
            ctx.quadraticCurveTo(px + i * size * 0.3, py, px + i * size * 0.44, py - size * 0.42);
            ctx.stroke();
          }
          break;
        }
        ctx.fillStyle = BUSH_LEAF;
        ctx.beginPath();
        ctx.ellipse(px, py, size * 0.46, size * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = RESOURCE_COLORS.berries;
        const berries = state === 'full' ? 5 : 2;
        for (let i = 0; i < berries; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(px + Math.cos(a) * size * 0.3, py + Math.sin(a) * size * 0.3, size * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'wild_grain': {
        // Standing cereal — and until this phase it was drawn as *nothing*.
        // M8.2 gave the kind a colour and never gave it a case in this switch,
        // so a stand of wild grain was a two-pixel shadow bar lying in the
        // grass. Ears on stalks, taller than reeds and heavy at the top, which
        // is what tells cereal from every other upright thing on this map.
        ctx.strokeStyle = spent ? SPENT_COLORS.stub : RESOURCE_COLORS.wild_grain;
        ctx.lineWidth = Math.max(1, size * 0.09);
        const height = spent ? size * 0.18 : size * 0.5;
        for (let i = -1; i <= 1; i++) {
          const topX = px + i * size * 0.3;
          ctx.beginPath();
          ctx.moveTo(px + i * size * 0.16, py + size * 0.45);
          ctx.lineTo(topX, py - height);
          ctx.stroke();
          if (spent) continue;
          ctx.fillStyle = RESOURCE_COLORS.wild_grain;
          ctx.beginPath();
          ctx.ellipse(topX, py - height, size * 0.09, size * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'fish':
        // A wedge with a tail-flick: the only node that reads as an animal
        // rather than a plant or a mineral. A fished-out shoal leaves the one
        // mark water can hold, which is a ring on the surface.
        if (spent) {
          ctx.strokeStyle = SPENT_COLORS.stub;
          ctx.lineWidth = Math.max(1, size * 0.07);
          ctx.beginPath();
          ctx.ellipse(px, py, size * 0.4, size * 0.16, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        ctx.beginPath();
        ctx.moveTo(px - size * 0.45, py);
        ctx.lineTo(px + size * 0.2, py - size * 0.28);
        ctx.lineTo(px + size * 0.2, py + size * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + size * 0.2, py - size * 0.28);
        ctx.lineTo(px + size * 0.48, py);
        ctx.lineTo(px + size * 0.2, py + size * 0.28);
        ctx.closePath();
        ctx.fill();
        break;
    }

    // The ground shadow is what tells the eye a thing stands on the map rather
    // than floating over it, so a spent node keeps a fainter one.
    ctx.fillStyle = spent ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(px - size / 2, py + size / 2 - 2, size, 2);
    if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - size / 2 - 3, py - size / 2 - 3, size + 6, size + 6);
    }
  }

  /**
   * A tree, sized by how grown it is.
   *
   * Age is the thing worth reading at a glance: a seedling is a sprig you could
   * step on, a grown oak is a canopy several tiles across. Seeing the
   * difference is what makes "leave that stand alone for twenty years" a
   * decision the player can actually make.
   */
  private drawTree(tree: Tree, selected: boolean): void {
    const { ctx, camera, sim } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(tree.x);
    const py = camera.worldToScreenY(tree.y);
    const radius = tree.radius * scale * 0.55;
    const season = sim.time.season;
    const evergreen = EVERGREEN_SPECIES.has(tree.def.species);
    // Bare in winter, gold in autumn, its own green the rest of the year —
    // pine is exempt from all of it, the one canopy that stays green.
    const bare = !evergreen && season === 'winter';
    const [canopy, shade] = season === 'autumn' && !evergreen
      ? AUTUMN_TREE_COLORS
      : TREE_COLORS[tree.def.species];

    if (tree.isSeedling) {
      // A sprig: two strokes, no canopy worth drawing.
      ctx.strokeStyle = bare ? '#8a7256' : canopy;
      ctx.lineWidth = Math.max(1, scale * 0.05);
      ctx.beginPath();
      ctx.moveTo(px, py + radius * 0.5);
      ctx.lineTo(px, py - radius * 0.9);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(px + radius * 0.15, py + radius * 0.5, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Trunk
      ctx.fillStyle = '#5a4028';
      const trunkW = Math.max(1, radius * 0.22);
      ctx.fillRect(px - trunkW / 2, py - radius * 0.1, trunkW, radius * 0.65);

      if (bare) {
        // No canopy fill — a fan of bare branches off the trunk instead.
        ctx.strokeStyle = '#6b5539';
        ctx.lineWidth = Math.max(1, radius * 0.06);
        const branchTop = py - radius * 0.1;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i / 4 - 0.5) * Math.PI * 0.75;
          ctx.beginPath();
          ctx.moveTo(px, branchTop);
          ctx.lineTo(px + Math.cos(a) * radius * 0.8, branchTop + Math.sin(a) * radius * 0.8);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(px, py - radius * 0.25, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = canopy;
        ctx.beginPath();
        ctx.arc(px - radius * 0.2, py - radius * 0.4, radius * 0.78, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fruit, when there is any: a handful of dots is enough to read "worth a
    // trip" from across the valley, which is the whole point of a season.
    if (tree.fruit >= 1 && tree.def.fruitItem) {
      ctx.fillStyle = FRUIT_COLORS[tree.def.fruitItem] ?? '#d8452f';
      const dots = Math.min(6, Math.ceil(tree.fruit / 3));
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * Math.PI * 2 + tree.id;
        const r = radius * 0.62;
        const size = Math.max(1.5, radius * 0.17);
        ctx.beginPath();
        ctx.arc(px + Math.cos(a) * r - radius * 0.15, py + Math.sin(a) * r - radius * 0.3, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Windfall: what came down when the season turned, lying on the ground and
    // going over. Drawn *after* the canopy so it reads as underneath the tree,
    // in the fruit's own colour darkened most of the way to brown — rotten, and
    // recognisably what used to be up there. See `Tree.windfall`.
    if (tree.windfall >= 1 && tree.def.fruitItem) {
      ctx.fillStyle = ROTTEN_FRUIT;
      const lying = Math.min(7, Math.ceil(tree.windfall / 3));
      for (let i = 0; i < lying; i++) {
        // Scattered by tree id and index rather than by the RNG: the simulation
        // owns every draw in this game, and a renderer that rolled its own
        // would also make the ground under one tree shimmer every frame.
        const a = (i / lying) * Math.PI * 2 + tree.id * 1.7;
        const r = radius * (0.35 + ((i * 7 + tree.id) % 5) * 0.1);
        ctx.beginPath();
        ctx.ellipse(
          px + Math.cos(a) * r, py + radius * 0.45 + Math.sin(a) * radius * 0.16,
          Math.max(1.2, radius * 0.12), Math.max(1, radius * 0.08), 0, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }

    if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py - radius * 0.25, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawBuilding(building: Building, selected: boolean): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(building.x - 0.5);
    const py = camera.worldToScreenY(building.y - 0.5);
    const w = building.def.width * scale;
    const h = building.def.height * scale;

    if (!building.complete) {
      // A site reads as an outline and a progress bar: clearly a plan rather
      // than a structure.
      ctx.fillStyle = 'rgba(210, 190, 150, 0.16)';
      ctx.fillRect(px, py, w, h);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(230, 214, 170, 0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, w, h);
      ctx.setLineDash([]);

      const barW = w * 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(px + w * 0.1, py + h - 8, barW, 5);
      ctx.fillStyle = building.materialsReady ? '#7ddc96' : '#e0b055';
      ctx.fillRect(px + w * 0.1, py + h - 8, barW * building.completion, 5);
    } else if (building.crop) {
      // A field is ground, not a structure, and it has to read as ground: bare
      // earth that greens as the crop comes on and goes gold when it is ready
      // to cut. Drawn here in the entity pass rather than repainted into the
      // terrain canvas, which is the rule M9.5 phase 2a set for the seasons —
      // the terrain is baked once and a crop changes every day.
      const crop = building.crop;
      const ripeness = crop.ripeness;
      ctx.fillStyle = crop.isFallow ? '#6b5335'
        : crop.isRipe ? '#d9b44a'
        : '#6f8f45';
      ctx.fillRect(px, py, w, h);
      // Furrows, so worked ground is legible as worked at a glance and at a
      // distance. Four lines whatever the zoom: a per-tile pattern would be a
      // grey smear at the scales this game is usually played at.
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const fy = py + (h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(px, fy);
        ctx.lineTo(px + w, fy);
        ctx.stroke();
      }
      if (!crop.isFallow && !crop.isRipe) {
        // How far along, as a band of colour growing up the plot rather than a
        // progress bar. A field is the one thing in this game whose progress is
        // the picture itself.
        ctx.fillStyle = 'rgba(216, 193, 105, 0.5)';
        ctx.fillRect(px, py + h * (1 - ripeness), w, h * ripeness * 0.25);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, w, h);
    } else {
      // M11 phase 11b: a ruin reads as scorched ground under a broken outline,
      // rather than the same solid fill an untouched building gets — the same
      // "clearly not what it should be" language the unfinished-site branch
      // above already speaks, borrowed for the opposite direction of damage.
      // A merely damaged one keeps its ordinary fill and gets the same red bar
      // a sabotage-in-progress would leave behind, so a glance across camp
      // shows which roofs need a builder without opening anybody's panel.
      if (building.ruined) {
        ctx.fillStyle = 'rgba(60, 40, 34, 0.55)';
        ctx.fillRect(px, py, w, h);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(217, 112, 90, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, w, h);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = building.def.shelter > 0 ? '#7a5c3e' : '#5c5343';
        ctx.fillRect(px, py, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fillRect(px, py, w, h * 0.35);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, w, h);
      }
      if (building.soundness < 1) {
        const barW = w * 0.8;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(px + w * 0.1, py + h - 8, barW, 5);
        ctx.fillStyle = '#d9705a';
        ctx.fillRect(px + w * 0.1, py + h - 8, barW * building.soundness, 5);
      }
    }

    // M11 phase 13a (owner's note 3): whose it is. The same colour its
    // band's people wear, as a ring *inside* the edge rather than on it — the
    // edge already carries what state the thing is in (the dashed plan of a
    // site, the broken red of a ruin), and that has to keep winning: a ruin
    // must read as a ruin first and as somebody's second. Skipped when too
    // small for two rings to be told apart.
    if (w > 14 && h > 14) {
      ctx.strokeStyle = BAND_COLORS[bandColorIndex(building.ownerBandId)]!;
      ctx.globalAlpha = building.ruined || !building.complete ? 0.6 : 0.9;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 4, py + 4, w - 8, h - 8);
      ctx.globalAlpha = 1;
    }

    if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 2, py - 2, w + 4, h + 4);
    }

    if (scale > 20) {
      ctx.save();
      ctx.font = Math.floor(scale * 0.7) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = building.complete ? 0.95 : 0.5;
      // A bare plot does not wear a sheaf of wheat. The icon says what is
      // standing there, and on a fallow field nothing is — which is precisely
      // the thing a player needs to notice, because it is the thing somebody
      // has to go and put right.
      if (!building.crop || !building.crop.isFallow) {
        ctx.fillText(building.def.icon, px + w / 2, py + h / 2);
      }
      ctx.restore();
    }
  }

  private drawPerson(person: Person, selected: boolean, at: Placed): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(at.x);
    const py = camera.worldToScreenY(at.y);
    const bodyScale = bodyScaleOf(person);
    // Torso footprint in screen pixels — the same 0.34 x 0.52 tile fraction
    // this always was, now scaled by age. `hitRadiusOf` reads the same
    // `bodyScaleOf`, so a child drawn small is a child clicked small.
    const w = scale * bodyScale * 0.34;
    const h = scale * bodyScale * 0.52;

    // Shadow first, so bodies read as standing on the ground.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px, py + h * 0.45, w * 0.6, w * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    const sizeClass = sizeClassOf(person);
    const colorIndex = bandColorIndex(person.bandId);

    if (scale < PERSON_LOD_BELOW) {
      // Too small on screen for a face or a tool to read. One `drawImage`,
      // matching the shape `if (scale > 20)` already gives building icons.
      this.atlas.drawSilhouette(ctx, sizeClass, colorIndex, px, py, this.atlas.bodyDrawSize(sizeClass, w) * 1.15);
    } else {
      const bodySize = this.atlas.bodyDrawSize(sizeClass, w);
      this.atlas.drawPerson(ctx, {
        sizeClass, bandColorIndex: colorIndex,
        pose: this.walkPoseFor(person, at),
        hairVariant: hairVariantOf(person),
        hasBeard: hasBeardOf(person),
        expression: this.expressionFor(person),
        heldItem: heldItemFor(person),
      }, px, py, bodySize);
    }

    // What they are working on, and how far through it they are.
    //
    // Three sources, because work is measured three different ways: a timer for
    // harvest cycles, accumulated progress on a trunk for felling, and the
    // site's own completion for building. Without this, digging clay looks
    // identical to standing still, which is exactly the complaint.
    const progress = this.workProgress(person);
    if (progress !== null) {
      const barW = w * 1.5;
      const barY = py - h / 2 - w * 1.35;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(px - barW / 2 - 1, barY - 1, barW + 2, 6);
      ctx.fillStyle = '#7fd4ff';
      ctx.fillRect(px - barW / 2, barY, barW * progress, 4);
    }

    // A health pip only when hurt — a full bar over every body is noise.
    if (person.health < 85) {
      const barW = w * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - barW / 2, py - h / 2 - w * 0.95, barW, 3);
      ctx.fillStyle = person.health < 40 ? '#e05555' : '#e0b055';
      ctx.fillRect(px - barW / 2, py - h / 2 - w * 0.95, barW * (person.health / 100), 3);
    }

    if (this.commandedId === person.id) {
      // Whoever the player is giving orders to, marked for as long as that is
      // true. One fading floater was not enough to answer "am I ordering myself
      // or somebody else?", which is a question you ask on every right-click.
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(px - w / 2 - 4, py - h / 2 - w * 0.75, w + 8, h + w * 0.9);
      ctx.setLineDash([]);
    }

    if (person.isPlayer) {
      ctx.strokeStyle = '#ffd35c';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - w / 2 - 2, py - h / 2 - w * 0.6, w + 4, h + w * 0.6);
      this.drawPath(person);
    } else if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - w / 2 - 2, py - h / 2 - w * 0.6, w + 4, h + w * 0.6);
    }
  }

  /** Screen-tile distance a walk cycle covers before advancing to the next
   * of the atlas's four pose frames. */
  private static readonly WALK_STEP_TILES = 0.38;

  /**
   * Which of the atlas's four walk-cycle body frames a person is on right
   * now, advanced by how far they have actually moved on screen (the
   * interpolated position, not the raw tick-to-tick one) so the legs keep
   * time with the glide `Interpolator` already smooths everything else
   * into. Standing still holds the last frame rather than resetting to a
   * neutral stance, which would otherwise snap on every single stop.
   */
  private walkPoseFor(person: Person, at: Placed): number {
    this.walkPhaseCapture++;
    let track = this.walkPhase.get(person.id);
    if (!track) {
      track = { x: at.x, y: at.y, distance: 0, seen: this.walkPhaseCapture };
      this.walkPhase.set(person.id, track);
    }
    track.distance += Math.hypot(at.x - track.x, at.y - track.y);
    track.x = at.x;
    track.y = at.y;
    track.seen = this.walkPhaseCapture;

    // Swept the same way `Interpolator` sweeps its own tracks: rarely, and
    // only entries this pass never touched, so a century of the dead does
    // not sit in this map forever.
    if (this.walkPhaseCapture % (64 * 200) === 0) {
      for (const [id, t] of this.walkPhase) {
        if (t.seen !== this.walkPhaseCapture) this.walkPhase.delete(id);
      }
    }

    return Math.floor(track.distance / Renderer.WALK_STEP_TILES) % 4;
  }

  /**
   * The face a person wears this frame. Recomputed at most once per
   * simulation step — `expressionOf` and the `knowsCondition` check behind
   * it read state that only changes at tick granularity, so recomputing on
   * every one of the sixty frames a step is drawn across would be work
   * spent on an answer that has not changed.
   */
  private expressionFor(person: Person): Expression {
    const { sim } = this;
    const cached = this.moodCache.get(person.id);
    if (cached && cached.tick === sim.time.tick) return cached.expr;

    // Being visibly hurt at all is coarse and public — the health pip draws
    // for everyone below, whoever is watching. Which particular expression a
    // face wears is finer than that, so it stays behind `knowsCondition`
    // exactly like every other read of somebody's private state, and a
    // stranger gets the neutral cell instead.
    const knows = !sim.player || sim.player.id === person.id ||
      knowsPersonCondition(sim.player.id, person.id, sim.relationships);
    const expr = knows ? expressionOf(person, sim) : 'neutral';
    this.moodCache.set(person.id, { tick: sim.time.tick, expr });
    return expr;
  }

  /**
   * The player's own remaining route: current position, through whichever
   * waypoints `Pathfinder` left unspent, on to the real target. The only way
   * to *see* M7's routing in play. Restricted to the player's own character
   * on purpose — a stranger's planned route is exactly the kind of private
   * state `Knowledge.ts`'s visibility rules exist to withhold, and drawing it
   * for everyone would read a mind nobody offered.
   */
  private drawPath(person: Person): void {
    if (person.pathAt >= person.pathCount && person.targetX === null) return;
    const { ctx, camera } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 211, 92, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(camera.worldToScreenX(person.x), camera.worldToScreenY(person.y));
    for (let i = person.pathAt; i < person.pathCount; i++) {
      // The same `WAYPOINT_AIM` offset the walker is actually steered by. Not
      // cosmetic: this line is the only way to *see* routing in play, and
      // drawing raw tile indices is what let a half-tile aim bias hide behind
      // a picture of a route running neatly along the water's edge.
      const wx = person.path![i * 2]! + WAYPOINT_AIM;
      const wy = person.path![i * 2 + 1]! + WAYPOINT_AIM;
      ctx.lineTo(camera.worldToScreenX(wx), camera.worldToScreenY(wy));
    }
    if (person.targetX !== null && person.targetY !== null) {
      ctx.lineTo(camera.worldToScreenX(person.targetX), camera.worldToScreenY(person.targetY));
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * An animal, sized and coloured by species.
   *
   * Drawn low and wide rather than upright, so at a glance a herd never reads
   * as a group of people — which matters, because the two are told apart at
   * distance and the verbs for them are entirely different.
   */
  private drawAnimal(animal: Animal, selected: boolean, at: Placed): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(at.x);
    const py = camera.worldToScreenY(at.y);

    const size = ANIMAL_SIZES[animal.species];
    const w = scale * size;
    const h = scale * size * 0.62;

    ctx.fillStyle = ANIMAL_COLORS[animal.species];
    ctx.fillRect(px - w / 2, py - h / 2, w, h);
    // Head, offset, so the thing has a facing at a glance.
    ctx.fillRect(px + w * 0.34, py - h * 0.72, w * 0.3, h * 0.42);

    // An alarmed animal is the single most useful thing to see on this map:
    // it is the difference between a stalk that is working and one that is not.
    if (animal.alarmed) {
      ctx.fillStyle = '#ffd35c';
      ctx.fillRect(px - 1, py - h / 2 - scale * 0.42, 2, scale * 0.2);
    }

    if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - w / 2 - 3, py - h / 2 - 3, w + 6, h + 6);
    }
  }

  /**
   * How far through their current job somebody is, 0-1, or null if idle.
   *
   * Delegates to `workProgressOf` so the bar over the head and the bar in the
   * character panel cannot say different things — which they did, for the whole
   * of felling and building.
   */
  workProgress(person: Person): number | null {
    return workProgressOf(person, this.sim);
  }

}

/** Drawn size in tiles, per species. A hare is not a boar. */
const ANIMAL_SIZES: Record<string, number> = { deer: 0.55, boar: 0.6, hare: 0.3 };
const ANIMAL_COLORS: Record<string, string> = {
  deer: '#b3844e',
  boar: '#6b5442',
  hare: '#c9b191',
};

/**
 * How far a broad-phase pick looks before `hitRadiusOf` narrows it down.
 *
 * The spatial hash needs *some* radius to query with; this is deliberately
 * generous, because rejecting a candidate is `hitRadiusOf`'s job and a range
 * that is too small would hide large things from the picker entirely.
 */
export const PICK_RANGE = 2.2;

/**
 * How close the player's own character must be before a pile's contents are
 * labelled on the map.
 *
 * Not a knowledge-gated value — `Knowledge.ts` governs what a *person* knows,
 * and this never reaches the sim — but the same principle applies to what the
 * screen tells the player: reading the contents of a pile across the valley
 * would be an omniscience the rest of the interface is built to withhold.
 */
const PILE_LABEL_RANGE = 6;

/**
 * Slack added to every hit radius, so precise clicking is not miserable.
 *
 * A quarter of a tile at the default zoom is a few pixels — enough that a click
 * aimed at a sprig of a seedling still lands on it, and not so much that the
 * seedling swallows clicks aimed at the grass beside it.
 */
export const GRAB_MARGIN = 0.25;

/**
 * How large a thing is to click on, matching what `drawPerson`, `drawNode`,
 * `drawTree` and `drawPile` above actually paint.
 *
 * These live here, beside the drawing code that produces them, precisely so
 * that the picker and the painter cannot drift apart. The picker used to carry
 * its own fixed radii — person 1.2, node 1.4, tree 1.6 — so a seedling drawn as
 * a two-pixel sprig captured clicks a tile and a half away and the bush you were
 * pointing at lost every one of them.
 */
export function hitRadiusOf(target: HitTarget): number {
  switch (target.kind) {
    // Body is 0.34 x 0.52 tiles plus a head; 0.45 covers the drawn silhouette
    // at adult size. M9.5 phase 1 draws a child small and an elder stooped
    // through the same `bodyScaleOf`, so the click target has to shrink and
    // grow with them or a child is clicked at the size of the adult standing
    // beside them — the "what is drawn and what is clickable are a third of
    // a tile apart" bug this file already warns about, one paragraph up.
    case 'person': return 0.45 * bodyScaleOf(target.person);
    // Three states, three sizes, read from the table `drawNode` paints from.
    // It used to be a fullness curve down to 0.18 of a tile with a 0.3 floor
    // under it, which meant the floor was doing all the work for every node
    // below half — the click target and the painted size had already parted
    // company before M9.6 phase 3 gave them one table to share.
    case 'node': return NODE_SIZES[nodeStateOf(target.node)];
    // `drawTree` paints a canopy of `tree.radius * 0.55`; a seedling is ~0.2.
    case 'tree': return Math.max(0.2, target.tree.radius * 0.55);
    case 'pile': return 0.3;
    // Matches the upright stone painted above: small, and easy to miss under
    // somebody standing on it, which is what the picker is for.
    case 'inscription': return 0.32;
    // Matches `ANIMAL_SIZES`, which is what `drawAnimal` paints.
    case 'animal': return (ANIMAL_SIZES[target.animal.species] ?? 0.5) * 0.75;
  }
}

/** The kinds `hitRadiusOf` knows how to size. Buildings use `contains`. */
export type HitTarget =
  | { kind: 'person'; person: Person }
  | { kind: 'node'; node: ResourceNode }
  | { kind: 'tree'; tree: Tree }
  | { kind: 'pile'; pile: ItemPile }
  | { kind: 'inscription'; inscription: Inscription }
  | { kind: 'animal'; animal: Animal };
