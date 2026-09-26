/**
 * M11 phase 8, macronutrients. A person's diet, read as a slow-moving balance
 * rather than a per-meal tally — the same argument `Mood.ts` makes for
 * spirits over a raw event log: a single lopsided day is not malnutrition any
 * more than a single bad night is a grudge.
 *
 * `Person.macroBalance` is fed by every meal and decays toward what was
 * actually eaten (8b); `Person.macroTarget` decays toward a mix set by how
 * hard the person has lately been working, reusing `NeedsSystem.exertionOf`
 * (8c); `malnutrition` reads the gap between the two and `NeedsSystem` caps
 * health recovery by it (8d) — degradation, never a fourth lethal need:
 * `LETHAL_NEEDS` stays hunger, thirst and cold, on purpose, and this file
 * never touches it.
 */
import type { Person } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';
import { nutritionFactor } from '../knowledge/Tech.ts';
import { telemetry } from './Telemetry.ts';
import { expectedFood } from '../ai/Beliefs.ts';

export type Macro = 'fat' | 'protein' | 'carb';
export const MACROS: readonly Macro[] = ['fat', 'protein', 'carb'];
export const VARIETY_WEIGHT = 0.6;
export const CRAVE_SPAN = 0.12;
const cravingCache = new WeakMap<Person, {
  target: [number, number, number]; balance: [number, number, number]; value: Record<Macro, number>
}>();

/** Current shortfall by macro, scaled to the useful 0-1 range. */
export function cravings(person: Person, enabled = true): Record<Macro, number> {
  if (!enabled) return { fat: 0, protein: 0, carb: 0 };
  const target = person.macroTarget;
  const balance = person.macroBalance;
  const previous = cravingCache.get(person);
  if (previous && previous.target[0] === target.fat && previous.target[1] === target.protein &&
    previous.target[2] === target.carb && previous.balance[0] === balance.fat &&
    previous.balance[1] === balance.protein && previous.balance[2] === balance.carb) {
    return previous.value;
  }
  const value = {
    fat: Math.max(0, Math.min(1, (person.macroTarget.fat - person.macroBalance.fat) / CRAVE_SPAN)),
    protein: Math.max(0, Math.min(1, (person.macroTarget.protein - person.macroBalance.protein) / CRAVE_SPAN)),
    carb: Math.max(0, Math.min(1, (person.macroTarget.carb - person.macroBalance.carb) / CRAVE_SPAN)),
  };
  cravingCache.set(person, {
    target: [target.fat, target.protein, target.carb],
    balance: [balance.fat, balance.protein, balance.carb], value,
  });
  return value;
}

/** Nutrition adjusted for the nutrients this person has been missing. */
export function appealOf(
  person: Person, itemId: string, varietyWeight = VARIETY_WEIGHT,
  cravingsEnabled = true, beliefsEnabled = true,
): number {
  const food = ITEMS[itemId];
  if (!food || food.nutrition <= 0) return 0;
  const craving = cravings(person, cravingsEnabled);
  const macros = food.macros;
  const pull = macros
    ? MACROS.reduce((sum, macro) => sum + craving[macro] * macros[macro], 0)
    : 0;
  return (beliefsEnabled ? expectedFood(person, itemId) : food.nutrition) * (1 + varietyWeight * pull);
}

/** Highest-appeal food in inventory; stack order breaks ties deterministically. */
export function bestFoodFor(
  person: Person, varietyWeight = VARIETY_WEIGHT,
  cravingsEnabled = true, beliefsEnabled = true,
): string | null {
  let chosen: string | null = null;
  let best = 0;
  for (const [itemId] of person.inventory.entries()) {
    const appeal = appealOf(person, itemId, varietyWeight, cravingsEnabled, beliefsEnabled);
    if (appeal > best) {
      chosen = itemId;
      best = appeal;
    }
  }
  return chosen;
}

/** A person's rolling diet, three fractions that always sum to 1. */
export class MacroBalance {
  fat = 1 / 3;
  protein = 1 / 3;
  carb = 1 / 3;
}

/**
 * How much of the gap between yesterday's balance and today's actual intake
 * closes in one day. Chosen well above `RelationshipGraph.decay`'s
 * familiarity term (6%) and `MOOD_DECAY_PER_DAY` (8%): a diet is not a
 * relationship or a spirit, it is what you ate, and the plan's "several
 * days" window means today's dinner should already be most of tomorrow's
 * verdict rather than one nudge among a month of them.
 */
const MACRO_DECAY_PER_DAY = 0.35;

/**
 * Eats one unit of `itemId` from `person`'s pack. Returns whether anything
 * was eaten.
 *
 * M11 phase 12a. The only way anybody eats. There used to be two: the AI's
 * `ActionSystem.doEat` and the Kit's *Eat* button, `Simulation.eatItem`, whose
 * own comment promised it gave "the same nourishment" as eating by order.
 * It did, until 8b taught `doEat` to write `macroIntakeToday` and nobody
 * taught the button — a player who only ever ate from the panel had a diet
 * frozen at whatever it was the day they stopped eating by order. The
 * `moveToward` argument: two copies of one idea drift.
 */
export function consumeFood(person: Person, itemId: string, tick = 0, cravingsEnabled = true): boolean {
  const def = ITEMS[itemId];
  if (!def || def.nutrition <= 0) return false;
  const craving = cravings(person, cravingsEnabled);
  const wantsProtein = craving.protein > 0.5;
  const calmProtein = craving.protein < 0.1;
  if (person.inventory.remove(itemId, 1) === 0) return false;
  // Eating is the direct evidence for the personal payoff of this food.
  person.beliefs.learn('eat:' + itemId, def.nutrition * nutritionFactor(person),
    0.3 * (1.5 - person.traits.tradition), 'own', tick);
  if (wantsProtein) {
    telemetry.count('eat_craving_protein');
    if ((def.macros?.protein ?? 0) >= 0.3) telemetry.count('eat_craving_protein_rich');
  }
  if (calmProtein) {
    telemetry.count('eat_calm_protein');
    if ((def.macros?.protein ?? 0) >= 0.3) telemetry.count('eat_calm_protein_rich');
  }
  // Cooking makes food go further. It is the plainest possible payoff for
  // knowing something, and it compounds: a band that cooks needs a third less
  // forage than one that does not, and can therefore support more people on
  // the same ground.
  const eaten = def.nutrition * nutritionFactor(person);
  // M13 phase 0 cohort observer: pooled nutrition from genuinely protein-rich
  // food, recorded at the same point as consumed nutrition without touching the sim.
  telemetry.count('diet_nutrition_total', eaten);
  if ((def.macros?.protein ?? 0) >= 0.3) telemetry.count('diet_nutrition_protein', eaten);
  person.needs.hunger = Math.max(0, person.needs.hunger - eaten);
  // M11 phase 8b: fold what was actually eaten into today's ledger, in the
  // same units `decayMacroBalance` will normalise into fractions. Cooking's
  // bonus counts here too — a band that cooks eats more of whatever it ate.
  if (def.macros) {
    person.macroIntakeToday.fat += eaten * def.macros.fat;
    person.macroIntakeToday.protein += eaten * def.macros.protein;
    person.macroIntakeToday.carb += eaten * def.macros.carb;
  }
  person.eatenToday.set(itemId, (person.eatenToday.get(itemId) ?? 0) + 1);
  telemetry.count('eat');
  // Per-item, on the same `completed_<id>`/`crafted_<id>` idiom the rest of
  // the health report uses — added for `milk`, which has no other way to
  // show that a byproduct nobody has ever needed to name before is actually
  // being eaten rather than only accruing.
  telemetry.count('eaten_' + itemId);
  return true;
}

/**
 * Ages one person's macro balance by a day, called from `Simulation`'s daily
 * block beside `decayMood`. Reads and clears `person.macroIntakeToday`, the
 * accumulator `consumeFood` fills as nutrition-weighted grams of each
 * macro consumed since the last daily tick. Clears `eatenToday` with it.
 *
 * A day nobody ate anything leaves the balance exactly where it was rather
 * than dragging it toward zero — going hungry is `needs.hunger`'s story to
 * tell, not a reason to also report a diet of nothing.
 */
export function decayMacroBalance(person: Person): void {
  const intake = person.macroIntakeToday;
  const total = intake.fat + intake.protein + intake.carb;
  if (total > 0) {
    for (const macro of MACROS) {
      const eatenFraction = intake[macro] / total;
      person.macroBalance[macro] += (eatenFraction - person.macroBalance[macro]) * MACRO_DECAY_PER_DAY;
    }
    intake.fat = 0;
    intake.protein = 0;
    intake.carb = 0;
  }
  person.eatenToday.clear();
  telemetry.count('macro_fat_sum', person.macroBalance.fat);
  telemetry.count('macro_protein_sum', person.macroBalance.protein);
  telemetry.count('macro_carb_sum', person.macroBalance.carb);
  telemetry.count('macro_samples');
}

/**
 * The mix a rested person's body wants, at `recentExertion === EXERTION_REST`
 * (`NeedsSystem`'s `sleep`, the gentlest entry in its table).
 *
 * Ordinary human dietary guidance, not this game's invention: roughly half
 * energy from carbohydrate at rest, with protein and fat splitting the rest.
 */
const REST_TARGET: MacroBalance = { fat: 0.28, protein: 0.17, carb: 0.55 };

/**
 * The mix hard, sustained physical labour wants, at `recentExertion ===
 * EXERTION_HARD` (`chop`/`attack`'s 1.5, the top of `NeedsSystem`'s table).
 *
 * Protein rises the most — muscle broken down by real work has to be rebuilt
 * — carbohydrate gives up the most ground, and fat holds roughly steady:
 * fat is stored energy the body draws on either way, not a lever exertion
 * pulls directly.
 */
const WORK_TARGET: MacroBalance = { fat: 0.27, protein: 0.28, carb: 0.45 };

/** `NeedsSystem.EXERTION`'s own floor and ceiling — `sleep` and `chop`/`attack`. */
const EXERTION_REST = 0.4;
const EXERTION_HARD = 1.5;

/** How much of the gap to today's average exertion closes in one day. */
const EXERTION_DECAY_PER_DAY = 0.35;

/** Interpolates the rest and work targets by where `exertion` falls between them. */
export function macroTargetFor(exertion: number): MacroBalance {
  const t = Math.max(0, Math.min(1, (exertion - EXERTION_REST) / (EXERTION_HARD - EXERTION_REST)));
  return {
    fat: REST_TARGET.fat + (WORK_TARGET.fat - REST_TARGET.fat) * t,
    protein: REST_TARGET.protein + (WORK_TARGET.protein - REST_TARGET.protein) * t,
    carb: REST_TARGET.carb + (WORK_TARGET.carb - REST_TARGET.carb) * t,
  };
}

/**
 * Ages one person's `recentExertion` and `macroTarget` by a day, called
 * alongside `decayMacroBalance`. Reads and clears `person.exertionToday`,
 * the per-tick ledger `NeedsSystem.update` fills with the same `exertionOf`
 * reading that already scales thirst — no second table.
 *
 * A day with no ticks recorded (nobody is ever not simulated, but a fresh
 * arrival mid-day might see `ticks === 0`) leaves `recentExertion` alone.
 */
export function decayMacroTarget(person: Person): void {
  const ledger = person.exertionToday;
  if (ledger.ticks > 0) {
    const today = ledger.total / ledger.ticks;
    person.recentExertion += (today - person.recentExertion) * EXERTION_DECAY_PER_DAY;
    ledger.total = 0;
    ledger.ticks = 0;
  }
  person.macroTarget = macroTargetFor(person.recentExertion);
  telemetry.count('macro_exertion_sum', person.recentExertion);
}

/**
 * How far `macroBalance` sits from `macroTarget`, 0 (matched) to 1 (fully
 * disjoint — everything eaten is the one macro the target wants none of).
 * Total variation distance between the two fraction sets: sum of the
 * absolute gaps, halved so the range lands on 0-1 instead of 0-2.
 *
 * No smoothing here on top of `macroBalance`'s own — that average is already
 * a multi-day trend by construction (35%/day toward what was eaten), so a
 * second smoothing pass would only blur what 8b already bought.
 */
export function malnutrition(person: Person): number {
  let gap = 0;
  for (const macro of MACROS) gap += Math.abs(person.macroBalance[macro] - person.macroTarget[macro]);
  return gap / 2;
}

/**
 * How many points below 100 the health ceiling falls at `malnutrition === 1`.
 * Interpolated linearly from 0. Modest on purpose — see `NeedsSystem`'s use
 * of this for the declared cost this was measured against.
 */
export const MALNUTRITION_HEALTH_CEILING_DROP = 20;

/** How much of `recoveryRate` is lost at `malnutrition === 1`. */
export const MALNUTRITION_RECOVERY_PENALTY = 0.6;
