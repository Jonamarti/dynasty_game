/**
 * The body stays — M11 phase 16 (owner's note 1).
 *
 * 16a: every death leaves a body where it happened, and the person still
 * leaves `people` exactly as before, so nothing that loops over the living
 * has to learn about the dead.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

const SMALL = {
  seed: 'corpse-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 2, peoplePerBand: 4 },
};

describe('a body', () => {
  it('is left where somebody died, and they leave the living as before', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [victim] = sim.livingPeople().filter(p => !p.isPlayer);
    const x = victim!.x;
    const y = victim!.y;
    victim!.die('killed by nobody in particular');
    sim.step();

    expect(sim.people.includes(victim!)).toBe(false);
    expect(sim.corpses.length).toBe(1);
    const corpse = sim.corpses[0]!;
    expect(corpse.person).toBe(victim);
    expect(corpse.x).toBe(x);
    expect(corpse.y).toBe(y);
    expect(corpse.wounded).toBe(true);
    expect(sim.corpseHash.findNearest(x, y, 1)).toBe(corpse);
  });

  it('shows no wound on somebody who died of age', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [elder] = sim.livingPeople().filter(p => !p.isPlayer);
    elder!.die('old age');
    sim.step();
    expect(sim.corpses[0]?.wounded).toBe(false);
  });
});

// M11 phase 16b.
import { stageOf, DISMEMBER_WORK, FRESH_DAYS, BONES_AFTER } from '../entities/Corpse.ts';
import { corpseIdentity } from '../social/Knowledge.ts';

function aBody(): { sim: Simulation; mourner: import('../entities/Person.ts').Person;
  body: import('../entities/Corpse.ts').Corpse } {
  const sim = new Simulation(SMALL);
  for (let i = 0; i < 5; i++) sim.step();
  const [victim, mourner] = sim.livingPeople().filter(p => !p.isPlayer && p.bandId === 0 && !p.isChild);
  // Knew them well, not kin.
  sim.relationships.edge(mourner!.id, victim!.id).familiarity = 40;
  victim!.die('old age');
  sim.step();
  return { sim, mourner: mourner!, body: sim.corpses[0]! };
}

describe('what time and a blade do to a body', () => {
  it('goes over, then to bones, and stops saying whose it was', () => {
    const { sim, mourner, body } = aBody();
    const perDay = sim.config.time.ticksPerDay;
    expect(stageOf(body, body.diedTick, perDay)).toBe('fresh');
    expect(corpseIdentity(mourner, body, sim.relationships, 'fresh').identified).toBe(true);
    expect(stageOf(body, body.diedTick + FRESH_DAYS * perDay, perDay)).toBe('decayed');
    // Known well enough to know them gone over.
    expect(corpseIdentity(mourner, body, sim.relationships, 'decayed').identified).toBe(true);
    expect(stageOf(body, body.diedTick + BONES_AFTER * perDay, perDay)).toBe('bones');
    expect(corpseIdentity(mourner, body, sim.relationships, 'bones').identified).toBe(false);
  });

  it('is cut up past knowing, the work banked on the body', () => {
    const { sim, mourner, body } = aBody();
    const [butcher] = sim.livingPeople().filter(p => p.id !== mourner.id && !p.isChild);
    butcher!.x = body.x + 1;
    butcher!.y = body.y;
    expect(sim.order(butcher!, 'dismember', { corpseId: body.id })).toBe(true);
    for (let i = 0; i < 20; i++) {
      butcher!.needs.thirst = 0; butcher!.needs.hunger = 0; butcher!.needs.cold = 0;
      sim.step();
    }
    const banked = body.dismemberWork;
    expect(banked).toBeGreaterThan(0);
    // Called away: the work stays on the body.
    butcher!.needs.thirst = 100;
    for (let i = 0; i < 3; i++) sim.step();
    expect(body.dismemberWork).toBeGreaterThanOrEqual(banked);
    body.dismemberWork = DISMEMBER_WORK;
    butcher!.needs.thirst = 0;
    expect(sim.order(butcher!, 'dismember', { corpseId: body.id })).toBe(true);
    for (let i = 0; i < 10 && !body.dismembered; i++) sim.step();
    expect(body.dismembered).toBe(true);
    expect(corpseIdentity(mourner, body, sim.relationships, 'fresh').identified).toBe(false);
  });

  it('is gone once dragged into the water', () => {
    const { sim, body } = aBody();
    const [dragger] = sim.livingPeople().filter(p => !p.isChild);
    dragger!.x = body.x;
    dragger!.y = body.y;
    expect(sim.order(dragger!, 'drag', { corpseId: body.id })).toBe(true);
    for (let i = 0; i < 2000 && dragger!.order !== null; i++) {
      dragger!.needs.thirst = 0; dragger!.needs.hunger = 0; dragger!.needs.cold = 0;
      dragger!.needs.fatigue = 0;
      sim.step();
    }
    expect(sim.corpsesById.has(body.id)).toBe(false);
  });
});
