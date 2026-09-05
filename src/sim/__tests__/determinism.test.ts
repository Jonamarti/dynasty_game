/**
 * Determinism is the load-bearing property of this simulation.
 *
 * A dynasty game runs for in-game centuries; when something goes wrong on year
 * 140 the only affordable way to investigate is to replay the seed and watch it
 * happen again. That works only if nothing anywhere reaches for `Math.random()`.
 * These tests are the tripwire — they will fail the moment one does.
 */
import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Simulation } from '../core/Simulation.ts';

const SMALL = {
  seed: 'determinism',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

/** A compact fingerprint of everything that should be reproducible. */
function fingerprint(sim: Simulation): string {
  const people = sim.livingPeople()
    .map(p =>
      [
        p.id, p.name, p.x.toFixed(6), p.y.toFixed(6), p.action,
        p.health.toFixed(6), p.needs.hunger.toFixed(6), p.needs.thirst.toFixed(6),
        p.inventory.total,
      ].join(':')
    )
    .join('|');
  const nodes = sim.nodes.map(n => n.id + ':' + n.amount.toFixed(6)).join('|');
  return people + '#' + nodes;
}

describe('RNG', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new RNG('hello');
    const b = new RNG('hello');
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces unrelated sequences for adjacent numeric seeds', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    // Adjacent seeds are the common case (scenario 1, scenario 2...) and must
    // not produce near-identical worlds.
    const identical = seqA.filter((v, i) => v === seqB[i]).length;
    expect(identical).toBe(0);
  });

  it('restores an exact position from saved state', () => {
    const rng = new RNG(42);
    for (let i = 0; i < 17; i++) rng.next();
    const state = rng.getState();
    const expected = Array.from({ length: 10 }, () => rng.next());

    const restored = new RNG(1);
    restored.setState(state);
    expect(Array.from({ length: 10 }, () => restored.next())).toEqual(expected);
  });

  it('stays within its declared ranges', () => {
    const rng = new RNG('ranges');
    for (let i = 0; i < 2000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe('Simulation determinism', () => {
  it('two runs of the same seed are byte-identical after 500 steps', () => {
    const a = new Simulation(SMALL);
    const b = new Simulation(SMALL);
    for (let i = 0; i < 500; i++) {
      a.step();
      b.step();
    }
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('generates the same terrain for the same seed', () => {
    const a = new Simulation(SMALL);
    const b = new Simulation(SMALL);
    expect(Array.from(a.world.biome)).toEqual(Array.from(b.world.biome));
  });

  it('generates different terrain for different seeds', () => {
    const a = new Simulation({ ...SMALL, seed: 'one' });
    const b = new Simulation({ ...SMALL, seed: 'two' });
    expect(Array.from(a.world.biome)).not.toEqual(Array.from(b.world.biome));
  });
});
