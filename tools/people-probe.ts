/**
 * CLI: what the people and the larders look like, every `every` days, in a detailed run. Companion to
 * tools/people-trajectory.ts for the 32c `lean` investigation: it asks whether the second-spring collapse is a
 * shortage of food in the world, of food in the stores, or of condition in the people.
 *   npx vite-node tools/people-probe.ts -- <variant> <seed,...> [every=5] [bands=N]
 * Nutrition columns are points (sum of count x `ITEMS[id].nutrition`) of: building stores, piles on the ground, packs.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { ITEMS, type Inventory } from '../src/sim/entities/Item.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const variant = args[0] ?? 'lean';
const seeds = (args[1] ?? 'delta').split(',');
const every = Number(args.find(a => a.startsWith('every='))?.slice(6) ?? 5);
const bandsArg = args.find(a => a.startsWith('bands='));
const base = SCENARIOS[variant]!;
const scenario = bandsArg ? { ...base, config: { ...base.config, population: { ...base.config.population, bands: Number(bandsArg.slice(6)) } } } : base;
const points = (inv: Inventory) => inv.entries().reduce((s, [id, n]) => s + n * (ITEMS[id]?.nutrition ?? 0), 0);
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const f = (x: number, d = 0) => Number.isFinite(x) ? x.toFixed(d) : 'n/a';

for (const seed of seeds) {
  const sim = scenario.create?.({ ...makeConfig(scenario.config), seed }) ?? new Simulation({ ...makeConfig(scenario.config), seed });
  if (scenario.create) scenario.setup?.(sim);
  const tpd = sim.config.time.ticksPerDay;
  console.log(`\n== ${variant} ${seed}: day season pop  fertileW  men  kids  health  hunger  thirst  cold  fatigue  %idle  store  piles  packs  worldFood`);
  const row = (day: number) => {
    const live = sim.people.filter(p => p.alive);
    const idle = live.filter(p => ['idle', 'rest', 'sleep', 'wait'].includes(p.order ?? p.action)).length;
    const store = sim.buildings.reduce((s, b) => s + points(b.store), 0);
    const piles = sim.piles.reduce((s, p) => s + points(p.contents), 0);
    const packs = live.reduce((s, p) => s + points(p.inventory), 0);
    const food = sim.nodes.reduce((s, n) => s + (n.depleted ? 0 : n.amount), 0);
    console.log(`  ${String(day).padStart(3)} ${String(sim.time.season).padEnd(6)} ${String(live.length).padStart(3)} ${String(live.filter(p => p.sex === 'female' && p.canBearChildren).length).padStart(4)} ${String(live.filter(p => p.sex === 'male' && !p.isChild).length).padStart(4)} ${String(live.filter(p => p.isChild).length).padStart(4)} ${f(mean(live.map(p => p.health))).padStart(5)} ${f(mean(live.map(p => p.needs.hunger))).padStart(5)} ${f(mean(live.map(p => p.needs.thirst))).padStart(5)} ${f(mean(live.map(p => p.needs.cold))).padStart(5)} ${f(mean(live.map(p => p.needs.fatigue))).padStart(5)} ${f(100 * idle / Math.max(1, live.length)).padStart(4)} ${f(store).padStart(6)} ${f(piles).padStart(6)} ${f(packs).padStart(6)} ${f(food).padStart(6)}`);
  };
  row(0);
  for (let i = 1; i <= scenario.steps; i++) {
    sim.step();
    if (sim.time.tick % tpd === 0) { const day = sim.time.tick / tpd; if (day % every === 0) row(day); }
  }
}
