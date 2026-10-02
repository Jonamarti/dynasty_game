/**
 * Fauna at the edge (M15 phase 23h): a hunted-out land is refilled slowly from
 * beyond the rim, a full one takes nobody, and a crowded one lets a herd go.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';

telemetry.enable();

const SMALL = {
  seed: 'edge-1',
  world: { width: 96, height: 96, gameHerds: 10, predators: 0 },
  population: { bands: 1, peoplePerBand: 4 },
};

const prey = (sim: Simulation) => sim.animals.filter(a => !a.def.predator && a.alive);

function emptyTheLand(sim: Simulation): void {
  for (const a of prey(sim)) { a.alive = false; (sim as any).removeAnimal(a); }
}

function days(sim: Simulation, n: number): void {
  for (let i = 0; i < n * sim.config.time.ticksPerDay; i++) sim.step();
}

describe('the edge of the land', () => {
  it('sends a herd in once the land is thinner than it began', { timeout: 120000 }, () => {
    const sim = new Simulation({ ...SMALL, world: { ...SMALL.world, edgeEntryChance: 1 } });
    expect(sim.foundingFauna.deer! + sim.foundingFauna.boar! + sim.foundingFauna.hare!).toBeGreaterThan(10);
    const before = telemetry.get('herd_entered_by_edge');
    days(sim, 3);
    expect(telemetry.get('herd_entered_by_edge')).toBe(before);
    emptyTheLand(sim);
    days(sim, 3);
    expect(telemetry.get('herd_entered_by_edge')).toBeGreaterThan(before);
    expect(prey(sim).length).toBeGreaterThan(0);
  });

  it('is slow at the default chance, and spends a finite reserve', { timeout: 120000 }, () => {
    const sim = new Simulation(SMALL);
    const founding = prey(sim).length;
    emptyTheLand(sim);
    days(sim, 20);
    expect(prey(sim).length).toBeLessThan(founding / 2);
    const closed = new Simulation({ ...SMALL, world: { ...SMALL.world, edgeReserve: 0, edgeEntryChance: 1 } });
    emptyTheLand(closed);
    days(closed, 5);
    expect(prey(closed).length).toBe(0);
  });

  it('is deterministic', { timeout: 120000 }, () => {
    const run = () => {
      const sim = new Simulation({ ...SMALL, world: { ...SMALL.world, edgeEntryChance: 0.5 } });
      emptyTheLand(sim);
      days(sim, 8);
      return prey(sim).map(a => `${a.species}${a.x.toFixed(2)},${a.y.toFixed(2)}`).join('|');
    };
    expect(run()).toBe(run());
  });
});
