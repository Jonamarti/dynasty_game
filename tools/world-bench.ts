import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG } from '../src/sim/core/Config.ts';
import { decodeWorldRaster } from '../src/sim/world/WorldBinary.ts';
import {
  BENCH_DEFAULTS,
  benchSummary,
  benchTicksPerYear,
  createBenchWorld,
  perfBudgetStepMicroseconds,
  runBenchYears,
  toByteLength,
} from './world-bench-model.ts';

interface Args { years: number; seed: string; perfPeak: number; map: string; output?: string; }

function parseArgs(argv: string[]): Args {
  const args: Args = {
    years: BENCH_DEFAULTS.years,
    seed: 'm15-world-bench',
    perfPeak: BENCH_DEFAULTS.perfBudgetPeakPeople,
    map: 'earth-12000-bce.bin',
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case '--years': args.years = Number(value); i++; break;
      case '--seed': args.seed = value ?? ''; i++; break;
      case '--perf-peak': args.perfPeak = Number(value); i++; break;
      case '--map': args.map = value ?? ''; i++; break;
      case '--output': args.output = value; i++; break;
      case '--help':
        console.log('world:bench [--years 200] [--seed VALUE] [--perf-peak 31] [--map earth-12000-bce.bin] [--output PATH]');
        process.exit(0);
      default: throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  if (!Number.isInteger(args.years) || args.years < 1) throw new Error('--years must be a positive integer');
  if (!args.seed) throw new Error('--seed must not be empty');
  if (!Number.isFinite(args.perfPeak) || args.perfPeak < 0) throw new Error('--perf-peak must be nonnegative');
  if (!/^[a-z0-9-]+\.bin$/.test(args.map)) throw new Error('--map must be a world atlas .bin filename');
  return args;
}

export function runWorldBench(args: Args) {
  const assetPath = resolve('public/world', args.map);
  const raster = decodeWorldRaster(new Uint8Array(readFileSync(assetPath)));
  const beforeSetup = process.memoryUsage();
  const world = createBenchWorld(raster, args.seed);
  const afterSetup = process.memoryUsage();
  const start = performance.now();
  runBenchYears(world, args.years);
  const elapsedMs = performance.now() - start;
  const afterRun = process.memoryUsage();

  const ticksPerYear = benchTicksPerYear();
  const simulatedTicks = args.years * ticksPerYear;
  const msPerSeason = elapsedMs / (args.years * 4);
  const microsecondsPerTick = elapsedMs * 1_000 / simulatedTicks;
  const stepBudgetMicroseconds = perfBudgetStepMicroseconds(args.perfPeak);
  const allowedMicroseconds = stepBudgetMicroseconds * 0.1;
  const stateBytes = toByteLength(world);
  const summary = benchSummary(world);
  const passed = microsecondsPerTick < allowedMicroseconds;

  return {
    benchmark: 'PeopleSim-shaped workload (synthetic fixture; no PeopleSim/LOD implementation)',
    map: args.map,
    seed: args.seed,
    years: args.years,
    timeModel: {
      ticksPerDay: DEFAULT_CONFIG.time.ticksPerDay,
      daysPerSeason: DEFAULT_CONFIG.time.daysPerSeason,
      seasonsPerYear: 4,
      ticksPerYear,
      simulatedTicks,
    },
    world: summary,
    timing: {
      totalMs: round(elapsedMs),
      averageMsPerSeasonalUpdate: round(msPerSeason),
      amortizedMicrosecondsPerSimulationTick: round(microsecondsPerTick),
      perfBudgetReference: `sim:check perf-budget floor formula at ${args.perfPeak} peak people`,
      referenceStepsPerSecondFloor: round(1_000_000 / stepBudgetMicroseconds),
      referenceMicrosecondsPerStep: stepBudgetMicroseconds,
      allowedMicrosecondsPerTick: round(allowedMicroseconds),
      passed,
    },
    memory: {
      peopleStateJsonBytes: stateBytes,
      heapUsedBeforeSetupBytes: beforeSetup.heapUsed,
      heapUsedAfterSetupBytes: afterSetup.heapUsed,
      heapUsedAfterRunBytes: afterRun.heapUsed,
      heapUsedSetupDeltaBytes: afterSetup.heapUsed - beforeSetup.heapUsed,
      heapUsedRunDeltaBytes: afterRun.heapUsed - afterSetup.heapUsed,
      rssBeforeSetupBytes: beforeSetup.rss,
      rssAfterSetupBytes: afterSetup.rss,
      rssAfterRunBytes: afterRun.rss,
      rssSetupDeltaBytes: afterSetup.rss - beforeSetup.rss,
      rssRunDeltaBytes: afterRun.rss - afterSetup.rss,
      maxRssKiB: process.resourceUsage().maxRSS,
    },
    caveat: 'The fixture reads the planned level-two record shape and operation loops. Demography, invention, regional eligibility, social outcomes, and LOD transitions are not calibrated game rules.',
  };
}

function round(value: number): number { return Math.round(value * 1_000) / 1_000; }

try {
  const args = parseArgs(process.argv.slice(2));
  const result = runWorldBench(args);
  const json = JSON.stringify(result, null, 2);
  if (args.output) writeFileSync(resolve(args.output), `${json}\n`, 'utf8');
  console.log(json);
  if (!result.timing.passed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
