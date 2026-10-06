/**
 * CLI: is death after a lean winter predicted by the condition people arrive in? 32c `lean` investigation.
 *   npx vite-node tools/people-condition.ts -- <variant> <seed,...> [at=30] [until=50]
 * At day `at` (the end of the first winter in the 40-day year) every living person's health, hunger, cold and group is
 * recorded; at day `until` it says who is still alive. Prints survival by health bin and by hunger bin, and by sex.
 * A condition-free model says survival does not depend on these once the supply ratio is given.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const variant = args[0] ?? 'lean';
const seeds = (args[1] ?? 'delta').split(',');
const at = Number(args.find(a => a.startsWith('at='))?.slice(3) ?? 30), until = Number(args.find(a => a.startsWith('until='))?.slice(6) ?? 50);
const scenario = SCENARIOS[variant]!;
interface Rec { health: number; hunger: number; cold: number; sex: string; child: boolean; survived: boolean }
const recs: Rec[] = [];
for (const seed of seeds) {
  const config = { ...makeConfig(scenario.config), seed };
  const sim = scenario.create?.(config) ?? new Simulation(config);
  if (scenario.create) scenario.setup?.(sim);
  const tpd = sim.config.time.ticksPerDay;
  const snap = new Map<number, Rec>();
  for (let i = 1; i <= until * tpd; i++) {
    sim.step();
    if (sim.time.tick === at * tpd) for (const p of sim.people) if (p.alive) snap.set(p.id, { health: p.health, hunger: p.needs.hunger, cold: p.needs.cold, sex: p.sex, child: p.isChild, survived: false });
  }
  for (const [id, r] of snap) { r.survived = sim.peopleById.get(id)!.alive; recs.push(r); }
}
const table = (title: string, key: (r: Rec) => string) => {
  const by = new Map<string, { n: number; s: number }>();
  for (const r of recs) { const k = key(r); const e = by.get(k) ?? { n: 0, s: 0 }; e.n++; if (r.survived) e.s++; by.set(k, e); }
  console.log(title + ': ' + [...by.entries()].sort().map(([k, v]) => `${k} ${v.s}/${v.n} (${(100 * v.s / v.n).toFixed(0)}%)`).join('   '));
};
console.log(`${variant} ${seeds.join(',')}: alive at day ${at}: ${recs.length}, alive at day ${until}: ${recs.filter(r => r.survived).length}`);
const bin = (v: number, w: number) => String(Math.floor(v / w) * w).padStart(3, '0');
table('by health', r => 'h' + bin(r.health, 25));
table('by hunger', r => 'u' + bin(r.hunger, 25));
table('by cold  ', r => 'c' + bin(r.cold, 25));
table('by sex   ', r => r.child ? 'child' : r.sex);
