import type { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { ADULT_YEARS } from '../src/sim/entities/Person.ts';
import { recordCompactFoodRates, type CompactFoodRateWatchRecord } from '../src/sim/compact/CompactFoodRateWatch.ts';
import type { CompactBandFoodSeason } from '../src/sim/compact/CompactBandFood.ts';

const SEASONS: readonly CompactBandFoodSeason[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Observe actual production in whole calendar days, keeping each season separate.
 * The CLI owns telemetry; rejecting an existing session prevents an observer from
 * silently resetting somebody else's counters. No rates here feed back into AI.
 */
export function observeFoodProduction(
  sim: Simulation, scenario: string, days: number,
): CompactFoodRateWatchRecord[] {
  if (!Number.isSafeInteger(days) || days < 1) throw new RangeError('days must be a positive safe integer');
  const ticksPerDay = sim.config.time.ticksPerDay;
  if (sim.time.tick % ticksPerDay !== 0) throw new RangeError('production cohort must start at a daily boundary');
  if (telemetry.isEnabled()) throw new Error('production cohort requires its own telemetry session');
  const records: CompactFoodRateWatchRecord[] = [];
  telemetry.reset();
  telemetry.enable();
  try {
    for (let day = 0; day < days; day++) {
      const season = sim.time.season as CompactBandFoodSeason;
      const initialPopulation = sim.livingPeople().length;
      const startingTechs = [...sim.knownTech];
      let livingPersonTicks = 0, livingAdultTicks = 0, temperatureSum = 0;
      const exposedPeople = new Set<number>();
      // Snapshot subtraction keeps counters cumulative for the entire run:
      // splitting a cohort must not change what the underlying observer sees.
      const before = telemetry.snapshot();
      for (let tick = 0; tick < ticksPerDay; tick++) {
        temperatureSum += sim.time.temperature;
        // Count the people who receive this tick, including someone who dies
        // during it. The post-step census alone loses their final work exposure.
        for (const person of sim.people) {
          if (!person.alive) continue;
          exposedPeople.add(person.id);
          livingPersonTicks++;
          if (person.years >= ADULT_YEARS) livingAdultTicks++;
        }
        sim.step();
      }
      const counts = Object.fromEntries(Object.entries(telemetry.snapshot())
        .map(([key, value]) => [key, value - (before[key] ?? 0)]));
      const climate = Object.fromEntries(SEASONS.map(key => [key, {
        days: key === season ? 1 : 0,
        meanAmbientTemperature: key === season ? temperatureSum / ticksPerDay : null,
      }])) as Record<CompactBandFoodSeason, { days: number; meanAmbientTemperature: number | null }>;
      records.push(recordCompactFoodRates({
        seed: String(sim.config.seed), scenario, elapsedDays: 1, ticksPerDay,
        initialPopulation, finalPopulation: sim.livingPeople().length,
        observedPersonDays: exposedPeople.size, livingAdultTicks, livingPersonTicks,
        startingTechs, endingKnownTechs: [...sim.knownTech], climate, telemetry: counts,
      }));
    }
  } finally {
    telemetry.disable();
    telemetry.reset();
  }
  return records;
}
