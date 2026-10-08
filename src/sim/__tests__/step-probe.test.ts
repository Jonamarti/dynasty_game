/**
 * The step stopwatch (`StepProbe.ts`) is an instrument: installing it must not
 * change what the simulation does, and it must actually see every block of the
 * step, or the profile it feeds (`npm run profile:step`) would be measuring a
 * different game or only part of this one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { setStepMark } from '../core/StepProbe.ts';

const SMALL = {
  seed: 'step-probe',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 8 },
};

/** Everything a person is, plus the RNG-driven world, as one string. */
function state(sim: Simulation): string {
  return JSON.stringify([
    sim.livingPeople().map(p => [p.id, p.x, p.y, p.action, p.health, p.needs, p.inventory.total,
      p.placeMemory.allRecords()]),
    sim.nodes.map(n => [n.id, n.amount]),
    sim.animals.map(a => [a.id, a.x, a.y]),
  ]);
}

afterEach(() => setStepMark(null));

describe('step probe', () => {
  it('does not change the state, and sees every block of the step', () => {
    const control = new Simulation(SMALL);
    for (let i = 0; i < 400; i++) control.step();

    const seen = new Map<string, number>();
    setStepMark(label => seen.set(label, (seen.get(label) ?? 0) + 1));
    const marked = new Simulation(SMALL);
    for (let i = 0; i < 400; i++) marked.step();
    setStepMark(null);

    expect(state(marked)).toBe(state(control));
    // One mark per block per step (the per-person ones once per person turn).
    for (const label of ['(start)', 'advance+rebuildHashes', 'needs.update', 'daily (all blocks)',
      'build contexts', 'loop: observePlaces', 'loop: brain', 'loop: execute', 'carry sync',
      'reconcileCarry', 'cleanupDead']) {
      expect(seen.get(label), label).toBeGreaterThanOrEqual(400);
    }
  });

  it('the comparison can fail: a different seed gives a different state', () => {
    const a = new Simulation(SMALL);
    const b = new Simulation({ ...SMALL, seed: 'step-probe-other' });
    for (let i = 0; i < 50; i++) { a.step(); b.step(); }
    expect(state(a)).not.toBe(state(b));
  });
});
