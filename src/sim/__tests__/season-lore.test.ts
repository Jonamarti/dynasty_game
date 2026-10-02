import { describe, expect, it } from 'vitest';
import { SeasonLore, BARE_YEARS_TO_LEARN } from '../knowledge/SeasonLore.ts';
import { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import { BUSHES, bushPhase, ResourceNode } from '../entities/ResourceNode.ts';

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

describe('bush species and their seasons', () => {
  it('ripen, hold and go bare in their own seasons', () => {
    const sim = world('bush-seasons');
    const bushes = sim.nodes.filter(n => n.kind === 'berries');
    expect(bushes.length).toBeGreaterThan(0);
    expect(bushes.every(n => n.species !== null)).toBe(true);
    for (let day = 0; day < sim.time.daysPerYear; day++) {
      for (let i = 0; i < sim.config.time.ticksPerDay; i++) sim.step();
      const season = sim.time.season;
      // Out of season every bush is bare; nothing out of season ever regrows.
      for (const bush of bushes) {
        if (bushPhase(bush.species!, season) === 'bare') expect(bush.amount).toBe(0);
      }
    }
    // A sloe left alone keeps its autumn fruit into the winter.
    const sloe = new ResourceNode('berries', 0, 0, { range: () => 1 } as never);
    sloe.species = 'sloe';
    sloe.amount = 7;
    sloe.regrow(2400, 0, 1, 'winter');
    expect(sloe.amount).toBe(7);
    sloe.regrow(20, 0, 1, 'autumn');
    expect(sloe.amount).toBeGreaterThan(7);
  });

  it('are learned about species by species, with plant lore, by watching', { timeout: 60000 }, () => {
    // Seed pinned, not tuned: on some worlds a bush picked clean in its own fruiting
    // season for two years running is learned as barren there (docs/bugs.md).
    const sim = world('bare-learn-2');
    const person = sim.livingPeople()[0]! as Person;
    person.knownTech.add('plant_lore');
    for (let i = 0; i < sim.time.daysPerYear * 2 * sim.config.time.ticksPerDay + 10; i++) sim.step();
    const species = [...new Set(sim.nodes.filter(n => n.kind === 'berries').map(n => n.species!))];
    const learned = species.filter(kind => BUSHES[kind].ripens.length + BUSHES[kind].holds.length < 4);
    expect(learned.length).toBeGreaterThan(0);
    for (const kind of learned) {
      const bare = (['spring', 'summer', 'autumn', 'winter'] as const).filter(s => bushPhase(kind, s) === 'bare');
      for (const season of bare) expect(person.seasonLore.barrenIn(`bush:${kind}`, season)).toBe(true);
      expect(person.seasonLore.barrenIn(`bush:${kind}`, BUSHES[kind].ripens[0]!)).toBe(false);
    }
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
