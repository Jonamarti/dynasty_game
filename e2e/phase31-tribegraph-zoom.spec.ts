import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ??
  'artifacts/playwright/captures/phase31-tribegraph-zoom/m15-tribegraph-mobile-zoom-2026-10-13';

test('tribe graph keeps labels readable on mobile and supports pan and zoom', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?skipIntro=1');
  await expect.poll(() => page.evaluate(() => {
    const d = (window as never as { __dynasty?: { sim?: { player?: unknown } } }).__dynasty;
    return !!d?.sim?.player;
  }), { timeout: 20_000 }).toBe(true);

  // A browser-only fixture makes the graph span a phone without adding
  // relationship setup, state or random draws to the simulation itself.
  const madeWideCircle = await page.evaluate(() => {
    type PersonLike = { id: number };
    type Debug = { __dynasty: { sim: {
      player: PersonLike;
      livingPeople: () => PersonLike[];
      relationships: {
        introduce: (a: number, b: number, bias: number) => boolean;
        addDeed: (a: number, b: number, amount: number, tick: number) => void;
      };
    } } };
    const sim = (window as never as Debug).__dynasty.sim;
    const subject = sim.player;
    const friends = sim.livingPeople().filter(person => person.id !== subject.id).slice(0, 17);
    if (friends.length < 12) return false;
    for (const person of friends) {
      sim.relationships.introduce(subject.id, person.id, 0);
      sim.relationships.addDeed(subject.id, person.id, 40, 0);
    }
    return true;
  });
  expect(madeWideCircle).toBe(true);

  await page.keyboard.press('t');
  const viewport = page.locator('.tribegraph-viewport');
  await expect(viewport).toBeVisible({ timeout: 10_000 });
  const canvas = page.locator('.tribegraph-canvas');
  await expect.poll(() => canvas.evaluate(el => el.getBoundingClientRect().width))
    .toBeGreaterThan(390);
  const initialZoom = Number(await canvas.getAttribute('data-zoom'));
  expect(initialZoom).toBeGreaterThanOrEqual(0.85);
  await expect(viewport).toHaveCSS('touch-action', 'none');
  await page.screenshot({ path: SHOTS + '/01-mobile-tribe-graph.png' });

  // The world keeps running behind the graph, and the overlay rebuilds its
  // markup whenever the layout digest changes: a single boundingBox() can land
  // between the old viewport being detached and the new one being measured and
  // come back null (1 run in 6 here). Ask again until a live node answers.
  const liveBox = async () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const measured = await viewport.boundingBox();
      if (measured) return measured;
      await page.waitForTimeout(100);
    }
    return null;
  };
  const box = await liveBox();
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
  await page.screenshot({ path: SHOTS + '/02-mobile-tribe-graph-zoomed.png' });

  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
