/**
 * M15 step 0 D (owner 2026-10-08): after the player takes over another
 * character the fog shows only what that character sees now, while the
 * character's own mental map (which their brain reads) is left whole.
 */
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-fog-on-switch-2026-10-08';

test('switching character blacks out everything beyond their sight, not their brain', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-fog-switch-e2e&skipIntro=1');
  await page.waitForFunction(() => Boolean((window as any).__dynasty?.sim?.player), null, { timeout: 30_000 });
  await expect(page.locator('.hud-tabs')).toBeVisible({ timeout: 10_000 });
  await page.locator('.hud-button', { hasText: /pause/i }).click();

  // The first character: a wide explored map, nothing hidden, no reveal.
  const first = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player;
    d.renderer.fogEnabled = true;
    p.placeMemory.observe(p.x, p.y, 40, sim.time.day);
    d.camera.snapTo(p.x, p.y); d.camera.following = false;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { reveal: d.renderer.fogReveal.active, id: p.id };
  });
  expect(first.reveal).toBe(false);
  await page.screenshot({ path: SHOTS + '/01-before-switch-explored-map.png' });

  const after = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, old = sim.player;
    const npc = sim.people.find((q: any) => q.alive && q.id !== old.id)!;
    // An NPC who has walked a lot: its brain's map is wide.
    npc.placeMemory.observe(old.x, old.y, 40, sim.time.day);
    const far = { x: Math.min(sim.world.width - 2, old.x + 30), y: old.y };
    const knewFar = npc.placeMemory.seenDayAt(far.x, far.y) > 0;
    sim.possess(npc);
    d.camera.snapTo(npc.x, npc.y); d.camera.following = false;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const reveal = d.renderer.fogReveal;
    return {
      active: reveal.active, knewFar,
      brainStillKnowsFar: npc.placeMemory.seenDayAt(far.x, far.y) > 0,
      showsFar: reveal.shows(far.x, far.y),
      showsHere: reveal.shows(npc.x, npc.y),
      oldSightings: old.placeMemory.records('person').length,
    };
  });
  expect(after.knewFar).toBe(true);
  expect(after.active).toBe(true);
  expect(after.brainStillKnowsFar).toBe(true);
  expect(after.showsFar).toBe(false);
  expect(after.showsHere).toBe(true);
  expect(after.oldSightings).toBe(0);
  await page.screenshot({ path: SHOTS + '/02-after-switch-only-sight-radius.png' });

  // Walk the new character on: what it sees from the new place is revealed,
  // and stays revealed behind it.
  const walked = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player;
    const start = { x: p.x, y: p.y };
    p.x = Math.min(sim.world.width - 3, p.x + 12);
    d.camera.snapTo(p.x, p.y);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const reveal = d.renderer.fogReveal;
    return { here: reveal.shows(p.x, p.y), behind: reveal.shows(start.x, start.y) };
  });
  expect(walked.here).toBe(true);
  expect(walked.behind).toBe(true);
  await page.screenshot({ path: SHOTS + '/03-after-walking-trail-stays-revealed.png' });
});
