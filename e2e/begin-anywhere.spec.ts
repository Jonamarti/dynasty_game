/**
 * M15 "begin anywhere" (2026-10-07): the world-map picker no longer refuses a place for lack of water, and a coastal
 * region (classed `ocean` by its own centre sample, but bordering dry land) is no longer unselectable.
 *
 * See `src/sim/world/StartPlace.ts` (`isCoastalRegion`, `findStartInRegion`'s `requireWater` option), `src/ui/WorldPicker.ts`
 * (`canBegin`, `confirmNoWater`) and `beginOnEarth` in `src/main.ts`. Both regions clicked below are real places in the
 * fixture atlas (`public/world/earth-12000-bce.bin`) — the same ones, with the same measurements, that
 * `src/sim/__tests__/start-place.test.ts`'s "M15 begin anywhere" block pins down at the unit level; this file only checks
 * that the UI wired on top of them behaves.
 *
 * Deliberately *without* `skipIntro`: the world-map picker is the thing under test, and `skipIntro` is exactly the flag
 * that bypasses it.
 */
import { test, expect, type Page } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-start-anywhere-2026-10-07';

function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  return errors;
}

/** Clicks the centre of one region cell of the world-picker canvas (96 by 48 regions in this atlas; see `globeGridOf`). */
async function clickRegion(page: Page, rx: number, ry: number): Promise<void> {
  const box = (await page.locator('.worldpicker-canvas').boundingBox())!;
  await page.mouse.click(box.x + (rx + 0.5) / 96 * box.width, box.y + (ry + 0.5) / 48 * box.height);
}

test('a region with no water nearby offers a choice, and "begin here anyway" starts the game on dry land', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?seed=e2e-begin-anywhere');
  await expect(page.locator('.worldpicker')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.worldpicker-canvas')).toBeVisible({ timeout: 15_000 });

  // 49,20: the same arid region `start-place.test.ts` measures as having no river or lake within two rings of regions —
  // "the middle of the Sahara" in that file's older phase-33 tests, reused here because it was already pinned down.
  await clickRegion(page, 49, 20);
  await expect(page.locator('.worldpicker-info')).toContainText('No river or lake is marked here');
  const begin = page.locator('.worldpicker-begin');
  await expect(begin).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/01-arid-region-hover.png` });
  await begin.click();

  // The search takes a moment (it measures real candidate windows); the confirm panel replaces the old hard refusal once
  // it finishes, instead of the plain "There is no river or lake within reach" note this used to end in.
  const confirm = page.locator('.worldpicker-confirm');
  await expect(confirm).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.worldpicker-note')).not.toContainText('There is no river or lake within reach');
  await expect(page.locator('.worldpicker-confirm-anyway')).toBeVisible();
  // A watered start does exist further out than the ordinary search radius (measured in the unit test's companion case),
  // so both doors are offered here, not only the dry one.
  await expect(page.locator('.worldpicker-confirm-nearest')).toBeVisible();
  await expect(page.locator('.worldpicker-confirm-nearest')).toContainText('regions away');
  await page.screenshot({ path: `${SHOTS}/02-no-water-confirm-panel.png` });

  await page.locator('.worldpicker-confirm-anyway').click();
  await expect(page.locator('.worldpicker')).toBeHidden();
  await expect(page.locator('.settings')).toBeVisible({ timeout: 15_000 });
  await page.locator('.settings button', { hasText: 'Begin' }).click();
  // Two rounds of the same `.newgame-option` card: first a tribe, then one of that tribe's adults — see the working
  // "character creation picks a life" case in `e2e/smoke.spec.ts` for the full, documented shape of this screen.
  await expect(page.locator('.newgame-option').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('.newgame-option').first().click();
  await expect(page.locator('.newgame-option').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('.newgame-option').first().click();
  await page.locator('.newgame .hud-button', { hasText: 'Begin' }).click();
  await expect(page.locator('.newgame')).toBeHidden();
  await expect(page.locator('.hud-clock')).not.toBeEmpty();

  // AGENTS.md: "if the simulation refuses, stops or abandons something, the UI must say why" — a start chosen knowing
  // there is no water nearby still gets told, once the game actually begins, rather than silently starting thirsty.
  const floaterTexts = await page.evaluate(() => (window as any).__dynasty.renderer.floaters.items.map((f: any) => f.text));
  expect(floaterTexts.some((text: string) => text.includes('no river or lake near here'))).toBe(true);
  await page.screenshot({ path: `${SHOTS}/03-started-dry-with-warning.png` });

  expect(errors).toEqual([]);
});

test('a coastal region — ocean at its own centre, land next door — is selectable and the game starts there', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?seed=e2e-begin-anywhere-coast');
  await expect(page.locator('.worldpicker-canvas')).toBeVisible({ timeout: 15_000 });

  // 46,10: classed `ocean` by its own centre sample — before this milestone `canBegin` refused it outright — but coastal,
  // with dry land in a neighbouring region; see `isCoastalRegion` and the matching case in `start-place.test.ts`.
  await clickRegion(page, 46, 10);
  await expect(page.locator('.worldpicker-info')).toContainText('Coast: you will begin on the shore.');
  await page.screenshot({ path: `${SHOTS}/04-coastal-region-hover.png` });
  const begin = page.locator('.worldpicker-begin');
  await expect(begin).toBeEnabled();
  await begin.click();

  // This region also has no water within the ordinary search radius (measured in the unit test), so the same confirm
  // panel appears; taking either door proves the region was genuinely selectable and not merely clickable.
  await expect(page.locator('.worldpicker-confirm')).toBeVisible({ timeout: 10_000 });
  await page.locator('.worldpicker-confirm-anyway').click();
  await expect(page.locator('.worldpicker')).toBeHidden();
  await expect(page.locator('.settings')).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});
