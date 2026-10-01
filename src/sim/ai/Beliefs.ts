import type { Person } from '../entities/Person.ts';
import { curiosityNeed } from './Temperament.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { BUILDINGS } from '../entities/Building.ts';
import type { Tech } from '../knowledge/Tech.ts';

export type BeliefSource = 'instinct' | 'own' | 'seen' | 'told' | 'inherited';
export interface Belief { value: number; confidence: number; source: BeliefSource; tick: number }

export const BELIEF_KEYS = [
  'yield:forage', 'yield:fish', 'yield:pick', 'yield:hunt',
] as const;
export const BELIEF_CAPACITY = 48;
/** First-cohort instrument baselines: keeping an untried action neutral makes
 * this reader respond only after personal experience supplies evidence. */
export const YIELD_INSTINCT: Readonly<Record<string, number>> = {
  'yield:forage': 12, 'yield:fish': 10, 'yield:pick': 16, 'yield:hunt': 8,
};
// `toxic_berries` is in the list on purpose: the baneberry looks like a berry,
// so everybody expects it to be one until they know better (21d).
const KNOWN_RAW_FOOD = ['berries', 'toxic_berries', 'apple', 'pear', 'plum', 'hazelnut', 'meat', 'fish', 'milk'] as const;

/** Per-person expectations. Map iteration preserves stable eviction and inheritance order. */
export class Beliefs {
  static readonly MAX = BELIEF_CAPACITY;
  private readonly values = new Map<string, Belief>();

  constructor(private readonly onNewBelief?: () => void) {}

  get(key: string): Belief | undefined { return this.values.get(key); }

  expect(key: string): { value: number; confidence: number } {
    const learned = this.values.get(key);
    if (learned) return { value: learned.value, confidence: learned.confidence };
    if (key.startsWith('eat:')) {
      const itemId = key.slice(4);
      const item = ITEMS[itemId];
      if (item && (KNOWN_RAW_FOOD as readonly string[]).includes(item.id)) {
        return { value: item.nutrition, confidence: 0.5 };
      }
      for (const recipe of Object.values(RECIPES)) {
        if ((recipe.output[itemId] ?? 0) <= 0) continue;
        let best = 0;
        for (const [ingredient, amount] of Object.entries(recipe.ingredients)) {
          if ((ITEMS[ingredient]?.nutrition ?? 0) <= 0) continue;
          const learnedIngredient = this.values.get('eat:' + ingredient);
          const instinct = ITEMS[ingredient]?.nutrition ?? 10;
          best = Math.max(best, (learnedIngredient?.value ?? instinct) * amount /
            Math.max(1, recipe.output[itemId]));
        }
        return { value: best > 0 ? best : 10, confidence: 0 };
      }
      return { value: 10, confidence: 0 };
    }
    return { value: 0, confidence: 0 };
  }

  learn(key: string, observed: number, alpha: number, source: BeliefSource, tick: number): void {
    if (!Number.isFinite(observed) || !Number.isFinite(alpha) || alpha <= 0) return;
    const rate = Math.min(1, alpha);
    const old = this.values.get(key);
    if (old) {
      old.value += (observed - old.value) * rate;
      old.confidence = Math.min(1, old.confidence + rate * (1 - old.confidence));
      old.source = source;
      old.tick = tick;
      return;
    }
    if (this.values.size >= BELIEF_CAPACITY) {
      let weakestKey: string | undefined;
      let weakest: Belief | undefined;
      for (const [candidate, belief] of this.values) {
        if (!weakest || belief.confidence < weakest.confidence ||
          (belief.confidence === weakest.confidence && belief.tick < weakest.tick)) {
          weakest = belief;
          weakestKey = candidate;
        }
      }
      if (weakestKey !== undefined) this.values.delete(weakestKey);
    }
    this.values.set(key, { value: observed, confidence: rate, source, tick });
    this.onNewBelief?.();
  }

  entries(): IterableIterator<[string, Belief]> { return this.values.entries(); }

  inherit(scale: number, onNewBelief?: () => void): Beliefs {
    const copy = new Beliefs(onNewBelief);
    const factor = Math.max(0, Math.min(1, scale));
    for (const [key, belief] of this.values) {
      copy.values.set(key, { ...belief, confidence: belief.confidence * factor, source: 'inherited' });
    }
    return copy;
  }
}

/** Resolve a known or learned food expectation without granting unknown foods knowledge. */
export function expectedFood(person: Person, itemId: string, unknownFood = 10): number {
  const belief = person.beliefs.expect('eat:' + itemId);
  if (belief.confidence > 0) return belief.value;
  // For a crafted food, project the most valued ingredient rather than treating
  // an unfamiliar label as objectively bad. Recipe chains stay deterministic.
  for (const recipe of Object.values(RECIPES)) {
    if ((recipe.output[itemId] ?? 0) <= 0) continue;
    let best = 0;
    for (const [ingredient, amount] of Object.entries(recipe.ingredients)) {
      if ((ITEMS[ingredient]?.nutrition ?? 0) > 0) {
        best = Math.max(best, expectedFood(person, ingredient, unknownFood) * amount /
          Math.max(1, recipe.output[itemId]));
      }
    }
    if (best > 0) return best;
  }
  return unknownFood;
}

/** Expected return relative to an untried person's instinct, with room for curiosity. */
export function expectationRatio(person: Person, key: string): number {
  const baseline = YIELD_INSTINCT[key];
  if (baseline === undefined || baseline <= 0) return 1;
  const belief = person.beliefs.expect(key);
  const expected = belief.confidence > 0 ? belief.value : baseline;
  return Math.max(0.5, Math.min(2, expected / baseline)) +
    curiosityNeed(person) * 0.15 * (1 - belief.confidence);
}

/** What this person expects a technology they lack to be worth in daily life. */
export function techAppeal(person: Person, tech: Tech): number {
  let appeal = 0;
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.tech !== tech) continue;
    const output = Object.keys(recipe.output).find(id => (ITEMS[id]?.nutrition ?? 0) > 0);
    if (!output) continue;
    const ingredient = Object.entries(recipe.ingredients)
      .sort((a, b) => (ITEMS[b[0]]?.nutrition ?? 0) * b[1] -
        (ITEMS[a[0]]?.nutrition ?? 0) * a[1])[0];
    if (!ingredient) continue;
    const expectedProduct = expectedFood(person, output);
    const expectedIngredient = expectedFood(person, ingredient[0]);
    appeal += Math.max(0, expectedProduct - expectedIngredient) * 3;
  }
  for (const building of Object.values(BUILDINGS)) {
    if (building.requiresTech === tech && building.shelter > 0) {
      appeal += person.beliefs.expect('warm:' + building.id).value;
    }
  }
  return appeal;
}
