/**
 * CLI: the correspondence experiment of `compactCorrespondence.ts` over a few seeds.
 *
 *   npx vite-node tools/compact-correspond.ts -- <scenario> <seed,seed,...> [warmupSteps] [days]
 *
 * Needs `src/sim/compact/MeasuredRates.ts` (emit it with `tools/compact-rates.ts`).
 * Use seeds that were NOT used to measure the table.
 */
import { MEASURED_RATES, MEASURED_SOURCE } from '../src/sim/compact/MeasuredRates.ts';
import { IntakeModel } from '../src/sim/compact/CompactIntake.ts';
import { pool, runCorrespondence, type ArmStats } from './compactCorrespondence.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const scenario = args[0] ?? 'lean';
const seeds = (args[1] ?? 'delta').split(',');
const warmupSteps = Number(args[2] ?? 7200);
const days = Number(args[3] ?? 10);
const life = args[4] === 'life';
const model = new IntakeModel(MEASURED_RATES);
const f = (v: number, d = 1) => v.toFixed(d);
const line = (name: string, a: ArmStats) =>
  `  ${name.padEnd(10)} n=${a.n} alive=${a.alive} (${f(100 * a.alive / a.n)}%) mean hunger ${f(a.hunger)} thirst ${f(a.thirst)} deaths ${JSON.stringify(a.causes)} births ${a.births} old-age ${a.oldAge}`;
console.log(`table measured on ${JSON.stringify(MEASURED_SOURCE)}; validating on ${scenario} seeds ${seeds.join(',')}, ${warmupSteps} warm-up steps, ${days} days`);
const rows = seeds.map(seed => {
  const r = runCorrespondence({ scenario, seed, warmupSteps, windowSteps: 2400, days, model, life });
  console.log(`seed ${seed}: forecast capacity ${Object.entries(r.scales).map(([b, c]) => `band${b} ${c ? f(c.hungryZero, 2) : 'n/a'}`).join('; ')}`);
  console.log(`  oracle capacity ${Object.entries(r.oracleScales).map(([b, c]) => `band${b} ${c ? f(c.hungryZero, 2) : 'n/a'}`).join('; ')}`);
  console.log(line('detailed', r.detailed)); console.log(line('compact', r.compact)); console.log(line('oracle', r.oracle)); console.log(line('closed', r.closed));
  return r;
});
console.log('POOLED');
console.log(line('detailed', pool(rows.map(r => r.detailed))));
console.log(line('compact', pool(rows.map(r => r.compact))));
console.log(line('oracle', pool(rows.map(r => r.oracle))));
console.log(line('closed', pool(rows.map(r => r.closed))));
