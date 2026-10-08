/**
 * M15 brain commitment: a familiar autonomous NPC says why a real route ended
 * when a more urgent need woke the scorer, and a stranger's need stays private.
 * The captures are the visual record of the translated stop reason.
 */
import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { commitmentGoal, type CommitmentTarget } from '../src/sim/ai/Commitment.ts';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-brain-commitment-2026-10-08T-01';

type Fixture = { personId: number; name: string | null; target: CommitmentTarget };

async function frames(page: Page, count = 4): Promise<void> {
  await page.evaluate(async n => {
    for (let i = 0; i < n; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }, count);
}

async function openGame(page: Page, lang: 'en' | 'es'): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=${lang}`);
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button').filter({ hasText: /Pause|Pausa/ }).click();
}

/** Put a familiar or unknown NPC on a real forage route, then force critical thirst. */
async function routeFixture(page: Page, kind: 'familiar' | 'stranger'): Promise<Fixture> {
  const fixture = await page.evaluate((wanted: 'familiar' | 'stranger') => {
    const d = (window as any).__dynasty, sim = d.sim, me = sim.player;
    const people = sim.livingPeople();
    const person = people.find((candidate: any) => {
      if (candidate.id === me.id) return false;
      const relation = sim.relationships.peek(me.id, candidate.id);
      if (wanted === 'familiar') return candidate.bandId === me.bandId && (relation?.kinship ?? 0) !== 0;
      return candidate.bandId !== me.bandId && relation === null && me.memory.about(candidate.id).length === 0;
    });
    if (!person) return null;

    if (wanted === 'stranger') {
      // Put the first-seen person in the player's actual sight, without creating
      // a relationship or memory of their private life. Hashes and interpolation
      // are refreshed because the browser is paused while this fixture moves them.
      const free = (x: number, y: number) => sim.world.isWalkable(x, y) && !sim.buildingAt(x, y) &&
        people.every((other: any) => other.id === person.id || Math.hypot(other.x - x, other.y - y) > 3) &&
        sim.trees.every((tree: any) => !tree.standing || Math.hypot(tree.x - x, tree.y - y) > 2);
      let spot: { x: number; y: number } | null = null;
      const outerRadius = Math.min(12, sim.config.sightRadius - 1);
      for (let radius = 4; radius < outerRadius && !spot; radius++) {
        for (let angle = 0; angle < 32 && !spot; angle++) {
          const x = Math.round(me.x + Math.cos(angle * Math.PI / 16) * radius);
          const y = Math.round(me.y + Math.sin(angle * Math.PI / 16) * radius);
          if (free(x, y)) spot = { x, y };
        }
      }
      if (!spot) return null;
      person.x = spot.x;
      person.y = spot.y;
      sim.peopleHash.clear();
      for (const other of sim.people) if (other.alive) sim.peopleHash.insert(other);
      d.renderer.interpolator.clear();
    }

    const node = sim.nodes.find((candidate: any) => candidate.kind === 'berries' && candidate.amount > 0 &&
      sim.world.sameRegion(person.x, person.y, candidate.x, candidate.y) &&
      Math.hypot(person.x - candidate.x, person.y - candidate.y) > 3);
    if (!node) return null;

    // This is a live entity target, not a synthetic point. The next simulation
    // tick exercises the real early-wake path before movement can finish the route.
    person.clearTarget();
    person.order = null;
    person.action = 'forage';
    person.actionTimer = 0;
    person.targetNodeId = node.id;
    person.targetX = node.x;
    person.targetY = node.y;
    person.pathCount = 0;
    person.pathAt = 0;
    person.needs.hunger = 0;
    person.needs.thirst = sim.config.needs.criticalThreshold + 2;
    person.needs.cold = 0;
    person.commitment = null;
    sim.interruptions.splice(0, sim.interruptions.length);
    d.renderer.floaters.clear();
    d.camera.following = false;
    d.camera.zoom = 3.2;
    d.camera.snapTo(person.x, person.y);
    return {
      personId: person.id,
      // Never send a stranger's actual name into the test process or use it to select them.
      name: wanted === 'familiar' ? person.name : null,
      target: {
        targetX: person.targetX, targetY: person.targetY, targetNodeId: person.targetNodeId,
        targetTreeId: person.targetTreeId, targetAnimalId: person.targetAnimalId,
        targetBuildingId: person.targetBuildingId, targetPersonId: person.targetPersonId,
        targetPileId: person.targetPileId, targetInscriptionId: person.targetInscriptionId,
        targetRecipe: person.targetRecipe, targetItemId: person.targetItemId,
        targetTech: person.targetTech, targetSubjectId: person.targetSubjectId,
        targetCorpseId: person.targetCorpseId, fleeFromId: person.fleeFromId,
      },
    };
  }, kind);
  expect(fixture, `a ${kind} NPC and a live berry route`).not.toBeNull();
  const goal = commitmentGoal('forage', fixture!.target);
  await page.evaluate(({ personId, goal }) => {
    const person = (window as any).__dynasty.sim.peopleById.get(personId);
    person.commitment = { action: 'forage', drive: 'hunger', baselinePressure: 0.2, goal };
  }, { personId: fixture!.personId, goal });
  await frames(page);
  const at = await page.evaluate(personId => {
    const d = (window as any).__dynasty, person = d.sim.peopleById.get(personId);
    return { x: d.camera.worldToScreenX(person.x), y: d.camera.worldToScreenY(person.y) };
  }, fixture!.personId);
  await page.mouse.click(at.x, at.y);
  const personChoice = fixture!.name !== null
    ? page.locator('.picker-item').filter({ hasText: fixture!.name }).first()
    : page.locator('.picker-item').filter({
      has: page.locator('.picker-icon', { hasText: '👤' }),
    }).first();
  await expect(personChoice).toBeVisible({ timeout: 10_000 });
  await personChoice.click();
  if (fixture!.name !== null) {
    await expect(page.locator('.hud-name')).toContainText(fixture!.name, { timeout: 10_000 });
  }
  return fixture!;
}

async function stopTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__dynasty.renderer.floaters.items.map((item: any) => item.text));
}

test('a selected, familiar NPC explains the urgent stop in English and Spanish; player orders remain explicit', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page, 'en');
  const npc = await routeFixture(page, 'familiar');

  const order = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim, player = sim.player;
    player.needs.hunger = 0; player.needs.thirst = 0; player.needs.cold = 0;
    return sim.order(player, 'rest');
  });
  expect(order).toBe(true);
  await page.evaluate(() => (window as any).__dynasty.sim.step());
  await expect(page.locator('.hud-stopped')).toContainText('they stopped for a drink', { timeout: 10_000 });
  expect((await stopTexts(page)).some(text => text.includes('they stopped for a drink'))).toBe(true);
  expect(await page.evaluate(() => (window as any).__dynasty.sim.player.order)).toBe('rest');
  await page.screenshot({ path: `${SHOTS}/01-familiar-npc-stops-for-thirst-en.png` });

  await openGame(page, 'es');
  const spanishNpc = await routeFixture(page, 'familiar');
  await page.evaluate(() => (window as any).__dynasty.sim.step());
  await expect(page.locator('.hud-stopped')).toContainText('paró a beber', { timeout: 10_000 });
  expect((await stopTexts(page)).some(text => text.includes('paró a beber'))).toBe(true);
  await page.screenshot({ path: `${SHOTS}/02-familiar-npc-stops-for-thirst-es.png` });
  expect(spanishNpc.personId).toBe(npc.personId);
});

test('a selected stranger’s autonomous need remains private', async ({ page }) => {
  await openGame(page, 'en');
  const stranger = await routeFixture(page, 'stranger');
  expect(stranger.name).toBeNull();
  const knowledge = await page.evaluate(personId => {
    const sim = (window as any).__dynasty.sim;
    return { relationship: sim.relationships.peek(sim.player.id, personId), memories: sim.player.memory.about(personId).length };
  }, stranger.personId);
  expect(knowledge.relationship).toBeNull();
  expect(knowledge.memories).toBe(0);

  await page.evaluate(() => (window as any).__dynasty.sim.step());
  await frames(page);
  await expect(page.locator('.hud-stopped')).toHaveCount(0);
  expect((await stopTexts(page)).some(text => text.includes('they stopped for a drink'))).toBe(false);
});
