/** M15 phase 40f: Spanish Field TechWeb, a real iron plough, and plough-sown ground. */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'artifacts/screenshots/m15-phase40-ploughshare-2026-10-08';

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-ploughshare-e2e&skipIntro=1&lang=es');
  await page.waitForFunction(() => Boolean((window as any).__dynasty?.sim?.player), null, { timeout: 30_000 });
  await expect(page.locator('.hud-tabs')).toBeVisible({ timeout: 10_000 });
  await page.locator('.hud-button', { hasText: /pausa/i }).click();
}

test('Field TechWeb names ploughshare in Spanish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  await page.evaluate(() => {
    const p = (window as any).__dynasty.sim.player;
    for (const id of ['farming', 'herding', 'iron_tools']) { p.knownTech.add(id); p.techLevel.set(id, 1); }
  });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await page.locator('.techweb-gatemark[data-web="field"]').click();
  const node = page.locator('.techweb-node[data-tech="ploughshare"]');
  await expect(node).toHaveCount(1);
  await node.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Reja de arado');
  await page.screenshot({ path: SHOTS + '/01-ploughshare-in-field-techweb-es.png' });
});

test('iron plough recipe, free draft pair gate, and real plough sow', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  const fixture = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player;
    if (!p) throw new Error('The game did not create a player');
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    p.workedTicks = 0; p.skills.smith = 70;
    for (const id of ['farming', 'herding', 'bog_iron', 'bellows', 'mining', 'smelting', 'charcoal',
      'firemaking', 'carpentry', 'bloomery', 'forging', 'carburising', 'iron_tools', 'ploughshare']) {
      p.knownTech.add(id); p.techLevel.set(id, 1); sim.knownTech.add(id);
    }
    for (const [id, count] of p.inventory.entries()) p.inventory.remove(id, count);

    const place = (kind: string, size: number, cx: number, cy: number, lo: number, hi: number) => {
      for (let r = lo; r <= hi; r++) for (let a = 0; a < 32; a++) {
        const x = Math.round(cx + Math.cos(a * Math.PI / 16) * r);
        const y = Math.round(cy + Math.sin(a * Math.PI / 16) * r);
        let clear = true;
        for (let dy = -1; dy < size + 1 && clear; dy++) for (let dx = -1; dx < size + 1; dx++) {
          const tx = x + dx, ty = y + dy;
          if (!sim.world.isWalkable(tx, ty) || sim.buildingAt(tx, ty) ||
              sim.trees.some((t: any) => t.standing && Math.hypot(t.x - tx - .5, t.y - ty - .5) < 1.5)) { clear = false; break; }
        }
        if (clear) { const b = sim.place(kind, x, y, p.bandId, null); if (b) { b.complete = true; return b; } }
      }
      throw new Error('Could not place clear fixture: ' + kind);
    };
    const anvil = place('anvil', 3, p.x, p.y, 3, 14);
    const field = place('field', 4, anvil.centerX + 7, anvil.centerY, 5, 14);
    const pen = place('pen', 2, field.centerX, field.centerY + 6, 2, 12);
    pen.store.add('meat', 2);
    p.x = anvil.centerX + 2; p.y = anvil.centerY + .5; p.path = null; p.pathCount = p.pathAt = 0;
    d.camera.snapTo(p.x, p.y); d.camera.following = false;
    p.inventory.add('wrought_iron', 1); p.inventory.add('sticks', 2);
    if (!sim.order(p, 'craft', { recipeId: 'iron_plough', buildingId: anvil.id })) {
      throw new Error('Iron plough craft refused: ' + sim.lastRefusal);
    }
    return { playerId: p.id, anvilId: anvil.id, fieldId: field.id, penId: pen.id };
  });

  const crafted = await page.evaluate(({ playerId, anvilId }) => {
    const sim = (window as any).__dynasty.sim, p = sim.peopleById.get(playerId);
    for (let i = 0; i < 3500 && !p.inventory.count('iron_plough'); i++) {
      p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0; sim.step();
    }
    if (p.inventory.count('iron_plough') !== 1) throw new Error('Smith did not finish iron plough');

    const a = sim.buildings.find((b: any) => b.id === anvilId);
    return { plough: p.inventory.count('iron_plough'), iron: p.inventory.count('wrought_iron'),
      sticks: p.inventory.count('sticks'), anvil: { x: a.centerX, y: a.centerY } };
  }, fixture);
  expect(crafted).toMatchObject({ plough: 1, iron: 0, sticks: 0 });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-item-name', { hasText: /arado de hierro/i })).toContainText('×1');
  await page.evaluate(pos => {
    const d = (window as any).__dynasty; d.renderer.floaters.clear(); d.camera.zoom = 4;
    d.camera.snapTo(pos.x, pos.y); d.camera.following = false;
  }, crafted.anvil);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: SHOTS + '/02-iron-plough-crafted-kit-es.png' });

  const target = await page.evaluate(({ playerId, fieldId, penId }) => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.peopleById.get(playerId);
    const field = sim.buildings.find((b: any) => b.id === fieldId), pen = sim.buildings.find((b: any) => b.id === penId);
    const modulePath = '/src/sim/core/Carry.ts';
    return import(modulePath).then(({ equipContainer }) => { p.inventory.add('basket', 1);

      if (!equipContainer(p, 'basket')) throw new Error('Could not equip seed basket');
      p.inventory.add('grain', 4);
      p.x = field.centerX + 2.5; p.y = field.centerY + .5; p.path = null; p.pathCount = p.pathAt = 0;
      p.workedTicks = 0;
      pen.store.remove('meat', pen.store.count('meat'));
      d.camera.zoom = 4; d.camera.snapTo(field.centerX, field.centerY); d.camera.following = false;
      const rect = document.getElementById('view')!.getBoundingClientRect();
      return { sx: rect.left + d.camera.worldToScreenX(field.centerX + .5),
        sy: rect.top + d.camera.worldToScreenY(field.centerY + .5) };
    });
  }, fixture);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.mouse.click(target.sx, target.sy, { button: 'right' });
  await expect(page.locator('.picker')).toBeVisible();
  await page.locator('.picker-item', { hasText: 'Campo' }).click();
  const ploughAction = page.locator('.radial-item', { hasText: 'Arar y sembrar' }).first();
  await expect(ploughAction).toBeVisible();
  await expect(ploughAction).toHaveClass(/is-disabled/);
  await expect(ploughAction).toHaveAttribute('title', 'no hay una yunta disponible cerca');
  await ploughAction.hover();
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + '/03-no-draft-pair-explained-es.png' });
  await page.keyboard.press('Escape');

  await page.evaluate(({ playerId, penId }) => {
    const sim = (window as any).__dynasty.sim, p = sim.peopleById.get(playerId);
    const pen = sim.buildings.find((b: any) => b.id === penId);
    pen.store.add('meat', 2);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
  }, fixture);
  await page.mouse.click(target.sx, target.sy, { button: 'right' });
  await expect(page.locator('.picker')).toBeVisible();
  await page.locator('.picker-item', { hasText: 'Campo' }).click();
  const enabledPlough = page.locator('.radial-item', { hasText: 'Arar y sembrar' }).first();
  await expect(enabledPlough).toBeVisible();
  await expect(enabledPlough).not.toHaveClass(/is-disabled/);
  await enabledPlough.click();
  const orderedItem = await page.evaluate(({ playerId }) =>
    (window as any).__dynasty.sim.peopleById.get(playerId).targetItemId, fixture);
  expect(orderedItem).toBe('iron_plough');
  const busy = await page.evaluate(async ({ playerId, fieldId, penId }) => {
    const d = (window as any).__dynasty, sim = d.sim, owner = sim.peopleById.get(playerId);
    const field = sim.buildings.find((b: any) => b.id === fieldId), pen = sim.buildings.find((b: any) => b.id === penId);
    for (let i = 0; i < 12; i++) {
      owner.needs.hunger = owner.needs.thirst = owner.needs.cold = owner.needs.fatigue = 0; sim.step();
    }
    const other = sim.livingPeople().find((person: any) => person.id !== playerId && person.bandId === owner.bandId);
    if (!other) throw new Error('No same-band person to verify the reserved draft team');
    const modulePath = '/src/sim/core/Carry.ts';
    const { equipContainer } = await import(modulePath);
    other.equipment.back = undefined;
    other.inventory.add('basket', 1);
    if (!equipContainer(other, 'basket')) throw new Error('Could not equip the comparison seed basket');
    other.inventory.add('iron_plough', 1); other.inventory.add('grain', 4);
    other.knownTech.add('farming'); other.knownTech.add('ploughshare');
    other.techLevel.set('farming', 1); other.techLevel.set('ploughshare', 1);
    return { stock: pen.store.count('meat'), reason: sim.ploughOrderRefusal(other, field) };
  }, fixture);
  expect(busy.stock).toBe(2);
  expect(busy.reason).toBe('la yunta cercana ya está trabajando');



  await page.evaluate(({ fieldId }) => {
    const d = (window as any).__dynasty, sim = d.sim;
    const field = sim.buildings.find((b: any) => b.id === fieldId);
    d.renderer.floaters.clear(); d.camera.zoom = 4;
    d.camera.snapTo(field.centerX, field.centerY); d.camera.following = false;
  }, fixture);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: SHOTS + '/04-iron-plough-at-field-es.png' });
  const result = await page.evaluate(({ playerId, fieldId, penId }) => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.peopleById.get(playerId);
    const field = sim.buildings.find((b: any) => b.id === fieldId), pen = sim.buildings.find((b: any) => b.id === penId);
    for (let i = 0; i < 1200 && field.crop.isFallow; i++) {
      p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0; sim.step();
    }
    d.renderer.floaters.clear(); d.renderer.fogEnabled = false; d.camera.zoom = 4;
    d.camera.snapTo(field.centerX, field.centerY); d.camera.following = false;
    return { stage: field.crop.stage, factor: field.crop.ploughYieldFactor,
      grain: p.inventory.count('grain'), plough: p.inventory.count('iron_plough'), meat: pen.store.count('meat') };
  }, fixture);
  expect(result.stage).not.toBe('fallow');
  expect(result.factor).toBe(1.2);
  expect(result.grain).toBe(0);
  expect(result.plough).toBe(1);
  expect(result.meat).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.evaluate(() => (window as any).__dynasty.renderer.floaters.clear());
  await page.screenshot({ path: SHOTS + '/05-iron-plough-sows-field-es.png' });
});
