/**
 * CLI: does `PeopleKnowledge`'s invention keep the detailed game's pace? M15 phase 32c, mechanism 3.
 *
 *   npx vite-node tools/people-knowledge-correspond.ts -- <seed,seed,...> [out.json]
 *
 * Seeds the rate was NOT measured on (it used alpha,beta,gamma): delta,eps,zeta. Each seed is the detailed default
 * world (`century`'s config, three bands) for 40,000 steps from founders who know nothing; at the end the number of
 * distinct techniques held by the living is counted. The model is one people (the three bands are in contact, which
 * is Kremer's pooled case) holding the detailed run's mean population constant, from nothing, for the same 16.7
 * seasons, 60 streams per seed, with the measured KREMER_KAPPA.
 *
 * TOLERANCES, written before the first measurement and not moved afterwards:
 *  K1 the model's mean number of techniques is within 35 % of the detailed mean over the seeds;
 *  K2 at least two of the detailed seeds' counts lie inside the model's 5-95 % range (the model must not be a
 *     single sharp number the detailed world never produces).
 *  K3 the model is not rate-free: with the population doubled it finds more techniques (Kremer), by at least 20 %.
 */
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { PeopleSim, emptyCohorts } from '../src/sim/world/PeopleSim.ts';
import { knowledge, regionMaterials, KREMER_KAPPA, PARTIAL_START } from '../src/sim/world/PeopleKnowledge.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const seeds = (args[0] ?? 'delta').split(',');
const out = args.find(a => a.endsWith('.json'));
const scenario = SCENARIOS.century!;
const STREAMS = 60;

const detailed: number[] = [], meanAlive: number[] = [];
let seasons = 0;
for (const seed of seeds) {
  const sim = new Simulation({ ...makeConfig(scenario.config), seed });
  const tpd = sim.config.time.ticksPerDay, sps = tpd * sim.config.time.daysPerSeason;
  let alive = 0, samples = 0;
  for (let i = 1; i <= scenario.steps; i++) {
    sim.step();
    if (i % sps === 0) { alive += sim.people.filter(p => p.alive).length; samples++; }
  }
  const union = new Set<string>();
  for (const p of sim.people) if (p.alive) for (const t of p.knownTech) union.add(t);
  detailed.push(union.size); meanAlive.push(Math.round(alive / samples)); seasons = Math.floor(scenario.steps / sps);
  console.log(`detailed ${seed}: ${union.size} techniques after ${seasons} seasons, mean alive ${(alive / samples).toFixed(1)} [${[...union].join(',')}]`);
}

function model(n: number, scale = 1): number[] {
  const counts: number[] = [];
  for (let k = 0; k < STREAMS; k++) {
    const clock = { ticksPerDay: 240, daysPerSeason: 10 };
    const sim = new PeopleSim(`know-${n}-${scale}-${k}`, clock, [knowledge({ mu: 0, partial: PARTIAL_START, regionOf: () => ({ materials: regionMaterials(), climate: { temperature: 0.5, wetness: 0.5 } }) })]);
    const cohorts = emptyCohorts();
    const per = Math.round(n * scale / 16);
    for (let b = 3; b <= 10; b++) { cohorts.male[b] = per; cohorts.female[b] = per; }
    const people = sim.found({ cohorts, comarcas: 1 });
    sim.advanceTo(seasons * 2400);
    counts.push(people.techs.size);
  }
  return counts;
}
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const all: number[] = [];
for (const n of meanAlive) all.push(...model(n));
const dMean = mean(detailed), mMean = mean(all);
const inside = detailed.filter(c => c >= q(all, 0.05) && c <= q(all, 0.95)).length;
const doubled: number[] = [];
for (const n of meanAlive) doubled.push(...model(n, 2));
console.log(`\nK1 mean techniques: detailed ${dMean.toFixed(2)} (${detailed.join(',')}), model ${mMean.toFixed(2)} (kappa ${KREMER_KAPPA}); ratio ${(mMean / dMean).toFixed(2)}  ${Math.abs(mMean / dMean - 1) <= 0.35 ? 'PASS' : 'FAIL'}`);
console.log(`K2 detailed counts inside the model 5-95 % range [${q(all, 0.05)}, ${q(all, 0.95)}]: ${inside} of ${detailed.length}  ${inside >= 2 ? 'PASS' : 'FAIL'}`);
console.log(`K3 population doubled: model mean ${mean(doubled).toFixed(2)} vs ${mMean.toFixed(2)}  ${mean(doubled) >= mMean * 1.2 ? 'PASS' : 'FAIL'}`);
if (out) writeFileSync(out, JSON.stringify({ seeds, detailed, meanAlive, seasons, mMean, dMean, doubledMean: mean(doubled), range: [q(all, 0.05), q(all, 0.95)] }, null, 1));
