import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { itemCapacityFor, capacityFor } from '../core/Carry.ts';
import { Person } from '../entities/Person.ts';
import {
  HEAVY_ACTIONS, gestationDays, handfulsOnly, pregnancyPace, showing, tooHeavyForHer, trimesterOf,
} from '../entities/Pregnancy.ts';
import { RNG } from '../core/RNG.ts';

/** A woman `along` of the way through a pregnancy (0 to 1). */
function expecting(along: number): Person {
  const woman = new Person('Mother', 0, 0, 0, new RNG('pregnancy-test'));
  woman.pregnant = true;
  woman.gestationLeft = gestationDays(woman) * (1 - along);
  return woman;
}

/** M15 phase 19a: the three thirds of a pregnancy and what each costs. */
describe('M15 phase 19a: the thirds of a pregnancy', () => {
  it('reads the third off how much of the span is spent', () => {
    expect(trimesterOf(new Person('Not', 0, 0, 0, new RNG('x')))).toBe(0);
    expect(trimesterOf(expecting(0))).toBe(1);
    expect(trimesterOf(expecting(0.32))).toBe(1);
    expect(trimesterOf(expecting(0.34))).toBe(2);
    expect(trimesterOf(expecting(0.66))).toBe(2);
    expect(trimesterOf(expecting(0.68))).toBe(3);
    expect(trimesterOf(expecting(0.99))).toBe(3);
  });

  it('survives a pregnancy set by hand outside the span', () => {
    const odd = expecting(0);
    odd.gestationLeft = 1e6;
    expect(trimesterOf(odd)).toBe(1);
    odd.gestationLeft = -3;
    expect(trimesterOf(odd)).toBe(3);
  });

  it('slows her 0.85 in the second third and 0.7 in the last, and not at all in the first', () => {
    expect(pregnancyPace(expecting(0.1))).toBe(1);
    expect(pregnancyPace(expecting(0.5))).toBe(0.85);
    expect(pregnancyPace(expecting(0.9))).toBe(0.7);
    expect(pregnancyPace(new Person('Not', 0, 0, 0, new RNG('x')))).toBe(1);
  });

  it('applies the pace to the one speed every walk shares', () => {
    const sim = new Simulation({ seed: 'pregnancy-pace', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 6 } });
    const woman = sim.people.find(p => p.sex === 'female' && !p.isChild)!;
    const speedOf = (p: Person) => (sim as unknown as { movementSystem: { speedOf(p: Person): number } })
      .movementSystem.speedOf(p);
    const free = speedOf(woman);
    woman.pregnant = true;
    woman.gestationLeft = gestationDays(woman) * 0.5;
    expect(speedOf(woman)).toBeCloseTo(free * 0.85, 10);
    woman.gestationLeft = gestationDays(woman) * 0.1;
    expect(speedOf(woman)).toBeCloseTo(free * 0.7, 10);
  });

  it('names the heavy work in one list, and leaves the gentle work out of it', () => {
    for (const heavy of ['hunt', 'chop', 'build', 'attack', 'spar', 'sabotage', 'restrain', 'drag']) {
      expect(HEAVY_ACTIONS.has(heavy)).toBe(true);
    }
    for (const gentle of ['forage', 'gather', 'pick', 'craft', 'talk', 'teach', 'sow', 'reap']) {
      expect(HEAVY_ACTIONS.has(gentle)).toBe(false);
    }
  });

  it('vetoes the heavy work only in the last third', () => {
    expect(tooHeavyForHer(expecting(0.1), 'hunt')).toBe(false);
    expect(tooHeavyForHer(expecting(0.5), 'hunt')).toBe(false);
    expect(tooHeavyForHer(expecting(0.9), 'hunt')).toBe(true);
    expect(tooHeavyForHer(expecting(0.9), 'forage')).toBe(false);
    expect(tooHeavyForHer(new Person('Not', 0, 0, 0, new RNG('x')), 'hunt')).toBe(false);
  });

  it('shows to a stranger only in the last third', () => {
    expect(showing(expecting(0.5))).toBe(false);
    expect(showing(expecting(0.9))).toBe(true);
    expect(handfulsOnly(expecting(0.9))).toBe(true);
  });

  it('carries handfuls only in the last third: no armful, nothing on the shoulder', () => {
    const carry = makeConfig().carry;
    const free = new Person('Free', 0, 0, 0, new RNG('carry-free'));
    const heavy = expecting(0.9);
    // Timber needs both arms or the shoulder; berries are a handful or an armful.
    expect(itemCapacityFor(free, carry, 'wood')).toBeGreaterThan(0);
    expect(itemCapacityFor(heavy, carry, 'wood')).toBe(0);
    expect(itemCapacityFor(heavy, carry, 'meat')).toBeLessThan(itemCapacityFor(free, carry, 'meat'));
    expect(capacityFor(heavy, carry)).toBeLessThan(capacityFor(free, carry));
    // The first two thirds change nothing.
    expect(itemCapacityFor(expecting(0.5), carry, 'wood')).toBe(itemCapacityFor(free, carry, 'wood'));
  });
});

/** Women held in their last third for a few days: what do they start doing? */
describe('M15 phase 19a: the scorer spares them', () => {
  function startedHeavy(spare: boolean): { starts: number; heavy: string[] } {
    const sim = new Simulation({ seed: 'pregnancy-brain', world: { width: 64, height: 64 },
      population: { bands: 1, peoplePerBand: 12 } });
    const women = sim.people.filter(p => p.sex === 'female' && !p.isChild);
    const was = new Map<number, string>();
    const heavy: string[] = [];
    let starts = 0;
    for (let tick = 0; tick < 900; tick++) {
      if (spare) {
        for (const w of women) {
          w.pregnant = true;
          w.pregnantBy = null;
          w.gestationLeft = gestationDays(w) * 0.1;
        }
      }
      sim.step();
      for (const w of women) {
        if (w.action !== was.get(w.id)) {
          starts++;
          if (spare && HEAVY_ACTIONS.has(w.action)) heavy.push(w.action);
        }
        was.set(w.id, w.action);
      }
    }
    return { starts, heavy };
  }

  it('starts no heavy task in her last third', () => {
    const run = startedHeavy(true);
    expect(run.starts).toBeGreaterThan(20);
    expect(run.heavy).toEqual([]);
  });
});
