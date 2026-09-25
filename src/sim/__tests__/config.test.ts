/**
 * The settings screen must not have retuned the game.
 *
 * Thirty-odd numbers moved out of module constants and into `SimConfig` so a
 * player could reach them, and five difficulty anchors were written on top. Any
 * one of those numbers typed a digit wrong is a silent, permanent change to a
 * world nobody asked to change — and every measurement in `docs/changelog.md`
 * was taken against the old ones. So the first two tests here are not about the
 * feature at all: they are the proof that Normal is still exactly what shipped.
 *
 * The rest guard the two ways a tunable can be quietly inert: a path that does
 * not resolve (the settings screen writes a field nothing reads), and a field
 * that is wired but never actually multiplied into anything.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, makeConfig } from '../core/Config.ts';
import {
  DIFFICULTIES, DIFFICULTY_IDS, SCALED_PATHS, TUNABLES,
  configFor, readPath, valuesFor,
} from '../core/Difficulty.ts';
import { Simulation } from '../core/Simulation.ts';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { KnowledgeSystem } from '../systems/KnowledgeSystem.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';

const SMALL = {
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

/** The same small world, once plainly and once through the Normal anchor. */
function smallWorlds() {
  const normal = configFor('normal');
  return {
    plain: { seed: 'anchor', ...SMALL },
    stamped: {
      ...normal,
      seed: 'anchor',
      world: { ...normal.world, ...SMALL.world },
      population: { ...normal.population, ...SMALL.population },
    },
  };
}

/** Borrowed from `determinism.test.ts`: everything that should reproduce. */
function fingerprint(sim: Simulation): string {
  const people = sim.livingPeople()
    .map(p => [
      p.id, p.name, p.x.toFixed(6), p.y.toFixed(6), p.action,
      p.health.toFixed(6), p.needs.hunger.toFixed(6), p.needs.thirst.toFixed(6),
      p.inventory.total,
    ].join(':'))
    .join('|');
  const nodes = sim.nodes.map(n => n.id + ':' + n.amount.toFixed(6)).join('|');
  return people + '#' + nodes;
}

describe('Normal is what ships', () => {
  it('stamps exactly the default config', () => {
    expect(makeConfig(configFor('normal'))).toEqual(makeConfig({}));
  });

  it('produces a world identical to an unconfigured one after 500 steps', () => {
    const { plain, stamped } = smallWorlds();
    const a = new Simulation(plain);
    const b = new Simulation(stamped);
    for (let i = 0; i < 500; i++) {
      a.step();
      b.step();
    }
    expect(fingerprint(b)).toBe(fingerprint(a));
  });
});

describe('the tunable table', () => {
  it('deep-merges home motivation and the child radius table', () => {
    const config = makeConfig({ motivation: { parentReach: 8, childRadius: { under1: 1 } } });
    expect(config.motivation.parentReach).toBe(8);
    expect(config.motivation.childRadius.under1).toBe(1);
    expect(config.motivation.childRadius.years4to7).toBe(DEFAULT_CONFIG.motivation.childRadius.years4to7);
  });
  it('has no path that fails to resolve', () => {
    // The failure this catches is silent rather than loud: `needs.hungerrate`
    // would have the settings screen writing a field nothing anywhere reads,
    // and the slider would move with no effect on the world at all.
    for (const tunable of TUNABLES) {
      expect(typeof readPath(DEFAULT_CONFIG, tunable.path), tunable.path).toBe('number');
    }
  });

  it('has no duplicate paths', () => {
    const paths = TUNABLES.map(t => t.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every anchor exactly the scaled fields, and no others', () => {
    for (const id of DIFFICULTY_IDS) {
      expect(Object.keys(DIFFICULTIES[id]).sort(), id).toEqual([...SCALED_PATHS].sort());
    }
  });

  it('leaves the pinned fields at their defaults in every anchor', () => {
    const pinned = TUNABLES.filter(t => !t.scaled);
    for (const id of DIFFICULTY_IDS) {
      const values = valuesFor(id);
      for (const tunable of pinned) {
        expect(values[tunable.path], id + ' ' + tunable.path)
          .toBe(readPath(DEFAULT_CONFIG, tunable.path));
      }
    }
  });

  it('keeps every anchor inside its own slider bounds', () => {
    for (const id of DIFFICULTY_IDS) {
      for (const tunable of TUNABLES) {
        const value = DIFFICULTIES[id][tunable.path];
        if (value === undefined) continue;
        expect(value, id + ' ' + tunable.path).toBeGreaterThanOrEqual(tunable.min);
        expect(value, id + ' ' + tunable.path).toBeLessThanOrEqual(tunable.max);
      }
    }
  });

  it('moves peaceful and extreme in opposite directions from normal', () => {
    // A column pasted into the wrong difficulty is the mistake this catches, and
    // it would otherwise show up only as "extreme feels oddly generous".
    for (const path of SCALED_PATHS) {
      const peaceful = DIFFICULTIES.peaceful[path]!;
      const normal = DIFFICULTIES.normal[path]!;
      const extreme = DIFFICULTIES.extreme[path]!;
      expect(Math.sign(peaceful - normal), path).toBe(-Math.sign(extreme - normal));
      expect(peaceful, path).not.toBe(extreme);
    }
  });

  it('carries an override through to the built config', () => {
    const built = makeConfig(configFor('hard', { 'needs.hungerRate': 0.5 }));
    expect(built.needs.hungerRate).toBe(0.5);
    // and leaves the rest of the anchor alone
    expect(built.needs.thirstRate).toBe(DIFFICULTIES.hard['needs.thirstRate']);
  });
});

describe('each new field actually does something', () => {
  it('learning.skillGain multiplies practice', () => {
    const slow = new Person('Slow', 0, 0, 0, new RNG('gain'));
    const fast = new Person('Fast', 0, 0, 0, new RNG('gain'));
    fast.skillGain = 2;
    slow.practice('forage', 1);
    fast.practice('forage', 1);
    expect(fast.skills.forage).toBeGreaterThan(slow.skills.forage);
  });

  it('world.regrowthRate multiplies regrowth', () => {
    const full = new ResourceNode('berries', 0, 0, new RNG('regrow'));
    const half = new ResourceNode('berries', 0, 0, new RNG('regrow'));
    full.amount = 1;
    half.amount = 1;
    full.regrow(200, 1, 1);
    half.regrow(200, 1, 0.5);
    expect(half.amount - 1).toBeCloseTo((full.amount - 1) / 2, 6);
  });

  it('a rate of zero stops regrowth entirely', () => {
    const node = new ResourceNode('berries', 0, 0, new RNG('regrow'));
    node.amount = 1;
    node.regrow(200, 1, 0);
    expect(node.amount).toBe(1);
  });

  it('learning.observationChance gates learning by watching', () => {
    const config = makeConfig({ seed: 'observe' });
    const run = (chance: number): boolean => {
      const knower = new Person('Knower', 4, 4, 0, new RNG('knower'));
      const watcher = new Person('Watcher', 4, 4, 0, new RNG('watcher'));
      knower.age = 30 * DAYS_PER_YEAR;
      watcher.age = 30 * DAYS_PER_YEAR;
      knower.knownTech.add('firemaking');
      const hash = new SpatialHash<Person>(8);
      const people = [knower, watcher];
      hash.rebuild(people);
      new KnowledgeSystem().daily(people, {
        rng: new RNG('watching'),
        tick: 1000,
        peopleHash: hash,
        world: new World(config.world, new RNG('observe-world')),
        season: 'summer',
        ticksPerDay: config.time.ticksPerDay,
        knowledge: config.knowledge,
        learning: { ...config.learning, observationChance: chance, childObservationChance: chance },
        onInsight: () => {},
      });
      return watcher.knownTech.has('firemaking');
    };
    expect(run(1)).toBe(true);
    expect(run(0)).toBe(false);
  });

  it('population.conceptionChance reaches the simulation', () => {
    // Cheapest honest assertion: the value the constructor built is the value
    // `LifeSystem` will be handed, since the daily context is rebuilt from it.
    const sim = new Simulation({ ...SMALL, seed: 'birth', population: { ...SMALL.population, conceptionChance: 0.4 } });
    expect(sim.config.population.conceptionChance).toBe(0.4);
  });

  it('applyLearning reaches people who are already alive', () => {
    const sim = new Simulation({ ...SMALL, seed: 'sweep' });
    expect(sim.livingPeople()[0]!.skillGain).toBe(1);
    sim.config.learning.skillGain = 2.5;
    sim.applyLearning();
    for (const person of sim.livingPeople()) expect(person.skillGain).toBe(2.5);
  });
});
