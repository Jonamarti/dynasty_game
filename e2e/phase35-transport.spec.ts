import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase35-transport-2026-10-09';

test('assigns a nearby donkey, shows it following, and keeps a released lease clear', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=phase35-transport&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const at = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const person = d.sim.player ?? d.sim.possessFirst();
    const animal = d.sim.animals.find((candidate: any) => candidate.alive && candidate.species === 'donkey');
    if (!person || !animal) throw new Error('Transport fixture is missing');
    person.knownTech.add('pack_animals');
    person.action = 'rest'; person.order = 'rest';
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    animal.tamedBy = person.id;
    animal.fedBy.add(person.id);
    animal.x = person.x + 1;
    animal.y = person.y;
    for (const other of d.sim.people) if (other !== person) {
      other.x = Math.max(3, d.sim.world.width - 3); other.y = Math.max(3, d.sim.world.height - 3); other.action = 'rest'; other.order = 'rest';
    }
    // Make the actual tamer and donkey readable in the capture: remove only
    // nearby trees from this E2E world, then rebuild the same indexes gameplay queries use.
    const clearRadius = 16;
    const removedTrees = d.sim.trees.filter((tree: any) => Math.hypot(tree.x - person.x, tree.y - person.y) <= clearRadius);
    d.sim.trees = d.sim.trees.filter((tree: any) => !removedTrees.includes(tree));
    for (const tree of removedTrees) d.sim.treesById.delete(tree.id);
    d.sim.treeHash.rebuild(d.sim.trees);
    d.sim.rebuildHashes();
    d.renderer.interpolator.clear();
    d.camera.zoom = 5.5;
    d.camera.snapTo(animal.x, animal.y);
    d.camera.following = false;
    d.renderer.fogEnabled = false;
    const rect = document.querySelector('#view')!.getBoundingClientRect();
    return { x: rect.left + d.camera.worldToScreenX(animal.x), y: rect.top + d.camera.worldToScreenY(animal.y) };
  });
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const firstPicker = page.locator('.picker');
  if (await firstPicker.isVisible()) await firstPicker.locator('.picker-item', { hasText: 'Donkey' }).first().click();
  const packOption = page.locator('.radial-item', { hasText: 'Use as a pack animal' });
  await expect(packOption).toBeVisible({ timeout: 10_000 });
  await expect(packOption).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/transport-animal-radial-dispatch.png` });
  await packOption.click();
  const leased = await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    const animal = d.sim.animals.find((candidate: any) => candidate.id === person.transportAnimalId);
    return { personId: person.id, personAnimal: person.transportAnimalId, animalOwner: animal?.transportedBy,
      mode: person.transportMode, capacity: person.transportCapacity, animalId: animal?.id };
  });
  expect(leased.animalId).toBe(leased.personAnimal);
  expect(leased.animalOwner).toBe(leased.personId);
  expect(leased).toMatchObject({ mode: 'pack', capacity: 24 });

  const follow = await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    const animal = d.sim.animals.find((candidate: any) => candidate.id === person.transportAnimalId);
    animal.x = person.x + 7; animal.y = person.y;
    d.sim.rebuildHashes();
    d.renderer.interpolator.clear();
    const before = Math.hypot(animal.x - person.x, animal.y - person.y);
    for (let i = 0; i < 30; i++) d.sim.step();
    const distance = Math.hypot(animal.x - person.x, animal.y - person.y);
    d.camera.zoom = 5.5; d.camera.snapTo((person.x + animal.x) / 2, (person.y + animal.y) / 2);
    return { before, distance, x: animal.x, y: animal.y, personX: person.x, personY: person.y };
  });
  expect(follow.distance).toBeLessThan(follow.before);
  // Preserve the proven close-follow state but offset the sprite so the player does not cover the donkey in the capture.
  await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    const animal = d.sim.animals.find((candidate: any) => candidate.id === person.transportAnimalId);
    animal.x = person.x + 1.1; animal.y = person.y + 0.7;
    d.sim.rebuildHashes();
    d.renderer.interpolator.clear();
    d.camera.snapTo((person.x + animal.x) / 2, (person.y + animal.y) / 2);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/transport-animal-following.png` });

  const releaseAt = await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    const animal = d.sim.animals.find((candidate: any) => candidate.id === person.transportAnimalId);
    animal.x = person.x + 1; animal.y = person.y; d.sim.rebuildHashes();
    const rect = document.querySelector('#view')!.getBoundingClientRect();
    return { x: rect.left + d.camera.worldToScreenX(animal.x), y: rect.top + d.camera.worldToScreenY(animal.y) };
  });
  await page.mouse.click(releaseAt.x, releaseAt.y, { button: 'right' });
  const releasePicker = page.locator('.picker');
  if (await releasePicker.isVisible()) await releasePicker.locator('.picker-item', { hasText: 'Donkey' }).first().click();
  const releaseOption = page.locator('.radial-item', { hasText: 'Release this transport animal' });
  await expect(releaseOption).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/transport-animal-release.png` });
  await releaseOption.click();
  const released = await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    const animal = d.sim.animals.find((candidate: any) => candidate.species === 'donkey' && candidate.tamedBy === person.id);
    d.sim.step();
    return { personAnimal: person.transportAnimalId, animalOwner: animal?.transportedBy, autoClaim: person.transportAutoClaim };
  });
  expect(released).toEqual({ personAnimal: null, animalOwner: null, autoClaim: false });
});