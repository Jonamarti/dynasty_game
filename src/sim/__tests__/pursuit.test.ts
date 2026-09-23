/**
 * M11 phase 12b: an attack on somebody some way off.
 *
 * `doAttack` used to test `PURSUIT_LIMIT` (9) on its very first tick, before
 * a step was taken, and `finish` — so an ordered attack on anyone ten tiles
 * away ended where the attacker stood, and nothing said why. The limit was
 * meant to catch a quarry pulling away; these pin that it now does exactly
 * that, and says so.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'pursuit',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 0 },
  population: { bands: 1, peoplePerBand: 4 },
};

/** Puts `who` on a walkable tile about `distance` from `from`, reachable on foot. */
function placeAway(sim: Simulation, from: Person, who: Person, distance: number): void {
  for (let a = 0; a < 32; a++) {
    const angle = (a / 32) * Math.PI * 2;
    const x = Math.round(from.x + Math.cos(angle) * distance);
    const y = Math.round(from.y + Math.sin(angle) * distance);
    if (sim.world.isWalkable(x, y) && sim.world.sameRegion(from.x, from.y, x, y)) {
      who.x = x;
      who.y = y;
      return;
    }
  }
  throw new Error('no walkable tile ' + distance + ' away from the test person');
}

describe('an ordered attack', () => {
  it('sets off after somebody ten tiles away instead of giving up on the spot', () => {
    const sim = new Simulation(SMALL);
    const [attacker, victim] = sim.livingPeople();
    placeAway(sim, attacker!, victim!, 10);

    expect(sim.order(attacker!, 'attack', { personId: victim!.id })).toBe(true);
    const start = attacker!.distanceTo(victim!);
    for (let i = 0; i < 5; i++) sim.step();

    expect(attacker!.order).toBe('attack');
    expect(attacker!.distanceTo(victim!)).toBeLessThan(start + 1);
    expect(sim.interruptions.some(stop => stop.reason === 'target_escaped')).toBe(false);
  });

  it('gives up, and says so, once the quarry opens the gap', () => {
    const sim = new Simulation(SMALL);
    const [attacker, victim] = sim.livingPeople();
    placeAway(sim, attacker!, victim!, 10);
    expect(sim.order(attacker!, 'attack', { personId: victim!.id })).toBe(true);
    sim.step();

    // Well past both the old limit and the start plus its slack.
    placeAway(sim, attacker!, victim!, 20);
    sim.step();

    expect(attacker!.order).toBeNull();
    expect(sim.interruptions.some(stop => stop.reason === 'target_escaped')).toBe(true);
  });
});
