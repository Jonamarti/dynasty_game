import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ??
  'artifacts/playwright/captures/fibre-skirt/m15-phase14c-fibre-skirt-2026-10-10T-01';

test('fibre skirt crafts in Spanish, equips in the hip slot, and can be removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fibre-skirt&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player;
    for (const [item, count] of p.inventory.entries()) p.inventory.remove(item, count);
    for (const id of ['clothing', 'cordage', 'fibre_skirt']) {
      p.knownTech.add(id); p.techLevel.set(id, 1);
      sim.knownTech.add(id);
    }
    p.inventory.add('thatch', 3);
    p.age = 30 * p.daysPerYear;
    p.workedTicks = 0;
    p.skills.build = 70;
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    if (!sim.order(p, 'craft', { recipeId: 'fibre_skirt' })) {
      throw new Error('Fibre skirt craft refused: ' + sim.lastRefusal);
    }
  });

  const crafted = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player;
    for (let tick = 0; tick < 240 && !p.inventory.count('fibre_skirt'); tick++) {
      p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
      sim.step();
    }
    if (p.inventory.count('fibre_skirt') !== 1) throw new Error('Craft did not produce a fibre skirt');
    return { skirt: p.inventory.count('fibre_skirt'), thatch: p.inventory.count('thatch') };
  });
  expect(crafted).toEqual({ skirt: 1, thatch: 0 });

  await page.locator('.hud-tab[data-tab="kit"]').click();
  const item = page.locator('.hud-item-name', { hasText: /falda de fibra/i });
  await expect(item).toContainText('×1');
  const wear = page.locator('.hud-item-verbs [data-item="fibre_skirt"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible();
  await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Falda de fibra');

  const worn = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    const rendererPath = '/src/render/Renderer.ts', techPath = '/src/sim/knowledge/Tech.ts';
    const { wornGarmentsOf } = await import(/* @vite-ignore */ rendererPath);
    const { warmthFrom } = await import(/* @vite-ignore */ techPath);
    const person = d.sim.player;
    return { slot: person.equipment.hips?.item, drawn: wornGarmentsOf(person).hips,
      warmth: warmthFrom(person), count: person.inventory.count('fibre_skirt') };
  });
  expect(worn).toMatchObject({ slot: 'fibre_skirt', drawn: 'fibre_skirt', count: 1 });
  expect(worn.warmth).toBeCloseTo(0.03);

  const pixels = await page.evaluate(() => {
    const art = (window as any).__dynasty.renderer.art;
    const aspect = { age: 'adult', sex: 'm', dir: 'S', pose: 'idle', skin: '#d5b28c',
      hair: '#3b2b1b', hairStyle: 'short', beard: false, expression: 'neutral', carryBaby: false };
    const image = (wear: boolean, band: string) => {
      const canvas = art.compose({ ...aspect, band, wear: wear ? { hips: 'fibre_skirt' } : {} });
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((value, i) => value === b[i]);
    return { visible: !same(image(true, '#ff0000'), image(false, '#ff0000')),
      fitted: same(image(true, '#ff0000'), image(true, '#0000ff')) };
  });
  expect(pixels).toEqual({ visible: true, fitted: true });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y - 2); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/T-01-fibre-skirt-es.png` });

  const takeOff = page.locator('.hud-item-verbs [data-item="fibre_skirt"][data-verb="take_off_garment"]');
  await expect(takeOff).toBeVisible();
  await takeOff.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  expect(await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    const rendererPath = '/src/render/Renderer.ts', techPath = '/src/sim/knowledge/Tech.ts';
    const { wornGarmentsOf } = await import(/* @vite-ignore */ rendererPath);
    const { warmthFrom } = await import(/* @vite-ignore */ techPath);
    const p = d.sim.player;
    return { slot: p.equipment.hips?.item, drawn: wornGarmentsOf(p).hips,
      warmth: warmthFrom(p), count: p.inventory.count('fibre_skirt') };
  })).toEqual({ slot: undefined, drawn: undefined, warmth: 0, count: 1 });
  expect(errors).toEqual([]);
});
