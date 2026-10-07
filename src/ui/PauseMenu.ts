/**
 * The screen Escape reaches when nothing else is in the way.
 *
 * Deliberately small. What a pause menu is actually for here is the things the
 * game had nowhere else to put — a way to stop, a way to reach the tuning
 * screen, **the seed**, which is printed nowhere in the game today and without
 * which a bug report cannot be reproduced, and (M15 phase 33c) **the saved
 * game**: save, load, and export to / import from a file. The menu only asks;
 * `main.ts` owns the world being saved and `SaveStore` owns where it goes, and
 * a save or a load that does not work says why on the line under the buttons.
 *
 * The key list is the fourth. The bindings live in one `keydown` handler in
 * `main.ts` and in a single line of HUD chrome that is easy to hide, so this is
 * the first place in the game they are actually written down.
 *
 * Like `Settings`, it registers no Escape listener of its own: `main.ts` owns
 * the precedence chain. See the note at the top of `Settings.ts`.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import { t, tc, onLanguageChange } from '../i18n/i18n.ts';
import { languageSwitchHtml, handleLanguageClick } from './LanguageSwitch.ts';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onSettings: () => void;
  fogEnabled: () => boolean;
  onToggleFog: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  /** The text of the file the player chose. */
  onImport: (text: string) => void;
  /** The file could not even be read. */
  onImportFailed: (error: unknown) => void;
}

/** Mirrors the handler in `main.ts`. Update both together. */
export const KEYS: [string, string][] = [
  ['W A S D', 'walk'],
  ['drag', 'pan the camera'],
  ['F', 're-centre on whoever you are'],
  ['click', 'inspect'],
  ['right-click', 'actions'],
  ['B', 'build'],
  ['M', 'make'],
  ['C', 'command someone'],
  ['G', 'tech web'],
  ['K', 'family tree'],
  ['T', 'tribe graph'],
  ['V', 'toggle fog of war'],
  ['1 – 6', 'panel tabs'],
  ['P', 'fold the panel'],
  ['H', 'hide the overlay'],
  ['space', 'pause'],
  ['Esc', 'back, or this menu'],
];

export class PauseMenu {
  private root: HTMLElement;
  private subtitle!: HTMLElement;
  private fogButton!: HTMLButtonElement;
  private loadButton!: HTMLButtonElement;
  private saveNote!: HTMLElement;
  private fileInput!: HTMLInputElement;
  private built = false;
  /** What the save line says, kept across a rebuild in another language. */
  private note: { text: string; bad: boolean } | null = null;
  private loadable: string | null = null;

  constructor(container: HTMLElement, private readonly callbacks: PauseMenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'pausemenu';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (handleLanguageClick(target)) return;
      const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'resume') this.callbacks.onResume();
      else if (act === 'settings') this.callbacks.onSettings();
      else if (act === 'save') this.callbacks.onSave();
      else if (act === 'load') this.callbacks.onLoad();
      else if (act === 'export') this.callbacks.onExport();
      else if (act === 'import') this.fileInput.click();
      else if (act === 'fog') {
        this.callbacks.onToggleFog();
        this.updateFogButton();
      }
      else if (target === this.root) this.callbacks.onResume();
    });

    // Built once, so a new language has to throw the card away. The subtitle
    // is part of it, and `open` is the only thing that knows what goes there.
    onLanguageChange(() => {
      if (!this.built) return;
      this.root.innerHTML = '';
      this.built = false;
      if (this.isOpen && this.lastSim) this.open(this.lastSim);
    });
  }

  private lastSim: Simulation | null = null;

  /** One line under the save buttons: what just happened, or why it did not. */
  setSaveNote(text: string | null, bad = false): void {
    this.note = text === null ? null : { text, bad };
    this.paintNote();
  }

  /** What the Load button would load ("Year 3, spring · 12 Oct 18:03"), or null when there is no save in the browser yet. */
  setLoadable(description: string | null): void {
    this.loadable = description;
    this.paintNote();
  }

  private paintNote(): void {
    if (!this.built) return;
    this.loadButton.disabled = this.loadable === null;
    this.loadButton.title = this.loadable ?? t('Nothing saved in this browser yet');
    const line = this.note ?? (this.loadable ? { text: t('Saved game: {what}', { what: this.loadable }), bad: false } : null);
    this.saveNote.textContent = line?.text ?? '';
    this.saveNote.classList.toggle('is-bad', line?.bad ?? false);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(sim: Simulation): void {
    this.lastSim = sim;
    if (!this.built) this.build();
    this.subtitle.textContent = sim.time.label() + ' · ' +
      t('seed {seed}', { seed: String(sim.config.seed) });
    this.updateFogButton();
    this.paintNote();
    this.root.hidden = false;
  }

  private updateFogButton(): void {
    if (this.fogButton) {
      this.fogButton.textContent = t('Fog of war: {state}', {
        state: this.callbacks.fogEnabled() ? t('On') : t('Off'),
      });
    }
  }

  close(): void {
    this.root.hidden = true;
  }

  private build(): void {
    const card = document.createElement('div');
    card.className = 'pausemenu-card';
    card.innerHTML =
      '<b class="pausemenu-title">' + t('Dynasty') + '</b>' +
      '<div class="pausemenu-sub"></div>' +
      '<div class="pausemenu-acts">' +
      '<button class="hud-button is-primary" type="button" data-act="resume">' + t('Resume') + '</button>' +
      '<button class="hud-button" type="button" data-act="settings">' + t('Settings') + '</button>' +
      '<button class="hud-button" type="button" data-act="fog"></button>' +
      '</div>' +
      '<div class="pausemenu-acts pausemenu-saves">' +
      '<button class="hud-button" type="button" data-act="save">' + t('Save') + '</button>' +
      '<button class="hud-button" type="button" data-act="load">' + t('Load') + '</button>' +
      '<button class="hud-button" type="button" data-act="export">' + t('Export to file') + '</button>' +
      '<button class="hud-button" type="button" data-act="import">' + t('Import from file') + '</button>' +
      '</div>' +
      '<div class="pausemenu-note" role="status" aria-live="polite"></div>' +
      '<input class="pausemenu-file" type="file" accept=".json,application/json" hidden>' +
      languageSwitchHtml() +
      '<div class="pausemenu-keys-head">' + t('Keys') + '</div>' +
      '<div class="pausemenu-keys">' +
      KEYS.map(([key, what]) =>
        '<span class="pausemenu-key"><b>' + tc('key', key) + '</b> ' + t(what) + '</span>').join('') +
      '</div>';
    this.subtitle = card.querySelector('.pausemenu-sub') as HTMLElement;
    this.fogButton = card.querySelector('[data-act="fog"]') as HTMLButtonElement;
    this.loadButton = card.querySelector('[data-act="load"]') as HTMLButtonElement;
    this.saveNote = card.querySelector('.pausemenu-note') as HTMLElement;
    this.fileInput = card.querySelector('.pausemenu-file') as HTMLInputElement;
    // `change` fires only when the chosen file differs from the last one, so picking the same file twice would do nothing:
    // clear the value as soon as it has been read.
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (!file) return;
      file.text().then(text => this.callbacks.onImport(text), error => this.callbacks.onImportFailed(error));
    });
    this.root.appendChild(card);
    this.built = true;
  }
}
