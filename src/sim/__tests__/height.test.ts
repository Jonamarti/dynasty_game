/**
 * Height (M15 phase 25): one answer to "how high is it?", in units and in
 * metres, that a spade (phase 26) can change.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../core/World.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';

const world = () => new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('height'));

describe('World.heightAt', () => {
  it('is the generated elevation until something is dug, and follows the offset after', () => {
    const w = world();
    const i = 30 * w.width + 30;
    expect(w.heightAt(30, 30)).toBe(w.elevation[i]);
    w.offset[i] = 0.1;
    expect(w.heightAt(30.4, 30.9)).toBeCloseTo(w.elevation[i]! + 0.1, 6);
    expect(w.heightAt(-5, 3)).toBe(0);
  });

  it('is smooth between tile centres and equal to the tile at its centre', () => {
    const w = world();
    expect(w.heightSmooth(20.5, 20.5)).toBeCloseTo(w.heightAt(20, 20), 6);
    const a = w.heightSmooth(20.5, 20.5);
    const b = w.heightSmooth(21.5, 20.5);
    expect(w.heightSmooth(21.0, 20.5)).toBeCloseTo((a + b) / 2, 6);
  });

  it('reads in metres above the sea, zero at the waterline', () => {
    const w = world();
    const i = 30 * w.width + 30;
    w.elevation[i] = DEFAULT_CONFIG.world.waterLevel + 0.25;
    expect(w.metresAt(30, 30)).toBeCloseTo(0.25 * DEFAULT_CONFIG.world.metresPerUnit, 4);
    w.elevation[i] = DEFAULT_CONFIG.world.waterLevel;
    expect(w.metresAt(30, 30)).toBeCloseTo(0, 4);
  });
});
