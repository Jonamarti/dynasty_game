import type { Person } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';

export type BeliefSource = 'instinct' | 'own' | 'seen' | 'told' | 'inherited';
export interface Belief { value: number; confidence: number; source: BeliefSource; tick: number }

export const BELIEF_KEYS = [
  'yield:forage', 'yield:fish', 'yield:pick', 'yield:hunt',
] as const;
export const BELIEF_CAPACITY = 48;
const KNOWN_RAW_FOOD = ['berries', 'apple', 'pear', 'plum', 'hazelnut', 'meat', 'fish', 'milk'] as const;

/** Per-person expectations. Map iteration preserves stable eviction and inheritance order. */
export class Beliefs {
  static readonly MAX = BELIEF_CAPACITY;
  private readonly values = new Map<string, Belief>();

  get(key: string): Belief | undefined { return this.values.get(key); }

  expect(key: string): { value: number; confidence: number } {
    const learned = this.values.get(key);
    if (learned) return { value: learned.value, confidence: learned.confidence };
    if (key.startsWith('eat:')) {
      const item = ITEMS[key.slice(4)];
      if (item && (KNOWN_RAW_FOOD as readonly string[]).includes(item.id)) {
        return { value: item.nutrition, confidence: 0.5 };
      }
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
  }

  entries(): IterableIterator<[string, Belief]> { return this.values.entries(); }

  inherit(scale: number): Beliefs {
    const copy = new Beliefs();
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
