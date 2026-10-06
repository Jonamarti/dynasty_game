/**
 * M15 phase 13c: the tech web opens its sub-webs, and does not move.
 *
 * Nothing here names a particular web or counts them: the table grows (the
 * kitchen is coming) and a spec that listed today's webs would be a spec about
 * this week. Webs are picked from `SUB_WEBS`, members from `techsOfWeb`.
 *
 * The player's character is given techniques the way the other specs do it, by
 * reaching into `window.__dynasty.sim.player.knownTech` (a DEV-only handle).
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SUB_WEBS, TECH, WEBS, techsOfWeb, webOf, type Tech } from '../src/sim/knowledge/Tech.ts';

const SHOTS = 'artifacts/screenshots/m15-phase13c-subwebs-2026-10-06';

type Debug = {
  __dynasty: {
    sim: { player: { knownTech: Set<string>; techLevel: Map<string, number> } | null };
  };
};

function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });
  return errors;
}

async function ready(page: Page, lang = 'en'): Promise<void> {
  await page.goto('/?seed=e2e-fixture&skipIntro=1' + (lang === 'es' ? '&lang=es' : ''));
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.locator('.hud-name')).not.toBeEmpty();
}

/** Makes the player's character know exactly these techniques out of the given set. */
async function setKnown(page: Page, know: Tech[], forget: Tech[]): Promise<void> {
  await page.evaluate(({ know, forget }) => {
    const player = (window as never as Debug).__dynasty.sim.player;
    if (!player) throw new Error('no player');
    for (const tech of forget) { player.knownTech.delete(tech); player.techLevel.delete(tech); }
    for (const tech of know) { player.knownTech.add(tech); player.techLevel.set(tech, 1); }
  }, { know, forget });
}

/** Every node's `left,top` on screen's own canvas coordinates, by tech. */
async function positions(page: Page): Promise<Record<string, string>> {
  return page.locator('.techweb-node').evaluateAll(els => Object.fromEntries(
    els.map(el => [el.getAttribute('data-tech')!,
      (el as HTMLElement).style.left + ',' + (el as HTMLElement).style.top])));
}

const opened = SUB_WEBS[0]!;
const other = SUB_WEBS.find(web => web.id !== opened.id)!;
const everyGate = SUB_WEBS.map(web => web.gate!);
const everyMember = SUB_WEBS.flatMap(web => techsOfWeb(web.id));

test('a known gate carries «known / total», opens its web, and Escape steps back', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const members = techsOfWeb(opened.id);
  await setKnown(page, [opened.gate!, members[0]!], [...everyGate.filter(g => g !== opened.gate), ...everyMember]);

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });

  // The main web draws its own nodes and nothing from a sub-web.
  await expect(page.locator('.techweb-node')).toHaveCount(techsOfWeb('main').length);
  for (const tech of everyMember) {
    await expect(page.locator('.techweb-node[data-tech="' + tech + '"]')).toHaveCount(0);
  }
  await expect(page.locator('.techweb-crumbs')).toHaveCount(0);

  // One mark, on the one gate the character knows, with its count.
  await expect(page.locator('.techweb-gatemark')).toHaveCount(1);
  const mark = page.locator('.techweb-gatemark[data-web="' + opened.id + '"]');
  await expect(mark).toBeVisible();
  await expect(mark.locator('.techweb-gatecount')).toHaveText('1 / ' + members.length);
  await expect(mark.locator('.techweb-gatename')).toHaveText(WEBS[opened.id].label);
  await expect(page.locator('.techweb-node[data-tech="' + opened.gate + '"]'))
    .toHaveClass(/is-gate/);

  await mark.click();
  const crumbs = page.locator('.techweb-crumbs');
  await expect(crumbs).toBeVisible();
  await expect(crumbs).toContainText(WEBS.main.label);
  await expect(crumbs.locator('.is-here')).toHaveText(WEBS[opened.id].label);
  await expect(crumbs.locator('.techweb-back')).toBeVisible();

  // Its own nodes, and its gate as the root: nothing else.
  await expect(page.locator('.techweb-node')).toHaveCount(members.length + 1);
  for (const tech of members) {
    await expect(page.locator('.techweb-node[data-tech="' + tech + '"]')).toHaveCount(1);
  }
  await expect(page.locator('.techweb-node.is-anchor')).toHaveAttribute('data-tech', opened.gate!);
  const shown = await page.locator('.techweb-node')
    .evaluateAll(els => els.map(el => el.getAttribute('data-tech')));
  for (const tech of shown) {
    expect(tech === opened.gate || webOf(tech as Tech) === opened.id, String(tech)).toBe(true);
  }
  // The counts line is about this web, and the known one is lit.
  await expect(page.locator('.techweb-node.is-proven[data-tech="' + members[0] + '"]'))
    .toHaveCount(1);
  // No mark inside the sub-web: the gate is already its root.
  await expect(page.locator('.techweb-gatemark')).toHaveCount(0);

  // Escape goes back to the main web; the second one closes, and neither opens
  // the pause menu on the way.
  await page.keyboard.press('Escape');
  await expect(crumbs).toHaveCount(0);
  await expect(page.locator('.techweb')).toBeVisible();
  await expect(page.locator('.techweb-node')).toHaveCount(techsOfWeb('main').length);
  await expect(page.locator('.pausemenu')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.techweb')).toBeHidden();
  await expect(page.locator('.techweb')).toHaveCSS('display', 'none');
  await expect(page.locator('.pausemenu')).toBeHidden();

  // The breadcrumb is a way back too, for a hand with no keyboard: the back
  // button, and the «Red principal» crumb.
  await page.keyboard.press('g');
  await page.locator('.techweb-gatemark[data-web="' + opened.id + '"]').click();
  await expect(crumbs).toBeVisible();
  await crumbs.locator('.techweb-back').click();
  await expect(crumbs).toHaveCount(0);
  await expect(page.locator('.techweb-node')).toHaveCount(techsOfWeb('main').length);
  await page.locator('.techweb-gatemark[data-web="' + opened.id + '"]').click();
  await crumbs.locator('.techweb-crumb[data-web="main"]').click();
  await expect(crumbs).toHaveCount(0);

  // And opening it again starts at the main web, not where it was left.
  await page.locator('.techweb-gatemark[data-web="' + opened.id + '"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-crumbs')).toHaveCount(0);
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});

test('a sub-web whose gate the character does not know is not there to see', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Nothing of the other web is known, gate included; the opened web's gate is.
  await setKnown(page, [opened.gate!], [other.gate!, ...techsOfWeb(other.id)]);

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });

  await expect(page.locator('.techweb-gatemark[data-web="' + opened.id + '"]')).toHaveCount(1);
  await expect(page.locator('.techweb-gatemark[data-web="' + other.id + '"]')).toHaveCount(0);

  // The gate itself is a node like any other (dark or lit as its prerequisites
  // dictate); it just carries no mark.
  await expect(page.locator('.techweb-node[data-tech="' + other.gate + '"]')).toHaveCount(1);
  await expect(page.locator('.techweb-node[data-tech="' + other.gate + '"] .techweb-gatemark'))
    .toHaveCount(0);

  // None of its nodes is drawn, and none of their names is anywhere in the
  // overlay — not as a node, not in a tooltip, not on the end of an edge.
  const html = await page.locator('.techweb').evaluate(el => el.innerHTML);
  const text = await page.locator('.techweb').evaluate(el => (el as HTMLElement).innerText);
  const mainLabels = techsOfWeb('main').map(tech => TECH[tech].label);
  for (const tech of techsOfWeb(other.id)) {
    expect(html, 'data-tech of ' + tech).not.toContain('data-tech="' + tech + '"');
    const label = TECH[tech].label;
    if (mainLabels.includes(label)) continue;
    expect(html, 'label of ' + tech).not.toContain(label);
    expect(text, 'text of ' + tech).not.toContain(label);
  }
  // Every edge ends on a node that is drawn.
  const nodeAt = await page.locator('.techweb-node').evaluateAll(els =>
    els.map(el => (parseFloat((el as HTMLElement).style.left)).toFixed(1) + ',' +
      (parseFloat((el as HTMLElement).style.top)).toFixed(1)));
  const ends = await page.locator('.techweb-edge').evaluateAll(lines => lines.flatMap(line => [
    parseFloat(line.getAttribute('x1')!).toFixed(1) + ',' + parseFloat(line.getAttribute('y1')!).toFixed(1),
    parseFloat(line.getAttribute('x2')!).toFixed(1) + ',' + parseFloat(line.getAttribute('y2')!).toFixed(1),
  ]));
  expect(ends.length).toBeGreaterThan(0);
  for (const end of ends) expect(nodeAt, 'edge end ' + end).toContain(end);

  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('clicks on the web do not reach the world behind it', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);
  // Paused: nobody walks off between choosing a tile and clicking it.
  await page.keyboard.press(' ');
  await setKnown(page, [opened.gate!], []);

  // A spot of empty ground, found the way the smoke spec finds one.
  const spot = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { x: number; y: number };
          world: { isWalkable: (x: number, y: number) => boolean };
          livingPeople: () => { x: number; y: number }[];
          nodes: { x: number; y: number }[];
          trees: { x: number; y: number; standing: boolean }[];
          piles: { x: number; y: number }[];
          animals: { x: number; y: number; alive: boolean }[];
          buildingAt: (x: number, y: number) => unknown;
        };
        camera: {
          worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
        };
      };
    }).__dynasty;
    const clear = (x: number, y: number) =>
      d.sim.world.isWalkable(x, y) && !d.sim.buildingAt(x, y) &&
      d.sim.livingPeople().every(p => Math.hypot(p.x - x, p.y - y) > 2.5) &&
      d.sim.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 2.5) &&
      d.sim.trees.every(t => !t.standing || Math.hypot(t.x - x, t.y - y) > 2.5) &&
      d.sim.piles.every(pile => Math.hypot(pile.x - x, pile.y - y) > 2.5) &&
      d.sim.animals.every(a => !a.alive || Math.hypot(a.x - x, a.y - y) > 6);
    const canvas = document.getElementById('view');
    for (let radius = 3; radius <= 16; radius++) {
      for (let angle = 0; angle < 16; angle++) {
        const x = Math.round(d.sim.player.x + Math.cos(angle) * radius);
        const y = Math.round(d.sim.player.y + Math.sin(angle) * radius);
        if (!clear(x, y)) continue;
        const sx = d.camera.worldToScreenX(x);
        const sy = d.camera.worldToScreenY(y);
        if (document.elementFromPoint(sx, sy) !== canvas) continue;
        return { x: sx, y: sy };
      }
    }
    return null;
  });
  expect(spot, 'no empty ground near the player').not.toBeNull();

  // The control: with the overlay closed a right click on that spot is a click
  // on the world, and puts up the radial menu. Without this the test below
  // could pass on a spot nothing would ever have answered.
  await page.mouse.click(spot!.x, spot!.y, { button: 'right' });
  await expect.poll(async () => page.locator('.radial-item').count()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.radial-item')).toHaveCount(0);
  const panelBefore = await page.locator('.hud-panel').innerText();

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });

  // The same screen point, now over the overlay. Nudge to a point of the
  // viewport that is not a node, so the click is a click on the web's own
  // empty canvas and not on something that answers it.
  const aim = await page.evaluate(({ x, y }) => {
    const viewport = document.querySelector('.techweb-viewport')!.getBoundingClientRect();
    const free = (px: number, py: number) => {
      const el = document.elementFromPoint(px, py);
      return el !== null && !el.closest('.techweb-node') && !!el.closest('.techweb-viewport');
    };
    if (free(x, y)) return { x, y };
    for (let step = 10; step < 400; step += 10) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const px = x + dx! * step, py = y + dy! * step;
        if (px > viewport.left + 4 && px < viewport.right - 4 &&
            py > viewport.top + 4 && py < viewport.bottom - 4 && free(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }, spot!);
  expect(aim, 'no free spot on the web').not.toBeNull();
  await page.mouse.click(aim!.x, aim!.y);
  await page.mouse.click(aim!.x, aim!.y, { button: 'right' });
  await page.mouse.dblclick(aim!.x, aim!.y);

  await expect(page.locator('.techweb-card')).toBeVisible();
  await expect(page.locator('.picker')).toBeHidden();
  await expect(page.locator('.radial-item')).toHaveCount(0);
  expect(await page.locator('.hud-panel').innerText()).toBe(panelBefore);

  // The same inside a sub-web.
  await page.locator('.techweb-gatemark[data-web="' + opened.id + '"]').click();
  await expect(page.locator('.techweb-crumbs')).toBeVisible();
  await page.mouse.click(aim!.x, aim!.y, { button: 'right' });
  await page.mouse.click(aim!.x, aim!.y);
  await expect(page.locator('.picker')).toBeHidden();
  await expect(page.locator('.radial-item')).toHaveCount(0);

  // And once the web is closed the click is the world's again: nothing is left
  // laid over the canvas swallowing it.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.techweb')).toHaveCSS('display', 'none');
  await page.mouse.click(spot!.x, spot!.y, { button: 'right' });
  await expect.poll(async () => page.locator('.radial-item').count()).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('learning a technique leaves every node where it was', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);
  await setKnown(page, [], [...everyGate, ...everyMember]);

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.techweb-gatemark')).toHaveCount(0);
  const before = await positions(page);
  expect(Object.keys(before)).toHaveLength(techsOfWeb('main').length);

  // Learnt while the web is open: the marks appear, the nodes do not move.
  await setKnown(page, everyGate, []);
  await expect(page.locator('.techweb-gatemark')).toHaveCount(SUB_WEBS.length);
  expect(await positions(page)).toEqual(before);

  // A sub-web and back again, and a close and a reopen: the same positions.
  await page.locator('.techweb-gatemark[data-web="' + opened.id + '"]').click();
  const sub = await positions(page);
  await page.keyboard.press('Escape');
  expect(await positions(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.techweb')).toBeHidden();

  await setKnown(page, ['firemaking', 'cordage', 'cooking'].filter(tech => tech in TECH) as Tech[], []);
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible();
  expect(await positions(page)).toEqual(before);
  await page.locator('.techweb-gatemark[data-web="' + opened.id + '"]').click();
  expect(await positions(page)).toEqual(sub);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('screenshots: the gate mark, a sub-web, in Spanish, and on a phone', async ({ browser }) => {
  mkdirSync(SHOTS, { recursive: true });
  const members = techsOfWeb(opened.id);
  const lit: Tech[] = ['firemaking', 'cordage', 'plant_lore', 'cooking', 'stoneworking']
    .filter(tech => tech in TECH) as Tech[];
  const learn = [...lit, opened.gate!, ...members.slice(0, 1)];
  const forget = [...everyGate.filter(gate => gate !== opened.gate), ...everyMember];

  for (const shot of ['desktop', 'spanish', 'phone'] as const) {
    const context = await browser.newContext(shot === 'phone'
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = guardErrors(page);
    await ready(page, shot === 'spanish' ? 'es' : 'en');
    await setKnown(page, learn, forget.filter(tech => !learn.includes(tech)));
    // Paused, so the HUD behind the overlay is the same in every capture.
    if (shot === 'phone') {
      await page.locator('.hud-mobile-tool', { hasText: 'Tech' }).click();
    } else {
      await page.keyboard.press('g');
    }
    await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
    const mark = page.locator('.techweb-gatemark[data-web="' + opened.id + '"]');

    if (shot === 'desktop') {
      await expect(mark).toBeVisible();
      await page.screenshot({ path: SHOTS + '/1-main-web-gate-mark.png' });
    }
    if (shot === 'phone') {
      // The web opens zoomed on what this person knows, which is where their
      // gate is: the mark is on screen and a finger opens it.
      await mark.tap();
    } else {
      await mark.click();
    }
    await expect(page.locator('.techweb-crumbs')).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: SHOTS + '/' + (shot === 'desktop' ? '2-sub-web-breadcrumb'
        : shot === 'spanish' ? '3-sub-web-spanish' : '4-sub-web-phone') + '.png',
    });

    if (shot === 'spanish') {
      await expect(page.locator('.techweb-crumbs')).toContainText('Red principal');
      await expect(page.locator('.techweb-back')).toHaveText('‹ Volver');
    }
    if (shot === 'phone') {
      // The way back is on screen and a thumb can press it.
      const back = page.locator('.techweb-back');
      const box = (await back.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.height).toBeGreaterThanOrEqual(30);
      await back.tap();
      await expect(page.locator('.techweb-crumbs')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    await context.close();
  }
});
