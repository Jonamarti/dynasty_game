/**
 * M15 phase 33: the game opens on the Earth, to choose where to begin (or a random island), and every start has fresh water.
 */
import { test, expect, type Page } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase33-earth-start-2026-10-07';

function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  return errors;
}

/** Centre of one region of the picker's canvas. */
async function regionPoint(page: Page, rx: number, ry: number) {
  const box = (await page.locator('.worldpicker-canvas').boundingBox())!;
  return { x: box.x + (rx + 0.5) / 96 * box.width, y: box.y + (ry + 0.5) / 48 * box.height };
}

async function freshWater(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as { __dynasty: { sim: any; worldState: any } }).__dynasty;
    return {
      kind: d.worldState.geography.kind as string,
      freshShore: d.sim.world.freshShore.length as number,
      peoples: (d.worldState.peoples?.sim.peoples.size ?? 0) as number,
      living: d.sim.livingPeople().length as number,
    };
  });
}

test('the game opens on the Earth; a place with a river begins there, with water to drink', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?seed=e2e-earth');
  const picker = page.locator('.worldpicker');
  await expect(picker).toBeVisible({ timeout: 20_000 });
  await expect(picker.locator('.worldpicker-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(picker.locator('.worldpicker-begin')).toBeDisabled();
  // Nothing behind it takes a key: Escape does not open the pause menu over the map.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pausemenu')).toBeHidden();

  // The open sea cannot be chosen, and the card says so.
  const sea = await regionPoint(page, 5, 24);
  await page.mouse.click(sea.x, sea.y);
  await expect(picker.locator('.worldpicker-info')).toContainText('nobody can begin here');
  await expect(picker.locator('.worldpicker-begin')).toBeDisabled();

  // A region with a river marked (row 24, column 30 on the 12,000-years-ago map).
  const river = await regionPoint(page, 30, 24);
  await page.mouse.click(river.x, river.y);
  await expect(picker.locator('.worldpicker-info')).toContainText('A river is marked here');
  await page.screenshot({ path: `${SHOTS}/01-earth-picker.png` });
  await picker.locator('.worldpicker-begin').click();

  // On to the settings, as every game; then the world behind is the Earth, with water.
  await expect(page.locator('.settings')).toBeVisible({ timeout: 30_000 });
  await expect(picker).toBeHidden();
  const earth = await freshWater(page);
  expect(earth.kind).toBe('earth');
  expect(earth.freshShore).toBeGreaterThan(40);
  expect(earth.peoples).toBeGreaterThan(100);
  expect(earth.living).toBeGreaterThan(0);
  await page.screenshot({ path: `${SHOTS}/02-after-choosing-settings.png` });
  await page.locator('.settings button', { hasText: 'Begin' }).click();
  await expect(page.locator('.newgame')).toBeVisible({ timeout: 15_000 });
  expect((await freshWater(page)).kind).toBe('earth');
  expect(errors).toEqual([]);
});

test('a place with no water within reach is refused, with the reason, and nothing changes', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?seed=e2e-earth');
  const picker = page.locator('.worldpicker');
  await expect(picker.locator('.worldpicker-canvas')).toBeVisible({ timeout: 20_000 });
  // Deep in the Sahara there is neither river nor lake for two regions around.
  const desert = await regionPoint(page, 49, 20);
  await page.mouse.click(desert.x, desert.y);
  await expect(picker.locator('.worldpicker-info')).toContainText('No river or lake is marked here');
  await picker.locator('.worldpicker-begin').click();
  await expect(picker.locator('.worldpicker-note')).toContainText('no river or lake within reach', { timeout: 30_000 });
  await expect(picker.locator('.worldpicker-note')).toHaveClass(/is-bad/);
  await expect(picker).toBeVisible();
  expect((await freshWater(page)).kind).not.toBe('earth');
  await page.screenshot({ path: `${SHOTS}/03-no-water-refused.png` });
  expect(errors).toEqual([]);
});

test('a random island is the other door, and the Spanish picker reads in Spanish', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?seed=e2e-earth&lang=es');
  const picker = page.locator('.worldpicker');
  await expect(picker.locator('.worldpicker-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(picker).toContainText('¿Dónde empieza tu historia?');
  await page.screenshot({ path: `${SHOTS}/04-earth-picker-es.png` });
  await picker.locator('.worldpicker-island').click();
  await expect(page.locator('.settings')).toBeVisible();
  await expect(picker).toBeHidden();
  expect((await freshWater(page)).kind).toBe('legacyIsland');
  expect(errors).toEqual([]);
});
