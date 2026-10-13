import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ??
  'artifacts/screenshots/m15-familytree-mobile-zoom-2026-10-13';

test('family tree keeps names readable on mobile and supports zooming', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?skipIntro=1');
  await expect.poll(() => page.evaluate(() => {
    const d = (window as never as { __dynasty?: { sim?: { player?: unknown } } }).__dynasty;
    return !!d?.sim?.player;
  }), { timeout: 20_000 }).toBe(true);

  // Make a deliberately wide sibling row from existing people. This is a
  // browser-only fixture, so the screenshot exercises a large family without
  // adding setup hooks or RNG draws to the simulation.
  const madeWideFamily = await page.evaluate(() => {
    type PersonLike = { id: number; motherId: number | null; fatherId: number | null };
    type Debug = { __dynasty: { sim: {
      player: PersonLike & { childIds: number[] };
      livingPeople: () => PersonLike[];
    } } };
    const sim = (window as never as Debug).__dynasty.sim;
    const subject = sim.player;
    const siblings = sim.livingPeople().filter(person => person.id !== subject.id).slice(0, 14);
    if (siblings.length < 10) return false;
    for (const person of siblings) {
      person.motherId = subject.id;
      person.fatherId = null;
      subject.childIds.push(person.id);
    }
    return true;
  });
  expect(madeWideFamily).toBe(true);

  await page.keyboard.press('k');
  const viewport = page.locator('.familytree-viewport');
  await expect(viewport).toBeVisible({ timeout: 10_000 });
  const canvas = page.locator('.familytree-canvas');
  await expect.poll(() => canvas.evaluate(el => el.getBoundingClientRect().width))
    .toBeGreaterThan(390);
  const initialZoom = Number(await canvas.getAttribute('data-zoom'));
  expect(initialZoom).toBeGreaterThanOrEqual(0.85);
  await page.screenshot({ path: SHOTS + '/01-mobile-family-tree.png' });

  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => canvas.getAttribute('data-zoom').then(Number))
    .toBeGreaterThan(initialZoom);
  const beforePan = await canvas.getAttribute('style');
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 35, box!.y + box!.height / 2 + 20);
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute('style'))
    .not.toBe(beforePan);
  await page.screenshot({ path: SHOTS + '/02-mobile-family-tree-zoomed.png' });

  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
