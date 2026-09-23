/**
 * What the settings screen remembers between sessions.
 *
 * Stored as **the difference from an anchor**, never as an expanded config:
 * `{ preset, overrides }`. If a later pass retunes Hard, a player who never
 * touched hunger picks up the new number and one who set it by hand keeps
 * theirs. Writing the whole config out instead would freeze every future retune
 * out of every browser that had ever opened the settings screen, silently.
 *
 * `localStorage` is reached defensively for the same reason `Hud`'s
 * `readFlag`/`writeFlag` are: a page opened from a file:// URL or in a private
 * window throws on first access, and losing a preference is never worth an
 * exception that stops the game from booting.
 */
import {
  DIFFICULTY_IDS, TUNABLES, configFor, type DifficultyId,
} from '../sim/core/Difficulty.ts';
import type { DeepPartial, SimConfig } from '../sim/core/Config.ts';
import { AUTONOMY_ORDER, type Autonomy } from '../sim/ai/Autonomy.ts';
import { LANGUAGES, type Language } from '../i18n/i18n.ts';

const KEY = 'dynasty.settings';

/**
 * How much the player's character looks after itself, kept apart from the
 * difficulty document above on purpose.
 *
 * It is not a tunable and not an override: `Settings` is a *difference from an
 * anchor*, and every anchor operation on that screen — dragging the difficulty
 * slider, "Reset everything to Normal" — legitimately throws the whole
 * `overrides` map away. A control-scheme preference living in there would be
 * silently reset by a player retuning their hunger rate, which is the same
 * class of surprise the comment at the top of this file exists to prevent.
 *
 * M9 phase 6's plan called for "a new `Settings` field" before that shape was
 * looked at closely; this is the same preference stored somewhere it survives.
 */
const AUTONOMY_KEY = 'dynasty.autonomy';

/**
 * The one tunable that is deliberately *not* remembered between sessions.
 *
 * M9.6 phase 0, and the owner's note was two words: "default speed 5". The
 * default already *was* 5 — `DEFAULT_CONFIG.time.tickRate`, read by the loop
 * and by the HUD slider alike — but game speed is a row on the difficulty
 * screen, and every row on that screen is written into `overrides` and kept for
 * ever. So a single drag of that slider, once, silently became the speed every
 * world opened at from then on, and the only way back to 5 was "Reset
 * everything to Normal", which throws away every other tuning the player has
 * made with it.
 *
 * Pacing is taste rather than difficulty — the comment above the clock group in
 * `Difficulty.ts` says so, and it is the same argument `AUTONOMY_KEY` above is
 * made of. A speed is also the one setting a player changes for the next two
 * minutes rather than for the next world: watching a birth, skipping a winter.
 * So it applies live from both controls and is stored by neither, and a world
 * always opens at the default. It is stripped on the way out *and* ignored on
 * the way in, so a value written by an older build stops mattering the first
 * time this build saves.
 */
const UNSAVED_PATHS = ['time.tickRate'];

export function loadAutonomy(): Autonomy {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(AUTONOMY_KEY);
  } catch {
    return 'manual';
  }
  // Anything unrecognised — an older build's spelling, a hand-edited value —
  // degrades to the mode the game has always had rather than throwing on boot.
  return AUTONOMY_ORDER.includes(raw as Autonomy) ? (raw as Autonomy) : 'manual';
}

/**
 * The language the game is shown in. Kept apart from the difficulty document
 * for the reason `AUTONOMY_KEY` is: "Reset everything to Normal" throws the
 * overrides away, and it must not also switch a Spanish reader into English.
 */
const LANGUAGE_KEY = 'dynasty.language';

/**
 * The stored choice, or — the first time the game is opened — the browser's
 * own language if the game has it, so a Spanish browser opens in Spanish
 * without anybody having to find a button in a language they cannot read.
 */
export function loadLanguage(): Language {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LANGUAGE_KEY);
  } catch {
    raw = null;
  }
  if (LANGUAGES.some(l => l.id === raw)) return raw as Language;
  const browser = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  return LANGUAGES.some(l => l.id === browser) ? (browser as Language) : 'en';
}

export function saveLanguage(value: Language): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, value);
  } catch {
    // Nothing to do: the preference simply does not persist.
  }
}

export function saveAutonomy(value: Autonomy): void {
  try {
    localStorage.setItem(AUTONOMY_KEY, value);
  } catch {
    // Nothing to do: the preference simply does not persist.
  }
}

export interface Settings {
  /** Schema version, so a later shape change can be migrated rather than guessed. */
  v: 1;
  /** The anchor the fields were last stamped from. */
  preset: DifficultyId;
  /** Path to value, only where the player moved it away from the anchor. */
  overrides: Record<string, number>;
}

export function defaultSettings(): Settings {
  return { v: 1, preset: 'normal', overrides: {} };
}

/**
 * Reads the stored settings, discarding anything that no longer makes sense.
 *
 * Everything here is validated rather than trusted: this is data written by an
 * older build of the game, and an unknown preset or a path that has since been
 * removed must degrade to the default rather than throw on the boot path.
 */
export function loadSettings(): Settings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return defaultSettings();
  }
  if (!raw) return defaultSettings();

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const preset = DIFFICULTY_IDS.includes(parsed.preset as DifficultyId)
      ? (parsed.preset as DifficultyId)
      : 'normal';
    const overrides: Record<string, number> = {};
    for (const [path, value] of Object.entries(parsed.overrides ?? {})) {
      const tunable = TUNABLES.find(t => t.path === path);
      if (!tunable) continue;
      if (UNSAVED_PATHS.includes(path)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      overrides[path] = Math.min(tunable.max, Math.max(tunable.min, value));
    }
    return { v: 1, preset, overrides };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  // The overrides the *screen* is holding are correct — the slider has to stay
  // where the player put it while they are looking at it — so the stripping
  // happens here, on the way to storage, rather than by refusing the edit.
  const overrides = { ...settings.overrides };
  for (const path of UNSAVED_PATHS) delete overrides[path];
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...settings, overrides }));
  } catch {
    // Nothing to do: the settings simply do not persist.
  }
}

/** The `Simulation` overrides these settings describe. */
export function configFrom(settings: Settings): DeepPartial<SimConfig> {
  return configFor(settings.preset, settings.overrides);
}
