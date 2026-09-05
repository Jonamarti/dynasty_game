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
import type { Person } from '../sim/entities/Person.ts';
import type { World } from '../sim/core/World.ts';
import { BIOMES, type Biome } from '../sim/core/World.ts';
import type { ResourceKind, ResourceNode } from '../sim/entities/ResourceNode.ts';
import type { ItemPile } from '../sim/entities/ItemPile.ts';
import type { Animal } from '../sim/entities/Animal.ts';
import type { Building } from '../sim/entities/Building.ts';
import type { Tree } from '../sim/entities/Tree.ts';
import type { TreeSpecies } from '../sim/entities/Tree.ts';
import { workProgressOf } from '../sim/core/Progress.ts';
import { Camera, TILE } from './Camera.ts';
import { Floaters } from './Floaters.ts';

const BIOME_COLORS: Record<Biome, [string, string]> = {
  // [base, speckle] — the speckle is dotted in per-tile to break up flat fields.
  water:  ['#24506f', '#2b5c7e'],
  beach:  ['#d6c493', '#c9b585'],
  grass:  ['#6b9c4a', '#628f43'],
  forest: ['#3c6b33', '#355f2d'],
  hills:  ['#8a8163', '#7d755a'],
  rock:   ['#6d6d72', '#636368'],
};

const RESOURCE_COLORS: Record<ResourceKind, string> = {
  berries: '#c0392b',
  flint:   '#c8ccd0',
  sticks:  '#8b5a2b',
  reeds:   '#b3b76a',
  clay:    '#a97b5d',
};

/** [canopy, shadow side] per species; fruit is drawn over the top. */
const TREE_COLORS: Record<TreeSpecies, [string, string]> = {
  oak:   ['#4a7a35', '#3a5f29'],
  pine:  ['#2f5c3a', '#25482e'],
  apple: ['#5d8a3f', '#496e31'],
  pear:  ['#638f46', '#4d7137'],
  plum:  ['#557f4a', '#43653a'],
  hazel: ['#6a9450', '#54763f'],
};

const FRUIT_COLORS: Record<string, string> = {
  apple: '#d8452f',
  pear: '#c8b23a',
  plum: '#7a3f8a',
  hazelnut: '#a8763f',
};

const BAND_COLORS = ['#3b6ea8', '#a83b52', '#7a4ea8', '#a8843b', '#3ba88a', '#a83b8f'];

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

  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
    private readonly camera: Camera
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.terrain = this.prerenderTerrain(sim.world);
  }

  /** One tile per TILE pixels, drawn once. */
  private prerenderTerrain(world: World): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = world.width * TILE;
    canvas.height = world.height * TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const biome = BIOMES[world.biome[world.index(x, y)]!]!;
        const [base, speckle] = BIOME_COLORS[biome];
        ctx.fillStyle = base;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

        // A deterministic speckle from the tile coordinates: cheap texture that
        // does not need an art asset and does not shimmer between frames.
        const h = (x * 73856093) ^ (y * 19349663);
        if ((h & 7) === 0) {
          ctx.fillStyle = speckle;
          ctx.fillRect(x * TILE + ((h >> 3) & 3) * 4, y * TILE + ((h >> 5) & 3) * 4, 4, 4);
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

  render(highlight: Highlight | null): void {
    const { ctx, camera, sim } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, camera.viewWidth, camera.viewHeight);

    const view = camera.visibleTiles();
    const scale = camera.scale;

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
      const px = camera.worldToScreenX(node.x);
      const py = camera.worldToScreenY(node.y);
      const fullness = node.amount / node.def.maxAmount;
      if (fullness <= 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(px - scale * 0.12, py - scale * 0.12, scale * 0.24, scale * 0.24);
        continue;
      }
      const size = scale * (0.18 + fullness * 0.22);
      ctx.fillStyle = RESOURCE_COLORS[node.kind];
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(px - size / 2, py + size / 2 - 2, size, 2);
      if (highlight?.nodeId === node.id) {
        ctx.strokeStyle = '#7fd4ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - size / 2 - 3, py - size / 2 - 3, size + 6, size + 6);
      }
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
    }

    // --- Animals -----------------------------------------------------------
    // Under people, like buildings: a hunter standing over a kill should be the
    // figure you can see.
    for (const animal of sim.animals) {
      if (!animal.alive) continue;
      if (animal.x < view.minX || animal.x > view.maxX) continue;
      if (animal.y < view.minY || animal.y > view.maxY) continue;
      this.drawAnimal(animal, highlight?.animalId === animal.id);
    }

    // --- People ------------------------------------------------------------
    for (const person of sim.livingPeople()) {
      if (person.x < view.minX || person.x > view.maxX || person.y < view.minY || person.y > view.maxY) continue;
      this.drawPerson(person, highlight?.personId === person.id);
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
   * A tree, sized by how grown it is.
   *
   * Age is the thing worth reading at a glance: a seedling is a sprig you could
   * step on, a grown oak is a canopy several tiles across. Seeing the
   * difference is what makes "leave that stand alone for twenty years" a
   * decision the player can actually make.
   */
  private drawTree(tree: Tree, selected: boolean): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(tree.x);
    const py = camera.worldToScreenY(tree.y);
    const radius = tree.radius * scale * 0.55;
    const [canopy, shade] = TREE_COLORS[tree.def.species];

    if (tree.isSeedling) {
      // A sprig: two strokes, no canopy worth drawing.
      ctx.strokeStyle = canopy;
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

      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(px, py - radius * 0.25, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.arc(px - radius * 0.2, py - radius * 0.4, radius * 0.78, 0, Math.PI * 2);
      ctx.fill();
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
    } else {
      ctx.fillStyle = building.def.shelter > 0 ? '#7a5c3e' : '#5c5343';
      ctx.fillRect(px, py, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(px, py, w, h * 0.35);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, w, h);
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
      ctx.fillText(building.def.icon, px + w / 2, py + h / 2);
      ctx.restore();
    }
  }

  private drawPerson(person: Person, selected: boolean): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(person.x);
    const py = camera.worldToScreenY(person.y);
    const w = scale * 0.34;
    const h = scale * 0.52;

    // Shadow first, so bodies read as standing on the ground.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px, py + h * 0.45, w * 0.6, w * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = BAND_COLORS[person.bandId % BAND_COLORS.length]!;
    ctx.fillRect(px - w / 2, py - h / 2, w, h);

    // Head
    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(px - w * 0.32, py - h / 2 - w * 0.52, w * 0.64, w * 0.56);

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
    } else if (selected) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - w / 2 - 2, py - h / 2 - w * 0.6, w + 4, h + w * 0.6);
    }
  }

  /**
   * An animal, sized and coloured by species.
   *
   * Drawn low and wide rather than upright, so at a glance a herd never reads
   * as a group of people — which matters, because the two are told apart at
   * distance and the verbs for them are entirely different.
   */
  private drawAnimal(animal: Animal, selected: boolean): void {
    const { ctx, camera } = this;
    const scale = camera.scale;
    const px = camera.worldToScreenX(animal.x);
    const py = camera.worldToScreenY(animal.y);

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

  /** The living person nearest a world point within `radius` tiles, or null. */
  pickPerson(worldX: number, worldY: number, radius = PICK_RANGE): Person | null {
    return this.sim.peopleHash.findNearest(worldX, worldY, radius);
  }

  /** The resource node nearest a world point within `radius` tiles, or null. */
  pickNode(worldX: number, worldY: number, radius = PICK_RANGE) {
    return this.sim.nodeHash.findNearest(worldX, worldY, radius);
  }

  /** The dropped pile nearest a world point, or null. */
  pickPile(worldX: number, worldY: number, radius = PICK_RANGE) {
    return this.sim.pileHash.findNearest(worldX, worldY, radius);
  }

  /** The standing tree nearest a world point, or null. */
  pickTree(worldX: number, worldY: number, radius = PICK_RANGE) {
    return this.sim.treeHash.findNearest(worldX, worldY, radius, t => t.standing);
  }

  /** The living animal nearest a world point, or null. */
  pickAnimal(worldX: number, worldY: number, radius = PICK_RANGE) {
    return this.sim.animalHash.findNearest(worldX, worldY, radius, a => a.alive);
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
    // Body is 0.34 x 0.52 tiles plus a head; 0.45 covers the drawn silhouette.
    case 'person': return 0.45;
    // A stripped bush is small. Fullness is what the renderer scales it by, so
    // the click target shrinks as the thing itself does.
    case 'node': {
      const def = target.node.def;
      const fullness = def.maxAmount > 0
        ? Math.max(0, Math.min(1, target.node.amount / def.maxAmount))
        : 0;
      return Math.max(0.3, 0.18 + fullness * 0.22);
    }
    // `drawTree` paints a canopy of `tree.radius * 0.55`; a seedling is ~0.2.
    case 'tree': return Math.max(0.2, target.tree.radius * 0.55);
    case 'pile': return 0.3;
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
  | { kind: 'animal'; animal: Animal };
