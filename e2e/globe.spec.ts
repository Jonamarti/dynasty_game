/**
 * M15 phase 31: the globe opens, closes, swallows no clicks, and shows only what
 * the player's character has seen or been told.
 *
 * A classic island has no globe, and says so. `?world=random` starts on a
 * seeded one (the browser's own world setting waits for phase 33).
 */
import { test, expect, type Page } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase31-globe-2026-10-06';

function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  return errors;
}

async function ready(page: Page, query: string): Promise<void> {
  await page.goto('/?skipIntro=1&' + query);
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.locator('.hud-name')).not.toBeEmpty();
}

/** The player's region and comarca on the globe, and the hearsay helper. */
async function where(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as { __dynasty: { sim: any } }).__dynasty;
    const here = d.sim.comarcaAtTile(d.sim.player.x, d.sim.player.y);
    return { cx: here.cx, cy: here.cy, day: d.sim.time.day };
  });
}

/** Clicks the centre of one cell of the globe canvas. */
async function clickCell(page: Page, col: number, row: number, cols: number, rows: number): Promise<void> {
  const box = (await page.locator('.worldmap-canvas').boundingBox())!;
  await page.mouse.click(box.x + (col + 0.5) / cols * box.width, box.y + (row + 0.5) / rows * box.height);
}

test('a classic island has no globe, says so, and gives the game back', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page, 'seed=e2e-fixture');
  await expect(page.locator('.worldmap')).toBeHidden();
  await page.locator('.hud-globe').click();
  await expect(page.locator('.worldmap')).toBeVisible();
  await expect(page.locator('.worldmap-info')).toContainText('classic island');
  await expect(page.locator('.worldmap-canvas')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.worldmap')).toBeHidden();
  // The pause menu did not open behind it: Escape was spent on the globe.
  await expect(page.locator('.pausemenu')).toBeHidden();
  // Hidden means gone: a click on the game underneath reaches it.
  await page.locator('canvas').first().click({ position: { x: 300, y: 300 }, timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('the globe shows what was seen and heard, and nothing of the rest', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page, 'seed=e2e-globe&world=random');
  const here = await where(page);
  const rx = Math.floor(here.cx / 10), ry = Math.floor(here.cy / 10);

  await page.keyboard.press('o');
  await expect(page.locator('.worldmap')).toBeVisible();
  await expect(page.locator('.worldmap-canvas')).toBeVisible();
  await expect(page.locator('.worldmap-sub')).toContainText('places known');

  // Hover somewhere nobody has been: the card says it is unknown and offers nothing.
  await clickCell(page, (rx + 40) % 96, ry, 96, 48);
  await expect(page.locator('.worldmap-info')).toContainText('Unknown');
  await expect(page.locator('.worldmap-closer')).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/01-world-unknown-region.png` });

  // Pick the home region: it is known, and can be looked at closer.
  await clickCell(page, rx, ry, 96, 48);
  await expect(page.locator('.worldmap-info')).toContainText('seen');
  await expect(page.locator('.worldmap-closer')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-world-home-region.png` });
  await page.locator('.worldmap-closer').click();
  await expect(page.locator('.worldmap-back')).toBeVisible();

  // Tell the character about a comarca in the same region, as a story would.
  const heard = await page.evaluate(({ rx, ry, hereX, hereY }) => {
    const d = (window as unknown as { __dynasty: { sim: any } }).__dynasty;
    for (let dy = 0; dy < 10; dy++) for (let dx = 0; dx < 10; dx++) {
      const cx = rx * 10 + dx, cy = ry * 10 + dy;
      if (!d.sim.player.worldKnowledge.entry(cx, cy) && (cx !== hereX || cy !== hereY)) {
        d.sim.player.worldKnowledge.hear(cx, cy, Math.max(0, d.sim.time.day - 5));
        return { dx, dy };
      }
    }
    return null;
  }, { rx, ry, hereX: here.cx, hereY: here.cy });
  expect(heard).not.toBeNull();
  await clickCell(page, heard!.dx, heard!.dy, 10, 10);
  await expect(page.locator('.worldmap-info')).toContainText('Heard of');
  await page.screenshot({ path: `${SHOTS}/03-region-heard-of.png` });

  // An unknown place inside a known region still says nothing of itself.
  const dark = await page.evaluate(({ rx, ry }) => {
    const d = (window as unknown as { __dynasty: { sim: any } }).__dynasty;
    for (let dy = 9; dy >= 0; dy--) for (let dx = 9; dx >= 0; dx--) {
      if (!d.sim.player.worldKnowledge.entry(rx * 10 + dx, ry * 10 + dy)) return { dx, dy };
    }
    return null;
  }, { rx, ry });
  expect(dark).not.toBeNull();
  await clickCell(page, dark!.dx, dark!.dy, 10, 10);
  await expect(page.locator('.worldmap-info')).toContainText('Unknown');

  // Escape steps back to the world, and is spent; the next closes the globe.
  await page.keyboard.press('Escape');
  await expect(page.locator('.worldmap')).toBeVisible();
  await expect(page.locator('.worldmap-back')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.worldmap')).toBeHidden();
  await expect(page.locator('.pausemenu')).toBeHidden();
  await page.locator('canvas').first().click({ position: { x: 300, y: 300 }, timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('the globe speaks Spanish', async ({ page }) => {
  await ready(page, 'seed=e2e-globe&world=random&lang=es');
  await page.locator('.hud-globe').click();
  await expect(page.locator('.worldmap-sub')).toContainText('lugares conocidos');
  await page.screenshot({ path: `${SHOTS}/04-world-es.png` });
});

test('the globe fits and can be read on a phone', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  const errors = guardErrors(page);
  await ready(page, 'seed=e2e-globe&world=random');
  await page.locator('.hud-mobile-tool', { hasText: 'World' }).click();
  await expect(page.locator('.worldmap')).toBeVisible();
  const card = (await page.locator('.worldmap-card').boundingBox())!;
  const canvas = (await page.locator('.worldmap-canvas').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(viewport.width);
  // A finger on a known region picks it; a second tap looks closer.
  const here = await where(page);
  const col = Math.floor(here.cx / 10), row = Math.floor(here.cy / 10);
  const tap = async () => {
    const b = (await page.locator('.worldmap-canvas').boundingBox())!;
    await page.touchscreen.tap(b.x + (col + 0.5) / 96 * b.width, b.y + (row + 0.5) / 48 * b.height);
  };
  await tap();
  await expect(page.locator('.worldmap-info')).toContainText('seen');
  await page.screenshot({ path: `${SHOTS}/05-world-phone.png` });
  await tap();
  await expect(page.locator('.worldmap-back')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-region-phone.png` });
  expect(errors).toEqual([]);
  await context.close();
});
