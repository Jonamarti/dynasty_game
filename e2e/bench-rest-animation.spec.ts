/** M15 phase 17: real bench rest uses a four-frame seated human pose. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a reached bench rest order shows four seated poses without changing the rest action', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-bench-rest-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No sitter fixture');
    const buildingPath = '/src/sim/entities/Building.ts';
    const { BUILDINGS } = await import(buildingPath);
    const Building = sim.buildings[0]?.constructor;
    if (!Building) throw new Error('No building constructor');
    const tx = Math.floor(person.x), ty = Math.floor(person.y);
    const host = new Building(BUILDINGS.mud_hut, tx - 1, ty - 1, person.bandId, sim.ids);
    host.complete = true; host.durability = host.def.workTicks;
    const bench = new Building(BUILDINGS.bench, tx, ty, person.bandId, sim.ids);
    bench.complete = true; bench.hostId = host.id;
    sim.buildings.push(host, bench);
    sim.buildingsById.set(host.id, host); sim.buildingsById.set(bench.id, bench);
    sim.buildingHash.insert(host); sim.buildingHash.insert(bench);
    sim.peopleHash.remove(person);
    person.x = bench.centerX; person.y = bench.centerY;
    person.targetX = person.x; person.targetY = person.y;
    person.path = null; person.pathCount = person.pathAt = 0;
    sim.peopleHash.insert(person);
    person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
    person.needs.fatigue = 40;
    if (!sim.order(person, 'rest', { buildingId: bench.id })) throw new Error('Simulation refused the bench rest order');
    const fatigue = person.needs.fatigue;
    sim.step();
    if (person.action !== 'rest' || person.actionTicks <= 0 || person.needs.fatigue >= fatigue) {
      throw new Error('The real bench rest order did not begin recovery');
    }
    const track = d.renderer.walkPhase.get(person.id);
    if (track) { track.x = person.x; track.y = person.y; track.movedAt = -Infinity; }
    d.camera.zoom = 9; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    (window as any).__sitterId = person.id;
  });

  const poses = new Set<string>(), sprites = new Set<string>();
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/bench-rest-animation/m15-bench-rest-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const sitter = d.sim.people.find((candidate: any) => candidate.id === (window as any).__sitterId);
      const before = { action: sitter.action, fatigue: sitter.needs.fatigue };
      sitter.actionTicks = 1 + phase * 2;
      const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
      const drawArt = d.renderer.drawArtPerson.bind(d.renderer);
      let drawingSitter = false, aspect: any = null;
      atlas.drawPerson = (ctx: any, candidateAspect: any, ...args: any[]) => {
        if (drawingSitter) aspect = candidateAspect;
        return drawPerson(ctx, candidateAspect, ...args);
      };
      d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
        if (renderedPerson.id !== sitter.id) return drawArt(art, renderedPerson, ...args);
        drawingSitter = true;
        try { return drawArt(art, renderedPerson, ...args); }
        finally { drawingSitter = false; }
      };
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const pixels = aspect ? atlas.sprite(aspect).image.toDataURL() : '';
      atlas.drawPerson = drawPerson; d.renderer.drawArtPerson = drawArt;
      return { pose: aspect?.pose, pixels, before, after: { action: sitter.action, fatigue: sitter.needs.fatigue } };
    }, phase);
    expect(rendered.pose).toBe(`j${phase}`);
    expect(rendered.pixels).not.toBe('');
    expect(rendered.after).toEqual(rendered.before);
    poses.add(rendered.pose); sprites.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-bench-rest-j${phase}.png` });
  }
  expect(poses.size).toBe(4);
  expect(sprites.size).toBe(4);
  expect(errors).toEqual([]);
});
