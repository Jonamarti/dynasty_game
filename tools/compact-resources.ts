/**
 * CLI: measure what a comarca of each kind of ground gives, in the detailed model (M15 step 1a).
 * Deterministic; no network; no RNG outside the seeded worlds it generates.
 *
 *   npx vite-node tools/compact-resources.ts -- [stride] [out.ts]
 *
 * Generates detailed one-comarca maps (what the game opens since 2026-10-08) over both Earth maps and three generated
 * worlds: three comarcas in each region of a regular lattice of `stride` regions (default 3), keys each by its geography
 * alone (`profileKeyOf`) and averages the habitat the generator's own rules accept in it. Writes the table as
 * `src/sim/compact/MeasuredResources.ts` when given a path ending in .ts. The windows are the *calibration*
 * set; the correspondence test checks the profile against windows it did not see (other seeds, other offsets).
 *
 * Positional on purpose (vite-node strips the names of unknown flags). About 100 ms a window, so the default
 * stride takes about ten minutes: it is a one-off, not part of the test run.
 */
import { writeFileSync } from 'node:fs';
import { randomWorldGeography, type WorldGeography } from '../src/sim/world/WorldGeography.ts';
import {
  HABITAT_FIELDS, PROFILE_SPAN, TILES_PER_COMARCA, MIN_ROW_CELLS, keyText, profileKeyOf, foodFromHabitat,
  type Habitat, type HabitatField, type MeasuredResourceTable,
} from '../src/sim/world/ResourceProfile.ts';
import { DEFAULT_CONFIG } from '../src/sim/core/Config.ts';
import { WORLD_FEATURE } from '../src/sim/world/WorldFeatureSeeds.ts';
import { earthSources, generateWindow, measureWindow, type MeasuredWindow } from './resourceMeasure.ts';

type Mapped = Exclude<WorldGeography, { kind: 'legacyIsland' }>;

const args = process.argv.slice(2).filter(a => a !== '--');
const stride = Number(args.find(a => /^\d+$/.test(a)) ?? 3);
const emit = args.find(a => a.endsWith('.ts'));

export const CALIBRATION_RANDOM_SEEDS = ['res-a', 'res-b', 'res-c'] as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
}

const sources: { name: string; geography: Mapped }[] = [
  ...earthSources(),
  ...CALIBRATION_RANDOM_SEEDS.map(seed => ({ name: `random:${seed}`, geography: randomWorldGeography(seed) as Mapped })),
];

interface Acc { cells: number; sums: number[] }
const acc = new Map<string, Acc>();
const windows: MeasuredWindow[] = [];
let skipped = 0;
let seaSeen = 0;
const t0 = Date.now();
/** Generates one window and folds its sixteen comarcas into the per-key sums. Returns false if the map refuses it. */
function add(name: string, geography: Mapped, cx: number, cy: number): boolean {
  let sim;
  // Open sea is nearly two thirds of the lattice and every sea comarca is the same row: keep one in six.
  if (profileKeyOf(geography, cx, cy).relief === 'sea' && seaSeen++ % 6 !== 0) return false;
  const x = cx + PROFILE_SPAN / 2, y = cy + PROFILE_SPAN / 2;
  try { sim = generateWindow(geography, x, y, `res-measure:${name}`); } catch { skipped++; return false; }
  const measured = measureWindow(sim);
  windows.push(measured);
  const originX = cx, originY = cy;
  for (let cy = 0; cy < PROFILE_SPAN; cy++) for (let cx = 0; cx < PROFILE_SPAN; cx++) {
    const key = keyText(profileKeyOf(geography, originX + cx, originY + cy));
    const cell = measured.cells[cy * PROFILE_SPAN + cx]!;
    const a = acc.get(key) ?? { cells: 0, sums: HABITAT_FIELDS.map(() => 0) };
    a.cells++;
    HABITAT_FIELDS.forEach((f, i) => { a.sums[i]! += cell[f] / TILES_PER_COMARCA; });
    acc.set(key, a);
  }
  return true;
}

for (const { name, geography } of sources) {
  const map = geography.map;
  const perRegion = map.width / map.regionsWide;
  let count = 0;
  // Three comarcas of each lattice region, at offsets no later test lattice uses (the correspondence test takes others).
  const offsets = [[2, 2], [5, 7], [8, 4]] as const;
  for (let ry = 1; ry < map.regionsHigh - 1; ry += stride) {
    // Alternate rows shift the lattice by half a stride so the windows do not all sit on one column of regions.
    for (let rx = (Math.floor(ry / stride) % 2) * Math.floor(stride / 2); rx < map.regionsWide; rx += stride) {
      for (const [ox, oy] of offsets) {
        if (add(name, geography, Math.floor(rx * perRegion + ox * perRegion / 10), Math.floor(ry * perRegion + oy * perRegion / 10))) count++;
      }
    }
  }
  // The lattice almost never lands on a lake (the Earth atlas flags five regions), so the lake class would stay
  // unmeasured: add a window on every region the geography flags as a lake.
  if (geography.kind === 'earth') {
    for (const region of geography.map.regions) {
      if ((region.features & WORLD_FEATURE.lake) === 0) continue;
      for (const [ox, oy] of offsets) {
        if (add(name, geography, Math.floor(region.x * perRegion + ox * perRegion / 10), Math.floor(region.y * perRegion + oy * perRegion / 10))) count++;
      }
    }
  }
  console.log(`${name}: ${count} windows (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

const rows: Record<string, number[]> = {};
for (const key of [...acc.keys()].sort()) {
  const a = acc.get(key)!;
  rows[key] = [a.cells, ...a.sums.map(s => Math.round(s / a.cells * 10000) / 10000)];
}

// Density: the quota over the median window that has any of the habitat (see ResourceProfile's header, point 2).
const world = DEFAULT_CONFIG.world;
const densityOf = (quota: number, fields: HabitatField[]) => {
  const tiles = windows.map(w => fields.reduce((s, f) => s + w.tiles[f], 0)).filter(t => t > 0);
  const medianTiles = median(tiles);
  return { quota, medianTiles, perTile: medianTiles > 0 ? Math.round(quota / medianTiles * 1e6) / 1e6 : 0 };
};
const density = {
  berries: densityOf(world.berryBushes, ['berry']),
  grain: densityOf(world.wildGrainPatches, ['grain']),
  herds: densityOf(world.gameHerds, ['forage']),
  fish: densityOf(world.fishingSpots, ['shallowFresh', 'shallowSalt']),
};
const table: MeasuredResourceTable = {
  source: { windows: windows.length, cells: windows.length * PROFILE_SPAN * PROFILE_SPAN, sources: sources.map(s => s.name), span: PROFILE_SPAN },
  rows: rows as unknown as MeasuredResourceTable['rows'],
  density,
};

console.log(`\n${windows.length} windows, ${skipped} refused by the map, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('\nDENSITY (quota / median habitat tiles of a window that has any)');
for (const [k, d] of Object.entries(density)) console.log(`  ${k.padEnd(8)} quota ${d.quota}  median tiles ${d.medianTiles}  per tile ${d.perTile}`);
console.log('\nHABITAT BY KEY (share of a comarca\'s tiles)   cells  ' + HABITAT_FIELDS.join(' '));
for (const [k, r] of Object.entries(rows)) console.log(`  ${k.padEnd(16)} ${String(r[0]).padStart(5)}  ${r.slice(1).map(v => v.toFixed(2)).join(' ')}`);

console.log('\nPOTENTIAL RATIONS A DAY PER COMARCA (rows with at least ' + MIN_ROW_CELLS + ' comarcas; wild cereal assumed present)');
console.log('  key              cells  bushes herds shoals  spring summer autumn winter  (gather/fish/game in the leanest season)');
for (const [k, r] of Object.entries(rows)) {
  if (r[0]! < MIN_ROW_CELLS) continue;
  const share = Object.fromEntries(HABITAT_FIELDS.map((f, i) => [f, r[i + 1]!])) as Habitat;
  const f = foodFromHabitat(share, true, table);
  const lean = (Object.entries(f.rations).sort((a, b) => a[1].total - b[1].total)[0]!)[1];
  console.log(`  ${k.padEnd(16)} ${String(r[0]).padStart(5)}  ${f.nodes.bushes.toFixed(1).padStart(5)} ${f.nodes.herds.toFixed(1).padStart(5)} ${f.nodes.shoals.toFixed(1).padStart(6)}  ` +
    `${f.rations.spring.total.toFixed(1).padStart(6)} ${f.rations.summer.total.toFixed(1).padStart(6)} ${f.rations.autumn.total.toFixed(1).padStart(6)} ${f.rations.winter.total.toFixed(1).padStart(6)}  ` +
    `(${lean.gather.toFixed(1)}/${lean.fish.toFixed(1)}/${lean.game.toFixed(1)})`);
}

if (emit) {
  const header = `/**
 * GENERATED by tools/compact-resources.ts (M15 step 1a) — do not edit by hand.
 * ${table.source.windows} detailed one-comarca maps (${PROFILE_SPAN} by ${PROFILE_SPAN}) (${table.source.cells} comarcas) over: ${table.source.sources.join(', ')}; lattice stride ${stride} regions.
 * Regenerate with: npx vite-node tools/compact-resources.ts -- ${stride} ${emit}
 * \`rows\`: key (relief|wetness class|water) -> [comarcas measured, then the share of a comarca's tiles for each of
 * HABITAT_FIELDS], counted with the generator's own habitat rules. \`density\`: the generator's quota over the
 * median window that holds any of that habitat (nodes per habitat tile). See world/ResourceProfile.ts.
 */
import type { MeasuredResourceTable } from '../world/ResourceProfile.ts';

export const MEASURED_RESOURCES: MeasuredResourceTable = ${JSON.stringify(table)};
`;
  writeFileSync(emit, header);
  console.log('wrote ' + emit);
}
