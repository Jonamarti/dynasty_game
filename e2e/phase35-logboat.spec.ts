import { test, expect } from '@playwright/test';

const DIR = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase35-logboat-2026-10-09';

test('logboat knowledge and item unlock a sheltered salt-water crossing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=phase35-logboat&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.evaluate(async () => {
    const modules = ['/src/sim/ai/ActionCatalog.ts', '/src/ui/RadialMenu.ts'];
    const [{ availableActions }, { RadialMenu }] = await Promise.all(modules.map(module => import(module)));
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player, world = sim.world;
    person.isPlayer = true; sim.autonomy = 'manual';
    // The classic island is freshwater-only. Add a deterministic salt lane on
    // its east-west divide to exercise the same local navigation in the UI.
    const n = world.width * world.height;
    Object.defineProperty(world, 'waterKind', { value: new Uint8Array(n), enumerable: true, writable: true, configurable: true });
    Object.defineProperty(world, 'waterSurface', { value: new Float32Array(n), enumerable: true, writable: true, configurable: true });
    const midX = Math.floor(world.width / 2), midY = Math.floor(world.height / 2);
    for (let y = 0; y < world.height; y++) for (let x = midX; x <= midX + 1; x++) {
      const tile = world.index(x, y);
      world.biome[tile] = 0; world.waterKind![tile] = 2; world.waterSurface![tile] = world.waterLevel;
      world.elevation[tile] = world.waterLevel - world.swimDepth * 2; world.setWalkable(x, y, false);
    }
    const from = { x: midX - 1, y: midY }, to = { x: midX + 2, y: midY };
    for (const x of [from.x, to.x]) {
      const tile = world.index(x, midY);
      world.biome[tile] = 1; world.waterKind![tile] = 0; world.waterSurface![tile] = 0;
      world.elevation[tile] = world.waterLevel + 0.02; world.setWalkable(x, midY, true);
    }
    person.x = from.x + 0.5; person.y = from.y + 0.5;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    person.inventory.add('logboat', 1);
    d.camera.following = false; d.camera.zoom = 4; d.camera.snapTo(midX, midY);
    d.renderer.fogEnabled = false;
    const holder = document.createElement('div'); Object.assign(holder.style, { position: 'fixed', zIndex: '10001' });
    document.body.appendChild(holder);
    const menu = new RadialMenu(holder);
    const target = { kind: 'ground', ...to };
    const showMenu = () => menu.show(window.innerWidth - 250, 240, 'Other bank',
      availableActions(person, target, { world, nearWater: true }), (option: any) => sim.order(person, option.id, to));
    const locked = availableActions(person, target, { world, nearWater: true }).find((option: any) => option.id === 'boat');
    showMenu();
    (window as any).__logboat = { sim, person, world, to, from, menu, showMenu, locked, renderer: d.renderer, camera: d.camera };
  });
  const locked = await page.evaluate(() => (window as any).__logboat.locked);
  expect(locked).toMatchObject({ enabled: false, reason: 'You need logboat knowledge to use it' });
  const menuItem = page.locator('.radial-item', { hasText: 'Travel by logboat' });
  await expect(menuItem).toHaveClass(/is-disabled/);
  await page.screenshot({ path: `${DIR}/01-logboat-needs-knowledge.png` });

  await page.evaluate(() => {
    const state = (window as any).__logboat;
    state.menu.close(); state.person.knownTech.add('logboat'); state.showMenu();
  });
  await expect(menuItem).not.toHaveClass(/is-disabled/);
  await page.screenshot({ path: `${DIR}/02-logboat-unlocked.png` });
  await menuItem.click();
  const crossing = await page.evaluate(() => {
    const { sim, person, world, renderer, camera } = (window as any).__logboat;
    let entered = false;
    for (let tick = 0; tick < 700 && person.action === 'boat'; tick++) {
      sim.step();
      if (person.aboardBoat === 'logboat') { entered = true; break; }
    }
    camera.snapTo(person.x, person.y); renderer.render({ personId: person.id });
    return { entered, vessel: person.aboardBoat, item: person.inventory.count('logboat'), safe: world.isLogboatTile(person.x, person.y) };
  });
  expect(crossing).toMatchObject({ entered: true, vessel: 'logboat', item: 1, safe: true });
  await page.screenshot({ path: `${DIR}/03-logboat-afloat.png` });
  const arrived = await page.evaluate(() => {
    const { sim, person } = (window as any).__logboat;
    for (let tick = 0; tick < 700 && person.action === 'boat'; tick++) sim.step();
    return !sim.world.isWater(person.x, person.y) && person.action === 'idle';
  });
  expect(arrived).toBe(true);
  expect(errors).toEqual([]);
});
