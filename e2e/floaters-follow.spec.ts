import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('a floating label stays over its walker as they move', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m16-floater-follow&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const start = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const person = d.sim.player;
    if (!person) throw new Error('No walker fixture');
    d.renderer.floaters.clear();
    d.renderer.floaters.push(person.x, person.y, 'walking', { boxed: true, followId: person.id });
    d.camera.zoom = 2;
    d.camera.snapTo(person.x, person.y);
    d.camera.following = false;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
    return { id: person.id, x: person.x, y: person.y,
      label: { x: d.renderer.floaters.items[0].x, y: d.renderer.floaters.items[0].y } };
  });

  // A routine verification must not overwrite the historical phase captures.
  const shots = process.env.DYNASTY_FLOATER_SHOTS;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/01-label-over-walker.png` });
  }

  const moved = await page.evaluate(id => {
    const d = (window as any).__dynasty;
    const person = d.sim.peopleById.get(id);
    person.x += 5;
    person.path = null;
    person.pathCount = person.pathAt = 0;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
    return { x: person.x, y: person.y,
      label: { x: d.renderer.floaters.items[0].x, y: d.renderer.floaters.items[0].y } };
  }, start.id);

  expect(moved.x - start.x).toBe(5);
  expect(moved.y).toBe(start.y);
  expect(moved.label).toEqual({ x: moved.x, y: moved.y });
  if (shots) await page.screenshot({ path: `${shots}/02-label-follows-walker.png` });

  const animalLabel = await page.evaluate(id => {
    const d = (window as any).__dynasty;
    // IdSpace allocates each kind independently: the first animal and the
    // player deliberately exercise the same numeric id through the renderer.
    const animal = d.sim.animalsById.get(id);
    const person = d.sim.player;
    if (!animal) throw new Error('No animal sharing the player id');
    animal.x = person.x + 1;
    animal.y = person.y;
    d.renderer.interpolator.clear();
    d.renderer.floaters.clear();
    d.renderer.floaters.push(animal.x, animal.y, 'animal', { followId: id, followKind: 'animal' });
    animal.x += 1;
    d.renderer.render(null, 0);
    const visible = { x: d.renderer.floaters.items[0].x, y: d.renderer.floaters.items[0].y };
    d.renderer.fogEnabled = true;
    animal.x += d.sim.world.width;
    d.renderer.render(null, 0);
    const unseen = { x: d.renderer.floaters.items[0].x, y: d.renderer.floaters.items[0].y };
    return { visible, unseen, expected: { x: person.x + 2, y: person.y } };
  }, start.id);
  expect(animalLabel.visible).toEqual(animalLabel.expected);
  expect(animalLabel.unseen).toEqual(animalLabel.visible);

  expect(await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const person = d.sim.player;
    d.renderer.floaters.clear();
    d.renderer.floaters.push(person.x, person.y, 'walking', { followId: person.id });
    d.renderer.interpolator.clear();
    d.renderer.interpolator.capture('person', [person]);
    const before = person.x;
    person.x += 2;
    d.renderer.interpolator.capture('person', [person]);
    d.renderer.render(null, 0.5);
    return d.renderer.floaters.items[0].x - before;
  })).toBe(1);
});
