/**
 * M15 phase 22: a bad meal. The chance belongs to the food, so roast meat is
 * safe because it is absent from `SICKENS`, not because the code exempts it —
 * and a build that gave it a risk would show as an illness after something
 * cooked, which is exactly what `raw-meat-sickens` looks for.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { consumeFood, appealOf } from '../core/Macros.ts';
import {
  SICKENS, sicken, poisonDaily, poisonGrade, poisonDrain, poisonWork, type Condition,
} from '../entities/Body.ts';

const SMALL = {
  seed: 'poison',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 0 },
  population: { bands: 1, peoplePerBand: 4 },
};

describe('food that can make you ill', () => {
  it('is raw meat and raw fish, and nothing cooked', () => {
    expect(SICKENS.meat).toBeGreaterThan(0);
    expect(SICKENS.fish).toBeGreaterThan(0);
    for (const safe of ['roast_meat', 'roast_fish', 'berries', 'meal', 'bread']) {
      expect(SICKENS[safe]).toBeUndefined();
    }
  });

  it('draws once for a risky food whatever happens, and never for a safe one', () => {
    let draws = 0;
    const rng = { next: () => { draws++; return 0.99; } } as RNG;
    const conditions: Condition[] = [];
    expect(sicken(conditions, 'meat', rng)).toBeNull();
    expect(draws).toBe(1);
    expect(sicken(conditions, 'roast_meat', rng)).toBeNull();
    expect(draws).toBe(1);
  });

  it('makes about one raw meal in nine ill, in grades, the unluckiest severe', () => {
    const rng = new RNG('raw-meals');
    const grades = { mild: 0, moderate: 0, severe: 0 };
    let ill = 0;
    for (let i = 0; i < 5000; i++) {
      const c = sicken([], 'meat', rng);
      if (c) { ill++; grades[c.severity]++; }
    }
    expect(ill / 5000).toBeGreaterThan(0.09);
    expect(ill / 5000).toBeLessThan(0.15);
    expect(grades.mild).toBeGreaterThan(grades.moderate);
    expect(grades.moderate).toBeGreaterThan(grades.severe);
    expect(grades.severe).toBeGreaterThan(0);
  });

  it('would be caught if roast meat carried a risk (the check\'s control)', () => {
    const rng = new RNG('broken-build');
    let ill = 0;
    const risky = { ...SICKENS, roast_meat: 0.12 };
    const saved = SICKENS as Record<string, number>;
    const original = saved.roast_meat;
    saved.roast_meat = risky.roast_meat;
    try {
      for (let i = 0; i < 500; i++) if (sicken([], 'roast_meat', rng)) ill++;
    } finally {
      if (original === undefined) delete saved.roast_meat; else saved.roast_meat = original;
    }
    expect(ill).toBeGreaterThan(0);
    expect(SICKENS.roast_meat).toBeUndefined();
  });

  it('is one illness however many bad meals, and runs its days out', () => {
    const conditions: Condition[] = [];
    const always = { next: () => 0.0 } as RNG; // share 0: severe
    const first = sicken(conditions, 'meat', always)!;
    sicken(conditions, 'fish', always);
    expect(conditions).toHaveLength(1);
    expect(first.severity).toBe('severe');
    expect(poisonGrade(conditions)).toBe(3);
    expect(poisonDrain(conditions)).toBeGreaterThan(0);
    expect(poisonWork(conditions)).toBeLessThan(0.5);
    for (let day = 0; day < 3; day++) expect(poisonDaily(conditions)).toBeNull();
    expect(poisonDaily(conditions)).not.toBeNull();
    expect(conditions).toHaveLength(0);
    expect(poisonGrade(conditions)).toBe(0);
  });
});

describe('eating a bad meal', () => {
  it('brings the meal back up, teaches the eater to be wary, and is chronicled', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    const rng = { next: () => 0.0 } as RNG; // always ill
    person.inventory.add('meat', 2);
    person.needs.hunger = 60;
    const before = appealOf(person, 'meat');
    expect(consumeFood(person, 'meat', 100, true, rng)).toBe(true);
    expect(person.conditions.some(c => c.kind === 'poisoning')).toBe(true);
    // 30 nutrition eaten, 30 back: hunger is where it was.
    expect(person.needs.hunger).toBeGreaterThanOrEqual(59);
    expect(person.beliefs.get('sick:meat')?.source).toBe('own');
    expect(appealOf(person, 'meat')).toBeLessThan(before);
    // Wary, not refusing: a hungry person still has an appetite for what there is.
    expect(appealOf(person, 'meat')).toBeGreaterThan(0);
    expect(person.chronicle.at(-1)!.text).toContain('raw meat');
  });

  it('draws nothing without a stream, so a unit test eats safely', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    person.inventory.add('meat', 1);
    consumeFood(person, 'meat', 0, true);
    expect(person.conditions).toHaveLength(0);
  });

  it('weakens, thirsts and slows the sick, and a sim day later ends a mild one', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    const speed = (sim as unknown as { movementSystem: { speedOf(p: unknown): number } }).movementSystem.speedOf(person);
    const factor = person.skillFactor('forage');
    person.conditions.push({ kind: 'poisoning', severity: 'moderate', daysLeft: 1, item: 'meat' });
    expect((sim as unknown as { movementSystem: { speedOf(p: unknown): number } }).movementSystem.speedOf(person)).toBeLessThan(speed);
    expect(person.skillFactor('forage')).toBeLessThan(factor);
    const thirst = person.needs.thirst;
    sim.step();
    expect(person.needs.thirst).toBeGreaterThan(thirst);
    for (let i = 0; i < sim.config.time.ticksPerDay + 2; i++) sim.step();
    expect(person.conditions.some(c => c.kind === 'poisoning')).toBe(false);
  });
});
