/**
 * CLI: how much of a window's POTENTIAL rations does a band actually take? (M15 step 1a, informational for step 1c.)
 *
 *   npx vite-node tools/resource-profile-harvest.ts -- [years] [peoplePerBand]
 *
 * The profile states potential: every node stripped daily. The compact band model has to apply a harvest share to
 * it, and a share nobody measured would be a coefficient out of the air. This runs one band of the founders' kind
 * (no starting technique) for a few years in three detailed 4 by 4 windows and divides the rations the band
 * actually ate per calendar day (the same accounting as `tools/people-calibrate.ts`: nominal nutrition eaten over a
 * day's hunger drift) by the window's profile. Two things confound it, and are printed: a band that starves shrinks
 * (so rations per person is printed too), and a band that has learned nothing cannot eat wild cereal or use a net.
 * Not a calibration, an order of magnitude; the calibration is 1c's.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { IdSpace } from '../src/sim/core/IdSpace.ts';
import { RateWatch, type PersonDay, type RateSeason } from '../src/sim/compact/CompactCalibration.ts';
import { randomWorldGeography } from '../src/sim/world/WorldGeography.ts';
import { findWateredGlobeStart, localWorldConfig } from '../src/sim/world/StartPlace.ts';
import { windowResourceProfile, PROFILE_SPAN } from '../src/sim/world/ResourceProfile.ts';
import { SEASONS } from '../src/sim/core/TimeManager.ts';
import { earthSources } from './resourceMeasure.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const years = Number(args[0] ?? 2);
const founders = Number(args[1] ?? 12);

const earth = earthSources()[0]!.geography;
const windows = [
  { name: 'random:harvest-a (watered start)', geography: randomWorldGeography('harvest-a'), pick: (g: ReturnType<typeof randomWorldGeography>) => findWateredGlobeStart(g, PROFILE_SPAN, localWorldConfig(), 'harvest')! },
  { name: 'random:harvest-b (watered start)', geography: randomWorldGeography('harvest-b'), pick: (g: ReturnType<typeof randomWorldGeography>) => findWateredGlobeStart(g, PROFILE_SPAN, localWorldConfig(), 'harvest')! },
  { name: 'earth-12000-bce (Ebro valley)', geography: earth, pick: () => ({ x: 478, y: 129 }) },
] as const;

for (const w of windows) {
  const start = (w.pick as (g: unknown) => { x: number; y: number })(w.geography);
  const sim = new Simulation({ seed: `harvest:${w.name}`, population: { bands: 1, peoplePerBand: founders } }, new IdSpace(),
    { geography: w.geography, x: start.x, y: start.y, comarcasWide: PROFILE_SPAN, comarcasHigh: PROFILE_SPAN });
  const potential = windowResourceProfile(w.geography, start.x - PROFILE_SPAN / 2, start.y - PROFILE_SPAN / 2);
  const watch = new RateWatch(sim);
  watch.observe();
  const tpd = sim.config.time.ticksPerDay;
  const days: Record<RateSeason, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  let season = sim.time.season as RateSeason;
  const steps = years * sim.time.daysPerYear * tpd;
  for (let i = 0; i < steps; i++) {
    sim.step(); watch.observe();
    if (sim.time.tick % tpd === 0) { days[season]++; season = sim.time.season as RateSeason; }
  }
  const eaten: Record<RateSeason, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  const personDays: Record<RateSeason, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  for (const d of watch.days as PersonDay[]) { eaten[d.season] += d.eaten / d.hungerDrift; personDays[d.season]++; }
  console.log(`\n${w.name} at ${start.x},${start.y}: ${years} years, ${founders} founders, ${sim.people.filter(p => p.alive).length} alive at the end`);
  console.log('  season   eaten/day  mean pop  potential/day   share');
  for (const s of SEASONS) {
    const perDay = days[s] > 0 ? eaten[s] / days[s] : 0;
    const pop = days[s] > 0 ? personDays[s] / days[s] : 0;
    console.log(`  ${s.padEnd(8)} ${perDay.toFixed(1).padStart(8)} ${pop.toFixed(1).padStart(9)} ${potential.rations[s].toFixed(1).padStart(14)} ${(potential.rations[s] > 0 ? perDay / potential.rations[s] : 0).toFixed(3).padStart(8)}`);
  }
}
