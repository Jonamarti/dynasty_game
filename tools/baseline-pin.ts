import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { switchesOffFingerprints } from './switches-off-checkpoint.ts';

const output = resolve('fixtures/switches-off.json');
const fingerprints = switchesOffFingerprints();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(fingerprints, null, 2) + '\n', 'utf8');
console.log(`Pinned switches-off checkpoint fingerprints at ${output}`);
for (const [seed, fingerprint] of Object.entries(fingerprints)) console.log(`  ${seed}: ${fingerprint}`);
