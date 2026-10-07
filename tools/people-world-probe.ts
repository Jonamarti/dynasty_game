import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeWorldRaster } from '../src/sim/world/WorldBinary.ts';
import { TECHS, TECH } from '../src/sim/knowledge/Tech.ts';
import { PeopleWorld } from './people-world-model.ts';

/** Probe for the phase 32c cohort gates: who holds what after N years, and why a technique never appears. `--years N` (default 30). */
const years = Number(process.argv[process.argv.indexOf('--years') + 1] || 30);
const raster = decodeWorldRaster(new Uint8Array(readFileSync(resolve('public/world/earth-12000-bce.bin'))));
const contactArg = process.argv.indexOf('--contact');
const c = contactArg >= 0 ? Number(process.argv[contactArg + 1]) : undefined;   // sensitivity control only: both contacts set to this
const w = new PeopleWorld(raster, 'probe-0', c === undefined ? {} : { contact: { same: c, adjacent: c } });
const grain = [...w.regions.values()].filter(r => r.hasGrain).length;
console.log(`regions ${w.regions.size}, with wild grain ${grain}`);
w.advanceYears(years);
const peoples = [...w.sim.peoples.values()];
const holders = new Map<string, number>();
for (const t of TECHS) holders.set(t, peoples.filter(p => p.techs.has(t)).length);
const open = TECHS.filter(t => holders.get(t) === 0);
console.log(`${peoples.length} peoples after ${years} years; ${TECHS.length - open.length} of ${TECHS.length} techniques held by somebody`);
console.log('never held, with what blocks them (R: requires missing everywhere, M: materials):');
for (const t of open) {
  const req = TECH[t].requires.filter(r => holders.get(r) === 0);
  const mats = Object.keys(TECH[t].prototype);
  console.log(`  ${t.padEnd(24)} d=${String(TECH[t].difficulty).padEnd(5)} requires ${TECH[t].requires.join('+') || '-'}${req.length ? `  [R: ${req.join(',')}]` : ''}  prototype ${mats.join(',') || '-'}`);
}
console.log('most common held:', [...holders].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t}:${n}`).join(' '));
console.log('least common held (>0):', [...holders].filter(([, n]) => n > 0).sort((a, b) => a[1] - b[1]).slice(0, 8).map(([t, n]) => `${t}:${n}`).join(' '));
console.log('events', w.knowledgeEvents.length, 'stats', JSON.stringify({ ...w.stats(), techCounts: undefined }));
