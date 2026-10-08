import { describe, expect, it } from 'vitest';
import { FogReveal } from '../FogReveal.ts';

/** M15 step 0 D: the fog rule when the player changes character. */
describe('FogReveal', () => {
  it('lets everything through for the character the game began with', () => {
    const fog = new FogReveal();
    fog.follow(1);
    fog.observe(10, 10, 6, 64, 64);
    expect(fog.active).toBe(false);
    expect(fog.shows(60, 60)).toBe(true);
  });

  it('shows only the sight radius after a change of observer, and keeps the trail', () => {
    const fog = new FogReveal();
    fog.follow(1);
    fog.follow(2);
    expect(fog.active).toBe(true);
    fog.observe(10, 10, 6, 64, 64);
    expect(fog.shows(10, 10)).toBe(true);
    expect(fog.shows(60, 60)).toBe(false);
    fog.observe(30, 10, 6, 64, 64);
    expect(fog.shows(30, 10)).toBe(true);
    expect(fog.shows(10, 10)).toBe(true);
    expect(fog.shows(20, 40)).toBe(false);
  });

  it('starts over on every change, and ignores nobody-at-the-moment', () => {
    const fog = new FogReveal();
    fog.follow(1); fog.follow(2);
    fog.observe(10, 10, 6, 64, 64);
    fog.follow(null);
    expect(fog.shows(10, 10)).toBe(true);
    fog.follow(3);
    expect(fog.shows(10, 10)).toBe(false);
    fog.follow(1);
    expect(fog.shows(10, 10)).toBe(false);
  });

  it('bumps its revision only when the picture changes, and a new world forgets it all', () => {
    const fog = new FogReveal();
    fog.follow(1); fog.follow(2);
    fog.observe(10, 10, 6, 64, 64);
    const seen = fog.revision;
    fog.observe(10, 10, 6, 64, 64);
    expect(fog.revision).toBe(seen);
    fog.reset();
    expect(fog.active).toBe(false);
    fog.follow(2);
    expect(fog.active).toBe(false);
  });
});
