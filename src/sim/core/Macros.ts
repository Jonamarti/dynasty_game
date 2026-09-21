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
import { telemetry } from './Telemetry.ts';

export type Macro = 'fat' | 'protein' | 'carb';
export const MACROS: readonly Macro[] = ['fat', 'protein', 'carb'];

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
 * Ages one person's macro balance by a day, called from `Simulation`'s daily
 * block beside `decayMood`. Reads and clears `person.macroIntakeToday`, the
 * accumulator `ActionSystem.doEat` fills as nutrition-weighted grams of each
 * macro consumed since the last daily tick.
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
