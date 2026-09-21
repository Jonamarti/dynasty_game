/**
 * M11 phase 8b. A person's diet, read as a slow-moving balance rather than a
 * per-meal tally — the same argument `Mood.ts` makes for spirits over a raw
 * event log: a single lopsided day is not malnutrition any more than a single
 * bad night is a grudge, and something has to smooth the noise out before 8d
 * can charge for an imbalance without charging for bad luck.
 *
 * This phase is deliberately inert, exactly like `Mood.ts` when it shipped:
 * `Person.macroBalance` exists, is fed by every meal, and decays toward what
 * was actually eaten — but nothing outside this file and its dry-run
 * telemetry reads it yet. 8c scales the target by activity and 8d is where an
 * imbalance first costs something.
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
