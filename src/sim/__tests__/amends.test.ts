/**
 * What a wrong leaves owing, and paying it — M12 phase 2a. See
 * `social/Amends.ts`.
 */
import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { Simulation } from '../core/Simulation.ts';
import { incur, debtTo, offerFor, acceptance, settleDebt, pruneDebts } from '../social/Amends.ts';
import { ITEMS } from '../entities/Item.ts';

function adult(name: string, band: number): Person {
  const person = new Person(name, 10, 10, band, new RNG('a-' + name));
  person.age = 30 * person.daysPerYear;
  return person;
}

describe('a debt', () => {
  it('adds up what one person owes another, keeping the goods taken', () => {
    const thief = adult('Ann', 0);
    const victim = adult('Bo', 1);
    incur(thief, victim, 'theft', 3, 100, { itemId: 'berries', count: 3 });
    incur(thief, victim, 'assault', 6, 200);
    const debt = debtTo(thief, victim.id)!;
    expect(debt.worth).toBe(9);
    expect(debt.kind).toBe('assault');
    expect(debt.goods).toEqual([{ itemId: 'berries', count: 3 }]);
    expect(debt.toBandId).toBe(1);
  });

  it('is never run up by a child', () => {
    const child = adult('Cai', 0);
    child.age = 6 * child.daysPerYear;
    incur(child, adult('Dan', 1), 'theft', 3, 100);
    expect(child.debts.length).toBe(0);
  });

  it('is forgotten once the one owed is dead, or after a year', () => {
    const thief = adult('Ann', 0);
    const victim = adult('Bo', 1);
    incur(thief, victim, 'theft', 3, 0);
    pruneDebts(thief, 100, 240, () => true);
    expect(thief.debts.length).toBe(1);
    pruneDebts(thief, 41 * 240, 240, () => true);
    expect(thief.debts.length).toBe(0);
    incur(thief, victim, 'theft', 3, 0);
    pruneDebts(thief, 100, 240, () => false);
    expect(thief.debts.length).toBe(0);
  });
});

describe('an offer', () => {
  it('hands back what was taken first, and never more than is owed', () => {
    const thief = adult('Ann', 0);
    const victim = adult('Bo', 1);
    thief.inventory.add('berries', 2);
    thief.inventory.add('flint', 10);
    incur(thief, victim, 'theft', 4, 0, { itemId: 'berries', count: 4 });
    const offer = offerFor(thief, debtTo(thief, victim.id)!);
    expect(offer.items[0]).toEqual(['berries', 2]);
    expect(offer.value).toBeGreaterThanOrEqual(4);
    expect(offer.value).toBeLessThan(4 + 10);
  });

  it('is taken more readily when it is whole and the wronged are mild', () => {
    const payer = adult('Ann', 0);
    const owed = adult('Bo', 1);
    owed.traits.malice = 0;
    owed.traits.aggression = 0;
    const mild = acceptance(owed, payer, 10, 10, 0);
    owed.traits.malice = 1;
    owed.traits.aggression = 1;
    const bitter = acceptance(owed, payer, 10, 10, 0);
    expect(mild).toBe(1);
    expect(bitter).toBeLessThan(0.3);
    expect(acceptance(owed, payer, 5, 10, 0)).toBeLessThan(bitter);
  });
});

describe('making amends', () => {
  const SMALL = {
    seed: 'amends-test',
    world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
    population: { bands: 2, peoplePerBand: 4 },
  };

  it('squares a debt, moves the goods, and softens the one who was wronged', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const payer = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild)!;
    const owed = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    owed.traits.malice = 0;
    owed.traits.aggression = 0;
    owed.x = payer.x + 1;
    owed.y = payer.y;
    payer.inventory.add('flint', 6);
    // Worth what was taken, as `doSteal` writes it.
    incur(payer, owed, 'theft', ITEMS.flint!.baseValue * 4, sim.time.tick, { itemId: 'flint', count: 4 });
    sim.relationships.addDeed(owed.id, payer.id, -40, sim.time.tick);
    const before = sim.relationships.opinion(owed.id, payer.id);
    const flintBefore = owed.inventory.count('flint');

    expect(sim.order(payer, 'make_amends', { personId: owed.id })).toBe(true);
    for (let i = 0; i < 40 && payer.debts.length > 0; i++) {
      for (const p of [payer, owed]) {
        p.needs.thirst = 0; p.needs.hunger = 0; p.needs.cold = 0; p.needs.fatigue = 0;
      }
      owed.x = payer.x + 1;
      owed.y = payer.y;
      sim.step();
    }
    expect(payer.debts.length).toBe(0);
    expect(owed.inventory.count('flint')).toBe(flintBefore + 4);
    expect(sim.relationships.opinion(owed.id, payer.id)).toBeGreaterThan(before);
  });

  it('is refused aloud to somebody who owes nothing', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const payer = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild)!;
    const other = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    other.x = payer.x + 1;
    other.y = payer.y;
    settleDebt(payer, other.id);
    sim.order(payer, 'make_amends', { personId: other.id });
    sim.step();
    expect(payer.action).not.toBe('make_amends');
  });
});
