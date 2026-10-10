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
  await expect(select.locator('option')).toHaveCount(2);
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
