/**
 * Reads the JSON of tools/people-trajectory.ts and prints, per seed and per 10-day block (a season of the
 * detailed calendar), population, rations/day, rations per person per day, foraging share, deaths and food stock;
 * then pools days by population band to ask whether rations per day follow the number of people.
 *   npx vite-node tools/people-trajectory-report.ts -- <in.json>
 */
import { readFileSync } from 'node:fs';
import type { DayRow } from './people-trajectory.ts';
const file = process.argv.slice(2).filter(a => a !== '--')[0]!;
const { rows, seeds } = JSON.parse(readFileSync(file, 'utf8')) as { rows: DayRow[]; seeds: string[] };
const f = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d) : 'n/a';
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
for (const seed of seeds) {
  console.log(`\n== ${seed}: block(10d) season  pop0  popMean  rations/day  ration/person  forage%  starved other births  food depleted`);
  const r = rows.filter(x => x.seed === seed);
  for (let b = 0; b * 10 < r.length; b++) {
    const c = r.slice(b * 10, b * 10 + 10);
    const pd = sum(c.map(x => x.personDays));
    console.log(`  ${String(b).padStart(2)} ${c[0]!.season.padEnd(6)} ${String(c[0]!.pop).padStart(3)} ${f(sum(c.map(x => x.pop)) / c.length, 1).padStart(5)} ${f(sum(c.map(x => x.rations)) / c.length).padStart(7)} ${f(pd ? sum(c.map(x => x.rations)) / pd : NaN).padStart(6)} ${f(100 * sum(c.map(x => x.foraging)) / c.length, 0).padStart(4)} ${String(sum(c.map(x => x.starved))).padStart(4)} ${String(sum(c.map(x => x.otherDeaths))).padStart(4)} ${String(sum(c.map(x => x.births))).padStart(3)} ${f(c.at(-1)!.food, 0).padStart(6)} ${c.at(-1)!.depleted}`);
  }
}
console.log('\n== pooled by population band (all seeds, all days with pop>0): days, rations/day, ration/person/day, forage%, hungryZero share of hungry adults');
const bands: [number, number][] = [[1, 3], [4, 7], [8, 12], [13, 20], [21, 30], [31, 50]];
for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
  console.log(' ' + season);
  for (const [lo, hi] of bands) {
    const c = rows.filter(x => x.season === season && x.pop >= lo && x.pop <= hi && x.personDays > 0);
    if (c.length < 5) continue;
    const pd = sum(c.map(x => x.personDays)), ha = sum(c.map(x => x.hungryAdult));
    console.log(`   pop ${String(lo).padStart(2)}-${String(hi).padEnd(2)} days ${String(c.length).padStart(3)}  rations/day ${f(sum(c.map(x => x.rations)) / c.length).padStart(6)}  /person ${f(sum(c.map(x => x.rations)) / pd)}  forage ${f(100 * sum(c.map(x => x.foraging)) / c.length, 0)}%  hungry0 ${ha ? f(sum(c.map(x => x.hungryZero)) / ha) : 'n/a'} (${ha})`);
  }
}
