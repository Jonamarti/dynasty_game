import { afterEach, describe, expect, it } from 'vitest';
import { observeFoodProduction } from '../../../tools/foodProductionCohort.ts';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const makeWorld = () => new Simulation({ seed: 'season-production-observer',
  world: { width: 48, height: 48 }, time: { startDay: 9 },
  population: { bands: 1, peoplePerBand: 4 } });

afterEach(() => { telemetry.disable(); telemetry.reset(); });

describe('seasonal production cohort', () => {
  it('attributes the day ending at a season boundary to the old season and leaves state/RNG identical', () => {
    const quiet = makeWorld();
    for (let tick = 0; tick < quiet.config.time.ticksPerDay * 2; tick++) quiet.step();
    const observed = makeWorld();
    const rows = observeFoodProduction(observed, 'fixture', 2);
    expect(rows[0]!.climate.spring.days).toBe(1);
    expect(rows[0]!.climate.summer.meanAmbientTemperature).toBeNull();
    expect(rows[1]!.climate.summer.days).toBe(1);
    expect(rows[1]!.climate.spring.meanAmbientTemperature).toBeNull();
    expect(JSON.stringify(toCheckpointRecord(observed))).toBe(JSON.stringify(toCheckpointRecord(quiet)));
    // With no production technique/work, missing coverage must remain missing.
    expect(rows.every(row => row.production.actions.farm.coverage === 'n/a')).toBe(true);
    expect(telemetry.isEnabled()).toBe(false);
  });

  it('rejects partial calendar days and an already active telemetry observer before advancing', () => {
    const sim = makeWorld();
    telemetry.enable();
    telemetry.count('existing-session', 7);
    expect(() => observeFoodProduction(sim, 'fixture', 1)).toThrow(/own telemetry session/);
    expect(telemetry.get('existing-session')).toBe(7);
    expect(sim.time.tick).toBe(0);
    telemetry.disable();
    sim.step();
    expect(() => observeFoodProduction(sim, 'fixture', 1)).toThrow(/daily boundary/);
    expect(sim.time.tick).toBe(1);
  });
});
