/**
 * M15 phase 33c: the whole game can be saved in the browser (IndexedDB), loaded back, exported to a file and imported from one,
 * and a save that cannot be read says why and leaves the game as it was.
 *
 * The world is the generated globe (`world=random`), so the saved game has a world of peoples in it as well as the comarca.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase33-save-2026-10-07';
const WORLD = 'seed=e2e-globe&world=random';

function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  return errors;
}

async function ready(page: Page, query: string): Promise<void> {
  await page.goto('/?skipIntro=1&' + query);
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 20_000 });
  await expect(page.locator('.hud-name')).not.toBeEmpty();
}

/** What a load must give back exactly. */
async function state(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as { __dynasty: { sim: any; worldState: any } }).__dynasty;
    return {
      tick: d.sim.time.tick as number, seed: String(d.sim.config.seed), player: d.sim.player?.id as number,
      living: d.sim.livingPeople().length as number, peoples: d.worldState.peoples?.sim.peoples.size as number,
      peoplesStep: d.worldState.peoples?.sim.currentStep as number,
    };
  });
}

async function openMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.pausemenu')).toBeVisible();
}

test('save, load: the game comes back exactly where it was, paused, and says so', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page, WORLD);
  // Let some time pass, so the saved moment is not the first tick.
  await page.waitForFunction(() => (window as any).__dynasty.sim.time.tick > 60, undefined, { timeout: 20_000 });
  await openMenu(page);
  await expect(page.locator('[data-act="load"]')).toBeDisabled();
  await page.locator('[data-act="save"]').click();
  await expect(page.locator('.pausemenu-note')).toContainText('Saved:');
  await expect(page.locator('[data-act="load"]')).toBeEnabled();
  const saved = await state(page);
  expect(saved.peoples).toBeGreaterThan(20);
  await page.screenshot({ path: `${SHOTS}/01-pause-menu-saved.png` });

  await page.locator('[data-act="load"]').click();
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__dynasty?.sim?.time.tick >= 0, undefined, { timeout: 30_000 });
  const loaded = await state(page);
  expect(loaded).toEqual(saved);
  // Opens paused: nothing moves until the player says so.
  await page.waitForTimeout(600);
  expect((await state(page)).tick).toBe(saved.tick);
  expect(page.url()).not.toContain('load=');
  await page.screenshot({ path: `${SHOTS}/02-loaded-paused.png` });

  // And it plays on, with the world of peoples advancing on the same clock.
  await page.keyboard.press('Space');
  await page.waitForFunction(t => (window as any).__dynasty.sim.time.tick > t + 40, saved.tick, { timeout: 20_000 });
  const later = await state(page);
  expect(later.peoplesStep).toBeLessThanOrEqual(later.tick);
  expect(errors).toEqual([]);
});

test('export a file and import it back; a bad file is refused with a reason and changes nothing', async ({ page }, info) => {
  const errors = guardErrors(page);
  await ready(page, WORLD);
  await page.waitForFunction(() => (window as any).__dynasty.sim.time.tick > 30, undefined, { timeout: 20_000 });
  await openMenu(page);
  const before = await state(page);

  const download = page.waitForEvent('download');
  await page.locator('[data-act="export"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^dynasty-e2e-globe-tick\d+\.json$/);
  const path = info.outputPath('save.json');
  await file.saveAs(path);
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  expect(parsed.format).toBe('dynasty-save');
  expect(parsed.world.peoples).not.toBeNull();
  await expect(page.locator('.pausemenu-note')).toContainText('Exported');

  // A file that is not a save: said, in red, and the game is exactly as it was.
  const junk = info.outputPath('junk.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(junk, '{"hello": "world"}');
  await page.locator('.pausemenu-file').setInputFiles(junk);
  await expect(page.locator('.pausemenu-note')).toContainText('not a Dynasty saved game');
  await expect(page.locator('.pausemenu-note')).toHaveClass(/is-bad/);
  writeFileSync(junk, 'not json at all');
  await page.locator('.pausemenu-file').setInputFiles(junk);
  await expect(page.locator('.pausemenu-note')).toContainText('not JSON');
  await page.screenshot({ path: `${SHOTS}/03-bad-file-refused.png` });
  expect((await state(page)).tick).toBe(before.tick);

  // The real one comes back, on a fresh page that never saw this world.
  await page.locator('.pausemenu-file').setInputFiles(path);
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__dynasty?.sim?.time.tick >= 0, undefined, { timeout: 30_000 });
  const after = await state(page);
  expect(after.tick).toBe(parsed.summary.tick);
  expect(after.seed).toBe('e2e-globe');
  expect(after.peoples).toBe(parsed.summary.peoples);
  expect(errors).toEqual([]);
});

test('a load that cannot be read says why on screen and opens a new world instead', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?skipIntro=1&seed=e2e-fixture&load=nothing-saved-here');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 20_000 });
  expect(await page.evaluate(() => String((window as any).__dynasty.sim.config.seed))).toBe('e2e-fixture');
  expect(page.url()).not.toContain('load=');
  expect(errors).toEqual([]);
});
