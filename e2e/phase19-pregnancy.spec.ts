/**
 * M15 phase 19: what the pregnancy puts on the screen. The behaviour is in
 * `src/sim/__tests__/pregnancy.test.ts`; these three are the claims that
 * belong to the browser: the panel says which third she is in (to those who
 * know her, and only the last third to a stranger), the menu and the stop say
 * why she will not do heavy work, and the belly is on the sprite.
 *
 *   DYNASTY_PORT=5401 node node_modules/@playwright/test/cli.js test e2e/phase19-pregnancy.spec.ts
 *
 * Paused throughout, with the camera fixed before any click (AGENTS.md).
 * Captures go to `artifacts/screenshots/m15-phase19-pregnancy-2026-10-07/`.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots/m15-phase19-pregnancy-2026-10-07';

type Woman = {
  id: number; x: number; y: number; bandId: number; sex: string; age: number; daysPerYear: number;
  alive: boolean; isChild: boolean; pregnant: boolean; gestationLeft: number; pregnantBy: number | null;
  needs: Record<string, number>; action: string; spouseId: number | null; name: string;
};
type Debug = {
  __dynasty: {
    sim: {
      player: Woman | null;
      time: { tick: number };
      livingPeople: () => Woman[];
      peopleById: Map<number, Woman>;
      possess: (person: Woman) => Woman;
      order: (person: Woman, action: string, target: { treeId?: number }) => boolean;
      step: () => void;
      lastRefusal: string | null;
      world: { isWalkable: (x: number, y: number) => boolean; sameRegion: (a: number, b: number, c: number, d: number) => boolean };
      trees: { id: number; x: number; y: number; standing: boolean; isMature: boolean }[];
      buildingAt: (x: number, y: number) => unknown;
      interruptions: { personId: number; reason: string }[];
      config: { sightRadius: number };
      people: Woman[];
      peopleHash: { clear: () => void; insert: (p: Woman) => void };
    };
    camera: {
      snapTo: (x: number, y: number) => void; following: boolean; zoom: number;
      worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
    };
    renderer: { art: { compose: (aspect: unknown) => HTMLCanvasElement } | null };
  };
};

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=e2e-fixture&skipIntro=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
}

const frames = (page: Page, n = 3): Promise<void> => page.evaluate(async count => {
  for (let i = 0; i < count; i++) await new Promise<void>(r => requestAnimationFrame(() => r()));
}, n);

/** Puts `id` a given share (0 to 1) of the way through a pregnancy. */
async function expecting(page: Page, id: number, share: number): Promise<void> {
  await page.evaluate(({ id, share }) => {
    const d = (window as never as Debug).__dynasty;
    const w = d.sim.peopleById.get(id)!;
    w.pregnant = true;
    w.pregnantBy = w.spouseId;
    w.gestationLeft = (w.daysPerYear / 4) * (1 - share);
  }, { id, share });
  await frames(page);
}

/**
 * A woman of `band` (a founding wife, or any grown woman), put on open ground
 * well away from everybody else so a click on her picks her alone, with the
 * camera on her. Returns her id and screen position.
 */
async function placeWoman(page: Page, wantOwnBand: boolean): Promise<{ id: number; x: number; y: number }> {
  const out = await page.evaluate(own => {
    const d = (window as never as Debug).__dynasty;
    const me = d.sim.player!;
    const people = d.sim.livingPeople();
    const woman = people.find(p => p.sex === 'female' && !p.isChild && p.id !== me.id &&
      (own ? p.bandId === me.bandId : p.bandId !== me.bandId));
    if (!woman) return null;
    const free = (x: number, y: number) => d.sim.world.isWalkable(x, y) && !d.sim.buildingAt(x, y) &&
      people.every(p => p.id === woman.id || Math.hypot(p.x - x, p.y - y) > 3) &&
      d.sim.trees.every(t => !t.standing || Math.hypot(t.x - x, t.y - y) > 2);
    // Inside the player's sight: a person out of it is not offered to a click.
    for (let radius = 4; radius < d.sim.config.sightRadius - 1; radius++) {
      for (let angle = 0; angle < 32; angle++) {
        const x = Math.round(me.x + Math.cos(angle * Math.PI / 16) * radius);
        const y = Math.round(me.y + Math.sin(angle * Math.PI / 16) * radius);
        if (!free(x, y)) continue;
        woman.x = x; woman.y = y;
        woman.needs.hunger = 0; woman.needs.thirst = 0;
        // The picker asks the people index, which is rebuilt on a step: paused,
        // a person moved by hand stays where the index last saw them.
        d.sim.peopleHash.clear();
        for (const p of d.sim.people) if (p.alive) d.sim.peopleHash.insert(p);
        d.camera.following = false;
        d.camera.snapTo(x, y);
        return { id: woman.id };
      }
    }
    return null;
  }, wantOwnBand);
  expect(out, 'a free spot and a woman').not.toBeNull();
  await frames(page, 4);
  const at = await page.evaluate(id => {
    const d = (window as never as Debug).__dynasty;
    const w = d.sim.peopleById.get(id)!;
    return { x: d.camera.worldToScreenX(w.x), y: d.camera.worldToScreenY(w.y) };
  }, out!.id);
  return { id: out!.id, ...at };
}

/** Clicks the screen point and, if the picker opens, takes the entry that reads `want` (or the first). */
async function selectAt(page: Page, x: number, y: number, want?: RegExp): Promise<void> {
  await page.mouse.click(x, y);
  const items = page.locator('.picker-item');
  if (!(await items.first().isVisible().catch(() => false))) return;
  const named = want ? items.filter({ hasText: want }) : items;
  await named.first().click();
}

test('the panel says which third she is in, and a stranger is told only of the last', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);

  // Somebody of the player's own band: known well enough to be read.
  const mine = await placeWoman(page, true);
  await expecting(page, mine.id, 0.5);
  await selectAt(page, mine.x, mine.y);
  await expect(page.locator('.hud-pregnancy')).toHaveText('pregnant (second trimester)', { timeout: 10_000 });
  await page.screenshot({ path: SHOTS + '/01-panel-second-trimester.png' });
  await expecting(page, mine.id, 0.9);
  await expect(page.locator('.hud-pregnancy')).toHaveText('pregnant (third trimester)', { timeout: 10_000 });
  await page.screenshot({ path: SHOTS + '/02-panel-third-trimester.png' });

  // A woman of another people, never met: her second third is hers to know.
  const stranger = await placeWoman(page, false);
  await expecting(page, stranger.id, 0.5);
  await selectAt(page, stranger.x, stranger.y);
  await expect(page.locator('.hud-panel')).toContainText('You would have to know them better', { timeout: 10_000 });
  await expect(page.locator('.hud-pregnancy')).toHaveCount(0);
  await page.screenshot({ path: SHOTS + '/03-panel-stranger-second-trimester-says-nothing.png' });
  // The last third shows to anyone.
  await expecting(page, stranger.id, 0.9);
  await expect(page.locator('.hud-pregnancy')).toHaveText('pregnant (third trimester)', { timeout: 10_000 });
  await page.screenshot({ path: SHOTS + '/04-panel-stranger-third-trimester-shows.png' });
});

test('the menu greys the heavy work with the reason, and the work she was at is stopped with it', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  const set = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const me = d.sim.player!;
    const woman = d.sim.livingPeople().find(p => p.sex === 'female' && !p.isChild && p.id !== me.id && p.bandId === me.bandId)!;
    d.sim.possess(woman);
    woman.needs.hunger = 0; woman.needs.thirst = 0; woman.needs.cold = 0;
    const tree = d.sim.trees.find(t => t.standing && t.isMature && d.sim.world.sameRegion(woman.x, woman.y, t.x, t.y) &&
      t.x > 12 && t.y > 12)!;
    // A few tiles from the trunk, so a click on her is a click on her alone.
    woman.x = tree.x; woman.y = tree.y + 3;
    d.sim.peopleHash.clear();
    for (const p of d.sim.people) if (p.alive) d.sim.peopleHash.insert(p);
    d.camera.following = false;
    d.camera.snapTo(tree.x, tree.y + 1.5);
    return { id: woman.id, name: woman.name, tree: tree.id, tx: tree.x, ty: tree.y };
  });
  await frames(page, 4);
  // `possess` leaves the panel on the man who was the player: select her.
  const herAt = await page.evaluate(id => {
    const d = (window as never as Debug).__dynasty;
    const w = d.sim.peopleById.get(id)!;
    return { x: d.camera.worldToScreenX(w.x), y: d.camera.worldToScreenY(w.y) };
  }, set.id);
  await selectAt(page, herAt.x, herAt.y, new RegExp(set.name));
  await expecting(page, set.id, 0.5);

  // Second third: the order goes through and she starts felling.
  const started = await page.evaluate(({ id, tree }) => {
    const d = (window as never as Debug).__dynasty;
    const w = d.sim.peopleById.get(id)!;
    const ok = d.sim.order(w, 'chop', { treeId: tree });
    for (let i = 0; i < 6; i++) d.sim.step();
    return { ok, action: w.action };
  }, set);
  expect(started).toEqual({ ok: true, action: 'chop' });

  // The day turns and her last third begins: the work stops and says why.
  await expecting(page, set.id, 0.9);
  await page.evaluate(() => (window as never as Debug).__dynasty.sim.step());
  await frames(page, 4);
  expect(await page.evaluate(id => (window as never as Debug).__dynasty.sim.peopleById.get(id)!.action, set.id)).not.toBe('chop');
  await expect(page.locator('.hud-stopped')).toContainText('too heavy with child', { timeout: 10_000 });
  await page.screenshot({ path: SHOTS + '/05-the-work-is-stopped-with-its-reason.png' });

  // And the ring says so before she tries: Fell is greyed, with the reason as its tooltip.
  const at = await page.evaluate(({ tx, ty }) => {
    const d = (window as never as Debug).__dynasty;
    return { x: d.camera.worldToScreenX(tx), y: d.camera.worldToScreenY(ty) };
  }, set);
  await page.mouse.click(at.x, at.y - 30, { button: 'right' });
  const picker = page.locator('.picker-item', { hasText: /tree|oak|birch|pine|elm|ash|willow/i }).first();
  if (await picker.isVisible().catch(() => false)) await picker.click();
  const fell = page.locator('.radial-item', { hasText: /Fell/ }).first();
  await expect(fell).toBeVisible({ timeout: 10_000 });
  await expect(fell).toHaveClass(/is-disabled/);
  await expect(fell).toHaveAttribute('title', 'Too heavy with child for that');
  await fell.hover();
  await page.screenshot({ path: SHOTS + '/06-menu-greys-the-felling-with-a-reason.png' });

  // The order itself is refused too, in words.
  const refusal = await page.evaluate(({ id, tree }) => {
    const d = (window as never as Debug).__dynasty;
    d.sim.lastRefusal = null;
    const ok = d.sim.order(d.sim.peopleById.get(id)!, 'chop', { treeId: tree });
    return { ok, why: d.sim.lastRefusal };
  }, set);
  expect(refusal).toEqual({ ok: false, why: 'she is too heavy with child for that' });
});

// A sharper screen for the crop, so a bump nine pixels across can be seen.
test.describe('the sprite', () => {
test.use({ deviceScaleFactor: 3 });
test('the belly of the last third is on the sprite, and only then', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  // Not moved by hand: the renderer draws people where the interpolator says,
  // which lags a person teleported while paused. A woman of the player's band
  // where she already stands, with the camera on her.
  const her = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const me = d.sim.player!;
    const near = d.sim.livingPeople()
      .filter(p => p.sex === 'female' && !p.isChild && p.id !== me.id && p.bandId === me.bandId)
      .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0]!;
    d.camera.following = false;
    d.camera.snapTo(near.x, near.y);
    d.camera.zoom = 3.4;
    return { id: near.id };
  });
  await frames(page, 4);
  const clip = async (name: string): Promise<void> => {
    const at = await page.evaluate(id => {
      const d = (window as never as Debug).__dynasty;
      const w = d.sim.peopleById.get(id)!;
      return { x: d.camera.worldToScreenX(w.x), y: d.camera.worldToScreenY(w.y) };
    }, her.id);
    await page.screenshot({ path: SHOTS + '/' + name, clip: { x: at.x - 90, y: at.y - 100, width: 180, height: 160 } });
  };
  await expecting(page, her.id, 0.5);
  await frames(page, 3);
  await clip('07-sprite-second-trimester-no-belly.png');
  await expecting(page, her.id, 0.9);
  await frames(page, 3);
  await clip('08-sprite-third-trimester-belly.png');

  // The atlas itself: the same woman, with and without it, is a different picture.
  const differs = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const art = d.renderer.art!;
    const base = { age: 'adult', sex: 'f', dir: 'S', pose: 'idle', skin: '#d9a77c', hair: '#2b2018', band: '#3a6ea5',
      hairStyle: 'long', beard: false, expression: 'neutral', wear: {}, carryBaby: false, held: null };
    const data = (aspect: unknown) => art.compose(aspect).getContext('2d')!.getImageData(0, 0, 96, 96).data;
    const plain = data(base), swollen = data({ ...base, belly: true });
    let changed = 0;
    for (let i = 3; i < plain.length; i += 4) if (plain[i] !== swollen[i] || plain[i - 1] !== swollen[i - 1]) changed++;
    return changed;
  });
  expect(differs).toBeGreaterThan(100);
});
});
