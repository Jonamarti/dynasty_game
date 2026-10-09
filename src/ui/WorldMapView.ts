/**
 * The globe: the world as the player's character knows it. M15 phase 31.
 *
 * ## What it shows, and what it refuses to
 *
 * Only what this one person has **seen** or been **told** (`WorldKnowledge`,
 * read through `Knowledge.ts`). A comarca nobody has stood in or heard of is
 * drawn dark and says nothing about itself — not its terrain, not whether it is
 * sea — because a map of the unexplored is the god's-eye view this game is
 * built to withhold. A comarca that was only described is painted the way it
 * was described and marked as hearsay, with how old the account is. One that
 * was seen is painted solid, with the day it was last seen and the peoples met
 * there, by name and by when.
 *
 * Two zooms and no more: the world, in regions, and one region, in its
 * comarcas. One step further in is the comarca itself, which is the game.
 *
 * ## Why a canvas, and why it still never flickers
 *
 * 96 by 48 regions is 4 608 cells, which is a picture and not a thousand DOM
 * nodes. The canvas is built once and redrawn **only when the digest changes**
 * (the `TechWeb` rule): `update` runs every frame, and anything that rebuilt the
 * DOM sixty times a second would detach whatever the pointer is over. Hover and
 * taps go through the one persistent canvas and a side card whose text is set
 * in place. Pointer events, not mouse events, so a finger and a mouse are the
 * same code; nothing needs hovering to be reached.
 */
import type { ComarcaEdge } from '../sim/world/ComarcaNeighbour.ts';
import type { Simulation } from '../sim/core/Simulation.ts';
import type { WorldGeography } from '../sim/world/WorldGeography.ts';
import { globeGridOf, worldTerrainOf, type GlobeGrid, type WorldTerrain } from '../sim/world/WorldTerrain.ts';
import { knowledgeOfWorld, type ComarcaLore } from '../sim/social/Knowledge.ts';
import { t, onLanguageChange } from '../i18n/i18n.ts';

/** One colour per word of the globe's vocabulary. Unknown is the page itself. */
export const TERRAIN_COLOR: Record<WorldTerrain, string> = {
  ocean: '#1f4f7a', lake: '#3b82b8', ice: '#dfe9f1', tundra: '#9aa7a0',
  boreal_forest: '#2f5d46', temperate_forest: '#3f7f46', grassland: '#7fa84a',
  steppe: '#b5a85a', desert: '#d2b062', savanna: '#b8923c', tropical_forest: '#1f6d3a',
};
const UNKNOWN_COLOR = '#0b0e14';

/** The words, spelled out so `i18n.test.ts` can see every one of them. */
export function terrainLabel(terrain: WorldTerrain): string {
  switch (terrain) {
    case 'ocean': return t('open sea');
    case 'lake': return t('lakes and rivers');
    case 'ice': return t('ice');
    case 'tundra': return t('tundra');
    case 'boreal_forest': return t('northern forest');
    case 'temperate_forest': return t('temperate forest');
    case 'grassland': return t('grassland');
    case 'steppe': return t('steppe');
    case 'desert': return t('desert');
    case 'savanna': return t('savanna');
    case 'tropical_forest': return t('tropical forest');
  }
}

/** Intrinsic pixels per cell; CSS scales the canvas, so these only set sharpness. */
const WORLD_CELL = 12;
const REGION_CELL = 48;

type Mode = 'world' | 'region';

interface RegionTally { seen: number; told: number; day: number; first: { cx: number; cy: number } | null }

function ago(now: number, then: number): string {
  const days = Math.max(0, now - then);
  if (days === 0) return t('today');
  return days === 1 ? t('{n} day ago', { n: days }) : t('{n} days ago', { n: days });
}

export class WorldMapOverlay {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly backButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly closerButton: HTMLButtonElement;
  private readonly journeyButton: HTMLButtonElement;
  private readonly caravanButton: HTMLButtonElement;
  private caravanStatus: string | null = null;
  private sim: Simulation | null = null;
  private geography: WorldGeography | null = null;
  private grid: GlobeGrid | null = null;
  private mode: Mode = 'world';
  private region = { x: 0, y: 0 };
  /** The cell the player has chosen, in the current mode's coordinates. */
  private picked: { x: number; y: number } | null = null;
  private hovered: { x: number; y: number } | null = null;
  private signature = '';

  constructor(container: HTMLElement, private readonly travel?: (action: 'leave_comarca' | 'scout' | 'propose', edge: ComarcaEdge) => void,
    private readonly journey?: (destination: { cx: number; cy: number }) => void,
    private readonly dispatchCaravan?: (destination: { cx: number; cy: number }) => string | null) {
    this.root = document.createElement('div');
    this.root.className = 'worldmap';
    this.root.hidden = true;
    this.root.innerHTML =
      '<div class="worldmap-card">' +
        '<div class="worldmap-head">' +
          '<b class="worldmap-title"></b><span class="worldmap-sub"></span>' +
          '<button class="worldmap-back" type="button" data-back hidden></button>' +
          '<button class="worldmap-close" type="button" data-close></button>' +
        '</div>' +
        '<div class="worldmap-body">' +
          '<div class="worldmap-stage"><canvas class="worldmap-canvas"></canvas></div>' +
          '<div class="worldmap-side"><div class="worldmap-info"></div>' +
            '<button class="worldmap-closer" type="button" hidden></button></div>' +
        '</div>' +
      '</div>';
    container.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.canvas = q<HTMLCanvasElement>('.worldmap-canvas');
    this.card = q('.worldmap-info');
    this.title = q('.worldmap-title');
    this.sub = q('.worldmap-sub');
    this.backButton = q<HTMLButtonElement>('.worldmap-back');
    this.closeButton = q<HTMLButtonElement>('.worldmap-close');
    this.closerButton = q<HTMLButtonElement>('.worldmap-closer');
    const journeys = document.createElement('div');
    journeys.className = 'worldmap-travel';
    // Persistent controls survive the map digest redraw, so a hover or tap is never detached.
    for (const edge of ['n', 'e', 's', 'w'] as const) {
      const row = document.createElement('div');
      for (const action of ['leave_comarca', 'scout', 'propose'] as const) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.travel = action; button.dataset.edge = edge;
        button.addEventListener('click', () => { this.travel?.(action, edge); this.close(); });
        row.appendChild(button);
      }
      journeys.appendChild(row);
    }
    q('.worldmap-side').appendChild(journeys);
    this.journeyButton = document.createElement('button');
    this.journeyButton.type = 'button';
    this.journeyButton.className = 'worldmap-journey';
    this.journeyButton.addEventListener('click', () => {
      if (!this.picked || this.mode !== 'region' || !this.grid) return;
      this.journey?.({ cx: this.region.x * this.grid.perRegion + this.picked.x, cy: this.region.y * this.grid.perRegion + this.picked.y });
      this.close();
    });
    q('.worldmap-side').appendChild(this.journeyButton);
    this.caravanButton = document.createElement('button');
    this.caravanButton.type = 'button';
    this.caravanButton.className = 'worldmap-caravan';
    this.caravanButton.addEventListener('click', () => {
      const destination = this.pickedDestination();
      if (!destination || !this.dispatchCaravan) return;
      this.caravanStatus = this.dispatchCaravan(destination) ?? t('A caravan has been sent.');
      this.signature = '';
      this.render();
    });
    q('.worldmap-side').appendChild(this.caravanButton);
    this.labelButtons();

    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target === this.root || target.closest('[data-close]')) { this.close(); return; }
      if (target.closest('[data-back]')) this.back();
    });
    this.closerButton.addEventListener('click', () => this.zoomIntoPicked());
    this.canvas.addEventListener('pointermove', event => {
      // A finger has no hover; its tap arrives as `pointerup` below.
      if (event.pointerType === 'touch') return;
      const cell = this.cellAt(event);
      if (cell?.x === this.hovered?.x && cell?.y === this.hovered?.y) return;
      this.hovered = cell;
      this.signature = '';
      this.render();
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.hovered) return;
      this.hovered = null;
      this.signature = '';
      this.render();
    });
    this.canvas.addEventListener('pointerup', event => {
      const cell = this.cellAt(event);
      if (!cell) return;
      // Tapping the cell already picked looks closer: a double-tap with no
      // timing in it, and the button beside the card does the same.
      if (this.picked && this.picked.x === cell.x && this.picked.y === cell.y && this.mode === 'world') {
        this.zoomIntoPicked();
        return;
      }
      this.picked = cell;
      this.caravanStatus = null;
      this.signature = '';
      this.render();
    });
    this.canvas.addEventListener('wheel', event => {
      if (!this.isOpen) return;
      event.preventDefault();
      if (event.deltaY < 0 && this.mode === 'world') {
        const cell = this.cellAt(event);
        if (cell) { this.picked = cell; this.zoomIntoPicked(); }
      } else if (event.deltaY > 0) this.back();
    }, { passive: false });
    window.addEventListener('keydown', event => {
      if (!this.isOpen || event.key !== 'Escape') return;
      event.preventDefault();
      // Inside a region, Escape steps back to the world and is spent, so the
      // first press does not throw the player out of the globe (as `TechWeb`).
      if (this.mode === 'region') {
        event.stopImmediatePropagation();
        this.back();
        return;
      }
      this.close();
    });
    onLanguageChange(() => { this.labelButtons(); this.signature = ''; this.render(); });
  }

  private labelButtons(): void {
    const directions = { n: t('north'), e: t('east'), s: t('south'), w: t('west') };
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-travel]')) {
      const direction = directions[button.dataset.edge as ComarcaEdge];
      button.textContent = button.dataset.travel === 'scout' ? t('Scout {direction}', { direction })
        : button.dataset.travel === 'propose' ? t('Propose moving {direction}', { direction })
          : t('Leave to the {direction}', { direction });
    }
    this.backButton.textContent = '← ' + t('The world');
    this.closeButton.textContent = t('Close');
    this.closerButton.textContent = t('Look closer');
    this.journeyButton.textContent = t('Travel to this comarca');
    this.caravanButton.textContent = t('Send a caravan here');
  }

  get isOpen(): boolean { return !this.root.hidden; }

  toggle(sim: Simulation, geography: WorldGeography): void {
    if (this.isOpen) { this.close(); return; }
    this.sim = sim;
    this.geography = geography;
    this.grid = globeGridOf(geography);
    this.mode = 'world';
    this.picked = null;
    this.hovered = null;
    this.caravanStatus = null;
    this.signature = '';
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
    this.sim = null;
    this.geography = null;
    this.signature = '';
  }

  back(): void {
    if (this.mode !== 'region') return;
    this.mode = 'world';
    this.picked = { ...this.region };
    this.hovered = null;
    this.signature = '';
    this.render();
  }

  private zoomIntoPicked(): void {
    if (!this.picked || this.mode !== 'world' || !this.sim || !this.grid) return;
    const tally = this.tallyRegion(this.picked.x, this.picked.y);
    // Nothing is known of it: there is nothing to look closer at, and drawing
    // its ten by ten would only show ten by ten dark squares. The card has
    // already said why.
    if (tally.seen + tally.told === 0) return;
    this.region = { ...this.picked };
    this.mode = 'region';
    this.picked = null;
    this.hovered = null;
    this.signature = '';
    this.render();
  }

  update(sim: Simulation): void {
    if (!this.isOpen) return;
    this.sim = sim;
    this.render();
  }

  // --- what the player knows ----------------------------------------------

  private lore() { return knowledgeOfWorld(this.sim?.player ?? null); }

  private tallyRegion(rx: number, ry: number): RegionTally {
    const grid = this.grid!;
    const tally: RegionTally = { seen: 0, told: 0, day: 0, first: null };
    const per = grid.perRegion;
    this.lore().each((cx, cy, lore) => {
      if (Math.floor(cx / per) !== rx || Math.floor(cy / per) !== ry) return;
      if (lore.source === 'seen') tally.seen++; else tally.told++;
      tally.day = Math.max(tally.day, lore.day);
      tally.first ??= { cx, cy };
    });
    return tally;
  }

  private terrainAt(cx: number, cy: number): WorldTerrain | null {
    return this.geography ? worldTerrainOf(this.geography.profileAt(cx + 0.5, cy + 0.5)) : null;
  }

  // --- drawing ------------------------------------------------------------

  private cellAt(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const grid = this.grid;
    if (!grid) return null;
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const cols = this.mode === 'world' ? grid.regionsWide : grid.perRegion;
    const rows = this.mode === 'world' ? grid.regionsHigh : grid.perRegion;
    const x = Math.floor((event.clientX - box.left) / box.width * cols);
    const y = Math.floor((event.clientY - box.top) / box.height * rows);
    return x >= 0 && y >= 0 && x < cols && y < rows ? { x, y } : null;
  }

  private render(): void {
    const sim = this.sim;
    if (!sim) return;
    const grid = this.grid;
    const lore = this.lore();
    const here = grid && sim.player ? sim.comarcaAtTile(sim.player.x, sim.player.y) : null;
    // The digest: everything the picture and the card depend on, and nothing
    // that changes every frame. A new day matters only because it ages the
    // "seen N days ago" lines.
    const signature = [this.mode, this.region.x, this.region.y, this.picked?.x, this.picked?.y,
      this.hovered?.x, this.hovered?.y, lore.revision, lore.size, sim.time.day, here?.cx, here?.cy,
      sim.player?.id, grid ? 1 : 0].join('|');
    if (signature === this.signature) return;
    this.signature = signature;

    this.root.querySelector<HTMLElement>('.worldmap-travel')!.hidden = !sim.comarcaTravel || !sim.worldFrame;
    this.caravanButton.hidden = !this.dispatchCaravan || !this.pickedDestination();
    this.journeyButton.hidden = this.mode !== 'region' || !this.picked || !this.grid || !sim.worldFrame ||
      !lore.at(this.region.x * this.grid.perRegion + this.picked.x, this.region.y * this.grid.perRegion + this.picked.y) ||
      (this.picked.x + this.region.x * this.grid.perRegion === here?.cx && this.picked.y + this.region.y * this.grid.perRegion === here?.cy);
    this.title.textContent = t('The world');
    this.sub.textContent = sim.player ? t('what {name} knows of it', { name: sim.player.name }) : '';
    this.backButton.hidden = this.mode !== 'region';
    this.closerButton.hidden = true;

    if (!grid || !this.geography) {
      this.canvas.hidden = true;
      this.card.textContent = t('This is the classic island. It sits on no map of the world, so there is no globe to show.');
      return;
    }
    this.canvas.hidden = false;
    if (this.mode === 'world') this.drawWorld(grid, lore, here);
    else this.drawRegion(grid, lore, here);
    this.fillCard(grid, lore, here);
  }

  private sizeCanvas(cols: number, rows: number, cell: number): CanvasRenderingContext2D | null {
    if (this.canvas.width !== cols * cell || this.canvas.height !== rows * cell) {
      this.canvas.width = cols * cell;
      this.canvas.height = rows * cell;
    }
    // The box must be exactly the picture: `cellAt` turns a pointer position
    // into a cell by the box's own size, so a canvas letterboxed or stretched
    // by CSS would send every click to the wrong place. The ratio is the
    // grid's, and the width is capped so the height never passes the window's.
    this.canvas.style.aspectRatio = `${cols} / ${rows}`;
    this.canvas.style.maxWidth = `calc((100vh - 170px) * ${cols / rows})`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = UNKNOWN_COLOR;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    return ctx;
  }

  private drawWorld(grid: GlobeGrid, lore: ReturnType<WorldMapOverlay['lore']>,
    here: { cx: number; cy: number } | null): void {
    const ctx = this.sizeCanvas(grid.regionsWide, grid.regionsHigh, WORLD_CELL);
    if (!ctx) return;
    const per = grid.perRegion;
    // A faint graticule every eight regions: scale, and nothing else. It is the
    // same for every world, so it says nothing about what is where.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let x = 8; x < grid.regionsWide; x += 8) {
      ctx.beginPath(); ctx.moveTo(x * WORLD_CELL + 0.5, 0); ctx.lineTo(x * WORLD_CELL + 0.5, grid.regionsHigh * WORLD_CELL); ctx.stroke();
    }
    for (let y = 8; y < grid.regionsHigh; y += 8) {
      ctx.beginPath(); ctx.moveTo(0, y * WORLD_CELL + 0.5); ctx.lineTo(grid.regionsWide * WORLD_CELL, y * WORLD_CELL + 0.5); ctx.stroke();
    }
    const regions = new Map<number, RegionTally>();
    const peoples: { cx: number; cy: number }[] = [];
    lore.each((cx, cy, entry) => {
      const key = Math.floor(cy / per) * grid.regionsWide + Math.floor(cx / per);
      let tally = regions.get(key);
      if (!tally) { tally = { seen: 0, told: 0, day: 0, first: null }; regions.set(key, tally); }
      if (entry.source === 'seen') tally.seen++; else tally.told++;
      tally.day = Math.max(tally.day, entry.day);
      tally.first ??= { cx, cy };
      if (entry.peoples.length > 0) peoples.push({ cx, cy });
    });
    for (const [key, tally] of regions) {
      const rx = key % grid.regionsWide, ry = Math.floor(key / grid.regionsWide);
      const terrain = tally.first ? this.terrainAt(tally.first.cx, tally.first.cy) : null;
      ctx.globalAlpha = tally.seen > 0 ? 1 : 0.45;
      ctx.fillStyle = terrain ? TERRAIN_COLOR[terrain] : UNKNOWN_COLOR;
      ctx.fillRect(rx * WORLD_CELL, ry * WORLD_CELL, WORLD_CELL, WORLD_CELL);
      ctx.globalAlpha = 1;
      if (tally.seen === 0) {
        // Hearsay is dashed, not just dim, so it is not told apart by colour alone.
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(rx * WORLD_CELL + 0.5, ry * WORLD_CELL + 0.5, WORLD_CELL - 1, WORLD_CELL - 1);
        ctx.setLineDash([]);
      }
    }
    ctx.fillStyle = '#ffd35c';
    for (const p of peoples) {
      const rx = Math.floor(p.cx / per), ry = Math.floor(p.cy / per);
      ctx.fillRect(rx * WORLD_CELL + 3, ry * WORLD_CELL + 3, 3, 3);
    }
    if (here) this.ring(ctx, Math.floor(here.cx / per), Math.floor(here.cy / per), WORLD_CELL);
    this.outline(ctx, this.picked, WORLD_CELL, '#7fd4ff');
    this.outline(ctx, this.hovered, WORLD_CELL, 'rgba(255,255,255,0.7)');
  }

  private drawRegion(grid: GlobeGrid, lore: ReturnType<WorldMapOverlay['lore']>,
    here: { cx: number; cy: number } | null): void {
    const ctx = this.sizeCanvas(grid.perRegion, grid.perRegion, REGION_CELL);
    if (!ctx) return;
    const per = grid.perRegion;
    const ox = this.region.x * per, oy = this.region.y * per;
    lore.each((cx, cy, entry) => {
      const x = cx - ox, y = cy - oy;
      if (x < 0 || y < 0 || x >= per || y >= per) return;
      const terrain = this.terrainAt(cx, cy);
      ctx.globalAlpha = entry.source === 'seen' ? 1 : 0.45;
      ctx.fillStyle = terrain ? TERRAIN_COLOR[terrain] : UNKNOWN_COLOR;
      ctx.fillRect(x * REGION_CELL, y * REGION_CELL, REGION_CELL, REGION_CELL);
      ctx.globalAlpha = 1;
      if (entry.source === 'told') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x * REGION_CELL + 1.5, y * REGION_CELL + 1.5, REGION_CELL - 3, REGION_CELL - 3);
        ctx.setLineDash([]);
      }
      if (entry.peoples.length > 0) {
        // The people's name, as far as it fits: the full list is in the card.
        ctx.fillStyle = '#ffd35c';
        ctx.font = '11px sans-serif';
        ctx.fillText(this.bandName(entry.peoples[0]!.bandId).slice(0, 8), x * REGION_CELL + 3, y * REGION_CELL + 13);
      }
    });
    if (here) {
      const x = here.cx - ox, y = here.cy - oy;
      if (x >= 0 && y >= 0 && x < per && y < per) this.ring(ctx, x, y, REGION_CELL);
    }
    this.outline(ctx, this.picked, REGION_CELL, '#7fd4ff');
    this.outline(ctx, this.hovered, REGION_CELL, 'rgba(255,255,255,0.7)');
  }

  private ring(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, cell / 12);
    ctx.beginPath();
    ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  private outline(ctx: CanvasRenderingContext2D, at: { x: number; y: number } | null, cell: number, color: string): void {
    if (!at) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(at.x * cell + 1, at.y * cell + 1, cell - 2, cell - 2);
    ctx.lineWidth = 1;
  }

  // --- the card -----------------------------------------------------------

  private pickedDestination(): { cx: number; cy: number } | null {
    if (this.mode !== 'region' || !this.picked || !this.grid || !this.sim) return null;
    const cx = this.region.x * this.grid.perRegion + this.picked.x;
    const cy = this.region.y * this.grid.perRegion + this.picked.y;
    if (!this.lore().at(cx, cy)) return null;
    const here = this.sim.player ? this.sim.comarcaAtTile(this.sim.player.x, this.sim.player.y) : null;
    return here?.cx === cx && here.cy === cy ? null : { cx, cy };
  }
  private bandName(bandId: number): string {
    return this.sim?.bands.find(band => band.id === bandId)?.name ?? t('another people');
  }

  private line(text: string, className = ''): HTMLElement {
    const p = document.createElement('div');
    p.className = 'worldmap-line' + (className ? ' ' + className : '');
    p.textContent = text;
    return p;
  }

  private fillCard(grid: GlobeGrid, lore: ReturnType<WorldMapOverlay['lore']>,
    here: { cx: number; cy: number } | null): void {
    const sim = this.sim!;
    const at = this.hovered ?? this.picked;
    const rows: HTMLElement[] = [];
    if (this.mode === 'world') {
      this.sub.textContent += (this.sub.textContent ? ' · ' : '') +
        t('{n} places known', { n: lore.size });
      if (!at) {
        rows.push(this.line(lore.size === 0
          ? t('Nobody here has been anywhere yet, or heard of anywhere else.')
          : t('Tap a region to see what is known of it.'), 'is-dim'));
      } else {
        const tally = this.tallyRegion(at.x, at.y);
        rows.push(this.line(t('Region {x}, {y}', { x: at.x + 1, y: at.y + 1 }), 'is-title'));
        if (tally.seen + tally.told === 0) {
          // Says nothing of what the region is: not its terrain, not whether it is sea.
          rows.push(this.line(t('Unknown. Nobody you know has been there or spoken of it.'), 'is-dim'));
        } else {
          rows.push(this.line(t('{seen} seen, {told} heard of', { seen: tally.seen, told: tally.told })));
          if (this.picked && this.picked.x === at.x && this.picked.y === at.y) this.closerButton.hidden = false;
        }
      }
    } else {
      rows.push(this.line(t('Region {x}, {y}', { x: this.region.x + 1, y: this.region.y + 1 }), 'is-title'));
      if (!at) {
        rows.push(this.line(t('Tap a place to see what is known of it.'), 'is-dim'));
      } else {
        const cx = this.region.x * grid.perRegion + at.x, cy = this.region.y * grid.perRegion + at.y;
        const entry = lore.at(cx, cy);
        rows.push(this.line(t('Place {x}, {y}', { x: cx + 1, y: cy + 1 }), 'is-title'));
        if (!entry) {
          rows.push(this.line(t('Unknown. Nobody you know has been there or spoken of it.'), 'is-dim'));
        } else {
          const terrain = this.terrainAt(cx, cy);
          if (terrain) rows.push(this.line(terrainLabel(terrain)));
          rows.push(this.line(entry.source === 'seen'
            ? t('Seen {when}', { when: ago(sim.time.day, entry.day) })
            : t('Heard of: that is how it was {when}', { when: ago(sim.time.day, entry.day) }), 'is-' + entry.source));
          for (const people of entry.peoples) {
            rows.push(this.line(t('{name} met here, {when}',
              { name: this.bandName(people.bandId), when: ago(sim.time.day, people.day) })));
          }
        }
      }
    }
    if (here && sim.player) {
      const per = grid.perRegion;
      const inView = this.mode === 'world' || (Math.floor(here.cx / per) === this.region.x && Math.floor(here.cy / per) === this.region.y);
      if (inView) rows.push(this.line(t('○ You are here'), 'is-here'));
    }
    // The peoples met anywhere, once, whichever level is open.
    const met = new Map<number, number>();
    lore.each((_cx, _cy, entry) => {
      for (const p of entry.peoples) met.set(p.bandId, Math.max(met.get(p.bandId) ?? 0, p.day));
    });
    if (met.size > 0) {
      rows.push(this.line(t('Peoples you know of'), 'is-title'));
      for (const [bandId, day] of [...met].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
        rows.push(this.line(t('{name}, last seen {when}', { name: this.bandName(bandId), when: ago(sim.time.day, day) })));
      }
    }
    if (this.caravanStatus) rows.push(this.line(this.caravanStatus, this.caravanStatus === t('A caravan has been sent.') ? 'is-here' : 'is-dim'));
    this.card.replaceChildren(...rows);
  }
}

export type { ComarcaLore };
