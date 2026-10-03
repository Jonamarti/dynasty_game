/** Renderer integration; real AI event generation is tested headlessly. */
import { test, expect } from '@playwright/test';

test('animal events draw four distinct shared frames and freeze while paused', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty.renderer.art);
  const id = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const animal = d.sim.animals.find((a: any) => a.alive && a.species === 'deer');
    const clearing = d.sim.nodes.find((n: any) => n.kind === 'berries' && n.x > 15 && n.y > 15 &&
      n.x < d.sim.world.width - 15 && n.y < d.sim.world.height - 15 &&
      d.sim.world.isWalkable(n.x + 1, n.y) && !d.sim.treeHash.findNearest(n.x + 1, n.y, 2, (t: any) => t.standing));
    if (!animal || !clearing) throw new Error('No animal/clearing fixture');
    animal.x = clearing.x + 1; animal.y = clearing.y;
    animal.lastMealAt = animal.lastAttackAt = animal.lastRunAt = -Infinity;
    d.sim.time.tick = Math.floor(d.sim.config.time.ticksPerDay * .45);
    (window as any).__animalBaseTick = d.sim.time.tick;
    d.camera.zoom = 6; d.camera.snapTo(animal.x, animal.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    // Freeze the interpolation fraction as well as the clock for an exact
    // contact sequence. Production render still draws the entire game and HUD.
    const render = d.renderer.render.bind(d.renderer);
    d.renderer.render = (highlight: any) => render(highlight, 0);
    const drawAnimal = d.renderer.drawArtAnimal.bind(d.renderer);
    d.renderer.drawArtAnimal = (...args: any[]) => {
      (window as any).__drawingAnimalId = args[1].id;
      return drawAnimal(...args);
    };
    const art = d.renderer.art, original = art.drawAsset.bind(art);
    art.drawAsset = (...args: any[]) => {
      if (args[1] === 'animals' && (window as any).__drawingAnimalId === animal.id) {
        (window as any).__animalDraw = { key: args[2], scale: args[5] };
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
        original(canvas.getContext('2d'), 'animals', args[2], 0, 0, 1);
        (window as any).__animalPixels = canvas.toDataURL();
      }
      return original(...args);
    };
    return animal.id;
  });
  const shots = 'artifacts/screenshots/m15-animals-' + new Date().toISOString().replace(/[:.]/g, '-');
  const scales = new Set<number>();
  for (const family of ['e', 'r', 'a']) {
    const pixels = new Set<string>();
    for (let phase = 0; phase < 4; phase++) {
      await page.evaluate(({ id, family, phase }) => {
        const d = (window as any).__dynasty;
        const animal = d.sim.animals.find((a: any) => a.id === id);
        const base = (window as any).__animalBaseTick;
        d.sim.time.tick = base + [0, 2, 3, 4][phase];
        animal.lastMealAt = family === 'e' ? base : -Infinity;
        animal.lastAttackAt = family === 'a' ? base : -Infinity;
        animal.lastRunAt = family === 'r' ? base : -Infinity;
        d.renderer.animalTrack.set(id, { x: animal.x, y: animal.y, east: true,
          distance: phase * .22, movedAt: family === 'r' ? d.sim.time.tick : -Infinity });
      }, { id, family, phase });
      await expect.poll(() => page.evaluate(() => (window as any).__animalDraw?.key)).toBe(`a/deer/E/${family}${phase}`);
      scales.add(await page.evaluate(() => (window as any).__animalDraw.scale));
      pixels.add(await page.evaluate(() => (window as any).__animalPixels));
      await page.screenshot({ path: `${shots}/${family}${phase}.png` });
    }
    expect(pixels.size, `${family} changed labels but not pixels`).toBe(4);
    const frozen = await page.evaluate(() => (window as any).__animalDraw);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__animalDraw)).toEqual(frozen);
  }
  expect(scales.size, 'trimmed head motion must not resize the animal').toBe(1);
  await page.evaluate(id => {
    const d = (window as any).__dynasty;
    d.sim.time.tick += 30;
    const a = d.sim.animals.find((a: any) => a.id === id);
    d.renderer.animalTrack.set(id, { x: a.x, y: a.y, east: true, distance: 0, movedAt: -Infinity });
  }, id);
  await expect.poll(() => page.evaluate(() => (window as any).__animalDraw?.key)).toBe('a/deer/E/idle');
  expect(errors).toEqual([]);
});

test('300 animated animal draws use one atlas and do not create per-animal composite canvases', async ({ page }) => {
  await page.goto('/?seed=e2e-fixture&skipIntro=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty.renderer.art);
  const result = await page.evaluate(() => {
    const d = (window as any).__dynasty, art = d.renderer.art;
    const before = art.cacheStats;
    const animals = d.sim.animals.filter((a: any) => a.alive);
    const scales: Record<string, Set<number>> = {};
    const calls = new Map<string, Set<string>>();
    const original = art.drawAsset.bind(art);
    art.drawAsset = (...args: any[]) => {
      if (args[1] === 'animals') {
        const species = args[2].split('/')[1];
        (scales[species] ??= new Set()).add(args[5]);
        const keys = calls.get(species) ?? new Set<string>(); keys.add(args[2]); calls.set(species, keys);
      }
      return original(...args);
    };
    for (const family of ['e', 'r', 'a']) for (let frame = 0; frame < 4; frame++) for (let i = 0; i < 300; i++) {
      const source = animals[i % animals.length];
      // Presentation workload only: no invented animals inserted into the AI.
      const animal = { ...source, id: 100_000 + i, alive: true,
        lastMealAt: family === 'e' ? d.sim.time.tick - [0, 2, 3, 4][frame] : -Infinity,
        lastAttackAt: family === 'a' ? d.sim.time.tick - [0, 2, 3, 4][frame] : -Infinity,
        lastRunAt: family === 'r' ? d.sim.time.tick : -Infinity };
      d.renderer.workAlpha = 0;
      d.renderer.animalTrack.set(animal.id, { x: source.x, y: source.y, east: i % 2 === 0,
        distance: frame * .22, movedAt: family === 'r' ? d.sim.time.tick : -Infinity });
      d.renderer.drawArtAnimal(art, animal, source, 400, 400, 32, 20);
    }
    art.drawAsset = original;
    return { before, after: art.cacheStats, scales: Object.values(scales).map(s => s.size),
      poses: [...calls.values()].map(s => s.size), sheets: art.manifest('animals').sheets.length };
  });
  expect(result.after).toEqual(result.before);
  expect(result.scales.every(n => n === 1)).toBe(true);
  expect(result.poses.every(n => n === 12)).toBe(true);
  expect(result.sheets).toBe(1);
});
