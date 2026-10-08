import { test, expect } from '@playwright/test';
const DIR = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-river-tools-2026-10-08';
for (const [name, lon, lat] of [['Ebro', -0.88, 41.65], ['Danube', 12.1, 49]] as const) {
  test(`${name}: curved river, real bank resources, and working bank/crossing orders`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/?seed=river-tools&skipIntro=1');
    await expect(page.locator('.hud-clock')).not.toBeEmpty();
    const initial = await page.evaluate(async ({ name, lon, lat }) => {
      const modules = ['/src/sim/core/Simulation.ts', '/src/sim/core/IdSpace.ts', '/src/sim/world/WorldGeography.ts',
        '/src/sim/world/WorldBinary.ts', '/src/render/Renderer.ts', '/src/render/Camera.ts', '/src/render/ArtAtlas.ts',
        '/src/sim/core/Earth.ts', '/src/sim/ai/ActionCatalog.ts', '/src/ui/RadialMenu.ts', '/src/i18n/i18n.ts'];
      const [{ Simulation }, { IdSpace }, { earthWorldGeography }, { decodeWorldRaster }, { Renderer }, { Camera },
        { ArtAtlas }, { canDigBankMud }, { availableActions }, { RadialMenu }, { setLanguage }] = await Promise.all(modules.map(m => import(m)));
      setLanguage('es');
      const raster = decodeWorldRaster(new Uint8Array(await (await fetch('/world/earth-present.bin')).arrayBuffer()));
      const geography = earthWorldGeography({ entry: { id: 'earth-present', title: 'Earth', file: 'earth-present.bin', seaLevelMeters: 0, recommended: false }, raster }, 10);
      const sim = new Simulation({ seed: 'river-tools', population: { bands: 1, peoplePerBand: 4 }, world: { width: 128, height: 128, gameHerds: 0, predators: 0 } },
        new IdSpace(), { geography, x: (lon + 180) / 360 * 960, y: (90 - lat) / 180 * 480, comarcasWide: 4, comarcasHigh: 4 });
      const person = sim.people.find((p: any) => p.alive && !p.isChild);
      sim.player = person; person.isPlayer = true; sim.autonomy = 'manual';
      const bank = sim.world.freshShore.find((p: any) => canDigBankMud(sim.world, p.x, p.y) && !sim.buildingAt(p.x, p.y));
      person.x = bank.x + 0.5; person.y = bank.y + 0.5;
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
      person.inventory.add('sticks', 1);
      const canvas = document.createElement('canvas'); canvas.id = 'river-tools'; canvas.width = 1280; canvas.height = 800;
      Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '10000', background: '#121820' }); document.body.appendChild(canvas);
      const camera = new Camera(); camera.setViewport(1280, 800); camera.zoom = 0.72; camera.snapTo(64, 64);
      const renderer = new Renderer(canvas, sim, camera); renderer.setArt(await ArtAtlas.load('/art/')); renderer.fogEnabled = false;
      renderer.render({ personId: person.id });
      const holder = document.createElement('div'); Object.assign(holder.style, { position: 'fixed', zIndex: '10001' }); document.body.appendChild(holder);
      const menu = new RadialMenu(holder);
      const options = availableActions(person, { kind: 'ground', ...bank }, { world: sim.world, nearWater: true, builtOn: (x: number, y: number) => !!sim.buildingAt(x, y) });
      menu.show(1030, 220, name, options, (option: any) => { sim.order(person, option.id, bank); });
      (window as any).__riverTools = { sim, person, bank, renderer, camera, menu, availableActions };
      return { clay: sim.nodes.filter((n: any) => n.kind === 'clay').length, reeds: sim.nodes.filter((n: any) => n.kind === 'reeds').length };
    }, { name, lon, lat });
    expect(initial.clay).toBeGreaterThan(0); expect(initial.reeds).toBeGreaterThan(0);
    await expect(page.getByText('Cavar barro de la orilla', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${DIR}/${name}-01-banks.png` });
    if (name === 'Ebro') {
      await page.getByText('Cavar barro de la orilla', { exact: true }).click();
      const mud = await page.evaluate(() => {
        const { sim, person, renderer, camera } = (window as any).__riverTools;
        for (let i = 0; i < 150 && person.inventory.count('mud') === 0; i++) sim.step();
        camera.zoom = 3; camera.snapTo(person.x, person.y); renderer.render({ personId: person.id });
        return person.inventory.count('mud');
      });
      expect(mud).toBeGreaterThan(0);
      await page.screenshot({ path: `${DIR}/${name}-02-mud-dug.png` });
    } else {
      const crossing = await page.evaluate(() => {
        const { sim, person, bank, renderer, camera, menu, availableActions } = (window as any).__riverTools;
        menu.close();
        const other = sim.shoreHash.findNearest(bank.x, bank.y, 128, (p: any) => !sim.world.isWater(p.x, p.y) &&
          !sim.world.sameRegion(bank.x, bank.y, p.x, p.y) && sim.world.sameBoatRegion(bank.x, bank.y, p.x, p.y));
        const before = availableActions(person, { kind: 'ground', ...other }, { world: sim.world, nearWater: true }).find((a: any) => a.id === 'boat');
        person.knownTech.add('cordage'); person.inventory.remove('sticks', 1);
        person.inventory.add('thatch', 6); person.inventory.add('sticks', 2); person.inventory.add('rope', 1); person.skills.build = 100;
        sim.order(person, 'craft', { recipeId: 'raft' });
        for (let i = 0; i < 250 && person.action === 'craft'; i++) sim.step();
        const raft = person.inventory.count('raft');
        const order = sim.order(person, 'boat', other);
        for (let i = 0; i < 250 && sim.world.depthAt(person.x, person.y) < sim.world.swimDepth; i++) sim.step();
        camera.zoom = 4; camera.snapTo(person.x, person.y); renderer.render({ personId: person.id });
        (window as any).__riverTools.other = other;
        return { blocked: before.enabled === false, raft, order, deep: sim.world.depthAt(person.x, person.y) >= sim.world.swimDepth, afloat: person.aboardRaft };
      });
      expect(crossing).toEqual({ blocked: true, raft: 1, order: true, deep: true, afloat: true });
      await page.screenshot({ path: `${DIR}/${name}-02-raft.png` });
      const arrived = await page.evaluate(() => {
        const { sim, person } = (window as any).__riverTools;
        for (let i = 0; i < 400 && person.action === 'boat'; i++) sim.step();
        return person.alive && !sim.world.isWater(person.x, person.y) && person.action === 'idle';
      });
      expect(arrived).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}
