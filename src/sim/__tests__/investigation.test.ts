/**
 * Who killed them — M11 phase 16d.
 *
 * The evidence functions are pure, so they are tested on their own; one case
 * runs the whole thing — a finding opens it, and an investigator standing
 * where the body was names somebody from what the people there say.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { weighEvidence, concludeFrom, SUSPICION_AT } from '../social/Investigation.ts';

const SMALL = {
  seed: 'investigation-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 2, peoplePerBand: 5 },
};

function adult(name: string): Person {
  const p = new Person(name, 10, 10, 0, new RNG('inv-' + name));
  p.age = 30 * p.daysPerYear;
  return p;
}

describe('the evidence', () => {
  it('names whoever was seen bloodied that day, and not the dead', () => {
    const asker = adult('Ann');
    const dead = adult('Bo');
    const killer = adult('Cai');
    asker.seenBloodied.set(killer.id, 1010);
    asker.seenBloodied.set(dead.id, 1010);
    const scores = new Map<number, number>();
    weighEvidence(asker, dead, 1000, false, asker.id, scores);
    expect(scores.has(dead.id)).toBe(false);
    const verdict = concludeFrom(scores);
    expect(verdict?.suspectId).toBe(killer.id);
    expect(verdict!.confidence).toBeLessThan(1);
  });

  it('is not enough on a single old grudge', () => {
    const asker = adult('Ann');
    const dead = adult('Bo');
    const grudger = adult('Cai');
    asker.memory.record({
      id: 999_001, type: 'threaten', actorId: grudger.id, targetId: dead.id,
      x: 0, y: 0, tick: 500, magnitude: 1, witnesses: 1,
    }, true, 1, null);
    const scores = new Map<number, number>();
    weighEvidence(asker, dead, 1000, false, asker.id, scores);
    expect(scores.get(grudger.id)! < SUSPICION_AT).toBe(true);
    expect(concludeFrom(scores)).toBeNull();
  });

  it('never has somebody inform on themselves', () => {
    const killer = adult('Cai');
    const dead = adult('Bo');
    killer.memory.record({
      id: 999_002, type: 'murder', actorId: killer.id, targetId: dead.id,
      x: 0, y: 0, tick: 1000, magnitude: 1, witnesses: 0,
    }, true, 1, null);
    const scores = new Map<number, number>();
    weighEvidence(killer, dead, 1000, true, 12345, scores);
    expect(scores.size).toBe(0);
  });
});

describe('an investigation', () => {
  it('is opened by a bandmate who finds the body, and names the killer a witness saw', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const band0 = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild && !p.isPlayer);
    const [dead, finder, witness] = band0;
    const [killer] = sim.livingPeople().filter(p => p.bandId === 1 && !p.isChild && !p.isPlayer);
    // The killing, seen by the witness.
    dead!.x = 30; dead!.y = 30;
    killer!.x = 31; killer!.y = 30;
    witness!.x = 33; witness!.y = 30;
    finder!.x = 60; finder!.y = 60;
    sim.peopleHash.rebuild(sim.people);
    dead!.die('killed by ' + killer!.name);
    sim.social.emit('murder', killer!, dead!, 1, sim.time.tick, sim.peopleHash, sim.config.sightRadius);
    sim.step();

    // The finder comes upon the body at the turn of the day, with the witness
    // standing by to be asked.
    const perDay = sim.config.time.ticksPerDay;
    const toDay = perDay - (sim.time.tick % perDay) + 1;
    for (let i = 0; i < toDay; i++) {
      for (const p of [finder!, witness!]) {
        p.x = p === finder ? 31 : 34; p.y = 31;
        p.targetX = p.x; p.targetY = p.y;
        p.needs.thirst = 0; p.needs.hunger = 0; p.needs.cold = 0;
      }
      killer!.x = 5; killer!.y = 5;
      sim.step();
    }
    expect(finder!.investigation).not.toBeNull();

    // Left to it.
    for (let i = 0; i < 400 && finder!.investigation !== null; i++) {
      finder!.needs.thirst = 0; finder!.needs.hunger = 0; finder!.needs.cold = 0;
      witness!.x = finder!.x + 2; witness!.y = finder!.y;
      witness!.targetX = witness!.x; witness!.targetY = witness!.y;
      sim.step();
    }
    expect(finder!.investigation).toBeNull();
    expect(finder!.memory.all().some(m =>
      m.type === 'murder' && m.targetId === dead!.id && m.actorId === killer!.id)).toBe(true);
  });
});
