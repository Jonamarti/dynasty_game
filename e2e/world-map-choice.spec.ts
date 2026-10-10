import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ??
  `artifacts/screenshots/m15-map-choice-${new Date().toISOString().replace(/[:.]/g, '-')}`;

test('changing the atlas clears the old start and installs the selected map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // This tests the initial world choice itself, so character creation is deliberately enabled.
  await page.goto('/?seed=e2e-earth&lang=es');
  const picker = page.locator('.worldpicker');
  const select = picker.locator('.worldpicker-map');
  await expect(select).toBeEnabled({ timeout: 20_000 });
  await expect(select).toHaveValue('earth-12000-bce');
  await expect(select.locator('option')).toHaveCount(3);
  await expect(picker.locator('.worldpicker-map-caveat')).toContainText('datos actuales');
  const canvas = picker.locator('.worldpicker-canvas');
  const box = (await canvas.boundingBox())!;
  const chooseRiver = async () => {
    await page.mouse.click(box.x + 30.5 / 96 * box.width, box.y + 24.5 / 48 * box.height);
    await page.mouse.move(0, 0);
  };
  await chooseRiver();
  await expect(picker.locator('.worldpicker-begin')).toBeEnabled();
  await select.selectOption('earth-present');
  await expect(picker.locator('.worldpicker-begin')).toBeDisabled();
  await expect(picker.locator('.worldpicker-map-caveat')).toBeEmpty();
  await expect(select.locator('option:checked')).toHaveText('La Tierra actual');
  await page.screenshot({ path: `${SHOTS}/01-present-map-es.png` });
  await select.selectOption('earth-12000-bce');
  await expect(picker.locator('.worldpicker-map-caveat')).toContainText('Costas antiguas');
  await page.screenshot({ path: `${SHOTS}/02-ancient-map-es.png` });
  await select.selectOption('earth-present');
  await chooseRiver();
  await picker.locator('.worldpicker-begin').click();
  await expect(page.locator('.settings')).toBeVisible({ timeout: 30_000 });
  const id = await page.evaluate(() => (window as any).__dynasty.worldState.geography.entry.id);
  expect(id).toBe('earth-present');
  expect(errors).toEqual([]);
});

test('a generated globe can be chosen in the start screen without URL flags', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); console.log('Generated start error:', error.message); });
  page.on('console', message => { if (message.type() === 'error') console.log('Generated browser error:', message.text()); });
  await page.goto('/?seed=e2e-generated-choice&lang=es');
  const picker = page.locator('.worldpicker');
  const select = picker.locator('.worldpicker-map');
  await expect(select).toBeEnabled({ timeout: 20_000 });
  await select.selectOption('generated-world');
  await expect(picker.locator('.worldpicker-sub')).toContainText('mundo generado');
  await expect(picker.locator('.worldpicker-begin')).toBeDisabled();
  await expect(picker.locator('.worldpicker-map-caveat')).toBeEmpty();
  const box = (await picker.locator('canvas').boundingBox())!;
  // Choose through the visible map. The selection screen knows the terrain;
  // no fixture replaces the generated geography or its water measurement.
  let selected = false;
  for (const ry of [24, 20, 28, 16, 32]) {
    for (const rx of [48, 40, 56, 32, 64, 24, 72]) {
      await page.mouse.click(box.x + (rx + 0.5) / 96 * box.width, box.y + (ry + 0.5) / 48 * box.height);
      if (await picker.locator('.worldpicker-begin').isEnabled()) { selected = true; break; }
    }
    if (selected) break;
  }
  expect(selected).toBe(true);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${SHOTS}/03-generated-world-es.png` });
  await picker.locator('.worldpicker-begin').click();
  await expect(page.locator('.settings').or(picker.locator('.worldpicker-confirm')).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  if (await picker.locator('.worldpicker-confirm').isVisible()) await picker.locator('.worldpicker-confirm-anyway').click();
  await expect(page.locator('.settings')).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(() => {
    const state = (window as any).__dynasty.worldState;
    return { kind: state.geography.kind, seed: state.current.config.seed, peoples: state.peoples.sim.peoples.size };
  });
  expect(result.kind).toBe('random');
  expect(result.seed).toBe('e2e-generated-choice');
  expect(result.peoples).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
