import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('a humid forest comarca starts with a small drinking source without a no-water warning', async ({ page }) => {
  // Initial place selection is the subject, so this deliberately includes intro.
  await page.goto('/?seed=728083595&defaults=1&lang=es');
  const picker = page.locator('.worldpicker');
  await expect(picker.locator('.worldpicker-map')).toBeEnabled({ timeout: 20_000 });
  const box = (await picker.locator('.worldpicker-canvas').boundingBox())!;
  await page.mouse.click(box.x + 47.5 / 96 * box.width, box.y + 11.5 / 48 * box.height);
  await picker.locator('[data-comarca-x="475"][data-comarca-y="115"]').click();
  const dir = 'artifacts/screenshots/m16-2026-10-22-local-water';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/01-selected-forest.png` });
  await picker.locator('.worldpicker-begin').click();
  await expect(page.locator('.settings')).toBeVisible({ timeout: 30_000 });
  await expect(picker.locator('.worldpicker-confirm')).toBeHidden();
  const result = await page.evaluate(() => {
    const { sim, worldState } = (window as any).__dynasty;
    return { start: worldState.initialGeographicStart.start,
      fresh: sim.world.waterKind.filter((k: number) => k === 1).length,
      banks: sim.world.freshShore.length };
  });
  expect(result.start).toEqual({ x: 475.5, y: 115.5 });
  expect(result.fresh).toBeGreaterThan(0);
  expect(result.banks).toBeGreaterThan(0);
  await page.screenshot({ path: `${dir}/02-start-accepted.png` });
});

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ??
  `artifacts/screenshots/m15-comarca-choice-${new Date().toISOString().replace(/[:.]/g, '-')}`;

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

test('the comarca grid distinguishes the coastal strip from inland terrain', async ({ page }) => {
  await page.goto('/?seed=e2e-coastal-comarca-grid&lang=es');
  const picker = page.locator('.worldpicker');
  const canvas = picker.locator('.worldpicker-canvas');
  await expect(picker.locator('.worldpicker-map')).toBeEnabled({ timeout: 20_000 });
  const box = (await canvas.boundingBox())!;
  // Region 46,10 is a real atlas coastline whose regional centre lies at sea.
  await page.mouse.click(box.x + 46.5 / 96 * box.width, box.y + 10.5 / 48 * box.height);
  const buttons = picker.locator('.worldpicker-comarcas button');
  await expect(buttons).toHaveCount(100);
  const colors = await buttons.evaluateAll(rows => rows.map(row => ({
    coastal: (row as HTMLButtonElement).dataset.coastal === 'true',
    color: getComputedStyle(row).backgroundColor,
  })));
  const coastalCount = colors.filter(row => row.coastal).length;
  expect(coastalCount, 'the selected atlas region contains sampled coastal comarcas').toBeGreaterThan(0);
  expect(coastalCount, 'inland comarcas retain their terrain colors').toBeLessThan(colors.length);
  expect(new Set(colors.map(row => row.color)).size, 'the grid shows more than one ground color').toBeGreaterThan(1);
  await page.screenshot({ path: `${SHOTS}/05-coastal-comarca-colors-es.png` });
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

test('choosing a comarca starts the local world there and reserves its region from world peoples', async ({ page }) => {
  await page.goto('/?seed=e2e-explicit-comarca&lang=es');
  const picker = page.locator('.worldpicker');
  await expect(picker.locator('.worldpicker-map')).toBeEnabled({ timeout: 20_000 });
  const canvas = picker.locator('.worldpicker-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 30.5 / 96 * box.width, box.y + 24.5 / 48 * box.height);
  await expect(picker.locator('.worldpicker-comarcas')).toBeVisible();
  await expect(picker.locator('.worldpicker-comarcas button')).toHaveCount(100);
  await expect(picker.locator('.worldpicker-comarca-label')).toContainText('Elige una comarca');
  const settings = page.locator('.settings');
  await picker.locator('.worldpicker-comarcas button').first().click();
  await page.screenshot({ path: `${SHOTS}/04-comarca-choice-es.png` });
  // Try cells in deterministic row order until one has enough dry land. If
  // its exact location lacks water, the existing explicit confirmation owns
  // that decision and must still keep the selected coordinate.
  let chosen = -1;
  for (let index = 0; index < 100; index++) {
    await picker.locator('.worldpicker-comarcas button').nth(index).click();
    await picker.locator('.worldpicker-begin').click();
    await page.waitForTimeout(120);
    if (await picker.locator('.worldpicker-note.is-bad').isVisible()) continue;
    if (await picker.locator('.worldpicker-confirm').isVisible() || await settings.isVisible()) { chosen = index; break; }
  }
  expect(chosen).toBeGreaterThanOrEqual(0);
  if (!(await settings.isVisible())) {
    await expect(picker.locator('.worldpicker-confirm')).toBeVisible({ timeout: 10_000 });
    await picker.locator('.worldpicker-confirm-anyway').click();
  }
  await expect(settings).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(() => {
    const state = (window as any).__dynasty.worldState;
    const regionId = 24 * 96 + 30;
    return {
      start: state.initialGeographicStart.start,
      localSize: [state.initialGeographicStart.comarcasWide, state.initialGeographicStart.comarcasHigh],
      regionExists: state.peoples.regions.has(regionId),
      occupiedPeopleRegions: [...state.peoples.regionOfPeople.values()].includes(regionId),
    };
  });
  expect(result.start).toEqual({ x: 300.5 + chosen % 10, y: 240.5 + Math.floor(chosen / 10) });
  expect(result.localSize).toEqual([1, 1]);
  expect(result.regionExists).toBe(true);
  expect(result.occupiedPeopleRegions).toBe(false);
});
