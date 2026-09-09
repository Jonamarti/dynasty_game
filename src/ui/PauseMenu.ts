/**
 * The screen Escape reaches when nothing else is in the way.
 *
 * Deliberately small. There is no save system in this project, so there is
 * nothing to load and nothing to quit to; what a pause menu is actually for here
 * is three things the game had nowhere else to put — a way to stop, a way to
 * reach the tuning screen, and **the seed**, which is printed nowhere in the
 * game today and without which a bug report cannot be reproduced.
 *
 * The key list is the fourth. The bindings live in one `keydown` handler in
 * `main.ts` and in a single line of HUD chrome that is easy to hide, so this is
 * the first place in the game they are actually written down.
 *
 * Like `Settings`, it registers no Escape listener of its own: `main.ts` owns
 * the precedence chain. See the note at the top of `Settings.ts`.
 */
import type { Simulation } from '../sim/core/Simulation.ts';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onSettings: () => void;
}

/** Mirrors the handler in `main.ts`. Update both together. */
const KEYS: [string, string][] = [
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
  ['1 – 6', 'panel tabs'],
  ['P', 'fold the panel'],
  ['H', 'hide the overlay'],
  ['space', 'pause'],
  ['Esc', 'back, or this menu'],
];

export class PauseMenu {
  private root: HTMLElement;
  private subtitle!: HTMLElement;
  private built = false;

  constructor(container: HTMLElement, private readonly callbacks: PauseMenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'pausemenu';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'resume') this.callbacks.onResume();
      else if (act === 'settings') this.callbacks.onSettings();
      else if (target === this.root) this.callbacks.onResume();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(sim: Simulation): void {
    if (!this.built) this.build();
    this.subtitle.textContent = sim.time.label() + ' · seed ' + String(sim.config.seed);
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  private build(): void {
    const card = document.createElement('div');
    card.className = 'pausemenu-card';
    card.innerHTML =
      '<b class="pausemenu-title">Dynasty</b>' +
      '<div class="pausemenu-sub"></div>' +
      '<div class="pausemenu-acts">' +
      '<button class="hud-button is-primary" type="button" data-act="resume">Resume</button>' +
      '<button class="hud-button" type="button" data-act="settings">Settings</button>' +
      '</div>' +
      '<div class="pausemenu-keys-head">Keys</div>' +
      '<div class="pausemenu-keys">' +
      KEYS.map(([key, what]) =>
        '<span class="pausemenu-key"><b>' + key + '</b> ' + what + '</span>').join('') +
      '</div>';
    this.subtitle = card.querySelector('.pausemenu-sub') as HTMLElement;
    this.root.appendChild(card);
    this.built = true;
  }
}
