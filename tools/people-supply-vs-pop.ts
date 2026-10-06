/**
 * CLI: does the food a comarca puts on the table follow the number of mouths? 32c `lean` investigation.
 * Input: tools/people-trajectory.ts JSON files of the same world with 1, 2 and 3 founding bands (`bands=N`).
 *   npx vite-node tools/people-supply-vs-pop.ts -- <b1.json> <b2.json> <b3.json>
 * Per season of the first year (days 0-40, before anyone has starved in numbers) prints founders, rations/day and
 * rations/person/day. If supply were a fixed property of the region, rations/day would be flat across founder counts
 * and rations/person would fall as 1/N; if it follows the mouths, rations/person is flat.
 */
import { readFileSync } from 'node:fs';
import type { DayRow } from './people-trajectory.ts';
const files = process.argv.slice(2).filter(a => a !== '--');
const names = ['spring', 'summer', 'autumn', 'winter'];
console.log('founders  season  rations/day  rations/person/day  (mean over seeds)');
for (const file of files) {
  const { rows, seeds } = JSON.parse(readFileSync(file, 'utf8')) as { rows: DayRow[]; seeds: string[] };
  for (let q = 0; q < 4; q++) {
    const c = rows.filter(r => r.day > q * 10 && r.day <= q * 10 + 10);
    const pd = c.reduce((a, x) => a + x.personDays, 0), rat = c.reduce((a, x) => a + x.rations, 0);
    const pop0 = rows.filter(r => r.day === 1).reduce((a, x) => a + x.pop, 0) / seeds.length;
    console.log(`${pop0.toFixed(0).padStart(5)}     ${names[q]!.padEnd(7)} ${(rat / c.length).toFixed(1).padStart(8)}      ${(rat / pd).toFixed(2)}`);
  }
}
