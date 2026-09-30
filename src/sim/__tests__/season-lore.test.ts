import { describe, expect, it } from 'vitest';
import { SeasonLore, BARE_YEARS_TO_LEARN } from '../knowledge/SeasonLore.ts';
import { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';

/**
 * M15 phase 20, the owner's answer of 2026-09-30: with plant lore, people
 * learn by watching two winters that a kind of plant bears nothing then, and
 * only then pass over a remembered place of that kind without walking to it.
 */
describe('season lore', () => {
  it('learns a barren season from two years of seeing only bare plants', () => {
    const lore = new SeasonLore();
    lore.observe('resource:berries', 'summer', 0, true);
    lore.observe('resource:berries', 'winter', 0, false);
    lore.observe('resource:berries', 'winter', 0, false);
    expect(lore.barrenIn('resource:berries', 'winter')).toBe(false);
    lore.observe('resource:berries', 'winter', 1, false);
    expect(BARE_YEARS_TO_LEARN).toBe(2);
    expect(lore.barrenIn('resource:berries', 'winter')).toBe(true);
    expect(lore.barrenSeasons('resource:berries')).toEqual(['winter']);
    expect(lore.learnedKinds()).toEqual(['resource:berries']);
  });

  it('never learns it if any year showed the plant in fruit then', () => {
    const lore = new SeasonLore();
    lore.observe('resource:wild_grain', 'summer', 0, true);
    lore.observe('resource:wild_grain', 'winter', 0, false);
    lore.observe('resource:wild_grain', 'winter', 1, false);
    lore.observe('resource:wild_grain', 'winter', 1, true);
    expect(lore.barrenIn('resource:wild_grain', 'winter')).toBe(false);
  });

  it('does not call a plant barren before it has ever been seen in fruit', () => {
    const lore = new SeasonLore();
    lore.observe('resource:berries', 'winter', 0, false);
    lore.observe('resource:berries', 'winter', 1, false);
    expect(lore.barrenIn('resource:berries', 'winter')).toBe(false);
  });
});

/** A year of four one-day seasons, so two winters pass in two thousand steps. */
function world(seed: string, sightRadius = 60) {
  const sim = new Simulation({ seed, world: { width: 48, height: 48 },
    time: { daysPerSeason: 1, startDay: 0 }, sightRadius,
    population: { bands: 1, peoplePerBand: 4 } });
  return sim;
}

describe('bushes in winter', () => {
  it('bear nothing', () => {
    const sim = world('bare-winter');
    const bushes = sim.nodes.filter(n => n.kind === 'berries');
    expect(bushes.some(n => n.amount > 0)).toBe(true);
    // The step that turns the day into winter is the one that strips them.
    while (sim.time.season !== 'winter') sim.step();
    expect(bushes.length).toBeGreaterThan(0);
    expect(bushes.every(n => n.amount === 0)).toBe(true);
  });

  it('are learned about, with plant lore, by watching them', { timeout: 60000 }, () => {
    const sim = world('bare-learn');
    const person = sim.livingPeople()[0]! as Person;
    person.knownTech.add('plant_lore');
    // Two years with the whole island in sight: every season seen, twice.
    for (let i = 0; i < sim.time.daysPerYear * 2 * sim.config.time.ticksPerDay + 10; i++) sim.step();
    expect(person.seasonLore.barrenIn('resource:berries', 'winter')).toBe(true);
    expect(person.seasonLore.barrenIn('resource:berries', 'summer')).toBe(false);
    const other = sim.livingPeople().find(p => !p.knownTech.has('plant_lore'));
    if (other) expect(other.seasonLore.learnedKinds()).toEqual([]);
  });
});

describe('a remembered place found empty', () => {
  it('is found empty by walking until it is in sight, not known from afar', () => {
    const sim = world('honest-walk', 8);
    const person = sim.livingPeople().find(p => !p.isChild)! as Person;
    for (const p of sim.people) { p.needs.hunger = 0; p.needs.thirst = 0; p.needs.cold = 0; p.needs.fatigue = 0; }
    const far = sim.nodes
      .filter(n => n.kind === 'berries' && sim.world.sameRegion(person.x, person.y, n.x, n.y))
      .sort((a, b) => person.distanceTo(b) - person.distanceTo(a))[0]!;
    const start = person.distanceTo(far);
    expect(start).toBeGreaterThan(sim.config.sightRadius);
    far.amount = 0;
    expect(sim.order(person, 'forage', { nodeId: far.id })).toBe(true);
    for (let i = 0; i < 20; i++) sim.step();
    // Still on the way, and nearer: nothing told them it was empty.
    expect(person.action).toBe('forage');
    expect(person.distanceTo(far)).toBeLessThan(start);
    for (let i = 0; i < 2000 && person.action === 'forage'; i++) sim.step();
    expect(person.distanceTo(far)).toBeLessThanOrEqual(sim.config.sightRadius + 1);
  });
});
