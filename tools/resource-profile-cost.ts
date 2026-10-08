/**
 * CLI: what does it cost to compute a comarca's resource profile? (M15 step 1a: "if it is cheap, do not store it".)
 *
 *   npx vite-node tools/resource-profile-cost.ts
 *
 * Times `comarcaResourceProfile` over a spread of comarcas on the real Earth and on a generated world, cold (first
 * call on a fresh geography, which fills the river caches) and warm, and the one-off `foodModel()` build. Wall clock
 * on this machine; run it again before quoting a number.
 */
import { randomWorldGeography } from '../src/sim/world/WorldGeography.ts';
import { comarcaResourceProfile, buildFoodModel } from '../src/sim/world/ResourceProfile.ts';
import { earthSources } from './resourceMeasure.ts';

const now = () => Number(process.hrtime.bigint()) / 1e6;
const t0 = now();
buildFoodModel();
console.log(`foodModel build (once per process): ${(now() - t0).toFixed(1)} ms`);

const points: [number, number][] = [];
for (let i = 0; i < 400; i++) points.push([(i * 37) % 960, 30 + (i * 53) % 400]);

for (const [name, make] of [
  ['earth-12000-bce', () => earthSources()[0]!.geography],
  ['random:cost', () => randomWorldGeography('cost')],
] as const) {
  const geography = make();
  const cold0 = now();
  for (const [x, y] of points) comarcaResourceProfile(geography, x, y);
  const cold = (now() - cold0) / points.length;
  const warm0 = now();
  for (let pass = 0; pass < 5; pass++) for (const [x, y] of points) comarcaResourceProfile(geography, x, y);
  const warm = (now() - warm0) / (5 * points.length);
  const one0 = now();
  const fresh = make();
  comarcaResourceProfile(fresh, 480, 240);
  const single = now() - one0;
  console.log(`${name.padEnd(16)} first pass ${(cold * 1000).toFixed(0)} us/comarca, warm ${(warm * 1000).toFixed(0)} us/comarca ` +
    `(${points.length} comarcas); a single comarca on a freshly built geography ${single.toFixed(1)} ms`);
}
