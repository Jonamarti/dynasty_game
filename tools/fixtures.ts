import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_CONFIG, type DeepPartial, type SimConfig } from '../src/sim/core/Config.ts';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { CHECKPOINT_RECORD_VERSION, toCheckpointRecord, type CheckpointRecord } from '../src/sim/persistence/CheckpointRecords.ts';
import { SCENARIOS, type Scenario } from './simcheck.ts';
import { stableJson } from './checkpoint-fingerprint.ts';

export interface FixtureRecipe {
  readonly name: string;
  readonly scenario: string;
  readonly seed: string | number;
  readonly steps: number;
  readonly minAlive: number;
  readonly description: string;
}

export const FIXTURE_RECIPES: readonly FixtureRecipe[] = [
  { name: 'after_first_winter', scenario: 'band', seed: 'band', steps: 10_800, minAlive: 6,
    description: 'A normal band after its first winter, for foresight.' },
  { name: 'band_with_shelter', scenario: 'hearths', seed: 'hearths', steps: 16_000, minAlive: 8,
    description: 'Two bands with fire and shelter, for assembly and building.' },
  { name: 'village_with_crafts', scenario: 'labour', seed: 'foreman', steps: 12_000, minAlive: 12,
    description: 'A chiefdom with working crafts, for command and craft.' },
  { name: 'two_rival_bands', scenario: 'conflicts', seed: 'conflicts', steps: 80, minAlive: 10,
    description: 'Two nearby bands with a witnessed conflict, for rivalry.' },
  { name: 'chiefdom_with_surplus', scenario: 'polity', seed: 'ziggurat', steps: 24_000, minAlive: 12,
    description: 'A chiefdom with surplus and state knowledge, for authority.' },
];

const recipesByName = new Map(FIXTURE_RECIPES.map(recipe => [recipe.name, recipe]));
const DEFAULT_WORLDS_DIRECTORY = resolve('fixtures/worlds');

function configFieldPaths(value: unknown, parent = 'config'): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [parent];
  const fields = Object.keys(value as Record<string, unknown>);
  if (fields.length === 0) return [parent];
  return fields.flatMap(key => configFieldPaths((value as Record<string, unknown>)[key], `${parent}.${key}`));
}

function scenarioFor(recipe: FixtureRecipe): Scenario {
  const scenario = SCENARIOS[recipe.scenario];
  if (!scenario) throw new Error(`Fixture recipe "${recipe.name}" names unknown scenario "${recipe.scenario}"`);
  return scenario;
}

/** Recipe, source scenario config, codec version, and every config leaf gate cache validity. */
export function fixtureKey(recipe: FixtureRecipe): string {
  const scenario = scenarioFor(recipe);
  const keyInput = {
    recipe,
    scenarioConfig: scenario.config,
    checkpointVersion: CHECKPOINT_RECORD_VERSION,
    configFieldPaths: configFieldPaths(DEFAULT_CONFIG).sort(),
  };
  return createHash('sha256').update(stableJson(keyInput), 'utf8').digest('hex');
}

function createRecipeWorld(recipe: FixtureRecipe): Simulation {
  const scenario = scenarioFor(recipe);
  const config = { ...scenario.config, seed: recipe.seed };
  const sim = scenario.create?.(config) ?? new Simulation(config);
  scenario.setup?.(sim);
  if (!sim.player) sim.headlessFocusBand ??= sim.livingPeople()[0]?.bandId ?? null;
  // A comarca arrival is an observable boundary: step one at a time so no
  // recipe jumps across it and drops the event that establishes the new world.
  for (let step = 0; step < recipe.steps; step++) sim.step();
  const alive = sim.livingPeople().length;
  if (alive < recipe.minAlive) {
    throw new Error(`Fixture recipe "${recipe.name}" ended with ${alive} living people; minimum is ${recipe.minAlive}`);
  }
  return sim;
}

function worldPaths(name: string, worldsDirectory: string): { record: string; key: string } {
  return { record: join(worldsDirectory, `${name}.json`), key: join(worldsDirectory, `${name}.key`) };
}

export function buildFixtureWorld(recipe: FixtureRecipe, worldsDirectory = DEFAULT_WORLDS_DIRECTORY): CheckpointRecord {
  const sim = createRecipeWorld(recipe);
  const record = toCheckpointRecord(sim);
  const key = fixtureKey(recipe);
  const paths = worldPaths(recipe.name, worldsDirectory);
  mkdirSync(worldsDirectory, { recursive: true });
  writeFileSync(paths.record, JSON.stringify(record, null, 2) + '\n', 'utf8');
  writeFileSync(paths.key, key + '\n', 'utf8');
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function applyOverrides(target: Record<string, unknown>, overrides: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(overrides)) {
    const prior = target[key];
    if (isRecord(value) && isRecord(prior)) applyOverrides(prior, value);
    else if (Array.isArray(value)) target[key] = structuredClone(value);
    else target[key] = value;
  }
}

/** Load a current cached world, rebuilding it when absent or made stale by a recipe/schema change. */
export function loadWorld(name: string, overrides?: DeepPartial<SimConfig>, worldsDirectory = DEFAULT_WORLDS_DIRECTORY): Simulation {
  const recipe = recipesByName.get(name);
  if (!recipe) throw new Error(`Unknown fixture world "${name}"`);
  const paths = worldPaths(name, worldsDirectory);
  const expectedKey = fixtureKey(recipe);
  const savedKey = existsSync(paths.key) ? readFileSync(paths.key, 'utf8').trim() : '';
  if (!existsSync(paths.record) || savedKey !== expectedKey) buildFixtureWorld(recipe, worldsDirectory);

  const record = JSON.parse(readFileSync(paths.record, 'utf8')) as CheckpointRecord;
  const sim = Simulation.fromCheckpointRecord(record);
  if (overrides) applyOverrides(sim.config as unknown as Record<string, unknown>, overrides as Record<string, unknown>);
  return sim;
}
