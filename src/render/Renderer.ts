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
import { stageOf, type Corpse } from '../sim/entities/Corpse.ts';
import type { Simulation } from '../sim/core/Simulation.ts';
import { hearthLight, torchLight, type LightSource } from '../sim/core/Light.ts';
import { Interpolator, type Placed } from './Interpolator.ts';
import type { Inscription } from '../sim/entities/Inscription.ts';
import type { Person } from '../sim/entities/Person.ts';
import { ITEMS } from '../sim/entities/Item.ts';
import type { PlaceRecord, PlaceVisual } from '../sim/social/PlaceMemory.ts';
import { FogReveal } from './FogReveal.ts';
import type { World } from '../sim/core/World.ts';
import { BIOMES, type Biome } from '../sim/core/World.ts';
import type { Season } from '../sim/core/TimeManager.ts';
import { WAYPOINT_AIM } from '../sim/systems/MovementSystem.ts';
import { BUSH_SPECIES, BUSHES, WILD_PLANTS, type BushSpecies, type ResourceKind, type ResourceNode } from '../sim/entities/ResourceNode.ts';
import type { ItemPile } from '../sim/entities/ItemPile.ts';
import type { Animal } from '../sim/entities/Animal.ts';
import { animalPose, trackAnimal, type AnimalTrack } from './AnimalAnimation.ts';
import { BUILDINGS, type Building } from '../sim/entities/Building.ts';
import { houseInteriorContains } from '../sim/world/HouseInterior.ts';
import type { Tree } from '../sim/entities/Tree.ts';
import type { TreeSpecies } from '../sim/entities/Tree.ts';
import { workProgressOf } from '../sim/core/Progress.ts';
import { DIG_TO } from '../sim/core/Earth.ts';
import { expressionOf, type Expression } from '../sim/core/Mood.ts';
import { canSeePlace, knowsPersonCondition } from '../sim/social/Knowledge.ts';
import { Camera, TILE } from './Camera.ts';
import { waterColors } from './WaterColor.ts';

/**
 * How hard the relief shows: elevation differences between neighbouring tiles
 * are about 0.013 at the median and 0.045 at the 99th percentile, so this puts
 * a median slope near a tenth of opacity and a cliff at the cap.
 */
const RELIEF_GAIN = 10;
import { Floaters } from './Floaters.ts';
import { t, tc } from '../i18n/i18n.ts';
import { ArtAtlas, type PersonAspect } from './ArtAtlas.ts';
import type { ArtDir, ArtPose } from './ArtManifest.ts';
import { choppingPose, craftingPose, diggingPose, extractionPose, fishingPose, gatheringPose } from './WorkAnimation.ts';
import { ADULT_YEARS } from '../sim/entities/Person.ts';
import { showing } from '../sim/entities/Pregnancy.ts';
import {
  SpriteAtlas, BAND_COLORS, bandColorIndex, sizeClassOf, bodyScaleOf, hairVariantOf, hasBeardOf, heldItemFor, heldTorchFor,
  type SizeClass,
} from './Sprites.ts';

/** Public appearance only: items in the private inventory do not look worn. */
export function wornGarmentsOf(person: Person): PersonAspect['wear'] {
  const torsoId = person.equipment.torso?.item;
  const torsoDef = torsoId ? ITEMS[torsoId]?.garment : undefined;
  const torso = torsoDef?.slot === 'torso' && torsoId && person.inventory.count(torsoId) > 0 &&
    (torsoId === 'fur_coat' || torsoId === 'hide_armour' || torsoId === 'sewn_tunic')
    ? torsoId === 'sewn_tunic' ? 'tunic' : torsoId : undefined;
  const cloak = person.equipment.cloak?.item === 'hide_cape' && person.inventory.count('hide_cape') >= 1
    ? 'cloak' as const : undefined;
  const feet = person.equipment.feet?.item === 'foot_wraps' && person.inventory.count('foot_wraps') >= 1
    ? 'wraps' as const : undefined;
  // Keep absent optional regions out of the appearance record: old callers
  // and cached appearances already use the two torso/cloak keys.
  return feet ? { torso, cloak, feet } : { torso, cloak };
}

const BIOME_COLORS: Record<Biome, [string, string]> = {
  // [base, speckle] — the speckle is dotted in per-tile to break up flat fields.
  // This is also spring and summer's palette: the two growing seasons keep
  // the ground's year-round colours, and only autumn and winter override it.
  water:  ['#24506f', '#2b5c7e'],
  river:  ['#24506f', '#2b5c7e'],
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
  meadow: number;
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
  // Copper as it lies: orange-brown, with a green bloom on it where it has weathered.
  native_copper: '#c9803c',
  // A seam shows as a grey outcrop stained with the metal's own colour: green
  // for copper, a pale tin-bright for tin.
  copper_ore: '#7a8f86',
  tin_ore: '#aeb4bb',
  // Yellow, the one colour in the table that is nothing else.
  gold: '#e6c34a',
  // Bog iron reads as a dark rust stain against wet ground.
  iron_ore: '#875b4c',
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
  corpseId?: number;
}

export class Renderer {
  readonly floaters = new Floaters();
  /** Who the player is currently commanding, outlined on the map. */
  commandedId: number | null = null;
  /** Tile the build cursor is hovering, or null when not in build mode. */
  buildGhost: {
    x: number; y: number; width: number; height: number; ok: boolean;
    /** Why it cannot stand here, written next to the cursor (M15 phase 26c). */
    reason?: string | null;
    /** For an earthwork, the tiles of the plan, so the preview is the work and not its bounding box. */
    plan?: { x: number; y: number; kind: 'dig' | 'pile' }[];
  } | null = null;
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
  private legacyAtlas: SpriteAtlas | null = null;
  private get atlas(): SpriteAtlas { return (this.legacyAtlas ??= new SpriteAtlas()); }

  /**
   * The committed art (`public/art`, see `ArtAtlas.ts`). When it is present
   * nothing is baked at startup and `atlas` above is never built; when it is
   * absent (a test that has no sheets, a failed fetch) the game falls back to
   * the procedural figures it always had.
   */
  private art: ArtAtlas | null = null;
  /** Presentation only: hides every roof, the way the roof-lift key will once phase 16 lands. */
  hideRoofs = false;
  /** Last cursor position in world units; presentation input for roof hover only. */
  cursorWorld: { x: number; y: number } | null = null;
  /** Buildings that stand up out of the ground this frame, depth-sorted with the people. */
  private readonly tallBuildings: Building[] = [];
  private frameHighlight: Highlight | null = null;
  private readonly animalTrack = new Map<number, AnimalTrack>();

  setArt(art: ArtAtlas | null): void { this.art = art; }

  /**
   * Walk-cycle phase per person, presentation state exactly like
   * `interpolator` above: advanced by *drawn* distance (interpolated, so it
   * keeps pace with what is on screen) rather than by anything the
   * simulation tracks, and swept the same way `Interpolator` sweeps its own
   * tracks so a century of dead people does not accumulate here.
   */
  private readonly walkPhase = new Map<number, { x: number; y: number; distance: number; seen: number; dir: ArtDir; movedAt: number }>();
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
  /** Static discovered/unknown mask; keyed by the observer's map revision. */
  private fogLayer: HTMLCanvasElement | null = null;
  private fogLayerKey = '';
  private fogFrame: HTMLCanvasElement | null = null;
  private fogFrameCtx: CanvasRenderingContext2D | null = null;
  /** Viewport-sized darkness layer; resized only when the viewport changes. */
  private nightLayer: HTMLCanvasElement | null = null;
  private nightLayerCtx: CanvasRenderingContext2D | null = null;
  private fogRecordsFor = -1;
  /** After a change of character the fog shows only what they see now (`FogReveal`). */
  private readonly fogReveal = new FogReveal();
  private fogRecords: PlaceRecord[] = [];
  /** Observer mode is an explicit presentation choice, never simulation state. */
  fogEnabled = true;
  /** The `World.earthVersion` the terrain bake was made at. */
  private earthSeen = 0;

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
    this.fogLayer = null;
    this.fogLayerKey = '';
    this.fogRecordsFor = -1;
    this.fogReveal.reset();
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
    // M15 phase 23a: how tall the meadow stands, in four steps, so the terrain
    // is re-baked a few times a year as the sward grows and dies back and not
    // every day. The mean over the whole map is enough: it moves with the year.
    const meadow = this.meadowLevel();
    return { season, frost, heat, meadow, key: `${season}:${frost}:${heat}:${meadow}` };
  }

  /** 0-3: the mean height of the sward against what the ground could carry. */
  private meadowLevel(): number {
    const { grass, grassCap } = this.sim.world;
    let have = 0;
    let cap = 0;
    for (let i = 0; i < grass.length; i += 7) { have += grass[i]!; cap += grassCap[i]!; }
    return cap === 0 ? 0 : Math.min(3, Math.floor((have / cap) * 4));
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
    this.earthSeen = world.earthVersion;

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const biome = BIOMES[world.biome[world.index(x, y)]!]!;
        const aquatic = biome === 'water' || biome === 'river';
        const [base, speckle] = aquatic
          ? waterColors(world.depthAt(x, y), world.wadeDepth, world.swimDepth)
          : SEASON_BIOME_COLORS[season]?.[biome] ?? BIOME_COLORS[biome];
        ctx.fillStyle = base;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

        // A deterministic speckle from the tile coordinates: cheap texture that
        // does not need an art asset and does not shimmer between frames.
        const h = (x * 73856093) ^ (y * 19349663);
        if ((h & 7) === 0) {
          ctx.fillStyle = speckle;
          ctx.fillRect(x * TILE + ((h >> 3) & 3) * 4, y * TILE + ((h >> 5) & 3) * 4, 4, 4);
        }

        if (aquatic) continue;

        // Earth moved by a spade, M15 phase 26: a dug tile is darker, turned
        // ground and a piled one paler, loose earth, in proportion to how far
        // it has been moved. The rim shows through the relief shading below.
        const moved = world.offset[world.index(x, y)]!;
        if (Math.abs(moved) > 1e-6) {
          const strength = Math.min(0.7, Math.abs(moved) / DIG_TO * 0.7);
          ctx.fillStyle = moved < 0 ? `rgba(120,78,44,${strength})` : `rgba(226,204,156,${strength})`;
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }

        // Relief, M15 phase 25a: the sun in the north-west. A tile whose ground
        // climbs towards the east and south faces it and is lit; one that falls
        // away is in its own shade. The gradient is read off `heightAt`, so a
        // spade (phase 26) changes the picture the same way it changes the walk.
        const shade = (world.heightAt(x + 1, y) - world.heightAt(x - 1, y) +
                       world.heightAt(x, y + 1) - world.heightAt(x, y - 1)) * 0.35 * RELIEF_GAIN;
        if (Math.abs(shade) > 0.02) {
          ctx.fillStyle = shade > 0
            ? `rgba(255,248,220,${Math.min(0.22, shade)})`
            : `rgba(10,20,40,${Math.min(0.26, -shade)})`;
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }

        // Tall grass is a deeper green and a cropped or dead sward is paler.
        // Per tile, so a grazed patch shows; the bake is redone when the
        // meadow's overall level changes.
        const cap = world.grassCap[world.index(x, y)]!;
        if (cap > 0 && frost === 0) {
          const ratio = world.grass[world.index(x, y)]! / cap;
          if (ratio > 0.75) {
            ctx.fillStyle = 'rgba(30,110,40,0.14)';
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          } else if (ratio < 0.3) {
            ctx.fillStyle = 'rgba(190,170,110,0.16)';
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          }
        }

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

  /** The accumulator fraction is held by main.ts when the world is paused. */
  private workAlpha = 1;

  /**
   * Draws one frame.
   *
   * `alpha` is how far the world is between the last completed simulation step
   * and the next one, and it is what turns five positions a second into sixty.
   * It comes from the fixed-step accumulator in `main.ts`, which was already
   * computing it and throwing it away.
   */
  render(highlight: Highlight | null, alpha = 1): void {
    this.workAlpha = alpha;
    const { ctx, camera, sim } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, camera.viewWidth, camera.viewHeight);

    const view = camera.visibleTiles();
    const scale = camera.scale;
    // Noticed even with the fog off, or a swap made meanwhile would not count.
    this.fogReveal.follow(sim.player?.id ?? null);
    const observer = this.fogEnabled ? sim.player : null;
    const sightRadius = observer ? sim.sightOf(observer) : sim.config.sightRadius;
    const inSight = (x: number, y: number): boolean =>
      canSeePlace(observer, x, y, sightRadius);
    const nightSources: { source: LightSource; centerLight: number }[] = [];
    // Lights may reach the edge from just offscreen, so query the spatial hash
    // by the viewport's diagonal plus the source radius instead of scanning all
    // buildings or relying only on the entity draw list.
    const viewRadius = Math.hypot(camera.viewWidth / (2 * scale), camera.viewHeight / (2 * scale));
    for (const building of sim.buildingHash.queryRadius(camera.x, camera.y, viewRadius + 5)) {
      const source = hearthLight(building);
      if (!source || !inSight(source.x, source.y)) continue;
      const px = camera.worldToScreenX(source.x), py = camera.worldToScreenY(source.y);
      const radius = source.radius * scale;
      if (px + radius < 0 || px - radius > camera.viewWidth ||
          py + radius < 0 || py - radius > camera.viewHeight) continue;
      nightSources.push({ source, centerLight: sim.lightAt(source.x, source.y) });
    }
    for (const carrier of sim.peopleHash.queryRadius(camera.x, camera.y, viewRadius + 5)) {
      const source = torchLight(carrier);
      if (!source || !inSight(carrier.x, carrier.y)) continue;
      const px = camera.worldToScreenX(source.x), py = camera.worldToScreenY(source.y);
      const radius = source.radius * scale;
      if (px + radius < 0 || px - radius > camera.viewWidth ||
          py + radius < 0 || py - radius > camera.viewHeight) continue;
      nightSources.push({ source, centerLight: sim.lightAt(source.x, source.y) });
    }

    // Repaint the whole terrain canvas only when the season (or a hard
    // freeze threshold within winter) actually changes — a few times a game
    // year, not sixty times a second. See `seasonVisual` and
    // `prerenderTerrain`.
    const visual = this.seasonVisual();
    if (visual.key !== this.seasonKey || sim.world.earthVersion !== this.earthSeen) {
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
      if (!inSight(node.x, node.y)) continue;
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
      if (!inSight(tree.x, tree.y)) continue;
      this.drawTree(tree, highlight?.treeId === tree.id);
    }

    // --- Buildings ---------------------------------------------------------
    // Drawn under people so someone standing in a doorway is not hidden by it.
    // With the committed art, the ones that stand up out of the ground (huts,
    // houses, ovens) are left for the depth-sorted pass below, so a person
    // behind a hut is behind it and a person at its door is in front.
    this.frameHighlight = highlight;
    this.tallBuildings.length = 0;
    for (const building of sim.buildings) {
      if (building.x > view.maxX || building.y > view.maxY) continue;
      if (building.x + building.def.width < view.minX) continue;
      if (building.y + building.def.height < view.minY) continue;
      if (!inSight(building.centerX, building.centerY)) continue;
      this.drawBuilding(building, highlight?.buildingId === building.id);
    }

    // --- Dropped goods -----------------------------------------------------
    for (const pile of sim.piles) {
      if (pile.x < view.minX || pile.x > view.maxX) continue;
      if (pile.y < view.minY || pile.y > view.maxY) continue;
      if (!inSight(pile.x, pile.y)) continue;
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

    // --- Bodies --------------------------------------------------------------
    // M11 phase 16a. A body lies where somebody died, drawn low and grey on
    // the ground below the living. Nothing on the map says whose it is:
    // that is for the inspector to say, and only to somebody who knew them.
    for (const corpse of sim.corpses) {
      if (corpse.x < view.minX || corpse.x > view.maxX) continue;
      if (corpse.y < view.minY || corpse.y > view.maxY) continue;
      if (!inSight(corpse.x, corpse.y)) continue;
      if (sim.isBuried(corpse.x, corpse.y)) continue;
      const px = camera.worldToScreenX(corpse.x);
      const py = camera.worldToScreenY(corpse.y);
      const long = scale * 0.5;
      const wide = scale * 0.18;
      // M11 phase 16b: what time and a blade have done to it.
      const stage = stageOf(corpse, sim.time.tick, sim.config.time.ticksPerDay);
      if (corpse.dismembered || stage === 'bones') {
        ctx.fillStyle = stage === 'bones' ? '#ddd6c6' : '#7a5a50';
        for (let k = 0; k < 5; k++) {
          const ox = Math.cos(k * 2.4 + corpse.id) * long * 0.4;
          const oy = Math.sin(k * 2.4 + corpse.id) * wide;
          ctx.fillRect(px + ox - wide * 0.3, py + oy - wide * 0.2, wide * 0.6, wide * 0.4);
        }
        if (highlight?.corpseId === corpse.id) {
          ctx.strokeStyle = '#7fd4ff';
          ctx.lineWidth = 2;
          ctx.strokeRect(px - long / 2 - 3, py - wide - 3, long + 6, wide * 2 + 6);
        }
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(px - long / 2 + 1, py - wide / 2 + 2, long, wide);
      ctx.fillStyle = stage === 'fresh' ? '#8e8a84' : '#6f6a55';
      ctx.fillRect(px - long / 2, py - wide / 2, long, wide);
      ctx.fillStyle = stage === 'fresh' ? '#b3aea6' : '#8a8468';
      ctx.beginPath();
      ctx.arc(px + long / 2, py, wide * 0.6, 0, Math.PI * 2);
      ctx.fill();
      if (corpse.wounded) {
        ctx.fillStyle = '#8a2c24';
        ctx.fillRect(px - wide * 0.4, py - wide * 0.3, wide * 0.8, wide * 0.6);
      }
      if (highlight?.corpseId === corpse.id) {
        ctx.strokeStyle = '#7fd4ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - long / 2 - 3, py - wide / 2 - 3, long + wide + 6, wide + 6);
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
      if (!inSight(record.x, record.y)) continue;
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

    // --- Animals, people and tall buildings, back to front ------------------
    // Sorted on the row their feet (or a wall's foot) stand on. Animals go in
    // first, then people, so at equal depth a hunter is still drawn over the
    // kill, as before.
    // Culled on the drawn position rather than the simulation one, so nothing
    // pops out of the view half a step before it leaves it.
    const depth: { y: number; kind: number; ref: Animal | Person | Building; at: Placed | null }[] = [];
    for (const animal of sim.animals) {
      if (!animal.alive) continue;
      const at = this.interpolator.at('animal', animal, alpha);
      if (at.x < view.minX || at.x > view.maxX) continue;
      if (at.y < view.minY || at.y > view.maxY) continue;
      if (!inSight(at.x, at.y)) continue;
      depth.push({ y: at.y + 0.1, kind: 0, ref: animal, at });
    }
    // --- People ------------------------------------------------------------
    // A carried baby (M15 phase 20) shares its carrier's position exactly, so
    // drawn in list order it vanished under her or covered her face. It is
    // drawn after its carrier instead, held at her side, which is also the
    // only way the player can see that a mother has a baby in one arm and
    // only one hand free.
    const carried = new Map<number, Person[]>();
    for (const person of sim.livingPeople()) {
      if (person.carriedBy === null) continue;
      const held = carried.get(person.carriedBy);
      if (held) held.push(person); else carried.set(person.carriedBy, [person]);
    }
    for (const person of sim.livingPeople()) {
      if (person.carriedBy !== null && sim.peopleById.get(person.carriedBy)?.alive) continue;
      const at = this.interpolator.at('person', person, alpha);
      if (at.x < view.minX || at.x > view.maxX || at.y < view.minY || at.y > view.maxY) continue;
      if (!inSight(at.x, at.y)) continue;
      depth.push({ y: at.y + 0.35 * bodyScaleOf(person), kind: 1, ref: person, at });
    }
    for (const b of this.tallBuildings) depth.push({ y: b.y - 0.5 + b.def.height, kind: 2, ref: b, at: null });
    depth.sort((a, b) => a.y - b.y);
    for (const d of depth) {
      if (d.kind === 0) this.drawAnimal(d.ref as Animal, highlight?.animalId === (d.ref as Animal).id, d.at!);
      else if (d.kind === 1) {
        const person = d.ref as Person;
        this.drawPerson(person, highlight?.personId === person.id, d.at!);
        const babies = carried.get(person.id);
        babies?.forEach((baby, i) => {
          const side = i === 0 ? 1 : -1;
          this.drawPerson(baby, highlight?.personId === baby.id,
            { ...d.at!, x: d.at!.x + side * 0.22, y: d.at!.y - 0.06 });
        });
      } else this.drawDepthBuilding(d.ref as Building);
    }

    // --- Build ghost -------------------------------------------------------
    if (this.buildGhost) {
      const g = this.buildGhost;
      const px = camera.worldToScreenX(g.x - 0.5);
      const py = camera.worldToScreenY(g.y - 0.5);
      ctx.fillStyle = g.ok ? 'rgba(120, 220, 150, 0.28)' : 'rgba(230, 100, 100, 0.28)';
      if (g.plan) {
        // The plan itself: dug tiles dark, heaped tiles light, the bounding box faint.
        for (const tile of g.plan) {
          ctx.fillStyle = g.ok
            ? (tile.kind === 'dig' ? 'rgba(92, 64, 36, 0.55)' : 'rgba(214, 190, 140, 0.55)')
            : 'rgba(230, 100, 100, 0.4)';
          ctx.fillRect(camera.worldToScreenX(tile.x - 0.5), camera.worldToScreenY(tile.y - 0.5), scale, scale);
        }
      } else {
        ctx.fillRect(px, py, g.width * scale, g.height * scale);
      }
      ctx.strokeStyle = g.ok ? '#7ddc96' : '#e66464';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, g.width * scale, g.height * scale);
      if (!g.ok && g.reason) {
        // The refusal beside the cursor, so the player does not have to click to be told.
        ctx.font = '600 13px system-ui, sans-serif';
        const width = ctx.measureText(g.reason).width + 12;
        const tx = Math.max(4, Math.min(px, camera.viewWidth - width - 4));
        const ty = Math.max(20, py - 8);
        ctx.fillStyle = 'rgba(30, 14, 14, 0.82)';
        ctx.fillRect(tx, ty - 15, width, 21);
        ctx.fillStyle = '#ffb4b4';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(g.reason, tx + 6, ty);
      }
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

    // Fog is composed as its own layer so the moving sight circle can be cut
    // out without erasing terrain or sprites. Unknown entities were culled
    // above; remembered markers are drawn over the veil from the observer's
    // own records only.
    if (observer) this.drawFog(observer, view, alpha);

    // --- Night overlay -----------------------------------------------------
    this.drawNightOverlay(nightSources);

    // Floaters last, over the night overlay: an action label that dims with
    // nightfall is exactly the label you most need to read.
    this.floaters.draw(ctx, camera);
  }

  /** Tint the finished scene, then erase a linear light falloff on this layer only. */
  private drawNightOverlay(sources: readonly { source: LightSource; centerLight: number }[]): void {
    const { camera, sim, ctx } = this;
    const daylight = sim.time.daylight;
    const darkness = (1 - daylight) * 0.55;
    if (darkness <= 0.02) return;
    const width = Math.ceil(camera.viewWidth), height = Math.ceil(camera.viewHeight);
    if (!this.nightLayer || this.nightLayer.width !== width || this.nightLayer.height !== height) {
      this.nightLayer = document.createElement('canvas');
      this.nightLayer.width = width;
      this.nightLayer.height = height;
      this.nightLayerCtx = this.nightLayer.getContext('2d');
    }
    const night = this.nightLayerCtx;
    if (!night || !this.nightLayer) return;
    night.globalCompositeOperation = 'source-over';
    night.clearRect(0, 0, width, height);
    night.fillStyle = `rgba(10, 16, 40, ${darkness})`;
    night.fillRect(0, 0, width, height);

    // Erase proportionally to the amount of measured light above daylight. The
    // remaining radius is where Light.ts's linear falloff reaches daylight.
    if (daylight < 1) {
      night.globalCompositeOperation = 'destination-out';
      for (const { source, centerLight } of sources) {
        if (centerLight <= daylight || source.strength <= daylight) continue;
        const x = camera.worldToScreenX(source.x), y = camera.worldToScreenY(source.y);
        const radius = source.radius * (1 - daylight / source.strength) * camera.scale;
        if (radius <= 0 || x + radius < 0 || x - radius > camera.viewWidth ||
            y + radius < 0 || y - radius > camera.viewHeight) continue;
        const lift = Math.max(0, Math.min(1, (centerLight - daylight) / (1 - daylight)));
        const gradient = night.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${lift})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        night.fillStyle = gradient;
        night.beginPath();
        night.arc(x, y, radius, 0, Math.PI * 2);
        night.fill();
      }
    }
    ctx.drawImage(this.nightLayer, 0, 0, camera.viewWidth, camera.viewHeight);
  }

  /** Text for a remembered marker under the pointer, without touching live entities. */
  fogDescriptionAt(x: number, y: number): string | null {
    const observer = this.fogEnabled ? this.sim.player : null;
    if (!observer || Math.hypot(x - observer.x, y - observer.y) <= this.sim.sightOf(observer)) return null;
    if (observer.placeMemory.seenDayAt(x, y) === 0 || !this.fogReveal.shows(x, y)) return null;
    const place = observer.placeMemory.nearestAny(x, y, 0.65);
    if (!place) return null;
    return place.source === 'told'
      ? t('heard about this place')
      : t('seen {n} days ago', { n: Math.max(0, this.sim.time.day - place.day) });
  }

  /**
   * What the ground under a point is, for the tooltip: its biome and how high
   * above the sea. Only for ground in sight — what is merely remembered is
   * `fogDescriptionAt`'s, and the height of a place nobody is looking at is not
   * something the player has earned.
   */
  groundDescriptionAt(x: number, y: number): string | null {
    const world = this.sim.world;
    if (!world.inBounds(x, y)) return null;
    const observer = this.fogEnabled ? this.sim.player : null;
    if (observer && Math.hypot(x - observer.x, y - observer.y) > this.sim.sightOf(observer)) return null;
    const metres = Math.round(world.metresAt(x, y));
    // Earth moved by a spade (phase 26) is said in its own words, in metres to
    // a tenth, because a trench is a metre deep and rounds to nothing otherwise.
    const moved = world.depthDug(x, y) * world.metresPerUnit;
    const spade = moved >= 0.05 ? ' · ' + t('dug {m} m deep', { m: moved.toFixed(1) })
      : moved <= -0.05 ? ' · ' + t('piled {m} m high', { m: (-moved).toFixed(1) }) : '';
    return tc('biome', world.biomeAt(x, y)) + ' · ' +
      (metres > 0 ? t('{m} m above the sea', { m: metres }) : t('at sea level')) + spade;
  }

  /** Paint the observer's coarse, cached map and the places they remember. */
  private drawFog(observer: Person, view: ReturnType<Camera['visibleTiles']>, alpha: number): void {
    const { canvas, camera, sim } = this;
    const memory = observer.placeMemory;
    const reveal = this.fogReveal;
    reveal.observe(observer.x, observer.y, sim.sightOf(observer), sim.world.width, sim.world.height);
    const key = observer.id + ':' + sim.world.width + 'x' + sim.world.height + ':' + memory.revision +
      ':' + reveal.revision;
    if (!this.fogLayer || this.fogLayer.width !== sim.world.width * TILE || this.fogLayer.height !== sim.world.height * TILE) {
      this.fogLayer = document.createElement('canvas');
      this.fogLayer.width = sim.world.width * TILE;
      this.fogLayer.height = sim.world.height * TILE;
      this.fogLayerKey = '';
    }
    if (this.fogLayerKey !== key) {
      const fog = this.fogLayer.getContext('2d');
      if (!fog) return;
      // A memory revision repaints translucent visited cells. Without clearing
      // the old pixels first, every observation adds another coat until the
      // whole explored map turns black during play.
      fog.clearRect(0, 0, this.fogLayer.width, this.fogLayer.height);
      const cell = 4;
      if (this.fogRecordsFor !== memory.revision) {
        this.fogRecords = memory.allRecords();
        this.fogRecordsFor = memory.revision;
      }
      for (let cy = 0; cy < memory.rows; cy++) {
        for (let cx = 0; cx < memory.cols; cx++) {
          const x = cx * cell;
          const y = cy * cell;
          fog.fillStyle = memory.seenDayAt(x + cell / 2, y + cell / 2) > 0 &&
            reveal.shows(x + cell / 2, y + cell / 2)
            ? 'rgba(10, 16, 40, 0.28)' : '#000000';
          fog.fillRect(x * TILE, y * TILE,
            Math.min(cell, sim.world.width - x) * TILE,
            Math.min(cell, sim.world.height - y) * TILE);
        }
      }
      // Memory markers are baked into the same versioned layer. Repainting
      // hundreds of places every animation frame made the first fog prototype
      // shimmer under hover and spend render time on data that changes only at
      // a thought or a new conversation.
      for (const place of this.fogRecords) {
        // A rumour can name an unvisited place. Keep the knowledge, but the
        // owner's never-visited map must remain visually black.
        if (memory.seenDayAt(place.x, place.y) === 0 || !reveal.shows(place.x, place.y)) continue;
        this.drawRememberedPlace(place, fog, place.x * TILE, place.y * TILE, TILE * 0.26);
      }
      this.fogLayerKey = key;
    }

    if (!this.fogFrame || this.fogFrame.width !== canvas.width || this.fogFrame.height !== canvas.height) {
      this.fogFrame = document.createElement('canvas');
      this.fogFrame.width = canvas.width;
      this.fogFrame.height = canvas.height;
      this.fogFrameCtx = this.fogFrame.getContext('2d');
    }
    const frame = this.fogFrame;
    const frameCtx = this.fogFrameCtx;
    if (!frame || !frameCtx || !this.fogLayer) return;
    const dprX = frame.width / Math.max(1, camera.viewWidth);
    const dprY = frame.height / Math.max(1, camera.viewHeight);
    frameCtx.setTransform(dprX, 0, 0, dprY, 0, 0);
    frameCtx.clearRect(0, 0, camera.viewWidth, camera.viewHeight);

    const sx = Math.max(0, view.minX);
    const sy = Math.max(0, view.minY);
    const sw = Math.min(sim.world.width - sx, view.maxX - sx + 1);
    const sh = Math.min(sim.world.height - sy, view.maxY - sy + 1);
    if (sw > 0 && sh > 0) {
      frameCtx.drawImage(this.fogLayer, sx * TILE, sy * TILE, sw * TILE, sh * TILE,
        camera.worldToScreenX(sx), camera.worldToScreenY(sy), sw * camera.scale, sh * camera.scale);
    }

    const at = this.interpolator.at('person', observer, alpha);
    frameCtx.globalCompositeOperation = 'destination-out';
    frameCtx.beginPath();
    frameCtx.arc(camera.worldToScreenX(at.x), camera.worldToScreenY(at.y),
      sim.sightOf(observer) * camera.scale, 0, Math.PI * 2);
    frameCtx.fill();
    frameCtx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(frame, 0, 0, frame.width, frame.height,
      0, 0, camera.viewWidth, camera.viewHeight);
  }

  /** A map marker is deliberately generic: a stale memory is not the live thing. */
  private drawRememberedPlace(place: PlaceRecord, ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.globalAlpha = place.source === 'told' ? 0.48 : 0.68;
    if (place.visual?.type === 'tree') {
      this.drawRememberedTree(place.visual, ctx, x, y);
      ctx.globalAlpha = 1;
      return;
    }
    if (place.visual?.type === 'person') {
      this.drawRememberedPerson(place.visual, ctx, x, y);
      ctx.globalAlpha = 1;
      return;
    }
    if (place.visual?.type === 'building') {
      this.drawRememberedBuilding(place.visual, ctx, x, y);
      ctx.globalAlpha = 1;
      return;
    }
    if (place.kind === 'water') {
      ctx.fillStyle = '#65aeca'; ctx.beginPath(); ctx.ellipse(x, y, size * 0.85, size * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    } else if (place.visual?.type === 'bush') {
      // As it was seen: in leaf or bare, with fruit or without, whatever the
      // season is now (owner, 2026-10-01).
      const species = (BUSH_SPECIES as readonly string[]).includes(place.visual.species) ||
        (WILD_PLANTS as readonly string[]).includes(place.visual.species)
        ? place.visual.species as BushSpecies : null;
      this.drawBush(x, y, TILE * 0.23 * 1.8, place.amount === 2 ? 'full' : place.amount === 1 ? 'picked' : 'spent',
        species, place.visual.leafless, ctx);
    } else if (place.kind.startsWith('resource:')) {
      this.drawRememberedResource(place.kind.slice('resource:'.length), place.amount, ctx, x, y);
    } else if (place.kind.startsWith('fruit:')) {
      ctx.fillStyle = '#8da96c'; ctx.beginPath(); ctx.arc(x, y, size * 0.7, 0, Math.PI * 2); ctx.fill();
    } else if (place.kind.startsWith('building:')) {
      this.drawRememberedBuildingMarker(place.amount, ctx, x, y, size);
    } else if (place.kind.startsWith('herd:')) {
      this.drawRememberedAnimal(place.kind.slice('herd:'.length), ctx, x, y, size);
    } else if (place.kind.startsWith('pile:')) {
      ctx.fillStyle = '#9b7950'; ctx.beginPath(); ctx.ellipse(x, y + size * 0.08, size * 0.85, size * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c1a276'; ctx.beginPath(); ctx.ellipse(x, y - size * 0.12, size * 0.53, size * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#b18c5b'; ctx.beginPath(); ctx.moveTo(x, y - size * 0.7); ctx.lineTo(x + size * 0.7, y);
      ctx.lineTo(x, y + size * 0.7); ctx.lineTo(x - size * 0.7, y); ctx.closePath(); ctx.fill();
    }
    if (place.amount === 0) {
      ctx.strokeStyle = 'rgba(20, 22, 25, 0.8)';
      ctx.lineWidth = Math.max(1, size * 0.16);
      ctx.beginPath();
      ctx.moveTo(x - size * 0.45, y + size * 0.45);
      ctx.lineTo(x + size * 0.45, y - size * 0.45);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawRememberedResource(kind: string, amount: number, ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const scale = TILE * 0.23;
    const depleted = amount === 0;
    ctx.strokeStyle = depleted ? '#928b79' : '#6a593c';
    ctx.fillStyle = depleted ? '#928b79' : '#d5b45f';
    if (kind === 'sticks' || kind === 'reeds' || kind === 'wild_grain') {
      ctx.lineWidth = Math.max(1, scale * 0.18);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * scale * 0.32, y + scale * 0.5);
        ctx.lineTo(x + i * scale * 0.18, y - scale * (kind === 'sticks' ? 0.25 : 0.65)); ctx.stroke();
      }
      if (kind === 'wild_grain' && !depleted) {
        ctx.fillStyle = '#ceb45c';
        for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * scale * 0.18 - 1, y - scale * 0.65, 2, 3);
      }
    } else if (kind === 'flint' || kind === 'clay' || kind === 'native_copper' || kind === 'copper_ore' || kind === 'tin_ore' || kind === 'gold') {
      ctx.beginPath(); ctx.ellipse(x, y, scale * 0.65, scale * 0.43, -0.2, 0, Math.PI * 2); ctx.fill();
      if (kind === 'flint' && !depleted) {
        ctx.strokeStyle = '#c6ccd0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - scale * 0.3, y); ctx.lineTo(x + scale * 0.3, y - scale * 0.15); ctx.stroke();
      }
    } else if (kind === 'fish') {
      ctx.fillStyle = '#65aeca'; ctx.beginPath(); ctx.ellipse(x, y + scale * 0.16, scale * 0.75, scale * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = depleted ? '#928b79' : '#bdc8bd'; ctx.beginPath(); ctx.ellipse(x, y, scale * 0.57, scale * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + scale * 0.48, y); ctx.lineTo(x + scale * 0.86, y - scale * 0.28); ctx.lineTo(x + scale * 0.86, y + scale * 0.28); ctx.closePath(); ctx.fill();
    } else {
      if (!depleted) {
        ctx.fillStyle = '#638646'; ctx.beginPath(); ctx.ellipse(x, y + scale * 0.12, scale * 0.85, scale * 0.46, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d8452f';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (i - 1) * scale * 0.38, y - scale * 0.06, scale * 0.18, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.strokeStyle = '#928b79'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - scale * 0.65, y + scale * 0.35); ctx.lineTo(x + scale * 0.6, y - scale * 0.35); ctx.stroke();
      }
    }
  }

  private drawRememberedBuilding(visual: Extract<PlaceVisual, { type: 'building' }>, ctx: CanvasRenderingContext2D,
    x: number, y: number): void {
    const def = BUILDINGS[visual.id];
    if (!def || !this.art) {
      this.drawRememberedBuildingMarker(visual.complete ? 2 : 1, ctx, x, y, TILE * 0.26);
      return;
    }
    const key = 'b/' + visual.id + (visual.complete ? '/ext' : '/plan');
    const box = this.art.assetBox('buildings', key);
    if (!box) {
      this.drawRememberedBuildingMarker(visual.complete ? 2 : 1, ctx, x, y, TILE * 0.26);
      return;
    }
    const manifest = this.art.manifest('buildings');
    const fw = def.width * TILE;
    const fh = def.height * TILE;
    const scale = fw * (visual.complete ? 1.05 : 1) / box.w;
    const x0 = x + fw / 2 - (box.ox + box.w / 2) * scale;
    const groundY = manifest.meta[visual.complete ? 'groundY' : 'planGroundY'] as number;
    const y0 = visual.complete
      ? y + fh / 2 - groundY * scale
      : y - (box.oy + box.h / 2) * scale;
    this.art.drawAsset(ctx, 'buildings', key, x0, y0, scale);
  }

  private drawRememberedBuildingMarker(amount: number, ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.fillStyle = amount === 2 ? '#c9b58d' : '#897d66';
    ctx.beginPath(); ctx.moveTo(x - size * 0.8, y - size * 0.1); ctx.lineTo(x, y - size * 0.8);
    ctx.lineTo(x + size * 0.8, y - size * 0.1); ctx.lineTo(x + size * 0.65, y + size * 0.65);
    ctx.lineTo(x - size * 0.65, y + size * 0.65); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#514537'; ctx.fillRect(x - size * 0.13, y + size * 0.1, size * 0.26, size * 0.55);
  }

  private drawRememberedAnimal(species: string, ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const fur = species === 'boar' ? '#725340' : species === 'hare' ? '#b8a487'
      : species === 'wolf' ? '#7b7d80' : species === 'bear' ? '#5a3e2b' : species === 'lynx' ? '#b69660' : '#aa9a7d';
    ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(x, y, size * 0.9, size * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + size * 0.72, y - size * 0.13, size * 0.31, size * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    if (species === 'hare') {
      ctx.beginPath(); ctx.ellipse(x + size * 0.8, y - size * 0.55, size * 0.12, size * 0.34, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + size, y - size * 0.51, size * 0.1, size * 0.3, 0.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** Draws the tree state that was observed; current season and fruit are deliberately irrelevant. */
  private drawRememberedTree(tree: Extract<PlaceVisual, { type: 'tree' }>, ctx: CanvasRenderingContext2D,
    x: number, y: number): void {
    const species = tree.species as TreeSpecies;
    const [canopy, shade] = tree.autumn && species !== 'pine'
      ? AUTUMN_TREE_COLORS : (TREE_COLORS[species] ?? TREE_COLORS.oak);
    const radius = (0.35 + (species === 'oak' ? 2.2 : species === 'pine' ? 1.6 :
      species === 'apple' ? 1.8 : species === 'pear' ? 1.7 : species === 'plum' ? 1.4 : 1.1) * tree.maturity) * TILE * 0.55;
    if (tree.maturity < 0.35) {
      ctx.strokeStyle = tree.bare ? '#8a7256' : canopy;
      ctx.lineWidth = Math.max(1, TILE * 0.05);
      ctx.beginPath(); ctx.moveTo(x, y + radius * 0.5); ctx.lineTo(x, y - radius * 0.9); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(x + radius * 0.15, y + radius * 0.5, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a4028';
      ctx.fillRect(x - Math.max(1, radius * 0.11) / 2, y - radius * 0.1, Math.max(1, radius * 0.22), radius * 0.65);
      if (tree.bare) {
        ctx.strokeStyle = '#6b5539'; ctx.lineWidth = Math.max(1, radius * 0.06);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i / 4 - 0.5) * Math.PI * 0.75;
          ctx.beginPath(); ctx.moveTo(x, y - radius * 0.1);
          ctx.lineTo(x + Math.cos(a) * radius * 0.8, y - radius * 0.1 + Math.sin(a) * radius * 0.8); ctx.stroke();
        }
      } else {
        ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(x, y - radius * 0.25, radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = canopy; ctx.beginPath(); ctx.arc(x - radius * 0.2, y - radius * 0.4, radius * 0.78, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (tree.fruit > 0) {
      const item = ({ apple: 'apple', pear: 'pear', plum: 'plum', hazel: 'hazelnut', oak: 'acorn' } as Record<string, string>)[species];
      ctx.fillStyle = FRUIT_COLORS[item ?? ''] ?? '#d8452f';
      const dots = Math.min(6, Math.ceil(tree.fruit / 3));
      for (let i = 0; i < dots; i++) {
        const a = i / dots * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * radius * 0.62 - radius * 0.15,
          y + Math.sin(a) * radius * 0.62 - radius * 0.3, Math.max(1.5, radius * 0.17), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /** A remembered person uses the same layered art, with only visible traits saved by the observer. */
  private drawRememberedPerson(person: Extract<PlaceVisual, { type: 'person' }>, ctx: CanvasRenderingContext2D,
    x: number, y: number): void {
    const colorIndex = this.colorIndexOfBand(person.bandId);
    if (!this.art) {
      ctx.fillStyle = BAND_COLORS[colorIndex]!;
      const h = person.age === 'infant' ? TILE * 0.3 : person.age === 'child' ? TILE * 0.55 : TILE * 0.85;
      ctx.beginPath(); ctx.ellipse(x, y, h * 0.22, h * 0.46, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const bald = person.age === 'elder' && person.id % 3 === 0;
    const aspect: PersonAspect = {
      age: person.age, sex: person.sex === 'male' ? 'm' : 'f', dir: 'S', pose: 'idle',
      skin: Renderer.TRIBE_SKIN[colorIndex]!, hair: person.age === 'elder' && person.id % 3 === 2 ? '#a7a197' : '#2b2018',
      band: BAND_COLORS[colorIndex]!, hairStyle: bald ? 'bald' : person.sex === 'female' ? 'long' : 'short',
      beard: person.sex === 'male' && person.age === 'adult' && person.id % 2 === 0,
      expression: 'neutral', wear: {}, carryBaby: false, held: null,
    };
    const scale = person.age === 'infant' ? 0.48 : person.age === 'child' ? 0.65 : person.age === 'adolescent' ? 0.82 : 1;
    const k = TILE * 1.55 * scale / 96;
    this.art.drawPerson(ctx, aspect, x - 48 * k, y - 52 * k, k);
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
  /**
   * A berry bush: the shrub first and always, then its fruit on it. What a
   * stripped bush loses is its fruit, not its size (the owner's note), and
   * since M15 phase 20 the fruit is its species' own colour and a deciduous
   * shrub stands leafless in winter — so the hips on a bare dog rose read as
   * the winter food they are. Shared with the fog, which draws a remembered
   * bush as it was seen.
   */
  private drawBush(px: number, py: number, size: number, state: NodeState,
    species: BushSpecies | null, leafless: boolean, ctx = this.ctx): void {
    const canes = (): void => {
      ctx.strokeStyle = SPENT_COLORS.twig;
      ctx.lineWidth = Math.max(1, size * 0.08);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(px, py + size * 0.42);
        ctx.quadraticCurveTo(px + i * size * 0.3, py, px + i * size * 0.44, py - size * 0.42);
        ctx.stroke();
      }
    };
    const def = species === null ? null : BUSHES[species];
    if (state === 'spent' && (leafless || !def?.evergreen)) {
      // Bare bramble: three canes out of a common root and no mass at all.
      canes();
      return;
    }
    if (leafless) canes();
    else {
      ctx.fillStyle = species === 'strawberry_tree' ? '#355a33' : BUSH_LEAF;
      ctx.beginPath();
      // A wild strawberry is a low plant, not a shrub.
      ctx.ellipse(px, py + (species === 'strawberry' ? size * 0.12 : 0), size * 0.46,
        size * (species === 'strawberry' ? 0.28 : 0.42), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state === 'spent') return;
    ctx.fillStyle = def?.fruitColor ?? RESOURCE_COLORS.berries;
    const berries = state === 'full' ? 5 : 2;
    for (let i = 0; i < berries; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * size * 0.3, py + Math.sin(a) * size * 0.3, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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
      case 'copper_ore':
      case 'tin_ore': {
        // A low grey outcrop with flecks of the metal in it, and a dark opening
        // where it has been dug into. Worked out, only the opening is left.
        const fleck = node.kind === 'copper_ore' ? '#3fae8a' : '#e3e7ea';
        ctx.fillStyle = spent ? SPENT_COLORS.scar : RESOURCE_COLORS[node.kind];
        ctx.beginPath();
        ctx.ellipse(px, py + size * 0.1, size * 0.52, size * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = SPENT_COLORS.pit;
        ctx.beginPath();
        ctx.ellipse(px + size * 0.12, py + size * 0.16, size * 0.2, size * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!spent) {
          ctx.fillStyle = fleck;
          for (const [dx, dy] of [[-0.3, -0.04], [-0.1, -0.16], [0.28, -0.02], [-0.24, 0.2]] as const) {
            ctx.fillRect(px + dx * size, py + dy * size, Math.max(1, size * 0.1), Math.max(1, size * 0.07));
          }
        }
        break;
      }
      case 'gold': {
        // Three bright grains and a glint: small, and nothing else on the map is yellow.
        if (spent) {
          ctx.fillStyle = SPENT_COLORS.scar;
          ctx.beginPath();
          ctx.ellipse(px, py, size * 0.3, size * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        for (const [dx, dy, r] of [[-0.22, 0.08, 0.17], [0.2, 0.14, 0.15], [0, -0.16, 0.2]] as const) {
          ctx.fillStyle = RESOURCE_COLORS.gold;
          ctx.beginPath();
          ctx.ellipse(px + dx * size, py + dy * size, r * size, r * size * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(px - size * 0.04, py - size * 0.24, Math.max(1, size * 0.1), Math.max(1, size * 0.06));
        break;
      }
      case 'native_copper': {
        // Three small nuggets and the green of weathering: metal that is lying
        // about, which is the thing about it. Taken, the ground keeps a scar
        // the way an outcrop of flint does - it never grows back.
        if (spent) {
          ctx.fillStyle = SPENT_COLORS.scar;
          ctx.beginPath();
          ctx.ellipse(px, py, size * 0.36, size * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        const lumps: [number, number, number][] = [[-0.26, 0.1, 0.24], [0.2, 0.18, 0.2], [0, -0.2, 0.27]];
        for (const [dx, dy, r] of lumps) {
          ctx.fillStyle = RESOURCE_COLORS.native_copper;
          ctx.beginPath();
          ctx.ellipse(px + dx * size, py + dy * size, r * size, r * size * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#5f9a7c';
        ctx.fillRect(px - size * 0.08, py - size * 0.26, Math.max(1, size * 0.12), Math.max(1, size * 0.08));
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
        const leafless = node.species !== null && !BUSHES[node.species].evergreen &&
          this.sim.time.season === 'winter';
        this.drawBush(px, py, size, state, node.species, leafless);
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

  /** Buildings the art draws flat on the ground: people walk over them, so they never hide anyone. */
  private static readonly FLAT_BUILDINGS: ReadonlySet<string> = new Set(['stockpile', 'storage_pit', 'fish_trap', 'snare', 'quern', 'hearth']);

  /** Whether phase 16c should expose a real room under this building's roof. */
  private roofLifted(b: Building): boolean {
    if (this.hideRoofs) return true;
    if (!b.def.interior) return false;
    const p = this.sim.player;
    if (p && houseInteriorContains(b, p.x, p.y)) return true;
    const id = this.frameHighlight?.personId;
    if (id !== undefined) {
      const sel = this.sim.peopleById.get(id);
      if (sel && houseInteriorContains(b, sel.x, sel.y)) return true;
    }
    return this.cursorWorld !== null && b.contains(this.cursorWorld.x, this.cursorWorld.y);
  }

  /** Old saves can carry a footprint that no longer matches the generated room sheet. */
  private hasInteriorArt(building: Building): boolean {
    if (!building.def.interior) return false;
    const bm = this.art?.manifest('buildings');
    if (!bm || !(`b/${building.def.id}/floor` in bm.keys)) return false;
    if (!(['north', 'east', 'south', 'west'] as const).every(side =>
      `b/${building.def.id}/walls-${side}` in bm.keys &&
      `b/${building.def.id}/front-${side}` in bm.keys)) return false;
    const unit = (bm.meta['unitPerTile'] as number) || 48;
    const entries = bm.meta['interiors'] as { id: string; width: number; height: number }[] | undefined;
    const art = entries?.find(entry => entry.id === building.def.id);
    return art?.width === building.def.width * unit && art.height === building.def.height * unit;
  }

  /**
   * A finished building from the committed art. Returns false when there is
   * none (a site, a ruin, a field or a kind the art lacks), and the caller
   * draws the plain rectangle as before. The tribe's ring and selection box
   * are drawn here, on the ground; the picture itself is either drawn now
   * (flat things, and roofless plans) or queued for the depth-sorted pass.
   */
  private drawBuildingArt(building: Building, selected: boolean, px: number, py: number, w: number, h: number): boolean {
    const art = this.art!;
    if (!building.complete || building.crop || building.ruined) return false;
    const bm = art.manifest('buildings');
    const id = building.def.id;
    if (!(('b/' + id + '/ext') in bm.keys)) return false;
    const { ctx } = this;

    // Whose it is: a thin ring on the ground round the footprint, and (below) a pennant.
    ctx.save();
    ctx.strokeStyle = BAND_COLORS[this.colorIndexOfBand(building.ownerBandId)]!;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px + w / 2, py + h / 2, w * 0.56, h * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (building.soundness < 1) {
      const barW = w * 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(px + w * 0.1, py + h - 8, barW, 5);
      ctx.fillStyle = '#d9705a';
      ctx.fillRect(px + w * 0.1, py + h - 8, barW * building.soundness, 5);
    }
    if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 2, py - 2, w + 4, h + 4);
    }

    const hasPlan = (('b/' + id + '/plan') in bm.keys);
    const hasInteriorLayers = this.hasInteriorArt(building);
    if (hasInteriorLayers && this.roofLifted(building)) {
      this.drawInteriorLayer(building, 'floor');
      // The complete ring sits behind people; the front edge is redrawn in the
      // depth pass so a person at the threshold is clipped by the near wall.
      this.drawInteriorLayer(building, 'walls');
      this.tallBuildings.push(building);
    } else if (hasPlan && this.roofLifted(building)) this.drawBuildingSprite(building, 'plan');
    else if (Renderer.FLAT_BUILDINGS.has(id)) this.drawBuildingSprite(building, 'ext');
    else this.tallBuildings.push(building);
    return true;
  }

  /** The exterior (or the roofless plan) of a building, its pennant included. */
  private drawBuildingSprite(building: Building, layer: 'ext' | 'plan'): void {
    const art = this.art!, { ctx, camera } = this;
    const bm = art.manifest('buildings');
    const plan = layer === 'plan';
    const key = 'b/' + building.def.id + '/' + layer;
    const box = art.assetBox('buildings', key);
    if (!box) return;
    const scale = camera.scale;
    const fw = building.def.width * scale, fh = building.def.height * scale;
    const left = camera.worldToScreenX(building.x - 0.5), top = camera.worldToScreenY(building.y - 0.5);
    const cx = left + fw / 2, bottom = top + fh;
    // Fit the picture's own width to the footprint, a little wider for the eaves.
    const u = (fw * (plan ? 1.0 : 1.05)) / box.w;
    const x0 = cx - (box.ox + box.w / 2) * u;
    const groundY = (plan ? bm.meta['planGroundY'] : bm.meta['groundY']) as number;
    const y0 = plan ? top + fh / 2 - (box.oy + box.h / 2) * u : bottom - groundY * u;
    art.drawAsset(ctx, 'buildings', key, x0, y0, u);
    if (!plan) {
      // A pennant in the tribe's colour at the right-hand corner of the front edge.
      const bu = scale / 40;
      const bx = cx + fw * 0.46 - 6 * bu, by = bottom - 46 * bu;
      art.drawAsset(ctx, 'buildings', 'banner/pole', bx, by, bu);
      art.drawAsset(ctx, 'buildings', 'banner/cloth', bx, by, bu, BAND_COLORS[this.colorIndexOfBand(building.ownerBandId)]!);
    }
  }

  /** Draw a generated room surface in exact tile coordinates beneath the footprint. */
  private drawInteriorLayer(building: Building, layer: 'floor' | 'walls' | 'front'): void {
    const art = this.art!, { ctx, camera } = this;
    const bm = art.manifest('buildings');
    const doorSide = building.interiorDoorSide ?? 'south';
    const key = layer === 'floor'
      ? `b/${building.def.id}/floor`
      : `b/${building.def.id}/${layer}-${doorSide}`;
    const box = art.assetBox('buildings', key);
    if (!box) return;
    const unit = (bm.meta['unitPerTile'] as number) || 48;
    const scale = camera.scale / unit;
    // House-wall overlays block World tiles [x, x+1), so their pixel corners
    // start at the integer tile origin (unlike the exterior sprite's centered fit).
    const left = camera.worldToScreenX(building.x);
    const top = camera.worldToScreenY(building.y);
    art.drawAsset(ctx, 'buildings', key, left - box.ox * scale, top - box.oy * scale, scale);
  }

  /** Room floor is in the ground pass; the wall ring is sorted against people. */
  private drawDepthBuilding(building: Building): void {
    const hasInteriorLayers = this.hasInteriorArt(building);
    if (hasInteriorLayers && this.roofLifted(building)) this.drawInteriorLayer(building, 'front');
    else this.drawBuildingSprite(building, 'ext');
  }

  /**
   * An earthwork on the map — M15 phase 26c. The ground itself is the picture:
   * a pit, a bank and a ditch are drawn by the terrain bake as relief, so what
   * is added here is the plan while it is unfinished: each tile shaded for what
   * is still to do (dark for dug, light for heaped) with a bar of how far it
   * has got, and a dashed outline round the lot. Once complete there is nothing
   * to add, and a selected one gets its outline back.
   */
  private drawEarthwork(building: Building, selected: boolean): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(building.x - 0.5);
    const py = camera.worldToScreenY(building.y - 0.5);
    const w = building.def.width * scale;
    const h = building.def.height * scale;
    if (!building.complete) {
      for (const tile of building.earth!) {
        const left = camera.worldToScreenX(tile.x - 0.5);
        const top = camera.worldToScreenY(tile.y - 0.5);
        const todo = 1 - tile.progress / tile.goal;
        ctx.fillStyle = tile.kind === 'dig' ? 'rgba(92, 64, 36, 0.38)' : 'rgba(214, 190, 140, 0.32)';
        ctx.fillRect(left, top, scale, scale * todo);
        ctx.strokeStyle = tile.kind === 'dig' ? 'rgba(60, 40, 20, 0.6)' : 'rgba(230, 214, 170, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, top + 0.5, scale - 1, scale - 1);
      }
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(230, 214, 170, 0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, w, h);
      ctx.setLineDash([]);
      const barW = Math.max(w * 0.8, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(px + (w - barW) / 2, py + h + 3, barW, 5);
      ctx.fillStyle = '#e0b055';
      ctx.fillRect(px + (w - barW) / 2, py + h + 3, barW * building.completion, 5);
    }
    if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 2, py - 2, w + 4, h + 4);
    }
  }

  private drawBuilding(building: Building, selected: boolean): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(building.x - 0.5);
    const py = camera.worldToScreenY(building.y - 0.5);
    const w = building.def.width * scale;
    const h = building.def.height * scale;

    if (building.def.earthwork) {
      this.drawEarthwork(building, selected);
      return;
    }
    if (this.art && this.drawBuildingArt(building, selected, px, py, w, h)) return;

    if (!building.complete) {
      // A silo is dug before it is lined: while there is hollow still to dig,
      // the tiles of the plan are drawn under the frame (`BuildingDef.dig`).
      if (building.earth && !building.earthDone) this.drawEarthwork(building, false);
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
      ctx.strokeStyle = BAND_COLORS[this.colorIndexOfBand(building.ownerBandId)]!;
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

    // Shadow first, so bodies read as standing on the ground. The committed
    // art bakes its own, so this is only the procedural fallback's.
    if (!this.art) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py + h * 0.45, w * 0.6, w * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const sizeClass = sizeClassOf(person);
    const colorIndex = this.colorIndexOfBand(person.bandId);

    if (scale < PERSON_LOD_BELOW) {
      // Too small on screen for a face or a tool to read. One `drawImage`,
      // matching the shape `if (scale > 20)` already gives building icons.
      if (this.art) {
        ctx.fillStyle = BAND_COLORS[colorIndex]!;
        ctx.beginPath();
        ctx.ellipse(px, py, w * 0.75, h * 1.0, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        this.atlas.drawSilhouette(ctx, sizeClass, colorIndex, px, py, this.atlas.bodyDrawSize(sizeClass, w) * 1.15);
      }
    } else if (this.art) {
      this.drawArtPerson(this.art, person, at, px, py, scale, bodyScale, sizeClass, colorIndex);
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

  /** Which way to face for a step of `dx, dy`, keeping the old facing on near-ties so a diagonal walk does not flicker. */
  private static facingOf(dx: number, dy: number, prev: ArtDir): ArtDir {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const horizontal = prev === 'E' || prev === 'W';
    if (horizontal ? ay > ax * 1.4 : ax > ay * 1.4) return ax > ay ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
    return horizontal ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
  }

  /** One skin tone per tribe, in the same order as `BAND_COLORS` (the last is for outcasts). */
  private static readonly TRIBE_SKIN = [
    '#ecd0ab', '#d4a276', '#bd865a', '#a26a46', '#84512f', '#663a24', '#f2d8ba', '#b17c50', '#c58d5f',
  ];
  /** The body scale at the middle of each size class, so growing up is smooth inside a baked figure. */
  private static readonly NOMINAL_SCALE: Record<SizeClass, number> = {
    infant: 0.55 + (1.5 / ADULT_YEARS) * 0.45, child: 0.55 + (5.5 / ADULT_YEARS) * 0.45,
    adolescent: 0.55 + (((8 + ADULT_YEARS) / 2) / ADULT_YEARS) * 0.45, adult: 1, elder: 0.94,
  };

  private colorIndexOfBand(bandId: number): number {
    return bandColorIndex(bandId, this.sim.bands.find(band => band.id === bandId)?.outcast ?? false);
  }

  /**
   * A person from the committed layers: the tribe's ring on the ground, then
   * one `drawImage` of the composed figure. Which way they face is deduced
   * here from how they moved (or, standing, from where their work is), never
   * stored in the simulation.
   */
  private drawArtPerson(
    art: ArtAtlas, person: Person, at: Placed, px: number, py: number, scale: number,
    bodyScale: number, sizeClass: SizeClass, colorIndex: number
  ): void {
    const { ctx } = this;
    const frame = this.walkPoseFor(person, at);
    const track = this.walkPhase.get(person.id)!;
    const moving = performance.now() - track.movedAt < 140;
    let dir = track.dir;
    if (!moving && person.targetX !== null && person.targetY !== null) {
      const tx = person.targetX - at.x, ty = person.targetY - at.y;
      if (Math.hypot(tx, ty) > 0.2) dir = Renderer.facingOf(tx, ty, dir);
    }
    const hair = hairVariantOf(person);
    const hairStyle = hair === 'bald' || hair === 'balding' ? hair : person.sex === 'female' ? 'long' : 'short';
    const gathering = gatheringPose(person, this.sim, moving, this.workAlpha);
    const fishing = fishingPose(person, this.sim, moving, this.workAlpha);
    const extraction = extractionPose(person, this.sim, moving, this.workAlpha);
    const digging = diggingPose(person, this.sim, moving, this.workAlpha);
    const chopping = choppingPose(person, this.sim, moving, this.workAlpha);
    const crafting = craftingPose(person, this.sim, moving, this.workAlpha);
    const workPose = gathering ?? fishing ?? extraction ?? digging ?? chopping ?? crafting;
    const torch = heldTorchFor(person);
    const otherHeld = gathering || crafting ? null : heldItemFor(person, this.sim.config.carry.autoEquipTools, true);
    const aspect: PersonAspect = {
      age: sizeClass, sex: person.sex === 'male' ? 'm' : 'f', dir,
      pose: moving ? (('w' + frame) as ArtPose) : workPose ?? 'idle',
      skin: Renderer.TRIBE_SKIN[colorIndex]!,
      hair: hair === 'grey' ? '#a7a197' : person.id % 3 === 0 ? '#5b3d28' : '#2b2018',
      band: BAND_COLORS[colorIndex]!,
      hairStyle, beard: hasBeardOf(person), expression: this.expressionFor(person),
      // Only an equipped item is drawn as clothing. Inventory ownership is not
      // visible state; the garment slot is the public observation of what is
      // being worn.
      wear: wornGarmentsOf(person),
      carryBaby: false,
      held: torch?.slot === 'right' ? torch.kind : otherHeld,
      heldLeft: torch?.slot === 'left' ? torch.kind : torch ? otherHeld : null,
      // M15 phase 19c: the belly of the last third, which anybody can see
      // (`Pregnancy.showing`); the earlier thirds are not on the sprite.
      belly: showing(person),
    };
    const ratio = Math.min(1.2, Math.max(0.85, bodyScale / Renderer.NOMINAL_SCALE[sizeClass]));
    const k = (scale * 1.55 * ratio) / 96;
    // The figure's vertical middle sits on the person's position, as the
    // procedural body's did, so `hitRadiusOf` still lands on it.
    const x0 = px - 48 * k, y0 = py - 52 * k;
    const ring = BAND_COLORS[colorIndex]!;
    ctx.save();
    ctx.strokeStyle = ring;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = Math.max(1, 1.5 * k);
    ctx.beginPath();
    ctx.ellipse(px, y0 + 88.6 * k, 17 * k, 4.4 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Afloat is observed action/position, never a read of a stranger's pack.
    if (person.aboardBoat && (this.sim.world.isBoatTile(person.x, person.y) || this.sim.world.isLogboatTile(person.x, person.y))) {
      art.drawAsset(ctx, 'props', person.aboardBoat === 'logboat' ? 'item/logboat' : 'item/raft', px - 32 * k, y0 + 57 * k, k);
      aspect.held = null;
      aspect.heldLeft = null;
    }
    art.drawPerson(ctx, aspect, x0, y0, k);
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
      track = { x: at.x, y: at.y, distance: 0, seen: this.walkPhaseCapture, dir: 'S', movedAt: 0 };
      this.walkPhase.set(person.id, track);
    }
    const dx = at.x - track.x, dy = at.y - track.y;
    const moved = Math.hypot(dx, dy);
    track.distance += moved;
    if (moved > 0.0005) {
      track.movedAt = performance.now();
      track.dir = Renderer.facingOf(dx, dy, track.dir);
    }
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

    if (this.art && this.drawArtAnimal(this.art, animal, at, px, py, w, h)) {
      if (animal.transportedBy !== null) this.drawTransportTack(px, py, w, h, animal.transportMode);
      if (animal.alarmed) {
        ctx.fillStyle = '#ffd35c';
        ctx.fillRect(px - 1, py - h / 2 - scale * 0.42, 2, scale * 0.2);
      }
      if (selected) {
        ctx.strokeStyle = '#7fd4ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - w / 2 - 3, py - h / 2 - 3, w + 6, h + 6);
      }
      return;
    }

    ctx.fillStyle = ANIMAL_COLORS[animal.species];
    ctx.fillRect(px - w / 2, py - h / 2, w, h);
    // Head, offset, so the thing has a facing at a glance.
    ctx.fillRect(px + w * 0.34, py - h * 0.72, w * 0.3, h * 0.42);

    if (animal.transportedBy !== null) this.drawTransportTack(px, py, w, h, animal.transportMode);

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

  private drawTransportTack(px: number, py: number, w: number, h: number, mode: 'pack' | 'riding' | null): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#4a3020';
    ctx.lineWidth = Math.max(1, w * 0.045);
    ctx.beginPath();
    ctx.moveTo(px - w * 0.13, py - h * 0.04);
    ctx.lineTo(px + w * 0.18, py - h * 0.02);
    ctx.stroke();
    if (mode === 'riding') {
      ctx.fillStyle = '#8b5a36';
      ctx.fillRect(px + w * 0.01, py - h * 0.19, w * 0.18, Math.max(2, h * 0.09));
    } else {
      ctx.fillStyle = '#d2b17e';
      ctx.fillRect(px - w * 0.03, py - h * 0.19, w * 0.14, Math.max(2, h * 0.12));
    }
    ctx.restore();
  }
  /** A beast from the committed frames, facing whichever way it last moved. False if the art has no such species. */
  private drawArtAnimal(art: ArtAtlas, animal: Animal, at: Placed, px: number, py: number, w: number, h: number): boolean {
    const { ctx } = this;
    let tr = this.animalTrack.get(animal.id);
    if (!tr) {
      if (this.animalTrack.size > 4096) this.animalTrack.clear();
      tr = { x: at.x, y: at.y, distance: 0, east: true, movedAt: -Infinity };
      this.animalTrack.set(animal.id, tr);
    }
    const moving = trackAnimal(tr, at, this.sim.time.tick + this.workAlpha);
    const pose = animalPose(animal, this.sim.time.tick, this.workAlpha, moving, tr.distance);
    const key = 'a/' + animal.species + '/E/' + pose;
    const box = art.assetBox('animals', key);
    if (!box) return false;
    // A reaching head makes the trimmed cell wider. Scaling by that cell made
    // the whole beast shrink between poses; keep the species' idle scale.
    const idle = art.assetBox('animals', 'a/' + animal.species + '/E/idle');
    const k = (w * 1.35) / (idle?.w ?? box.w);
    // Feet on the row the old rectangle's bottom edge sat on.
    const x0 = px - 48 * k, y0 = py + h / 2 - 84 * k;
    ctx.save();
    if (!tr.east) { ctx.translate(px, 0); ctx.scale(-1, 1); ctx.translate(-px, 0); }
    art.drawAsset(ctx, 'animals', key, x0, y0, k);
    ctx.restore();
    return true;
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
const ANIMAL_SIZES: Record<string, number> = { deer: 0.55, boar: 0.6, hare: 0.3, wolf: 0.55, bear: 0.85, lynx: 0.45, donkey: 0.58, horse: 0.72 };
const ANIMAL_COLORS: Record<string, string> = {
  deer: '#b3844e',
  boar: '#6b5442',
  hare: '#c9b191',
  wolf: '#7b7d80',
  bear: '#5a3e2b',
  lynx: '#b69660',
  donkey: '#817461',
  horse: '#79543a',
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
    // Matches the body painted above: half a tile long.
    case 'corpse': return 0.35;
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
  | { kind: 'corpse'; corpse: Corpse }
  | { kind: 'inscription'; inscription: Inscription }
  | { kind: 'animal'; animal: Animal };
