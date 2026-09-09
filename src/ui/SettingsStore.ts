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

const KEY = 'dynasty.settings';

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
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      overrides[path] = Math.min(tunable.max, Math.max(tunable.min, value));
    }
    return { v: 1, preset, overrides };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Nothing to do: the settings simply do not persist.
  }
}

/** The `Simulation` overrides these settings describe. */
export function configFrom(settings: Settings): DeepPartial<SimConfig> {
  return configFor(settings.preset, settings.overrides);
}
