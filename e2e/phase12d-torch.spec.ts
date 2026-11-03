import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { placeHearthFixtureOnClaimedGround } from './helpers';

for (const obstruction of ['hands', 'item-capacity'] as const) {
  test(`m16 torch amends explain recipient refusal: ${obstruction}`, async ({ page }) => {
    await page.goto('/?seed=m16-torch-amends&skipIntro=1&defaults=1&lang=es');
    await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
    await page.locator('.hud-button', { hasText: 'Pausa' }).click();
    await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
    await page.evaluate(async obstruction => {
      const d = (window as any).__dynasty, sim = d.sim, payer = sim.player;
      const owed = sim.livingPeople().find((p: any) => p.id !== payer.id && !p.isChild);
      if (!owed) throw new Error('No adult torch recipient');
      const path = '/src/sim/social/Amends.ts';
      const { incur } = await import(/* @vite-ignore */ path);
      for (const [item, count] of payer.inventory.entries()) payer.inventory.remove(item, count);
      payer.equipment = {};
      payer.inventory.add('torch', 1);
      payer.equipment.left = { item: 'torch', count: 1, lit: 12 };
      payer.needs.hunger = payer.needs.thirst = payer.needs.fatigue = payer.needs.cold = 0;
      owed.x = payer.x + 1; owed.y = payer.y;
      owed.traits.malice = owed.traits.aggression = 0;
      for (const [item, count] of owed.inventory.entries()) owed.inventory.remove(item, count);
      owed.equipment = {};
      if (obstruction === 'hands') {
        owed.inventory.add('handaxe', 1); owed.inventory.add('spear', 1);
        owed.equipment.left = { item: 'handaxe', count: 1 };
        owed.equipment.right = { item: 'spear', count: 1 };
      } else {
        owed.age = 80 * owed.daysPerYear;
      }
      incur(payer, owed, 'theft', 1, sim.time.tick, { itemId: 'torch', count: 1 });
      sim.peopleHash.rebuild(sim.livingPeople());
      if (!sim.order(payer, 'make_amends', { personId: owed.id })) throw new Error(sim.lastRefusal);
      payer.actionTimer = 1;
      sim.step();
      d.camera.zoom = 5; d.camera.snapTo(payer.x, payer.y); d.camera.following = false;
      d.renderer.interpolator.clear();
      if (payer.inventory.count('torch') !== 1 || payer.debts.length !== 1) {
        throw new Error('Refused torch payment changed ownership or settled debt');
      }
    }, obstruction);
    await page.waitForFunction(() => (window as any).__dynasty.renderer.floaters.items
      .some((item: any) => item.text.includes('receptor')));
    const text = await page.evaluate(() => (window as any).__dynasty.renderer.floaters.items
      .find((item: any) => item.text.includes('receptor'))?.text);
    expect(text).toContain(obstruction === 'hands' ? 'mano' : 'antorcha');
    const shots = 'artifacts/playwright/captures/phase12d-torch/m16-2026-10-24-2.26';
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${obstruction === 'hands' ? '01-amends-recipient-no-free-hand' : '02-amends-recipient-torch-capacity'}-es.png` });
  });
}

test('a lit torch is visible and its fuel freezes with the paused world', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=phase12d-torch&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/playwright/captures/phase12d-torch/m15-phase12d-torches-2026-10-10';
  mkdirSync(shots, { recursive: true });

  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    if (!d.sim.player) d.sim.possessFirst();
    const p = d.sim.player;
    d.sim.knownTech.add('firemaking');
    p.knownTech.add('firemaking');
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    p.inventory.add('torch', 1);
    p.inventory.add('handaxe', 1);
    p.equipment.right = { item: 'handaxe', count: 1 };
  });
  const hearthFixture = await page.evaluate(placeHearthFixtureOnClaimedGround, {
    radiusLimit: 23,
    rounding: 'floor' as const,
  });
  const fixture = await page.evaluate(({ id: hearthId }) => {
    const d = (window as any).__dynasty;
    const p = d.sim.player;
    const hearth = d.sim.buildingsById.get(hearthId);
    if (!hearth) throw new Error(`Hearth fixture disappeared after placement (${hearthId})`);
    hearth.complete = true;
    p.x = hearth.x + 1.25; p.y = hearth.y + 0.5;
    p.path = null; p.pathCount = p.pathAt = 0;
    d.sim.time.tick = 0;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    d.camera.following = false;
    d.camera.zoom = 5;
    d.camera.snapTo(p.x, p.y);
    d.sim.peopleHash.rebuild(d.sim.livingPeople());
    if (!d.sim.order(p, 'light_torch', { itemId: 'torch' })) throw new Error('Could not order torch lighting');
    d.sim.step(); d.sim.step(); d.sim.step();
    d.sim.time.tick = 0;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
    return { person: p.id, hearth: hearth.id, lit: p.equipment.left?.lit ?? p.equipment.right?.lit ?? 0,
      tick: d.sim.time.tick, light: d.sim.lightAt(p.x, p.y), x: p.x, y: p.y,
      otherHand: p.equipment.right?.item };
  }, hearthFixture);
  expect(fixture.lit).toBeGreaterThan(0);
  expect(fixture.light).toBeGreaterThan(0.5);
  expect(fixture.otherHand).toBe('handaxe');
  await page.screenshot({ path: `${shots}/01-antorcha-encendida.png` });

  await page.waitForTimeout(500);
  expect(await page.evaluate(({ id }) => {
    const d = (window as any).__dynasty, p = d.sim.peopleById.get(id);
    return { tick: d.sim.time.tick, fuel: p.equipment.left?.lit ?? p.equipment.right?.lit ?? 0 };
  }, { id: fixture.person })).toEqual({ tick: fixture.tick, fuel: fixture.lit });

  const extinguished = await page.evaluate(({ id, hearth }) => {
    const d = (window as any).__dynasty, p = d.sim.peopleById.get(id);
    const slot = p.equipment.left?.item === 'torch' ? 'left' : 'right';
    p.equipment[slot].lit = 0;
    d.sim.buildingsById.get(hearth).durability = 0;
    d.renderer.render(null, 0);
    return { light: d.sim.lightAt(p.x, p.y), fuel: p.equipment[slot].lit };
  }, { id: fixture.person, hearth: fixture.hearth });
  expect(extinguished.light).toBe(0);
  await page.screenshot({ path: `${shots}/02-antorcha-apagada.png` });
  expect(errors).toEqual([]);
});
