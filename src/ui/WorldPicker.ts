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
import { isCoastalRegion, regionWater } from '../sim/world/StartPlace.ts';
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
  private readonly confirmBox: HTMLElement;
  private readonly confirmText: HTMLElement;
  private readonly confirmAnyway: HTMLButtonElement;
  private readonly confirmNearest: HTMLButtonElement;
  private geography: WorldGeography | null = null;
  private grid: GlobeGrid | null = null;
  private picked: { x: number; y: number } | null = null;
  private hovered: { x: number; y: number } | null = null;
  private busy: string | null = null;
  private message: { text: string; bad: boolean } | null = null;
  /**
   * The chosen place has no fresh water within the search radius (M15 "begin anywhere", 2026-10-07). Before this the game
   * refused outright (`main.ts`'s old `beginOnEarth`); the owner's decision was a choice instead: begin on dry land anyway,
   * or — only when the search actually found one — go to the nearest place that does have water. `nearestRegions` is null
   * when there is nothing to go to, which is also why "true open ocean" still ends in a plain refusal: neither button here
   * would have anywhere to send the player.
   */
  private confirm: { onBeginAnyway: () => void; nearestRegions: number | null; onGoNearest: (() => void) | null } | null = null;

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
            '<div class="worldpicker-confirm" role="alert" hidden>' +
              '<div class="worldpicker-confirm-text"></div>' +
              '<button class="hud-button is-primary worldpicker-confirm-anyway" type="button"></button>' +
              '<button class="hud-button worldpicker-confirm-nearest" type="button" hidden></button>' +
            '</div>' +
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
    this.confirmBox = q('.worldpicker-confirm');
    this.confirmText = q('.worldpicker-confirm-text');
    this.confirmAnyway = q<HTMLButtonElement>('.worldpicker-confirm-anyway');
    this.confirmNearest = q<HTMLButtonElement>('.worldpicker-confirm-nearest');
    this.label();

    this.beginButton.addEventListener('click', () => { if (this.picked && !this.busy && !this.confirm) this.callbacks.onBegin({ ...this.picked }); });
    this.islandButton.addEventListener('click', () => { if (!this.busy && !this.confirm) this.callbacks.onIsland(); });
    this.confirmAnyway.addEventListener('click', () => {
      const chosen = this.confirm;
      // Cleared before the callback runs: `onBeginAnyway` goes on to rebuild the world and close the picker, and a stale
      // confirm panel left behind would otherwise reappear the next time something calls `render()`.
      this.confirm = null;
      this.render();
      chosen?.onBeginAnyway();
    });
    this.confirmNearest.addEventListener('click', () => {
      const chosen = this.confirm;
      this.confirm = null;
      this.render();
      chosen?.onGoNearest?.();
    });
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
      // Tapping the region already picked begins there: a double-tap with no timing in it. Not while a confirm panel is up,
      // though — a second tap on the same cell then should not silently re-run `onBegin` behind the choice being offered.
      if (!this.confirm && this.picked && this.picked.x === cell.x && this.picked.y === cell.y && this.canBegin(cell)) {
        this.callbacks.onBegin({ ...cell }); return;
      }
      this.picked = cell;
      this.message = null;
      this.confirm = null;
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
    this.picked = null; this.hovered = null; this.confirm = null;
    this.render();
  }

  /** While something slow happens (loading the map, looking for water) nothing can be clicked. */
  setBusy(text: string | null): void { this.busy = text; this.render(); }

  /** Why a choice was refused, or what happened. */
  setNote(text: string | null, bad = false): void { this.message = text === null ? null : { text, bad }; this.render(); }

  /**
   * The chosen place has no fresh water within reach: offer "begin here anyway" (dry land, no water promised) and, only
   * when `nearest` is given, "go to the nearest water" — the two actions `main.ts`'s `beginOnEarth` would otherwise have
   * picked between on the player's behalf. See the `confirm` field's own comment for why `nearest` is sometimes omitted.
   */
  confirmNoWater(onBeginAnyway: () => void, nearest: { regions: number; onGo: () => void } | null): void {
    this.confirm = { onBeginAnyway, nearestRegions: nearest?.regions ?? null, onGoNearest: nearest?.onGo ?? null };
    this.render();
  }

  private terrainOf(rx: number, ry: number): WorldTerrain | null {
    const grid = this.grid;
    if (!this.geography || !grid) return null;
    return worldTerrainOf(this.geography.profileAt(rx * grid.perRegion + grid.perRegion / 2, ry * grid.perRegion + grid.perRegion / 2));
  }

  private canBegin(cell: { x: number; y: number }): boolean {
    const terrain = this.terrainOf(cell.x, cell.y);
    // `terrainOf` is only non-null once `this.geography` is set, so `this.geography!` below is safe.
    if (terrain === null || terrain === 'ice') return false;
    // M15 "begin anywhere" (2026-10-07): a region classed `ocean` is still a shore, not a refusal, when it is coastal — its
    // own centre sample landed in the water, but dry land is right there in one of its eight neighbours. True open ocean
    // (`isCoastalRegion` false) is refused exactly as it always has been; `findStartInRegion` makes the same distinction
    // for the same reason, so a region this allows the player to click is one it can actually find a start in.
    if (terrain === 'ocean') return isCoastalRegion(this.geography!, cell.x, cell.y);
    return true;
  }

  /** Fills in the confirm panel's text in the current language and shows or hides it. Called from `render()`, which already
   * runs again on every language change, so the panel never gets stuck showing a sentence in the language it was raised in. */
  private renderConfirm(): void {
    const confirm = this.confirm;
    this.confirmBox.hidden = confirm === null;
    if (!confirm) return;
    this.confirmText.textContent =
      t('There is no river or lake near here. You can begin on dry land anyway, or go to the nearest water.');
    this.confirmAnyway.textContent = t('Begin here anyway');
    if (confirm.nearestRegions !== null) {
      this.confirmNearest.hidden = false;
      this.confirmNearest.textContent = t('Go to the nearest water ({n} regions away)', { n: confirm.nearestRegions });
    } else {
      this.confirmNearest.hidden = true;
    }
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
    // Both buttons wait for the confirm panel's own choice while it is up: begin-anyway and go-to-nearest are what this
    // click would otherwise have meant, and a second, ordinary click on Begin here behind the panel would bypass it.
    this.islandButton.disabled = this.busy !== null || this.confirm !== null;
    this.beginButton.disabled = this.busy !== null || this.confirm !== null || !this.picked || !this.canBegin(this.picked);
    this.note.textContent = this.message?.text ?? '';
    this.note.classList.toggle('is-bad', this.message?.bad ?? false);
    this.renderConfirm();
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
    if (terrain === 'ocean' && !isCoastalRegion(this.geography, cell.x, cell.y)) {
      line(t('Open sea: nobody can begin here.'), 'is-dim'); return;
    }
    if (terrain === 'ice') { line(t('Ice: nobody can begin here.'), 'is-dim'); return; }
    if (terrain === 'ocean') { line(t('Coast: you will begin on the shore.')); }
    switch (regionWater(this.geography, cell.x, cell.y)) {
      case 'river': line(t('A river is marked here.')); break;
      case 'lake': line(t('A lake is marked here.')); break;
      default: line(t('No river or lake is marked here. The game will look for the nearest fresh water.'), 'is-dim');
    }
    line(this.picked && this.picked.x === cell.x && this.picked.y === cell.y
      ? t('Press Begin here, or click it again.') : t('Click to choose this place.'), 'is-dim');
  }
}
