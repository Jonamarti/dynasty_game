/**
 * A village of every building the art covers, placed by hand into a fresh
 * world, for the owner's visual review of M15 phase 17 and for checking that
 * nothing throws while the depth-sorted pass draws them beside people.
 *
 *   DYNASTY_PORT=5399 npx playwright test e2e/art-village.spec.ts
 *
 * Placing them is a test convenience: it bypasses tech and cost on purpose,
 * because the question here is how they look, not whether a band can afford them.
 */
import { test, expect } from '@playwright/test';

const DIR = 'artifacts/screenshots';

interface B { x: number; y: number; complete: boolean; def: { id: string; width: number; height: number; requiresTech: string | null } }
interface Handle {
  sim: {
    player: { id: number; x: number; y: number; bandId: number };
    buildings: B[];
    place: (id: string, x: number, y: number, band: number) => B | null;
    knownTech: Set<string>;
  };
  camera: { zoom: number; following: boolean; snapTo: (x: number, y: number) => void };
  renderer: { hideRoofs: boolean; fogEnabled: boolean };
}

const KINDS = [
  'mud_hut', 'wattle_hut', 'stone_house', 'longhouse', 'granary', 'library', 'stockpile', 'windbreak', 'storage_pit',
  'snare', 'fish_trap', 'pen', 'quern', 'compost_heap', 'loom', 'oven', 'kiln', 'well', 'hearth',
];

test('a village of every building', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=tour&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });

  const placed = await page.evaluate(async (kinds: string[]) => {
    const d = (window as never as { __dynasty: Handle }).__dynasty;
    const p = d.sim.player;
    const placed: string[] = [];
    // Placing a site needs its tech known; a review of the pictures does not.
    const path = '/src/sim/entities/Building.ts';
    const defs = (await import(/* @vite-ignore */ path) as { BUILDINGS: Record<string, { requiresTech: string | null }> }).BUILDINGS;
    for (const id of kinds) { const t = defs[id]?.requiresTech; if (t) d.sim.knownTech.add(t); }
    // Spiral outwards from the player, three tiles between neighbours.
    for (const id of kinds) {
      let done = false;
      for (let ring = 2; ring < 34 && !done; ring++) {
        for (let k = 0; k < ring * 8 && !done; k++) {
          const a = (k / (ring * 8)) * Math.PI * 2;
          const x = Math.round(p.x + Math.cos(a) * ring * 1.5), y = Math.round(p.y + Math.sin(a) * ring * 1.5);
          // The site must stay clear of what is already there; `place` checks the ground.
          if (d.sim.buildings.some(b => Math.abs(b.x - x) < 8 && Math.abs(b.y - y) < 6)) continue;
          const b = d.sim.place(id, x, y, p.bandId);
          if (b) { b.complete = true; placed.push(id); done = true; }
        }
      }
    }
    d.renderer.fogEnabled = false;
    d.camera.following = false;
    d.camera.zoom = 1.0;
    d.camera.snapTo(p.x, p.y);
    return placed;
  }, KINDS);
  expect(placed.length).toBeGreaterThan(8);

  await page.waitForTimeout(800);
  await page.screenshot({ path: DIR + '/m15-17-village-wide.png' });

  // Close on the first two placed buildings, roofs on and then off.
  await page.evaluate(() => {
    const d = (window as never as { __dynasty: Handle }).__dynasty;
    const b = d.sim.buildings.find(x => x.def.id === 'mud_hut') ?? d.sim.buildings[0]!;
    d.camera.zoom = 2.2;
    d.camera.snapTo(b.x + b.def.width / 2, b.y + b.def.height / 2);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: DIR + '/m15-17-village-close.png' });
  await page.evaluate(() => { (window as never as { __dynasty: Handle }).__dynasty.renderer.hideRoofs = true; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + '/m15-17-village-roofless.png' });
  expect(errors).toEqual([]);
});
