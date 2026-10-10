import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('garment warmth is learned from wearing and only seen in public view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-garment-warm-beliefs&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-phase14c-garment-warm-beliefs-2026-10-10';
  mkdirSync(shots, { recursive: true });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, wearer = sim.player;
    if (!wearer) throw new Error('No player fixture');
    const observers = sim.people.filter((person: any) => person.alive && person.id !== wearer.id);
    if (observers.length < 2) throw new Error('Need two observers for near/far sight fixture');
    const near = observers[0], far = observers[1];
    const key = 'warm:fur_coat';

    wearer.order = null; wearer.commitment = null; wearer.action = 'idle';
    wearer.needs.hunger = wearer.needs.thirst = wearer.needs.cold = wearer.needs.fatigue = 0;
    for (const slot of ['hips', 'torso', 'legs', 'feet', 'head', 'cloak']) delete wearer.equipment[slot];
    wearer.inventory.remove('fur_coat', wearer.inventory.count('fur_coat'));
    near.order = null; near.commitment = null; near.action = 'idle';
    far.order = null; far.commitment = null; far.action = 'idle';
    near.beliefs = new (wearer.beliefs.constructor as any)();
    far.beliefs = new (wearer.beliefs.constructor as any)();
    wearer.beliefs = new (wearer.beliefs.constructor as any)();

    // Use a winter sample at midday. The isolated NeedsSystem probes below
    // receive no buildings, so shelter and hearth cannot explain their result.
    // The observation chance is made certain only for this controlled browser fixture.
    const tpd = sim.config.time.ticksPerDay;
    const winterDay = sim.config.time.daysPerSeason * 3;
    sim.time.tick = winterDay * tpd + Math.floor(tpd / 2) - 1;
    const x = wearer.x, y = wearer.y;
    wearer.x = x; wearer.y = y;
    near.x = x + 0.5; near.y = y;
    far.x = x + 100; far.y = y;
    near.path = far.path = wearer.path = null;
    near.pathCount = far.pathCount = wearer.pathCount = 0;
    sim.config.learning.observationChance = 1;
    sim.config.learning.childObservationChance = 1;
    wearer.inventory.add('fur_coat', 1);
    wearer.needs.cold = 70;
    // An owned but packed garment is not evidence that it keeps its wearer warm.
    sim.needsSystem.update([wearer], sim.time, []);
    if (wearer.beliefs.get(key)) throw new Error('Packed coat taught warmth without being worn');
    // A stale equipment pointer without ownership is equally inert.
    wearer.equipment.torso = { item: 'fur_coat', count: 1 };
    wearer.inventory.remove('fur_coat', 1);
    sim.needsSystem.update([wearer], sim.time, []);
    if (wearer.beliefs.get(key)) throw new Error('Unowned stale coat taught warmth');
    delete wearer.equipment.torso;
    wearer.needs.cold = 0;
    d.camera.zoom = 7.5;
    d.camera.snapTo(wearer.x, wearer.y);
    d.camera.following = false;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    (window as any).__garmentWarmFixture = { wearerId: wearer.id, nearId: near.id, farId: far.id, key };
  });

  const item = 'fur_coat';
  await page.evaluate(() => (window as any).__dynasty.sim.player.inventory.add('fur_coat', 1));
  await page.locator('.hud-tab[data-tab="kit"]').click();
  const wear = page.locator('.hud-item-verbs [data-item="fur_coat"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible();
  await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks; tick++) d.sim.step();
    if (p.equipment.torso?.item !== 'fur_coat') throw new Error('Kit order did not wear the coat');
    const winterDay = d.sim.config.time.daysPerSeason * 3;
    d.sim.time.tick = winterDay * d.sim.config.time.ticksPerDay - 1;
    p.needs.cold = 70;
    d.sim.needsSystem.update([p], d.sim.time, []);
  });

  const learned = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim;
    const { wearerId, nearId, farId, key } = (window as any).__garmentWarmFixture;
    const wearer = sim.people.find((person: any) => person.id === wearerId);
    const near = sim.people.find((person: any) => person.id === nearId);
    const far = sim.people.find((person: any) => person.id === farId);
    // The next step crosses midnight in winter and runs the daily public-observation pass.
    sim.step();
    const own = wearer.beliefs.get(key);
    const seen = near.beliefs.get(key);
    const remote = far.beliefs.get(key);
    return {
      own: own && { source: own.source, value: own.value, confidence: own.confidence },
      seen: seen && { source: seen.source, value: seen.value, confidence: seen.confidence },
      remote: remote && { source: remote.source, value: remote.value, confidence: remote.confidence },
      cold: wearer.needs.cold,
      item: wearer.equipment.torso?.item,
      owned: wearer.inventory.count('fur_coat'),
    };
  });
  expect(learned.item).toBe(item);
  expect(learned.owned).toBe(1);
  expect(learned.own?.source).toBe('own');
  expect(learned.own?.confidence).toBeGreaterThan(0);
  expect(learned.seen?.source).toBe('seen');
  expect(learned.remote).toBeUndefined();

  // Refresh the retained Kit panel after the simulation-only fixture advanced.
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText(/torso: Fur coat/);
  await page.screenshot({ path: `${shots}/01-fur-coat-worn-in-kit.png` });
  expect(errors).toEqual([]);
});
