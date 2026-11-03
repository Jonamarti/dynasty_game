/** Real render states for a resting, carried, and nursing infant. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/infant-care-animation/m15-infant-care-2026-10-16';

test('infant lying, carrying, and nursing use the actual person and pause with simulation state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-infant-care&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button').filter({ hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, carer = sim.player;
    const infant = sim.livingPeople().find((p: any) => p.id !== carer.id && p.bandId === carer.bandId);
    if (!carer || !infant) throw new Error('The starting band has no two people for the render fixture');
    infant.age = Math.floor(infant.daysPerYear / 2);
    infant.x = carer.x + 0.2; infant.y = carer.y;
    carer.x = Math.round(carer.x); carer.y = Math.round(carer.y);
    infant.x = carer.x + 0.2; infant.y = carer.y;
    d.camera.zoom = 8; d.camera.snapTo(carer.x, carer.y); d.camera.following = false;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();

    const aspects: Record<number, any> = {};
    const assets: string[] = [];
    const originalDrawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    const originalDrawPerson = d.renderer.art.drawPerson.bind(d.renderer.art);
    d.renderer.drawArtPerson = (art: any, person: any, ...args: any[]) => {
      d.renderer.art.drawPerson = (ctx: any, aspect: any, ...drawArgs: any[]) => {
        if (person.id === carer.id || person.id === infant.id) aspects[person.id] = aspect;
        return originalDrawPerson(ctx, aspect, ...drawArgs);
      };
      try { return originalDrawArtPerson(art, person, ...args); }
      finally { d.renderer.art.drawPerson = originalDrawPerson; }
    };
    const originalDrawAsset = d.renderer.art.drawAsset.bind(d.renderer.art);
    d.renderer.art.drawAsset = (ctx: any, domain: any, key: string, ...args: any[]) => {
      if (key.startsWith('baby/')) assets.push(key);
      return originalDrawAsset(ctx, domain, key, ...args);
    };
    const checkpointModule = '/src/sim/persistence/CheckpointRecords.ts';
    const checkpoint = await import(checkpointModule);

    (window as any).__infantRenderState = async (phase: string) => {
      assets.length = 0;
      delete aspects[carer.id]; delete aspects[infant.id];
      infant.carriedBy = null; infant.action = phase === 'asleep' ? 'sleep' : 'idle';
      infant.actionTicks = phase === 'asleep' ? 1 : 0;
      infant.targetPersonId = null; infant.workedTicks = 0;
      infant.x = carer.x + 0.2; infant.y = carer.y;
      carer.action = 'idle'; carer.targetPersonId = null; carer.workedTicks = 0;
      carer.armsTaken = 0;
      if (phase === 'carried') { infant.carriedBy = carer.id; carer.armsTaken = 1; }
      if (phase === 'nursing') { carer.action = 'nurse'; carer.targetPersonId = infant.id; carer.workedTicks = 1; }
      for (const person of [carer, infant]) {
        const track = d.renderer.walkPhase.get(person.id);
        if (track) { track.x = person.x; track.y = person.y; track.movedAt = -Infinity; }
      }
      const before = JSON.stringify(checkpoint.toCheckpointRecord(sim));
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      return { phase, readonly: before === JSON.stringify(checkpoint.toCheckpointRecord(sim)),
        infant: aspects[infant.id], carer: aspects[carer.id], assets: assets.slice() };
    };
  });

  mkdirSync(SHOTS, { recursive: true });
  for (const phase of ['awake', 'asleep', 'carried', 'nursing']) {
    const state = await page.evaluate((phase) =>
      (window as any).__infantRenderState(phase), phase);
    expect(state.readonly, `${phase} render must not mutate simulation/checkpoint state`).toBe(true);
    expect(state.infant?.pose, `${phase} infant pose`).toBe(phase === 'asleep' ? 'e0' : 'L0');
    if (phase === 'awake' || phase === 'asleep') {
      expect(state.assets).toContain(`baby/ground/${phase}/bed`);
      expect(state.assets).toContain(`baby/ground/${phase}/blanket`);
    } else {
      expect(state.assets.some((key: string) => key.startsWith('baby/ground/'))).toBe(false);
    }
    if (phase === 'carried') {
      expect(state.carer?.carryBaby).toBe(true);
      expect(state.carer?.drawCarriedBaby).toBe(false);
    }
    if (phase === 'nursing') expect(state.carer?.pose).toMatch(/^N[0-3]$/);
    await page.screenshot({ path: `${SHOTS}/${phase}.png` });
  }
  expect(errors).toEqual([]);
});
