/** M15 phase 41: an autonomous attack stops and explains when its target is unconscious. */
import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const SHOTS = 'artifacts/screenshots/m15-attack-response-2026-10-16';

async function openGame(page: Page, lang: 'en' | 'es'): Promise<number> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/?seed=m15-attack-response&skipIntro=1&defaults=1&lang=${lang}`);
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button').filter({ hasText: /Pause|Pausa/ }).click();

  const fixture = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, player = sim.player;
    const attacker = sim.livingPeople().find((person: any) => person.id !== player.id &&
      person.bandId === player.bandId && sim.relationships.peek(player.id, person.id)?.kinship);
    const target = sim.livingPeople().find((person: any) => person.bandId !== player.bandId && !person.isChild);
    if (!attacker || !target) return null;

    const x = Math.floor(player.x), y = Math.floor(player.y);
    attacker.x = x + 1;
    attacker.y = y;
    target.x = x + 2;
    target.y = y;
    for (const person of [attacker, target]) {
      person.needs.hunger = 0;
      person.needs.thirst = 0;
      person.needs.cold = 0;
      person.needs.fatigue = 0;
      person.needs.company = 0;
    }
    attacker.clearTarget();
    attacker.order = null;
    attacker.commitment = null;
    attacker.action = 'attack';
    attacker.targetPersonId = target.id;
    attacker.actionTimer = 1;
    target.action = 'idle';
    target.actionTimer = 0;
    target.knockedOutUntil = sim.time.tick + 100;
    sim.peopleHash.clear();
    for (const person of sim.people) if (person.alive) sim.peopleHash.insert(person);
    sim.interruptions.splice(0, sim.interruptions.length);
    d.renderer.floaters.clear();
    d.renderer.fogEnabled = false;
    d.camera.following = false;
    d.camera.zoom = 3.2;
    d.camera.snapTo(attacker.x, attacker.y);
    return { id: attacker.id, name: attacker.name };
  });
  expect(fixture, 'a familiar adult and an adult in the neighboring band').not.toBeNull();

  const at = await page.evaluate(id => {
    const d = (window as any).__dynasty, person = d.sim.peopleById.get(id);
    return { x: d.camera.worldToScreenX(person.x), y: d.camera.worldToScreenY(person.y) };
  }, fixture!.id);
  await page.mouse.click(at.x, at.y);
  await page.locator('.picker-item').filter({ hasText: fixture!.name }).first().click();
  await expect(page.locator('.hud-name')).toContainText(fixture!.name, { timeout: 10_000 });
  return fixture!.id;
}

test('a familiar autonomous attacker says why it stopped in English and Spanish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });

  for (const [index, lang] of (['en', 'es'] as const).entries()) {
    const attackerId = await openGame(page, lang);
    await page.evaluate(() => (window as any).__dynasty.sim.step());

    const expected = lang === 'en'
      ? 'they could not go on beating someone unconscious'
      : 'no pudo seguir golpeando a alguien inconsciente';
    await expect(page.locator('.hud-stopped')).toContainText(expected, { timeout: 10_000 });
    await expect.poll(() => page.evaluate(text => (window as any).__dynasty.renderer.floaters.items
      .some((item: any) => item.text.includes(text)), expected)).toBe(true);
    const action = await page.evaluate(id => (window as any).__dynasty.sim.peopleById.get(id).action, attackerId);
    expect(action).toBe('idle');
    await page.screenshot({ path: `${SHOTS}/0${index + 1}-autonomous-attack-stopped-${lang}.png` });
  }
});
