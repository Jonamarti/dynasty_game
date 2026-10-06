/**
 * CLI: per season of a detailed run, what the model's link "supply ratio -> hunger -> starvation" would say, against what
 * the detailed run did. 32c `lean` investigation. Input: tools/people-trajectory.ts JSON.
 *   npx vite-node tools/people-hazard.ts -- <traj.json>
 * Columns: s (rations / person-days that season), detailed hungryZero and hungryShare against the curve's at that s,
 * detailed starvation deaths and all other deaths as a share of the season's opening population, the model's
 * starvation chance for the season at that s, and the same chance with the run-start formula replaced by the exact
 * chance of a run of K empty days inside the season (a diagnostic of the formula, not a proposal).
 */
import { readFileSync } from 'node:fs';
import { capacityAt, STARVATION_DAYS } from '../src/sim/world/PeopleCapacity.ts';
import { starvationHazardPerDay } from '../src/sim/world/PeopleCapacity.ts';
import type { DayRow } from './people-trajectory.ts';
const { rows, seeds } = JSON.parse(readFileSync(process.argv.slice(2).filter(a => a !== '--')[0]!, 'utf8')) as { rows: DayRow[]; seeds: string[] };
/** P(a run of >= K consecutive empty days within n days), each day empty with probability z, from a clean start. */
function runWithin(z: number, n: number, K: number): number {
  // state: current run length 0..K-1; absorbing at K
  let st = new Array<number>(K).fill(0); st[0] = 1; let hit = 0;
  for (let d = 0; d < n; d++) {
    const next = new Array<number>(K).fill(0);
    for (let j = 0; j < K; j++) { next[0]! += st[j]! * (1 - z); if (j + 1 === K) hit += st[j]! * z; else next[j + 1]! += st[j]! * z; }
    st = next;
  }
  return hit;
}
const f = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d) : ' n/a';
console.log('seed  blk season  pop0   s    hz_det hz_curve  share_det share_curve  starved/pop0 other/pop0  model_pStarve  exact_run_pStarve(share*P)');
for (const seed of seeds) {
  const r = rows.filter(x => x.seed === seed);
  for (let k = 0; k * 10 < r.length; k++) {
    const c = r.slice(k * 10, k * 10 + 10); const pd = c.reduce((a, x) => a + x.personDays, 0);
    if (pd === 0) continue;
    const s = c.reduce((a, x) => a + x.rations, 0) / pd, pop0 = k === 0 ? c[0]!.pop : r[k * 10 - 1]!.pop;
    const ha = c.reduce((a, x) => a + x.hungryAdult, 0), hz = c.reduce((a, x) => a + x.hungryZero, 0), adults = c.reduce((a, x) => a + x.adults, 0);
    const cur = capacityAt(s);
    const pModel = 1 - Math.pow(1 - starvationHazardPerDay(s), c.length);
    const exact = cur.hungryShare * runWithin(cur.hungryZero, c.length, STARVATION_DAYS);
    console.log(`${seed.padEnd(5)} ${String(k).padStart(2)} ${c[0]!.season.padEnd(6)} ${String(pop0).padStart(3)}  ${f(s)}  ${f(ha ? hz / ha : NaN)}   ${f(cur.hungryZero)}     ${f(ha / adults)}      ${f(cur.hungryShare)}       ${f(c.reduce((a, x) => a + x.starved, 0) / pop0)}        ${f(c.reduce((a, x) => a + x.otherDeaths, 0) / pop0)}        ${f(pModel)}          ${f(exact)}`);
  }
}
