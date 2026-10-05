import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const seed = process.argv.find(value => value.startsWith('--seed='))?.slice(7) ?? 'sigma';
const scenarioName = process.argv.find(value => value.startsWith('--scenario='))?.slice(11) ?? 'century';
const result = [];
for (const arm of ['baseline', 'final']) {
  const root = new URL(`./${arm}/`, import.meta.url);
  const { Simulation } = await import(fileURLToPath(new URL('src/sim/core/Simulation.ts', root)));
  const { telemetry } = await import(fileURLToPath(new URL('src/sim/core/Telemetry.ts', root)));
  const { SCENARIOS } = await import(fileURLToPath(new URL('tools/simcheck.ts', root)));
  const scenario = SCENARIOS[scenarioName];
  telemetry.reset(); telemetry.enable();
  const sim = new Simulation({ ...scenario.config, seed });
  scenario.setup?.(sim);
  const initialRosterHash = createHash('sha256').update(JSON.stringify(sim.livingPeople().map(person => ({
    name: person.name, x: person.x, y: person.y, traits: person.traits,
    skills: Object.fromEntries(Object.entries(person.skills).filter(([key]) => key !== 'swim')),
  })))).digest('hex');
  let peak = sim.livingPeople().length;
  const samples = [];
  for (let tick = 0; tick < scenario.steps; tick++) {
    sim.step(); peak = Math.max(peak, sim.livingPeople().length);
    if ((tick + 1) % 5000 === 0) samples.push({ tick: tick + 1, alive: sim.livingPeople().length });
  }
  const deaths: Record<string, number> = {};
  for (const person of sim.peopleById.values()) {
    if (person.alive) continue;
    const cause = person.causeOfDeath ?? 'unknown';
    deaths[cause] = (deaths[cause] ?? 0) + 1;
  }
  const row = { arm, scenario: scenarioName, seed, initialRosterHash, peak, end: sim.livingPeople().length, deaths, samples,
    telemetry: telemetry.snapshot() };
  result.push(row);
  console.log(JSON.stringify({ ...row, telemetry: undefined }));
}
writeFileSync(new URL(`probe-${scenarioName}-${seed}.json`, import.meta.url), JSON.stringify(result, null, 2) + '\n');
