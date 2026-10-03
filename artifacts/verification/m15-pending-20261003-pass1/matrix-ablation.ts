/** Reproduce the legacy tool ablation and retain applicability, not just failures. */
import { SCENARIOS, runScenario, markMatrixRun } from '../../../tools/simcheck.ts';
markMatrixRun();
const names = ['conquest', 'craft', 'farmers', 'feasts', 'herders', 'labour', 'lean', 'millers', 'polity', 'porters', 'scribes', 'stewards'];
for (const name of names) {
  const scenario = SCENARIOS[name]!;
  const report = runScenario({ ...scenario, config: { ...scenario.config,
    carry: { ...scenario.config.carry, autoEquipTools: false } } });
  console.log(JSON.stringify({ scenario: name, checks: report.checks }));
}
