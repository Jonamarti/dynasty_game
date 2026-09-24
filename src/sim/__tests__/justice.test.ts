/**
 * The chief as judge — M12 phase 2b. See `social/Justice.ts`.
 */
import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { Simulation } from '../core/Simulation.ts';
import { incur } from '../social/Amends.ts';
import { judgeOwn, answerDemand, PARTIAL_AT } from '../social/Justice.ts';

function adult(name: string, band: number): Person {
  const person = new Person(name, 10, 10, band, new RNG('j-' + name));
  person.age = 30 * person.daysPerYear;
  return person;
}

describe('a chief judging their own', () => {
  it('orders amends when the accused can pay, and shames them when not', () => {
    const rels = new RelationshipGraph();
    const [chief, plaintiff, accused] = [adult('Ann', 0), adult('Bo', 0), adult('Cai', 0)];
    expect(judgeOwn(chief, plaintiff, accused, rels, true)).toBe('order');
    expect(judgeOwn(chief, plaintiff, accused, rels, false)).toBe('shame');
  });

  it('will not hear it against somebody they favour far above the one wronged', () => {
    const rels = new RelationshipGraph();
    const [chief, plaintiff, accused] = [adult('Ann', 0), adult('Bo', 0), adult('Cai', 0)];
    rels.addDeed(chief.id, accused.id, PARTIAL_AT + 10, 0);
    expect(judgeOwn(chief, plaintiff, accused, rels, true)).toBe('dismiss');
  });
});

describe('a chief answering another people', () => {
  it('pays a people that minds strangers, and refuses one that thinks them fair game', () => {
    const rels = new RelationshipGraph();
    const [chief, accused] = [adult('Ann', 0), adult('Cai', 0)];
    chief.traits.tradition = 0.5;
    expect(answerDemand(chief, accused, 0.8, 0, rels, true)).toBe('order');
    expect(answerDemand(chief, accused, 0.2, 0, rels, true)).toBe('refuse');
  });

  it('refuses a people it is at odds with, whatever its ways', () => {
    const rels = new RelationshipGraph();
    const [chief, accused] = [adult('Ann', 0), adult('Cai', 0)];
    chief.traits.tradition = 0.5;
    expect(answerDemand(chief, accused, 0.6, -60, rels, true)).toBe('refuse');
  });
});

describe('a wrong, told and carried', () => {
  const SMALL = {
    seed: 'justice-test',
    world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
    population: { bands: 2, peoplePerBand: 5 },
  };

  function calm(...people: Person[]): void {
    for (const p of people) {
      p.needs.thirst = 0; p.needs.hunger = 0; p.needs.cold = 0; p.needs.fatigue = 0;
    }
  }

  it('reaches the chief only by being told, and goes on the docket against a stranger', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 300; i++) sim.step();
    const chiefId = sim.bandSystem.chiefByBand.get(0)!;
    const chief = sim.peopleById.get(chiefId)!;
    const plaintiff = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild && p.id !== chiefId)!;
    const stranger = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    incur(stranger, plaintiff, 'theft', 4, sim.time.tick, { itemId: 'berries', count: 4 });

    // Not known to the chief until it is said.
    expect(chief.docket.length).toBe(0);
    expect(sim.order(plaintiff, 'complain', { personId: chief.id })).toBe(true);
    for (let i = 0; i < 60 && plaintiff.grievances.some(g => !g.lodged); i++) {
      calm(plaintiff, chief);
      plaintiff.x = chief.x + 1;
      plaintiff.y = chief.y;
      sim.step();
    }
    expect(chief.docket.some(c => c.accusedId === stranger.id && c.plaintiffId === plaintiff.id)).toBe(true);
  });

  it('is carried home by whoever of the other people it is put to', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 300; i++) sim.step();
    const chief = sim.peopleById.get(sim.bandSystem.chiefByBand.get(0)!)!;
    const otherChiefId = sim.bandSystem.chiefByBand.get(1);
    const plaintiff = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild && p.id !== chief.id)!;
    const [accused, envoy] = sim.livingPeople()
      .filter(p => p.bandId === 1 && !p.isChild && p.id !== otherChiefId);
    incur(accused!, plaintiff, 'theft', 4, sim.time.tick);
    chief.docket.push({
      plaintiffId: plaintiff.id, plaintiffBandId: 0, accusedId: accused!.id, accusedBandId: 1,
      kind: 'theft', tick: sim.time.tick,
    });

    expect(sim.order(chief, 'parley', { personId: envoy!.id })).toBe(true);
    for (let i = 0; i < 60 && chief.docket.length > 0; i++) {
      calm(chief, envoy!);
      envoy!.x = chief.x + 1;
      envoy!.y = chief.y;
      sim.step();
    }
    expect(chief.docket.length).toBe(0);
    expect(envoy!.carriedDemand?.accusedId).toBe(accused!.id);
  });
});

describe('pending player verdicts', () => {
  function pendingCase() {
    const sim = new Simulation({
      seed: 'justice-test',
      world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 2, peoplePerBand: 5 },
    });
    const [chief, plaintiff, accused] = sim.livingPeople().filter(p => p.bandId === 0);
    chief!.isPlayer = true;
    sim.bandSystem.chiefByBand.set(0, chief!.id);
    const told = {
      plaintiffId: plaintiff!.id, plaintiffBandId: 0,
      accusedId: accused!.id, accusedBandId: 0,
      kind: 'theft' as const, tick: sim.time.tick,
    };
    sim.pendingVerdicts.push(told);
    return { sim, chief: chief!, plaintiff: plaintiff!, accused: accused!, told };
  }

  it.each(['accused', 'plaintiff'] as const)('rejects a verdict after the %s changes bands', role => {
    const setup = pendingCase();
    setup[role].bandId = 1;
    expect(setup.sim.resolveVerdict(setup.chief, setup.told, 'shame')).toBe(false);
    expect(setup.sim.lastRefusal).toBeTruthy();
  });

  it('removes a dead party from the queue and exposes the next case', () => {
    const { sim, chief, accused, told } = pendingCase();
    const replacement = sim.livingPeople().find(p => p.bandId === 0 &&
      p.id !== chief.id && p.id !== told.plaintiffId && p.id !== accused.id)!;
    const next = { ...told, accusedId: replacement.id };
    sim.pendingVerdicts.push(next);
    accused.alive = false;
    expect(sim.pendingVerdictFor(chief)).toBe(next);
    expect(sim.pendingVerdicts).toEqual([next]);
    expect(sim.insights.some(note => note.personId === chief.id)).toBe(true);
  });

  it('does not offer judgments after the player loses office', () => {
    const { sim, chief, plaintiff } = pendingCase();
    sim.bandSystem.chiefByBand.set(chief.bandId, plaintiff.id);
    expect(sim.pendingVerdictFor(chief)).toBeNull();
  });
});
