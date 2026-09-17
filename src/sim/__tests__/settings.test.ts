/**
 * What the settings screen is allowed to remember.
 *
 * M9.6 phase 0. Game speed used to be an ordinary row on the difficulty screen,
 * which meant one drag of it silently became the speed every future world
 * opened at — the owner's "default speed 5" note, whose cause was not the
 * default (it was already 5) but the store. These tests are the guard on that:
 * the stripping happens in two places, and both of them have to keep working
 * for an old profile to stop opening fast.
 *
 * `SettingsStore` reaches `localStorage` defensively and returns defaults when
 * it throws, so a stub is required here or every test below passes for the
 * wrong reason — the module would simply be failing to read anything at all.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, defaultSettings } from '../../ui/SettingsStore.ts';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
});

describe('settings storage', () => {
  it('round-trips an ordinary override, so the stub is not hiding a failure', () => {
    saveSettings({ ...defaultSettings(), overrides: { 'needs.hungerRate': 0.08 } });
    expect(loadSettings().overrides['needs.hungerRate']).toBeCloseTo(0.08);
  });

  it('does not write game speed to storage', () => {
    saveSettings({
      ...defaultSettings(),
      overrides: { 'time.tickRate': 40, 'needs.hungerRate': 0.08 },
    });
    const raw = JSON.parse(store.get('dynasty.settings')!) as {
      overrides: Record<string, number>;
    };
    expect(raw.overrides['time.tickRate']).toBeUndefined();
    expect(raw.overrides['needs.hungerRate']).toBeCloseTo(0.08);
  });

  it('ignores a game speed written by an older build', () => {
    store.set('dynasty.settings', JSON.stringify({
      v: 1, preset: 'normal', overrides: { 'time.tickRate': 40 },
    }));
    expect(loadSettings().overrides['time.tickRate']).toBeUndefined();
  });
});
