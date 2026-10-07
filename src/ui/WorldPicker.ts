/**
 * Where the story begins: the Earth, to choose a place on (M15 phase 33).
 *
 * The first screen of a new game. The whole map is drawn, because this is the player choosing where to be born and not a
 * character's memory of the world (that is `WorldMapView`, which withholds everything unseen). One click picks a region, and the
 * card says what the map says of it, **including whether it is marked with a river or a lake**, and what the game will do about
 * a place without: it looks for the nearest water, because a band that starts without a drink is dead in days. The other door is
 * the random island the game has always opened on.
 *
 * Like the globe it is a canvas built once and redrawn only when what it shows changes (no `innerHTML` at sixty frames a second),
 * and it takes pointer events so a finger and a mouse are the same code. The overlay only asks: `main.ts` owns the world, and says
 * through `setNote` why a choice was refused.
 */
import type { WorldGeography } from '../sim/world/WorldGeography.ts';
import { globeGridOf, worldTerrainOf, type GlobeGrid, type WorldTerrain } from '../sim/world/WorldTerrain.ts';
import { regionWater } from '../sim/world/StartPlace.ts';
import { TERRAIN_COLOR, terrainLabel } from './WorldMapView.ts';
import { t, onLanguageChange } from '../i18n/i18n.ts';

const CELL = 12;

export interface WorldPickerCallbacks {
  /** The player chose a region to begin in. */
  onBegin: (region: { x: number; y: number }) => void;
  /** The player chose the random island instead. */
  onIsland: () => void;
}

export class WorldPicker {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly info: HTMLElement;
  private readonly note: HTMLElement;
  private readonly beginButton: HTMLButtonElement;
  private readonly islandButton: HTMLButtonElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private geography: WorldGeography | null = null;
  private grid: GlobeGrid | null = null;
  private picked: { x: number; y: number } | null = null;
  private hovered: { x: number; y: number } | null = null;
  private busy: string | null = null;
  private message: { text: string; bad: boolean } | null = null;

  constructor(container: HTMLElement, private readonly callbacks: WorldPickerCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'worldpicker';
    this.root.hidden = true;
    this.root.innerHTML =
      '<div class="worldpicker-card">' +
        '<div class="worldpicker-head"><b class="worldpicker-title"></b><span class="worldpicker-sub"></span></div>' +
        '<div class="worldpicker-body">' +
          '<div class="worldpicker-stage"><canvas class="worldpicker-canvas" hidden></canvas></div>' +
          '<div class="worldpicker-side">' +
            '<div class="worldpicker-info"></div>' +
            '<div class="worldpicker-note" role="status" aria-live="polite"></div>' +
            '<button class="hud-button is-primary worldpicker-begin" type="button" disabled></button>' +
            '<button class="hud-button worldpicker-island" type="button"></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    container.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.canvas = q<HTMLCanvasElement>('.worldpicker-canvas');
    this.info = q('.worldpicker-info');
    this.note = q('.worldpicker-note');
    this.beginButton = q<HTMLButtonElement>('.worldpicker-begin');
    this.islandButton = q<HTMLButtonElement>('.worldpicker-island');
    this.title = q('.worldpicker-title');
    this.sub = q('.worldpicker-sub');
    this.label();

    this.beginButton.addEventListener('click', () => { if (this.picked && !this.busy) this.callbacks.onBegin({ ...this.picked }); });
    this.islandButton.addEventListener('click', () => { if (!this.busy) this.callbacks.onIsland(); });
    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const cell = this.cellAt(event);
      if (cell?.x === this.hovered?.x && cell?.y === this.hovered?.y) return;
      this.hovered = cell;
      this.render();
    });
    this.canvas.addEventListener('pointerleave', () => { if (this.hovered) { this.hovered = null; this.render(); } });
    this.canvas.addEventListener('pointerup', event => {
      if (this.busy) return;
      const cell = this.cellAt(event);
      if (!cell) return;
      // Tapping the region already picked begins there: a double-tap with no timing in it.
      if (this.picked && this.picked.x === cell.x && this.picked.y === cell.y && this.canBegin(cell)) { this.callbacks.onBegin({ ...cell }); return; }
      this.picked = cell;
      this.message = null;
      this.render();
    });
    onLanguageChange(() => { this.label(); this.render(); });
  }

  get isOpen(): boolean { return !this.root.hidden; }

  private label(): void {
    this.title.textContent = t('Where does your story begin?');
    this.beginButton.textContent = t('Begin here');
    this.islandButton.textContent = t('A random island instead');
  }

  open(): void { this.root.hidden = false; this.render(); }
  close(): void { this.root.hidden = true; }

  /** The map to choose on, once it has loaded. */
  setGeography(geography: WorldGeography | null): void {
    this.geography = geography;
    this.grid = geography ? globeGridOf(geography) : null;
    this.picked = null; this.hovered = null;
    this.render();
  }

  /** While something slow happens (loading the map, looking for water) nothing can be clicked. */
  setBusy(text: string | null): void { this.busy = text; this.render(); }

  /** Why a choice was refused, or what happened. */
  setNote(text: string | null, bad = false): void { this.message = text === null ? null : { text, bad }; this.render(); }

  private terrainOf(rx: number, ry: number): WorldTerrain | null {
    const grid = this.grid;
    if (!this.geography || !grid) return null;
    return worldTerrainOf(this.geography.profileAt(rx * grid.perRegion + grid.perRegion / 2, ry * grid.perRegion + grid.perRegion / 2));
  }

  private canBegin(cell: { x: number; y: number }): boolean {
    const terrain = this.terrainOf(cell.x, cell.y);
    return terrain !== null && terrain !== 'ocean' && terrain !== 'ice';
  }

  private cellAt(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const grid = this.grid;
    if (!grid) return null;
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const x = Math.floor((event.clientX - box.left) / box.width * grid.regionsWide);
    const y = Math.floor((event.clientY - box.top) / box.height * grid.regionsHigh);
    return x >= 0 && y >= 0 && x < grid.regionsWide && y < grid.regionsHigh ? { x, y } : null;
  }

  private render(): void {
    if (!this.isOpen) return;
    const grid = this.grid;
    this.sub.textContent = this.busy ?? (grid ? t('Click a place on the Earth, or take a random island') : '');
    this.islandButton.disabled = this.busy !== null;
    this.beginButton.disabled = this.busy !== null || !this.picked || !this.canBegin(this.picked);
    this.note.textContent = this.message?.text ?? '';
    this.note.classList.toggle('is-bad', this.message?.bad ?? false);
    this.canvas.hidden = !grid;
    if (!grid || !this.geography) { this.info.textContent = this.busy ?? ''; return; }

    const w = grid.regionsWide, h = grid.regionsHigh;
    if (this.canvas.width !== w * CELL || this.canvas.height !== h * CELL) {
      this.canvas.width = w * CELL; this.canvas.height = h * CELL;
    }
    // The box must be exactly the picture (see `WorldMapView.sizeCanvas`): `cellAt` divides by the box's own size.
    this.canvas.style.aspectRatio = `${w} / ${h}`;
    this.canvas.style.maxWidth = `calc((100vh - 170px) * ${w / h})`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    for (let ry = 0; ry < h; ry++) for (let rx = 0; rx < w; rx++) {
      const terrain = this.terrainOf(rx, ry);
      ctx.fillStyle = terrain ? TERRAIN_COLOR[terrain] : '#0b0e14';
      ctx.fillRect(rx * CELL, ry * CELL, CELL, CELL);
      // A river or a lake marked in the region: a pale dot, so the places with water are visible before choosing.
      if (terrain && terrain !== 'ocean' && terrain !== 'lake' && regionWater(this.geography, rx, ry) !== 'none') {
        ctx.fillStyle = 'rgba(160,215,255,0.85)';
        ctx.fillRect(rx * CELL + 5, ry * CELL + 5, 2, 2);
      }
    }
    for (const [cell, color] of [[this.picked, '#ffd35c'], [this.hovered, 'rgba(255,255,255,0.7)']] as const) {
      if (!cell) continue;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.strokeRect(cell.x * CELL + 1, cell.y * CELL + 1, CELL - 2, CELL - 2);
    }
    this.fillInfo(this.hovered ?? this.picked);
  }

  private fillInfo(cell: { x: number; y: number } | null): void {
    this.info.textContent = '';
    const line = (text: string, cls = '') => {
      const el = document.createElement('div');
      el.className = 'worldpicker-line ' + cls;
      el.textContent = text;
      this.info.appendChild(el);
    };
    if (!cell || !this.geography) { line(t('Hover over the map to see what is there.'), 'is-dim'); return; }
    const terrain = this.terrainOf(cell.x, cell.y);
    if (!terrain) return;
    line(terrainLabel(terrain), 'is-title');
    if (terrain === 'ocean') { line(t('Open sea: nobody can begin here.'), 'is-dim'); return; }
    if (terrain === 'ice') { line(t('Ice: nobody can begin here.'), 'is-dim'); return; }
    switch (regionWater(this.geography, cell.x, cell.y)) {
      case 'river': line(t('A river is marked here.')); break;
      case 'lake': line(t('A lake is marked here.')); break;
      default: line(t('No river or lake is marked here. The game will look for the nearest fresh water.'), 'is-dim');
    }
    line(this.picked && this.picked.x === cell.x && this.picked.y === cell.y
      ? t('Press Begin here, or click it again.') : t('Click to choose this place.'), 'is-dim');
  }
}
