/**
 * CLI: who dies in a detailed collapse, and of what. 32c `lean` investigation.
 *   npx vite-node tools/people-groups.ts -- <variant> <seed,...> [bands=N]
 * Groups are fixed at day 0 (the founders): adult man, adult woman (16-44, fertile), elder (any sex, 45+), child.
 * Prints survival of each group at checkpoints and the causes of death by group; pools the seeds.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const variant = args[0] ?? 'lean';
const seeds = (args[1] ?? 'delta').split(',');
const bandsArg = args.find(a => a.startsWith('bands='));
const base = SCENARIOS[variant]!;
const scenario = bandsArg ? { ...base, config: { ...base.config, population: { ...base.config.population, bands: Number(bandsArg.slice(6)) } } } : base;
const CHECK = [20, 30, 40, 50, 100];
type G = 'man' | 'woman' | 'elder' | 'child';
const GROUPS: G[] = ['man', 'woman', 'elder', 'child'];
const total: Record<G, number> = { man: 0, woman: 0, elder: 0, child: 0 };
const alive: Record<G, number[]> = { man: CHECK.map(() => 0), woman: CHECK.map(() => 0), elder: CHECK.map(() => 0), child: CHECK.map(() => 0) };
const causes: Record<G, Record<string, number>> = { man: {}, woman: {}, elder: {}, child: {} };
const firstWinterDeaths: Record<G, number> = { man: 0, woman: 0, elder: 0, child: 0 };

for (const seed of seeds) {
  const sim = scenario.create?.({ ...makeConfig(scenario.config), seed }) ?? new Simulation({ ...makeConfig(scenario.config), seed });
  if (scenario.create) scenario.setup?.(sim);
  const tpd = sim.config.time.ticksPerDay;
  const group = new Map<number, G>();
  for (const p of sim.people) {
    if (!p.alive) continue;
    const g: G = p.isChild ? 'child' : p.years >= 45 ? 'elder' : p.sex === 'female' ? 'woman' : 'man';
    group.set(p.id, g); total[g]++;
  }
  for (let i = 1; i <= scenario.steps; i++) {
    sim.step();
    if (sim.time.tick % tpd !== 0) continue;
    const day = sim.time.tick / tpd;
    const k = CHECK.indexOf(day);
    if (k >= 0) for (const [id, g] of group) if (sim.peopleById.get(id)?.alive) alive[g][k]!++;
  }
  for (const [id, g] of group) {
    const p = sim.peopleById.get(id)!;
    if (!p.alive) { const c = p.causeOfDeath ?? 'unknown'; causes[g][c] = (causes[g][c] ?? 0) + 1; }
  }
}
console.log(`${variant} seeds ${seeds.join(',')}${bandsArg ? ' ' + bandsArg : ''}: founders alive at days ${CHECK.join(', ')} (of founders)`);
for (const g of GROUPS) console.log(`  ${g.padEnd(6)} ${String(total[g]).padStart(3)} founders  survive: ${alive[g].map((n, i) => `d${CHECK[i]} ${(100 * n / Math.max(1, total[g])).toFixed(0)}%`).join('  ')}   causes ${JSON.stringify(causes[g])}`);
void firstWinterDeaths;
