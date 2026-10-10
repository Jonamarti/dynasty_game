import { describe, expect, it } from 'vitest';
import { garmentWarmthGain, GARMENT_WARMTH_PRIOR } from '../ai/Beliefs.ts';
import { makeConfig } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { Simulation } from '../core/Simulation.ts';
import { KnowledgeSystem } from '../systems/KnowledgeSystem.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';

const config = makeConfig({ seed: 'garment-warm-beliefs', world: { width: 48, height: 48 } });

function person(name: string, x = 10.5, y = 10.5): Person {
  const result = new Person(name, x, y, 0, new RNG('warm-' + name));
  result.age = 30 * result.daysPerYear;
  return result;
}

function deepWinter(): TimeManager {
  const time = new TimeManager(config.time);
  time.tick = config.time.ticksPerDay * (config.time.daysPerSeason * 3 + Math.floor(config.time.daysPerSeason / 2));
  return time;
}

describe('personal and public garment warmth beliefs', () => {
  it('records a curiosity trial only after a wear order finishes', () => {
    const sim = new Simulation({ seed: 'warm-order-interrupt', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const wearer = sim.livingPeople()[0]!;
    wearer.isPlayer = true;
    wearer.inventory.add('fur_coat', 1);
    expect(sim.order(wearer, 'wear_garment', { itemId: 'fur_coat' })).toBe(true);
    sim.step();
    wearer.needs.thirst = 100;
    sim.step();
    expect(wearer.equipment.torso).toBeUndefined();
    expect(wearer.lately.get('warm-tried:fur_coat')).toBeUndefined();

    const completed = new Simulation({ seed: 'warm-order-complete', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const wearer2 = completed.livingPeople()[0]!;
    wearer2.isPlayer = true;
    wearer2.curiosityDays = 30;
    wearer2.inventory.add('fur_coat', 1);
    expect(garmentWarmthGain(wearer2, 'fur_coat', null)).toBeGreaterThan(0);
    expect(completed.order(wearer2, 'wear_garment', { itemId: 'fur_coat' })).toBe(true);
    for (let i = 0; i < config.carry.equipTicks; i++) completed.step();
    expect(wearer2.equipment.torso?.item).toBe('fur_coat');
    expect(wearer2.lately.get('warm-tried:fur_coat')).toBe(1);
    expect(garmentWarmthGain(wearer2, 'fur_coat', 'fur_coat')).toBe(0);
  });

  it('keeps unknown garments uncertain, permits a curiosity trial, and honors own zero', () => {
    const wearer = person('prior');
    wearer.curiosityDays = 30;
    expect(wearer.beliefs.expect('warm:fur_coat')).toEqual({ value: GARMENT_WARMTH_PRIOR, confidence: 0.05 });
    expect(wearer.beliefs.expect('warm:cloth')).toEqual({ value: 0, confidence: 0 });
    expect(garmentWarmthGain(wearer, 'fur_coat', null)).toBeGreaterThan(0);

    wearer.beliefs.learn('warm:fur_coat', 0.4, 1, 'own', 1);
    wearer.curiosityDays = 30;
    expect(garmentWarmthGain(wearer, 'toggled_coat', 'fur_coat')).toBeGreaterThan(0);
    wearer.beliefs.learn('warm:toggled_coat', 0, 1, 'own', 2);
    expect(garmentWarmthGain(wearer, 'toggled_coat', 'fur_coat')).toBe(0);
    wearer.beliefs.learn('warm:toggled_coat', 0.08, 1, 'seen', 3);
    wearer.curiosityDays = 30;
    expect(garmentWarmthGain(wearer, 'toggled_coat', 'fur_coat')).toBeGreaterThan(0);
    wearer.lately.set('warm-tried:toggled_coat', 1);
    expect(garmentWarmthGain(wearer, 'toggled_coat', 'fur_coat')).toBe(0);
  });

  it('learns own marginal warmth while exposed, including when cold is only prevented from rising', () => {
    const wearer = person('own-sample');
    wearer.needs.cold = 50;
    wearer.inventory.add('fur_coat', 1);
    wearer.equipment.torso = { item: 'fur_coat', count: 1 };
    const before = wearer.needs.cold;
    const bare = person('bare-comparison');
    bare.needs.cold = before;

    new NeedsSystem(config.needs).update([wearer, bare], deepWinter());

    const learned = wearer.beliefs.get('warm:fur_coat');
    expect(learned?.source).toBe('own');
    expect(learned?.value).toBeGreaterThan(GARMENT_WARMTH_PRIOR);
    expect(wearer.needs.cold).toBeGreaterThanOrEqual(before);
    expect(wearer.needs.cold).toBeLessThan(bare.needs.cold);
  });

  it('does not attribute warmth to a stale, packed, or hearth-dominated garment', () => {
    const packed = person('packed');
    packed.needs.cold = 50;
    packed.inventory.add('fur_coat', 1);
    new NeedsSystem(config.needs).update([packed], deepWinter());
    expect(packed.beliefs.get('warm:fur_coat')).toBeUndefined();

    const stale = person('stale');
    stale.needs.cold = 50;
    stale.equipment.torso = { item: 'fur_coat', count: 1 };
    new NeedsSystem(config.needs).update([stale], deepWinter());
    expect(stale.beliefs.get('warm:fur_coat')).toBeUndefined();

    const sheltered = person('sheltered');
    sheltered.needs.cold = 50;
    sheltered.inventory.add('fur_coat', 1);
    sheltered.equipment.torso = { item: 'fur_coat', count: 1 };
    const hut = new Building(BUILDINGS.mud_hut!, 9, 9, 1);
    hut.complete = true;
    new NeedsSystem(config.needs).update([sheltered], deepWinter(), [hut]);
    expect(sheltered.beliefs.get('warm:fur_coat')).toBeUndefined();

    const byFire = person('fire-dominated');
    byFire.needs.cold = 50;
    byFire.inventory.add('fur_hat', 1);
    byFire.equipment.head = { item: 'fur_hat', count: 1 };
    const hearth = new Building(BUILDINGS.hearth!, 10, 10, 1);
    hearth.complete = true;
    const hash = new SpatialHash<Building>(8);
    hash.insert(hearth);
    new NeedsSystem(config.needs).update([byFire], deepWinter(), [hearth], hash);
    expect(byFire.beliefs.get('warm:fur_hat')).toBeUndefined();
  });

  it('offers only a weak seen hypothesis for a visible owned winter outfit', () => {
    const observer = person('observer');
    const wearer = person('witnessed', 11.5, 10.5);
    wearer.inventory.add('fur_coat', 1);
    wearer.equipment.torso = { item: 'fur_coat', count: 1 };
    const peopleHash = new SpatialHash<Person>(8);
    peopleHash.insert(observer);
    peopleHash.insert(wearer);
    const rng = new RNG('warm-observation');
    rng.chance = () => true;
    const knowledge = new KnowledgeSystem();
    const makeContext = (season: 'winter' | 'summer', sight: number) => ({
      observerSight: () => sight,
      rng, tick: 1000, peopleHash,
      world: new World(config.world, new RNG('warm-observation-world')),
      season, ticksPerDay: config.time.ticksPerDay,
      knowledge: config.knowledge, learning: config.learning,
      pileHash: new SpatialHash(8), buildingHash: new SpatialHash(8), carry: config.carry,
      onInsight: () => {},
    } satisfies Parameters<KnowledgeSystem['daily']>[1]);

    knowledge.daily([observer, wearer], makeContext('winter', 5));
    expect(observer.beliefs.get('warm:fur_coat')).toMatchObject({
      value: GARMENT_WARMTH_PRIOR, source: 'seen',
    });

    const unseen = person('unseen');
    const farHash = new SpatialHash<Person>(8);
    farHash.insert(unseen);
    farHash.insert(wearer);
    const farContext = { ...makeContext('winter', 0), peopleHash: farHash };
    knowledge.daily([unseen, wearer], farContext);
    expect(unseen.beliefs.get('warm:fur_coat')).toBeUndefined();

    const summerObserver = person('summer-observer');
    const summerHash = new SpatialHash<Person>(8);
    summerHash.insert(summerObserver);
    summerHash.insert(wearer);
    knowledge.daily([summerObserver, wearer], { ...makeContext('summer', 5), peopleHash: summerHash });
    expect(summerObserver.beliefs.get('warm:fur_coat')).toBeUndefined();

    wearer.inventory.remove('fur_coat', 1);
    const staleObserver = person('stale-observer');
    const staleHash = new SpatialHash<Person>(8);
    staleHash.insert(staleObserver);
    staleHash.insert(wearer);
    knowledge.daily([staleObserver, wearer], { ...makeContext('winter', 5), peopleHash: staleHash });
    expect(staleObserver.beliefs.get('warm:fur_coat')).toBeUndefined();
  });
});
