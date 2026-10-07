import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeWorldRaster } from '../src/sim/world/WorldBinary.ts';
import { PeopleWorld, type PeopleWorldStats } from './people-world-model.ts';

/**
 * M15 phase 32c cohort gates on the Earth: `the-world-is-uneven`, `farming-spreads`, `states-arise`.
 * `npm run world:cohort -- [--seeds 10] [--years 200] [--map earth-12000-bce.bin] [--no-union]`
 * It prints what it measured and what each gate says; it does not tune anything to make a gate pass.
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
}
const seeds = Number(arg('seeds', '10')), years = Number(arg('years', '200')), map = arg('map', 'earth-12000-bce.bin');
const union = !process.argv.includes('--no-union');
const raster = decodeWorldRaster(new Uint8Array(readFileSync(resolve('public/world', map))));

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

export interface SeedResult { seed: string; ms: number; stats: PeopleWorldStats; initialPeoples: number; initialTechs: number }
const results: SeedResult[] = [];
for (let k = 0; k < seeds; k++) {
  const seed = `cohort-${k}`;
  const world = new PeopleWorld(raster, seed, { union });
  const initialPeoples = world.sim.peoples.size, initialTechs = [...world.sim.peoples.values()][0]!.techs.size;
  const t0 = performance.now();
  world.advanceYears(years);
  results.push({ seed, ms: performance.now() - t0, stats: world.stats(), initialPeoples, initialTechs });
  const s = results.at(-1)!;
  console.log(`${seed}: ${s.initialPeoples} -> ${s.stats.peoples} peoples, pop ${s.stats.population}, techs mean ${mean(s.stats.techCounts).toFixed(2)} sd ${sd(s.stats.techCounts).toFixed(2)} max ${Math.max(...s.stats.techCounts)}, `
    + `farming ${s.stats.farming.total} (${s.stats.farming.inventedInGrainRegion} invented, ${s.stats.farming.learned} learned, ${s.stats.farming.inGrainlessRegion} in grainless), states ${s.stats.states}, `
    + `splits ${s.stats.splits} merges ${s.stats.merges} wars ${s.stats.wars}, ${(s.ms / 1000).toFixed(1)}s`);
}

// ---- gates (thresholds written before measuring) --------------------------------------------------------------------
// the-world-is-uneven: at the end the peoples' technique counts are neither all equal nor all stalled: at least 3 distinct values, a
// spread (sd) above 0.5, and more than a fifth of the peoples hold something beyond the common start. Per seed; the gate needs 8 in 10.
// farming-spreads: farming appears (invented) in some region that has wild grain, and a people in a region WITHOUT wild grain holds it,
// so it crossed: in at least half of the seeds. states-arise: some people reaches `state` in at least half of the seeds.
const uneven = results.filter(r => new Set(r.stats.techCounts).size >= 3 && sd(r.stats.techCounts) > 0.5 && r.stats.techCounts.filter(c => c > r.initialTechs).length > 0.2 * r.stats.peoples).length;
const spreads = results.filter(r => r.stats.farming.inventedInGrainRegion > 0 && r.stats.farming.inGrainlessRegion > 0).length;
const states = results.filter(r => r.stats.states > 0).length;
const need = (frac: number) => Math.ceil(frac * seeds);
const line = (name: string, got: number, want: number) => console.log(`${got >= want ? 'PASS' : 'FAIL'}  ${name}: ${got}/${seeds} seeds (needs ${want})`);
console.log('');
line('the-world-is-uneven', uneven, need(0.8));
line('farming-spreads', spreads, need(0.5));
line('states-arise', states, need(0.5));
console.log(`mean wall time per seed: ${(mean(results.map(r => r.ms)) / 1000).toFixed(1)}s for ${years} years`);
