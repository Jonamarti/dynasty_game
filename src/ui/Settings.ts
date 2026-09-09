/**
 * The tuning screen: a difficulty from peaceful to extreme, and every field it
 * moves, individually editable underneath.
 *
 * Two deliberate departures from the other full-screen overlays in this folder:
 *
 * 1. **It registers no Escape listener of its own.** `TribeGraph` and friends
 *    each close themselves on Escape, which is fine when a key means one thing.
 *    Here it means three — leave the settings, leave the menu, leave neither —
 *    so `main.ts` owns the whole precedence chain and this screen only exposes
 *    `isOpen` and `close()` for it to drive. Two self-closing overlays plus a
 *    chain is three things deciding what one key does.
 *
 * 2. **It never rewrites `innerHTML` after the first build.** The hover problem
 *    `TechWeb` documents is the mild version; the sharp one is that rebuilding
 *    while a `<input type="range">` is under the pointer detaches the element
 *    mid-drag, the pointer capture dies, and the slider sticks. Rows are built
 *    once and mutated through `rows`, so re-stamping thirty fields when the
 *    difficulty moves touches no DOM structure at all.
 *
 * Live edits are written straight into `sim.config`. That works because of
 * object identity rather than by accident: `NeedsSystem` and `TimeManager` were
 * handed the very objects inside `SimConfig` in the constructor, and the
 * per-tick and per-day contexts are rebuilt from `this.config` every step. See
 * `Simulation.applyLearning` for the one field this is not true of.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import {
  DIFFICULTY_IDS, DIFFICULTY_LABELS, DIFFICULTY_NOTES,
  GROUP_LABELS, TUNABLES, readPath, valuesFor, writePath,
  type DifficultyId, type Tunable, type TunableGroup,
} from '../sim/core/Difficulty.ts';
import { sliderRow, type SliderRow } from './SliderRow.ts';
import { defaultSettings, saveSettings, type Settings } from './SettingsStore.ts';

/**
 * Where the screen was opened from, which changes what leaving it means.
 *
 * `start` is the screen the game now opens on, before character creation: at
 * that point there is nothing to go *back* to, the world can still be rebuilt
 * from scratch, and Escape must not work — the same reason `NewGame` and
 * `Succession` have no Escape handler. `menu` is the in-game screen reached
 * from the pause menu.
 */
export type SettingsMode = 'start' | 'menu';

export interface SettingsCallbacks {
  /** Back to the pause menu. Only reachable in `menu` mode. */
  onBack: () => void;
  /** Leave the start screen and get on with choosing a character. */
  onBegin: () => void;
  /** A live change to `time.tickRate`, which the simulation never reads itself. */
  onSpeedChange: (value: number) => void;
  /** Save and reload into a fresh world on this seed. */
  onNewWorld: (seed: string) => void;
}

const GROUP_ORDER: TunableGroup[] = ['body', 'land', 'mind', 'people', 'clock'];

export class SettingsOverlay {
  private root: HTMLElement;
  private sim: Simulation | null = null;
  private settings: Settings = defaultSettings();
  private mode: SettingsMode = 'menu';

  private built = false;
  private rows = new Map<string, SliderRow>();
  private difficulty!: HTMLInputElement;
  private anchorRow!: HTMLElement;
  private presetNote!: HTMLElement;
  private restartNote!: HTMLElement;
  private subtitle!: HTMLElement;
  private titleEl!: HTMLElement;
  private undoStrip!: HTMLElement;
  private newWorldPane!: HTMLElement;
  private seedBox!: HTMLInputElement;

  /** The overrides discarded by the last difficulty drag, for the Undo strip. */
  private discarded: Record<string, number> | null = null;

  constructor(container: HTMLElement, private readonly callbacks: SettingsCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'settings';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act) this.onAction(act);
      // A click on the backdrop leaves, but only where leaving is a thing that
      // can happen: on the start screen there is no game behind it to fall back
      // into, so a stray click must not skip past the settings.
      else if (target === this.root && this.mode === 'menu') this.callbacks.onBack();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** True while this is the screen the game opens on, before anything exists. */
  get isStartScreen(): boolean {
    return this.isOpen && this.mode === 'start';
  }

  open(sim: Simulation, settings: Settings, mode: SettingsMode = 'menu'): void {
    this.sim = sim;
    this.mode = mode;
    this.settings = { ...settings, overrides: { ...settings.overrides } };
    if (!this.built) this.build();
    this.titleEl.textContent = mode === 'start' ? 'Before you begin' : 'Settings';
    this.subtitle.textContent = mode === 'start'
      ? 'seed ' + String(sim.config.seed)
      : 'seed ' + String(sim.config.seed) + ' · ' + sim.time.label();
    this.root.classList.toggle('is-start', mode === 'start');
    this.newWorldPane.hidden = true;
    this.undoStrip.hidden = true;
    this.discarded = null;
    this.refresh();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.sim = null;
  }

  /** The settings as they now stand, for whoever owns the stored copy. */
  current(): Settings {
    return { ...this.settings, overrides: { ...this.settings.overrides } };
  }

  // -------------------------------------------------------------------------
  // Building, once
  // -------------------------------------------------------------------------

  private build(): void {
    const card = div('settings-card');

    const head = div('settings-head');
    head.innerHTML =
      '<b class="settings-title">Settings</b>' +
      '<span class="settings-sub"></span>' +
      '<button class="hud-button settings-back" type="button" data-act="back">back</button>';
    this.titleEl = head.querySelector('.settings-title') as HTMLElement;
    this.subtitle = head.querySelector('.settings-sub') as HTMLElement;
    card.appendChild(head);

    // --- the difficulty slider ---------------------------------------------
    const box = div('settings-difficulty');
    const label = div('settings-difficulty-label');
    label.textContent = 'Difficulty';
    box.appendChild(label);

    this.difficulty = document.createElement('input');
    this.difficulty.type = 'range';
    this.difficulty.className = 'settings-difficulty-range';
    this.difficulty.min = '0';
    this.difficulty.max = String(DIFFICULTY_IDS.length - 1);
    this.difficulty.step = '1';
    this.difficulty.setAttribute('list', 'settings-anchors');
    this.difficulty.oninput = () => this.stamp(DIFFICULTY_IDS[Number(this.difficulty.value)]!);
    box.appendChild(this.difficulty);

    const list = document.createElement('datalist');
    list.id = 'settings-anchors';
    for (let i = 0; i < DIFFICULTY_IDS.length; i++) {
      const option = document.createElement('option');
      option.value = String(i);
      list.appendChild(option);
    }
    box.appendChild(list);

    this.anchorRow = div('settings-anchor-row');
    for (const id of DIFFICULTY_IDS) {
      const span = document.createElement('span');
      span.className = 'settings-anchor';
      span.dataset.anchor = id;
      span.textContent = DIFFICULTY_LABELS[id];
      this.anchorRow.appendChild(span);
    }
    box.appendChild(this.anchorRow);

    this.presetNote = div('settings-preset-note');
    box.appendChild(this.presetNote);

    // Dragging the slider throws away hand edits, so it offers them back once.
    // Silently discarding somebody's work is how a settings screen earns a
    // reputation it never loses.
    this.undoStrip = div('settings-undo');
    this.undoStrip.hidden = true;
    box.appendChild(this.undoStrip);

    card.appendChild(box);

    // --- the fields ---------------------------------------------------------
    const groups = div('settings-groups');
    for (const group of GROUP_ORDER) {
      const members = TUNABLES.filter(t => t.group === group);
      if (members.length === 0) continue;
      const section = div('settings-group');
      const heading = div('settings-group-head');
      heading.innerHTML = '<b>' + GROUP_LABELS[group] + '</b>';
      section.appendChild(heading);

      // The four work-limit fields are the sharpest edge on this screen — a need
      // settles at the line that stops it — so they are folded away rather than
      // sitting between hunger and thirst inviting a casual drag.
      const plain = members.filter(t => !isAdvanced(t));
      const advanced = members.filter(t => isAdvanced(t));
      for (const tunable of plain) section.appendChild(this.makeRow(tunable));
      if (advanced.length > 0) {
        const details = document.createElement('details');
        details.className = 'settings-advanced';
        const summary = document.createElement('summary');
        summary.textContent = 'Advanced — where work stops';
        details.appendChild(summary);
        for (const tunable of advanced) details.appendChild(this.makeRow(tunable));
        section.appendChild(details);
      }
      groups.appendChild(section);
    }
    card.appendChild(groups);

    this.restartNote = div('settings-restart-note');
    this.restartNote.hidden = true;
    card.appendChild(this.restartNote);

    // --- new world ----------------------------------------------------------
    this.newWorldPane = div('settings-newworld');
    this.newWorldPane.hidden = true;
    this.newWorldPane.innerHTML =
      '<div class="settings-newworld-warn">This world is not saved anywhere. ' +
      'Starting another one ends it.</div>' +
      '<label class="settings-newworld-seed">Seed ' +
      '<input type="text" class="settings-seed" /></label>' +
      '<div class="settings-newworld-acts">' +
      '<button class="hud-button is-primary" type="button" data-act="newworld-go">Start</button>' +
      '<button class="hud-button" type="button" data-act="newworld-cancel">Cancel</button>' +
      '</div>';
    this.seedBox = this.newWorldPane.querySelector('.settings-seed') as HTMLInputElement;
    card.appendChild(this.newWorldPane);

    // Two sets of actions for the two modes, rather than one set relabelled.
    // "New world with these settings" is meaningless on a screen where no world
    // has been shown yet, and "Back" has nowhere to go.
    const actions = div('settings-actions');
    actions.innerHTML =
      '<button class="hud-button settings-menu-act" type="button" data-act="reset">Reset everything to Normal</button>' +
      '<button class="hud-button is-primary settings-menu-act" type="button" data-act="newworld">New world with these settings</button>' +
      '<button class="hud-button settings-menu-act" type="button" data-act="back">Back</button>' +
      '<button class="hud-button settings-start-act" type="button" data-act="reset">Reset to Normal</button>' +
      '<button class="hud-button is-primary settings-start-act" type="button" data-act="begin">Begin</button>';
    card.appendChild(actions);

    this.root.appendChild(card);
    this.built = true;
  }

  private makeRow(tunable: Tunable): HTMLElement {
    const row = sliderRow(
      {
        label: tunable.label,
        hint: tunable.hint,
        min: tunable.min,
        max: tunable.max,
        step: tunable.step,
        places: tunable.places,
        tag: tunable.restart ? 'new world' : undefined,
        tagTitle: tunable.restart
          ? 'Spent when the world is generated — this only takes effect in a new one.'
          : undefined,
      },
      // From the settings themselves, not from `sim.config`. On the start
      // screen the world in front of the player is about to be rebuilt from
      // these values, so the config is the stale one of the two.
      (valuesFor(this.settings.preset)[tunable.path] ?? 0),
      value => this.edit(tunable, value),
      () => this.resetField(tunable)
    );
    this.rows.set(tunable.path, row);
    return row.el;
  }

  // -------------------------------------------------------------------------
  // Editing
  // -------------------------------------------------------------------------

  private onAction(act: string): void {
    switch (act) {
      case 'back': this.callbacks.onBack(); break;
      case 'begin': this.callbacks.onBegin(); break;
      case 'reset': this.resetAll(); break;
      case 'undo': this.undo(); break;
      case 'newworld':
        this.newWorldPane.hidden = false;
        // A fresh seed by default, but editable: replaying a specific world is
        // the whole point of the seed being a text field rather than a button.
        this.seedBox.value = String(Math.floor(Math.random() * 1e9));
        this.seedBox.focus();
        break;
      case 'newworld-cancel': this.newWorldPane.hidden = true; break;
      case 'newworld-go': {
        const seed = this.seedBox.value.trim();
        if (seed !== '') this.callbacks.onNewWorld(seed);
        break;
      }
    }
  }

  /** One field moved by hand. */
  private edit(tunable: Tunable, value: number): void {
    const anchor = valuesFor(this.settings.preset)[tunable.path]!;
    if (value === anchor) delete this.settings.overrides[tunable.path];
    else this.settings.overrides[tunable.path] = value;
    this.applyLive(tunable, value);
    this.persist();
    this.refreshNotes();
    this.rows.get(tunable.path)?.set(value, value !== anchor);
  }

  /** The difficulty slider moved: re-stamp everything, offering the edits back. */
  private stamp(preset: DifficultyId): void {
    const had = Object.keys(this.settings.overrides).length;
    this.discarded = had > 0 ? { ...this.settings.overrides } : null;
    this.settings.preset = preset;
    this.settings.overrides = {};
    this.applyAll();
    this.persist();
    this.refresh();
    if (this.discarded) {
      this.undoStrip.hidden = false;
      this.undoStrip.innerHTML =
        '<span>Replaced ' + had + (had === 1 ? ' setting' : ' settings') +
        ' you had changed.</span>' +
        '<button class="hud-button" type="button" data-act="undo">Undo</button>';
    }
  }

  private undo(): void {
    if (!this.discarded) return;
    this.settings.overrides = { ...this.discarded };
    this.discarded = null;
    this.undoStrip.hidden = true;
    this.applyAll();
    this.persist();
    this.refresh();
  }

  /** Back to this difficulty's value for one field, not to the shipped default. */
  private resetField(tunable: Tunable): void {
    const anchor = valuesFor(this.settings.preset)[tunable.path]!;
    delete this.settings.overrides[tunable.path];
    this.applyLive(tunable, anchor);
    this.persist();
    this.rows.get(tunable.path)?.set(anchor, false);
    this.refreshNotes();
  }

  private resetAll(): void {
    this.settings = defaultSettings();
    this.discarded = null;
    this.undoStrip.hidden = true;
    this.applyAll();
    this.persist();
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // Applying
  // -------------------------------------------------------------------------

  /**
   * Writes one field into the running world, where that means anything.
   *
   * A `restart` field is deliberately *not* written. For the resource counts it
   * would merely be inert, but `time.ticksPerDay` would be actively harmful:
   * `TimeManager.day` is derived from an ever-increasing tick, so halving it
   * mid-run jumps the calendar by years, and every absolute day stored anywhere
   * — the spacing between a mother's births, the age at which an unbuilt idea is
   * abandoned — is instantly wrong.
   */
  private applyLive(tunable: Tunable, value: number): void {
    const sim = this.sim;
    if (!sim || tunable.restart) return;
    writePath(sim.config, tunable.path, value);
    if (tunable.path === 'learning.skillGain') sim.applyLearning();
    if (tunable.path === 'time.tickRate') this.callbacks.onSpeedChange(value);
  }

  private applyAll(): void {
    const values = { ...valuesFor(this.settings.preset), ...this.settings.overrides };
    for (const tunable of TUNABLES) this.applyLive(tunable, values[tunable.path]!);
  }

  private persist(): void {
    saveSettings(this.settings);
  }

  // -------------------------------------------------------------------------
  // Redrawing, without rebuilding
  // -------------------------------------------------------------------------

  private refresh(): void {
    const anchors = valuesFor(this.settings.preset);
    const values = { ...anchors, ...this.settings.overrides };
    for (const tunable of TUNABLES) {
      this.rows.get(tunable.path)?.set(
        values[tunable.path]!,
        values[tunable.path] !== anchors[tunable.path]
      );
    }
    this.difficulty.value = String(DIFFICULTY_IDS.indexOf(this.settings.preset));
    for (const span of Array.from(this.anchorRow.children) as HTMLElement[]) {
      span.classList.toggle('is-on', span.dataset.anchor === this.settings.preset);
    }
    this.refreshNotes();
  }

  private refreshNotes(): void {
    const changed = Object.keys(this.settings.overrides).length;
    const label = DIFFICULTY_LABELS[this.settings.preset];
    this.presetNote.classList.toggle('is-custom', changed > 0);
    this.difficulty.classList.toggle('is-custom', changed > 0);
    this.presetNote.textContent = changed === 0
      ? label + ' — ' + DIFFICULTY_NOTES[this.settings.preset]
      : 'Custom — from ' + label + ', with ' + changed +
        (changed === 1 ? ' setting changed.' : ' settings changed.');

    // The player must be told which of their edits the world in front of them
    // cannot honour. A screen that accepts a number and quietly ignores it is
    // the thing the standing rule about refusals exists to prevent.
    //
    // Nothing to say on the start screen: the world has not been handed over
    // yet, and `Begin` rebuilds it from whatever is on this form.
    if (this.mode === 'start') {
      this.restartNote.hidden = true;
      return;
    }
    const anchors = valuesFor(this.settings.preset);
    const values = { ...anchors, ...this.settings.overrides };
    const pending = TUNABLES.filter(t =>
      t.restart && this.sim !== null &&
      values[t.path] !== readPath(this.sim.config, t.path));
    this.restartNote.hidden = pending.length === 0;
    if (pending.length > 0) {
      this.restartNote.textContent =
        pending.length + (pending.length === 1 ? ' setting' : ' settings') +
        ' below (' + pending.map(t => t.label.toLowerCase()).join(', ') +
        ') only take effect in a new world.';
    }
  }

}

/** The fields folded behind "Advanced" — see the comment at the call site. */
function isAdvanced(tunable: Tunable): boolean {
  return tunable.path.startsWith('needs.workLimits.') ||
    tunable.path === 'needs.criticalThreshold';
}

function div(className: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
