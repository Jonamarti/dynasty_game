import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { ageSpeed, canCrawl, canForage, canHunt, canWalk } from '../entities/LifeStage.ts';
import { lastScores } from '../ai/Brain.ts';
import type { Person } from '../entities/Person.ts';

/** M15 phase 20, the owner's timeline of 2026-09-30. */
describe('growing up', () => {
  const sim = new Simulation({ seed: 'stages', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 } });
  const child = sim.people[1]! as Person;
  const c = sim.config.childhood;
  const at = (years: number) => { child.age = years * child.daysPerYear; return child; };

  it('crawls at ten months, walks at one, forages at four, hunts at eight', () => {
    expect(canCrawl(at(0.8), c)).toBe(false);
    expect(canCrawl(at(0.85), c)).toBe(true);
    expect(canWalk(at(0.9), c)).toBe(false);
    expect(canWalk(at(1), c)).toBe(true);
    expect(canForage(at(3.9), c)).toBe(false);
    expect(canForage(at(4), c)).toBe(true);
    expect(canHunt(at(7.9), c)).toBe(false);
    expect(canHunt(at(8), c)).toBe(true);
  });

  it('moves slower the younger they are, and as an adult from twelve', () => {
    expect(ageSpeed(at(0.5), c)).toBe(0);
    const speeds = [0.9, 2, 5, 8, 10, 12].map(y => ageSpeed(at(y), c));
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeGreaterThan(speeds[i - 1]!);
    expect(ageSpeed(at(8), c)).toBeLessThan(1);
    expect(ageSpeed(at(12), c)).toBe(1);
  });
});

describe('what a small child does', () => {
  function world(seed: string) {
    const sim = new Simulation({ seed, world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 5 } });
    const [a, b] = [sim.people[2]!, sim.people[3]!] as [Person, Person];
    for (const kid of [a, b]) {
      kid.age = 3 * kid.daysPerYear;
      kid.x = sim.people[0]!.x;
      kid.y = sim.people[0]!.y;
      kid.needs.hunger = 0;
      kid.needs.thirst = 0;
      kid.needs.fatigue = 0;
      kid.order = null;
    }
    b.x += 1;
    return { sim, a, b };
  }

  it('is never offered foraging, picking, taking from a store or hunting before four', () => {
    const { sim, a } = world('small-child-choices');
    a.needs.hunger = 80;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      sim.step();
      for (const row of lastScores.get(a.id) ?? []) seen.add(row.id);
    }
    for (const verb of ['forage', 'pick', 'take', 'hunt', 'chop', 'gather']) expect(seen.has(verb)).toBe(false);
  });

  it('plays with another child, and both come away less lonely', () => {
    const { sim, a, b } = world('small-child-play');
    a.needs.company = 80;
    b.needs.company = 80;
    a.action = 'romp';
    a.targetPersonId = b.id;
    a.targetX = b.x;
    a.targetY = b.y;
    a.order = 'romp';
    for (let i = 0; i < 80 && a.action === 'romp'; i++) sim.step();
    expect(b.needs.company).toBeLessThan(80);
    expect(a.needs.company).toBeLessThan(80);
  });
});
