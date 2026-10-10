import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('hide loincloth occupies the hip slot and draws only while worn', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-hide-loincloth&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
  await expect(page.locator('.game-version')).toContainText(`v${version}`);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    for (const [item, count] of p.inventory.entries()) p.inventory.remove(item, count);
    d.sim.time.tick = d.sim.config.time.ticksPerDay / 2;
    p.age = 30 * p.daysPerYear; p.inventory.add('hide_loincloth', 1);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y - 2); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  const wear = page.locator('.hud-item-verbs [data-item="hide_loincloth"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible(); await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Taparrabos de piel');
  const worn = await page.evaluate(async () => {
    const d = (window as any).__dynasty, path = '/src/render/Renderer.ts', techPath = '/src/sim/knowledge/Tech.ts';
    const { wornGarmentsOf } = await import(/* @vite-ignore */ path);
    const { warmthFrom } = await import(/* @vite-ignore */ techPath);
    const person = d.sim.player;
    return { slot: person.equipment.hips?.item, drawn: wornGarmentsOf(person).hips, warmth: warmthFrom(person) };
  });
  expect(worn).toMatchObject({ slot: 'hide_loincloth', drawn: 'hide_loincloth' });
  expect(worn.warmth).toBeCloseTo(0.02);
  const colours = await page.evaluate(() => {
    const art = (window as any).__dynasty.renderer.art;
    const aspect = { age: 'adult', sex: 'm', dir: 'S', pose: 'idle', skin: '#d5b28c',
      hair: '#3b2b1b', hairStyle: 'short', beard: false, expression: 'neutral', carryBaby: false };
    const pixels = (hips: boolean, band: string) => {
      const canvas = art.compose({ ...aspect, band, wear: hips ? { hips: 'hide_loincloth' } : {} });
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((value, i) => value === b[i]);
    return { fitted: equal(pixels(true, '#ff0000'), pixels(true, '#0000ff')),
      visible: !equal(pixels(true, '#ff0000'), pixels(false, '#ff0000')) };
  });
  expect(colours).toEqual({ fitted: true, visible: true });
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase14c-hide-loincloth-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/T-01-hide-loincloth.png` });

  const takeOff = page.locator('.hud-item-verbs [data-item="hide_loincloth"][data-verb="take_off_garment"]');
  await expect(takeOff).toBeVisible(); await takeOff.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  expect(await page.evaluate(async () => {
    const d = (window as any).__dynasty, rendererPath = '/src/render/Renderer.ts', techPath = '/src/sim/knowledge/Tech.ts';
    const { wornGarmentsOf } = await import(/* @vite-ignore */ rendererPath);
    const { warmthFrom } = await import(/* @vite-ignore */ techPath);
    return { slot: d.sim.player.equipment.hips?.item, drawn: wornGarmentsOf(d.sim.player).hips,
      warmth: warmthFrom(d.sim.player), count: d.sim.player.inventory.count('hide_loincloth') };
  })).toEqual({ slot: undefined, drawn: undefined, warmth: 0, count: 1 });
  expect(errors).toEqual([]);
});
