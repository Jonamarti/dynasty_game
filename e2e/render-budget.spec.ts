/**
 * Browser render and population budget checks. These exercise the production
 * canvas and ArtAtlas paths, rather than game UI flows covered by smoke.spec.
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const PERSON_PIXELS = JSON.parse(readFileSync(
  new URL('../src/render/__tests__/person-pixels.json', import.meta.url), 'utf8',
)) as Record<string, string>;

/** Fails the test on any uncaught error or console error, not just assertions. */
function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });
  return errors;
}

test('population profiler runs 300 real founders through the production loop', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?seed=profile-4&defaults=1&skipIntro=1&profileHumans=300');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  const initial = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    return { count: d.sim.livingPeople().length, tick: d.sim.time.tick,
      families: d.sim.livingPeople().filter((p: any) => p.motherId !== null || p.partnerId !== null).length };
  });
  expect(initial.count).toBe(300);
  expect(initial.families).toBeGreaterThan(0);
  await page.waitForFunction(tick => (window as any).__dynasty.sim.time.tick > tick + 2, initial.tick);
  expect(await page.evaluate(() => (window as any).__dynasty.renderer.art.cacheStats.composed.entries)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('ArtAtlas preserves person pixels and stays within the render cache budget', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/tools/art/memory.html?skipIntro=1');
  await test.step('preserve every body, pose and facing pixel', async () => {
    const failures = await page.evaluate(async golden => {
      const { ArtAtlas } = await new Function('return import("/src/render/ArtAtlas.ts")')();
      const atlas = await ArtAtlas.load('/art/');
      const failures: string[] = [];
      for (const [key, expected] of Object.entries(golden)) {
        const [age, sex, dir, pose] = key.split('/');
        const a = { age, sex, dir, pose, skin: '#d4a276', hair: '#2b2018', band: '#3b6ea8',
          hairStyle: sex === 'f' ? 'long' : 'short', beard: sex === 'm', expression: 'warm',
          wear: {}, carryBaby: false, held: null };
        const cell = atlas.compose(a);
        const pixels = cell.getContext('2d').getImageData(0, 0, 96, 96).data;
        const hash = await crypto.subtle.digest('SHA-256', pixels);
        const actual = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        if (actual !== expected) failures.push(key);
      }
      return failures;
    }, PERSON_PIXELS);
    expect(Object.keys(PERSON_PIXELS).length).toBe(360);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
  });

  await test.step('keep 500 gathering appearances within the cache budget without warm recompositions', async () => {
    const stats = await page.evaluate(async () => {
      const { ArtAtlas } = await new Function('return import("/src/render/ArtAtlas.ts")')();
      const atlas = await ArtAtlas.load('/art/');
      const cycle = (people: number) => {
        for (let phase = 0; phase < 4; phase++) for (let i = 0; i < people; i++) {
          atlas.sprite({ age: i % 7 === 0 ? 'elder' : 'adult', sex: i % 2 ? 'f' : 'm', dir: 'E', pose: 'g' + phase,
            skin: '#' + (0xb08050 + i).toString(16), hair: '#2b2018', band: '#3b6ea8',
            hairStyle: i % 2 ? 'long' : 'short', beard: false, expression: 'neutral',
            wear: {}, carryBaby: false, held: null });
        }
      };
      cycle(500); const cold = atlas.cacheStats;
      cycle(500); const warm = atlas.cacheStats;
      cycle(1800); const overflow = atlas.cacheStats;
      return { cold, warm, overflow };
    });
    expect(stats.cold.composed.entries).toBe(2000);
    expect(stats.cold.composed.bytes).toBeLessThan(24 * 1024 * 1024);
    expect(stats.cold.composed.evictions).toBe(0);
    expect(stats.warm.composed.misses).toBe(stats.cold.composed.misses);
    expect(stats.warm.composed.hits - stats.cold.composed.hits).toBe(2000);
    for (const cache of [stats.overflow.composed, stats.overflow.tints]) {
      expect(cache.bytes).toBeLessThanOrEqual(cache.maxBytes);
      expect(cache.evictions).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });
});
