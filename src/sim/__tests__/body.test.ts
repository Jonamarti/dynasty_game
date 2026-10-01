/**
 * M15 phase 21a: a body with six parts, written by blows and read by nothing.
 *
 * The claim worth pinning is the "inert" half: choosing a part draws from
 * `healthRng`, a stream of its own, so a blow takes exactly the health it took
 * before and every other stream is where it was.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { BODY_PARTS, newBody, strikePart, wound, worstDamage } from '../entities/Body.ts';

const SMALL = {
  seed: 'body',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 0 },
  population: { bands: 1, peoplePerBand: 4 },
};

describe('a body', () => {
  it('starts whole', () => {
    const body = newBody();
    expect(Object.keys(body).sort()).toEqual([...BODY_PARTS].sort());
    for (const part of BODY_PARTS) expect(body[part]).toEqual({ damage: 0, wound: 'none' });
  });

  it('is wounded by a blow, cumulatively and never past destroyed', () => {
    const body = newBody();
    wound(body, 'left_leg', 0.3);
    expect(body.left_leg).toEqual({ damage: 0.3, wound: 'fresh' });
    wound(body, 'left_leg', 0.9);
    expect(body.left_leg.damage).toBe(1);
    expect(worstDamage(body)).toBe(1);
    expect(body.head.wound).toBe('none');
  });

  it('is struck mostly on the torso and arms, in every part sooner or later', () => {
    const rng = new RNG('strikes');
    const hits = Object.fromEntries(BODY_PARTS.map(p => [p, 0])) as Record<string, number>;
    for (let i = 0; i < 4000; i++) hits[strikePart(rng)]!++;
    for (const part of BODY_PARTS) expect(hits[part]).toBeGreaterThan(0);
    expect(hits.torso).toBeGreaterThan(hits.head! * 2);
  });
});

describe('a blow that lands', () => {
  it('leaves a wound on the victim and takes health as ever', () => {
    const sim = new Simulation(SMALL);
    const [attacker, victim] = sim.livingPeople();
    attacker!.x = victim!.x + 1;
    attacker!.y = victim!.y;
    expect(sim.order(attacker!, 'attack', { personId: victim!.id })).toBe(true);
    for (let i = 0; i < 200 && victim!.health >= 100 && victim!.alive; i++) sim.step();

    expect(victim!.health).toBeLessThan(100);
    expect(worstDamage(victim!.body)).toBeGreaterThan(0);
    expect(BODY_PARTS.some(p => victim!.body[p].wound === 'fresh')).toBe(true);
    // Nobody who was not struck carries a mark.
    for (const part of BODY_PARTS) expect(attacker!.body[part].wound).toBe('none');
  });
});
