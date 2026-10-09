/**
 * One seeded ten-day observation of actual food production by source.
 *
 * Run with `npx vite-node tools/compact-food-rates.ts` (JSON goes to stdout). This is a mechanism sample, not a
 * multi-seed economy forecast; the detailed model only counts productive task ticks, so rates exclude travel/search.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { RateWatch } from '../src/sim/compact/CompactCalibration.ts';
import { recordCompactFoodRates } from '../src/sim/compact/CompactFoodRateWatch.ts';
import type { CompactBandFoodSeason } from '../src/sim/compact/CompactBandFood.ts';

const SEED = 'compact-food-rate-watch-2026-10-09';
const DAYS = 10;
const POPULATION = 12;
const SEASONS: readonly CompactBandFoodSeason[] = ['spring', 'summer', 'autumn', 'winter'];
const sim = new Simulation({ seed: SEED, population: { bands: 1, peoplePerBand: POPULATION } });
const watch = new RateWatch(sim);
const climate = Object.fromEntries(SEASONS.map(season => [season, { days: 0, temperatureSum: 0, samples: 0 }])) as
  Record<CompactBandFoodSeason, { days: number; temperatureSum: number; samples: number }>;
const startingTechs = [...sim.config.population.startingTech].sort();
telemetry.reset(); telemetry.enable();
watch.observe();
const ticksPerDay = sim.config.time.ticksPerDay;
let livingPersonTicks = 0;
for (let day = 0; day < DAYS; day++) {
  const season = sim.time.season as CompactBandFoodSeason;
  const temperature = sim.time.temperature;
  climate[season].days++;
  if (Number.isFinite(temperature)) { climate[season].temperatureSum += temperature; climate[season].samples++; }
  for (let tick = 0; tick < ticksPerDay; tick++) {
    sim.step();
    livingPersonTicks += sim.livingPeople().length;
    watch.observe();
  }
}
const climateRecord = Object.fromEntries(SEASONS.map(season => [season, {
  days: climate[season].days,
  meanAmbientTemperature: climate[season].samples > 0 ? climate[season].temperatureSum / climate[season].samples : null,
}])) as Record<CompactBandFoodSeason, { days: number; meanAmbientTemperature: number | null }>;
const livingAdultTicks = watch.days.filter(day => day.group === 'adult').reduce((sum, day) => sum + day.ticks, 0);
const record = recordCompactFoodRates({
  seed: SEED, scenario: 'default generated world; one band; 12 founders', elapsedDays: DAYS, ticksPerDay,
  initialPopulation: POPULATION, finalPopulation: sim.livingPeople().length,
  observedPersonDays: watch.days.length, livingAdultTicks, livingPersonTicks, startingTechs,
  endingKnownTechs: [...sim.knownTech], climate: climateRecord, telemetry: telemetry.snapshot(),
});
telemetry.disable();
console.log(JSON.stringify(record, null, 2));
