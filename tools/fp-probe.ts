// Temporary probe: which checkpoint object nodes differ between runtimes at step 0?
import { readFileSync, writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { SCENARIOS } from './simcheck.ts';
import { toCheckpointRecord } from '../src/sim/persistence/CheckpointRecords.ts';
import { checkpointFingerprint, stableJson } from './checkpoint-fingerprint.ts';
const scenario = SCENARIOS.band!;
const config = { ...scenario.config, seed: '1' };
const sim = scenario.create?.(config) ?? new Simulation(config);
scenario.setup?.(sim);
const rec = toCheckpointRecord(sim) as { objects: { graph: { nodes: unknown[] } } };
const nodes = rec.objects.graph.nodes;
const fps = nodes.map(n => checkpointFingerprint(n));
if (process.argv.includes('--write')) { writeFileSync('tools/fp-probe-ref.json', JSON.stringify(fps)); process.exit(0); }
const ref = JSON.parse(readFileSync('tools/fp-probe-ref.json', 'utf8')) as string[];
const diff = fps.map((f, i) => (f !== ref[i] ? i : -1)).filter(i => i >= 0);
console.log(`nodes ${nodes.length} ref ${ref.length} differing ${diff.length}: ${diff.slice(0, 40).join(',')}`);
for (const i of diff.slice(0, 8)) console.log(`node ${i}: ${stableJson(nodes[i]).slice(0, 600)}`);
