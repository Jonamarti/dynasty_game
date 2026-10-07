/**
 * Being with child, M15 phase 19: the three thirds of a pregnancy, what each
 * one costs her, and the one list of work she is spared.
 *
 * One place for these questions for the reason `LifeStage.ts` is one: "is she
 * in her last third" asked in the scorer, the action system, the radial menu,
 * the carry rules and the sprite with five slightly different readings of
 * `gestationLeft` is how a woman ends up forbidden to hunt in the menu and
 * hunting anyway in the brain. Everything below reads `trimesterOf`.
 *
 * **Why no `ActionDef`.** The plan (`m14_plan.md` 5a) says the veto list is "a
 * property of `ActionDef`". There is no such type: an action in this project is
 * a bare string, and its rules live in sets scattered beside the code that asks
 * (`CUT_OFF_AT_ONCE`, `YOUNG_CHILD_ACTIONS`, `WORK_ACTIONS`). `HEAVY_ACTIONS`
 * below is that same shape, kept here so the three consumers that filter
 * candidates — `Brain`, `ActionCatalog` and `ActionSystem.execute` — import
 * one list rather than three. Recorded in `docs/bugs.md`.
 */
import type { Person } from './Person.ts';

/**
 * Days a pregnancy runs: a quarter of the calendar year, whatever the
 * scenario's season length says that is. Kept a function rather than a
 * constant now that a person's `daysPerYear` need not be eighty — a fixed
 * number here would silently decouple gestation from the calendar exactly as
 * `DAYS_PER_YEAR` itself used to. (Moved here from `LifeSystem` so the thirds
 * can be measured against it without a cycle; `LifeSystem` re-exports it.)
 */
export function gestationDays(mother: Person): number {
  return mother.daysPerYear / 4;
}

/** 0 when not with child; otherwise the third of the pregnancy she is in. */
export type Trimester = 0 | 1 | 2 | 3;

/**
 * Which third of her pregnancy she is in. `gestationLeft` counts down from
 * `gestationDays` at conception, so how far along she is is the share of it
 * already spent. Clamped, because the world has never promised that a woman
 * set pregnant by hand (a test, a checkpoint from before this phase) has a
 * `gestationLeft` inside the span.
 */
export function trimesterOf(person: Person): Trimester {
  if (!person.pregnant) return 0;
  const total = gestationDays(person);
  const along = total > 0 ? 1 - person.gestationLeft / total : 1;
  return along < 1 / 3 ? 1 : along < 2 / 3 ? 2 : 3;
}

/**
 * Her pace against her own, by third (owner's plan: nothing, then 0.85, then
 * 0.7). Index 0 is "not pregnant". Multiplies `MovementSystem.speedOf`.
 */
const PACE: readonly number[] = [1, 1, 0.85, 0.7];

export function pregnancyPace(person: Person): number {
  return PACE[trimesterOf(person)]!;
}

/**
 * The work too heavy for the last third of a pregnancy (`m14_plan.md` 5a).
 * Fighting, felling, building and dragging; the allowed list — `forage`,
 * `gather`, `pick`, `craft`, `talk`, `teach`, `sow`, `reap` — is everything
 * not named here, so a verb added later is allowed until somebody decides it
 * is not, rather than silently forbidden.
 */
export const HEAVY_ACTIONS: ReadonlySet<string> = new Set([
  'hunt', 'chop', 'build', 'attack', 'spar', 'sabotage', 'restrain', 'drag',
]);

/** The stop reason (`Floaters.STOP_REASONS`) for work refused her in her last third. */
export const TOO_HEAVY_WITH_CHILD = 'too_heavy_with_child';

/** Whether this verb is refused to this person right now. */
export function tooHeavyForHer(person: Person, action: string): boolean {
  return person.pregnant && HEAVY_ACTIONS.has(action) && trimesterOf(person) === 3;
}

/**
 * In her last third she carries handfuls only: no armful of something bulky
 * and nothing on the shoulder (`Carry.ts`). The belly is in the way of the one
 * and the weight on the spine is the other.
 */
export function handfulsOnly(person: Person): boolean {
  return person.pregnant && trimesterOf(person) === 3;
}

/**
 * Whether the belly shows to somebody who has never met her. Only the last
 * third does; the first two are hers (and her family's) to know, which is what
 * `Knowledge.pregnancySeenBy` builds on.
 */
export function showing(person: Person): boolean {
  return trimesterOf(person) === 3;
}
