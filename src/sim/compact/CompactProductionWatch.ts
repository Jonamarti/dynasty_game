/**
 * Read-only interpretation of production counters emitted by ActionSystem.
 * Counts describe completed inventory changes and actual work ticks; this
 * module never estimates work from a recipe duration or a resource potential.
 */
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';

export interface CompactProductionActionObservation {
  readonly workTicks: number;
  readonly inputItems: Readonly<Record<string, number>>;
  readonly outputItems: Readonly<Record<string, number>>;
  readonly inputNutrition: number;
  readonly outputNutrition: number;
  readonly netNutrition: number;
  readonly outputUnitsPerWorkTick: number | null;
  readonly netNutritionPerWorkTick: number | null;
  readonly materialWithoutWork: boolean;
  readonly coverage: 'measured' | 'n/a';
}

export interface CompactProductionObservation {
  readonly recordType: 'CompactProductionObservation';
  readonly version: 2;
  readonly interpretation: 'single-run mechanism observation; not a calibrated forecast';
  readonly actions: Readonly<Record<'farm' | 'processing', CompactProductionActionObservation>>;
  /** Named recipe rows make aggregate processing counters attributable without turning them into rates. */
  readonly recipes: Readonly<Record<string, CompactProductionActionObservation>>;
}

function count(snapshot: Readonly<Record<string, number>>, key: string): number {
  const value = snapshot[key] ?? 0;
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`telemetry ${key} must be finite and non-negative`);
  return value;
}

function items(snapshot: Readonly<Record<string, number>>, prefix: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (!key.startsWith(prefix)) continue;
    const itemId = key.slice(prefix.length);
    if (!itemId || !ITEMS[itemId]) throw new RangeError(`unknown production item ${itemId || '(empty)'}`);
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`telemetry ${key} must be a safe non-negative item count`);
    result[itemId] = value;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function nutrition(basket: Readonly<Record<string, number>>): number {
  return Object.entries(basket).reduce((total, [itemId, amount]) =>
    total + (ITEMS[itemId]?.nutrition ?? 0) * amount, 0);
}

function actionObservation(
  snapshot: Readonly<Record<string, number>>,
  action: 'farm' | 'processing',
): CompactProductionActionObservation {
  const workTicks = count(snapshot, `compact_production_work_ticks_${action}`);
  if (!Number.isSafeInteger(workTicks)) throw new RangeError(`${action} work ticks must be a safe integer`);
  const inputItems = items(snapshot, `compact_production_input_${action}_`);
  const outputItems = items(snapshot, `compact_production_output_${action}_`);
  const inputNutrition = nutrition(inputItems);
  const outputNutrition = nutrition(outputItems);
  const outputUnits = Object.values(outputItems).reduce((sum, amount) => sum + amount, 0);
  const hasMaterial = Object.values(inputItems).some(value => value > 0) || Object.values(outputItems).some(value => value > 0);
  const netNutrition = outputNutrition - inputNutrition;
  if (![inputNutrition, outputNutrition, outputUnits, netNutrition].every(Number.isFinite)) {
    throw new RangeError(`${action} production totals must be finite`);
  }
  return Object.freeze({
    workTicks,
    inputItems: Object.freeze(inputItems), outputItems: Object.freeze(outputItems),
    inputNutrition, outputNutrition, netNutrition,
    outputUnitsPerWorkTick: workTicks > 0 ? outputUnits / workTicks : null,
    netNutritionPerWorkTick: workTicks > 0 ? netNutrition / workTicks : null,
    materialWithoutWork: hasMaterial && workTicks === 0,
    coverage: workTicks > 0 ? 'measured' : 'n/a',
  });
}

function recipeObservations(snapshot: Readonly<Record<string, number>>): Readonly<Record<string, CompactProductionActionObservation>> {
  const root = 'compact_production_';
  const recipeIds = new Set<string>();
  const knownRecipeIds = Object.keys(RECIPES).sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const key of Object.keys(snapshot)) {
    const workPrefix = `${root}work_ticks_recipe_`, inputPrefix = `${root}input_recipe_`, outputPrefix = `${root}output_recipe_`;
    const prefix = key.startsWith(workPrefix) ? workPrefix : key.startsWith(inputPrefix) ? inputPrefix : key.startsWith(outputPrefix) ? outputPrefix : null;
    if (!prefix) continue;
    const suffix = key.slice(prefix.length);
    const recipeId = knownRecipeIds.find(id => suffix === id || suffix.startsWith(`${id}_`));
    if (!recipeId) throw new RangeError(`unknown production recipe in ${key}`);
    if (prefix === workPrefix && suffix !== recipeId) throw new RangeError(`invalid production work counter ${key}`);
    recipeIds.add(recipeId);
  }
  const rows: Record<string, CompactProductionActionObservation> = {};
  for (const recipeId of [...recipeIds].sort()) {
    const workTicks = count(snapshot, `${root}work_ticks_recipe_${recipeId}`);
    if (!Number.isSafeInteger(workTicks)) throw new RangeError(`${recipeId} work ticks must be a safe integer`);
    const inputItems = items(snapshot, `${root}input_recipe_${recipeId}_`);
    const outputItems = items(snapshot, `${root}output_recipe_${recipeId}_`);
    const inputNutrition = nutrition(inputItems), outputNutrition = nutrition(outputItems);
    const outputUnits = Object.values(outputItems).reduce((sum, amount) => sum + amount, 0);
    const hasMaterial = Object.values(inputItems).some(value => value > 0) || Object.values(outputItems).some(value => value > 0);
    const netNutrition = outputNutrition - inputNutrition;
    if (![inputNutrition, outputNutrition, outputUnits, netNutrition].every(Number.isFinite)) throw new RangeError(`${recipeId} production totals must be finite`);
    rows[recipeId] = Object.freeze({ workTicks, inputItems: Object.freeze(inputItems), outputItems: Object.freeze(outputItems),
      inputNutrition, outputNutrition, netNutrition,
      outputUnitsPerWorkTick: workTicks > 0 ? outputUnits / workTicks : null,
      netNutritionPerWorkTick: workTicks > 0 ? netNutrition / workTicks : null,
      materialWithoutWork: hasMaterial && workTicks === 0, coverage: workTicks > 0 ? 'measured' : 'n/a' });
  }
  return Object.freeze(rows);
}

/** Build a detached JSON-safe observation. It does not reset or mutate telemetry. */
export function observeCompactProduction(
  snapshot: Readonly<Record<string, number>>,
): CompactProductionObservation {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('telemetry snapshot is required');
  return Object.freeze({
    recordType: 'CompactProductionObservation', version: 2,
    interpretation: 'single-run mechanism observation; not a calibrated forecast',
    actions: Object.freeze({ farm: actionObservation(snapshot, 'farm'), processing: actionObservation(snapshot, 'processing') }),
    recipes: recipeObservations(snapshot),
  });
}
