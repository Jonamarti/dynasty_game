/**
 * How much of itself the player's character looks after.
 *
 * M9 phase 6, from the owner's note: *"the controlled NPC does not drink, eat
 * or sleep on its own."* That was never an oversight — see the comment at the
 * branch in `Simulation.step` — but the consequence was that putting the game
 * down for two minutes killed you, and dying of thirst while standing still is
 * not a decision the player made.
 *
 * Three states rather than a switch, because the two extremes are both wrong
 * for most of the game. Full manual control is what the game is *about* — the
 * player is one person, not a colony overseer — and full autonomy hands the
 * character back to the brain and turns the player into a spectator. The middle
 * state is the one that answers the note: the character will not do anything
 * you did not ask for, except stop itself from dying.
 *
 * This module deliberately holds no state. `Simulation.autonomy` is the one
 * copy, and everything here is a pure question asked about a person, so the
 * rules can be tested without a world — which matters, because this phase has
 * no `sim:check` gate. Headless runs never possess anybody, so none of this
 * runs in any scenario and no named check can see it.
 */
import type { NeedsConfig } from '../core/Config.ts';
import { LETHAL_NEEDS, type Person } from '../entities/Person.ts';

export type Autonomy = 'manual' | 'urgent' | 'auto';

/** The order the control cycles in, from least to most hands-off. */
export const AUTONOMY_ORDER: readonly Autonomy[] = ['manual', 'urgent', 'auto'];

export const AUTONOMY_LABELS: Record<Autonomy, string> = {
  manual: 'You steer',
  urgent: 'Stays alive',
  auto: 'Acts alone',
};

/** What each state actually does, in the player's words rather than the code's. */
export const AUTONOMY_NOTES: Record<Autonomy, string> = {
  manual: 'Your character does what you tell it and nothing else. It will stand ' +
    'where you left it until it dies of thirst.',
  urgent: 'Your character fetches water, food or shelter when one of them turns ' +
    'dangerous, and does nothing else on its own.',
  auto: 'Your character lives like anyone else in the world. An order from you ' +
    'always comes first.',
};

/** The next state the control cycles to. */
export function nextAutonomy(current: Autonomy): Autonomy {
  const at = AUTONOMY_ORDER.indexOf(current);
  return AUTONOMY_ORDER[(at + 1) % AUTONOMY_ORDER.length]!;
}

/**
 * How far below the killing line "dangerous" starts, in need points.
 *
 * Expressed as a margin under `needs.criticalThreshold` rather than as a number
 * of its own, because the threshold is a difficulty setting: a player who moves
 * the line health starts draining at has moved what counts as dangerous, and a
 * safety net pinned to an absolute 70 would sit *above* the line on a hard
 * world and never fire until the damage had already started.
 *
 * Fifteen points is about two hundred ticks of default thirst — most of an
 * in-game day — which is the walk to the water and the drink, with room for the
 * walk to be the long way round. It is also far later than anybody else in the
 * world leaves it: `needs.workLimits.thirst` stops an ordinary person working at
 * 42. That gap is the point. This is a character looking after itself at the
 * last sensible moment, not a brain quietly taking the reins back.
 */
export const URGENT_MARGIN = 15;

/** One of the three needs that can kill. */
export type UrgentNeed = (typeof LETHAL_NEEDS)[number];

/**
 * Every need that has turned dangerous, worst first.
 *
 * A list rather than the single worst, because the answer to being both
 * starving and freezing is not to pick one and ignore the other — it is to let
 * the scorer choose between eating and getting under a roof, which is a
 * judgement it already makes far better than an ordering here could.
 *
 * Only `LETHAL_NEEDS`. Fatigue is deliberately absent: nobody has ever died of
 * it in this simulation, so a character that walked off to sleep in the middle
 * of what the player was doing would be taking over rather than surviving.
 * Someone who wants their character to sleep on its own wants `auto`.
 */
export function urgentNeeds(person: Person, cfg: NeedsConfig): UrgentNeed[] {
  const line = cfg.criticalThreshold - URGENT_MARGIN;
  return LETHAL_NEEDS
    .filter(need => person.needs[need] > line)
    .sort((a, b) => person.needs[b] - person.needs[a]);
}

/**
 * The verbs that answer each need, and the only ones a character in `urgent`
 * may choose for itself.
 *
 * Keyed by need rather than kept as one flat allowlist, and the flat version
 * was written first and thrown away for a reason worth recording: every verb in
 * here can score above zero for reasons that have nothing to do with the need
 * that fired. `forage` carries a standing `greed * 0.25` stockpiling term, so a
 * freezing character with a berry bush in sight and no roof anywhere picked
 * berries — a perfectly sensible score, an absurd thing to watch, and exactly
 * the "it does things I did not ask for" complaint this mode exists to avoid.
 *
 * Within a need the scorer still arbitrates: eat what you carry or walk to the
 * bush is `eat` against `forage`, which is a sum it already computes.
 *
 * Three absences are decisions rather than omissions:
 *
 *  - **`hunt`.** A safety net must not pick a fight. The scorer discounts hunts
 *    by the odds, but the odds are never zero, and a starving player character
 *    sent alone at an aurochs by a convenience feature is a death the player did
 *    not choose. Foraging is the slower answer and the one that cannot kill you.
 *  - **`sleep` and `rest`.** Fatigue is not lethal — see `urgentNeeds`.
 *  - **`flee`.** Being attacked is urgent in every ordinary sense of the word,
 *    but it is not a *need*, and this phase's trigger is a need. Recorded in
 *    `bugs.md` rather than smuggled in: a character that runs away by itself is
 *    a real change to what combat feels like and deserves measuring.
 */
export const NEED_ACTIONS: Record<UrgentNeed, readonly string[]> = {
  thirst: ['drink'],
  hunger: ['eat', 'forage', 'pick', 'take'],
  cold: ['shelter'],
};

/** The verbs on offer to a character looking after itself right now. */
export function survivalActions(needs: readonly UrgentNeed[]): ReadonlySet<string> {
  const allowed = new Set<string>();
  for (const need of needs) for (const action of NEED_ACTIONS[need]) allowed.add(action);
  return allowed;
}

export function stallReason(need: UrgentNeed): string {
  switch (need) {
    case 'thirst': return 'thirsty, and no water in sight';
    case 'hunger': return 'hungry, and nothing within reach to eat';
    case 'cold': return 'freezing, and no shelter nearby';
  }
}
