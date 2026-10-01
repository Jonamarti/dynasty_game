/**
 * A body, M15 phase 21a: six parts that each carry damage and the state of
 * their wound.
 *
 * **Inert on purpose.** `Person.health` is still the one number everything
 * reads, and a blow still takes exactly the health it took before. What is new
 * is that the blow also chooses a part and writes into it, so that phase 21b
 * (legs slow you, arms weaken work and fighting, the torso bleeds, the head
 * knocks you out) and 21c (an untended wound festers) have something to read.
 * The field arrives first, with its own writer and no reader, for the reason
 * `Building.durability` and `Person.mood` did: a change to who dies and when
 * is easier to measure when the data already exists and is already right.
 *
 * Which part a blow lands on is drawn from `healthRng`, a stream of its own
 * (fork 19), so that choosing a part consumes nothing `actionRng` expects and
 * every fight in every saved seed lands exactly as hard as it did.
 */
import type { RNG } from '../core/RNG.ts';

export const BODY_PARTS = [
  'head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg',
] as const;
export type BodyPart = typeof BODY_PARTS[number];

/**
 * Where a wound stands. `fresh` is open and untended; `tended` has been dressed
 * and is mending; `infected` is a fresh one nobody tended (21c); `healed` is
 * gone; `scarred` is gone and left a mark. Only `fresh` is written in 21a.
 */
export type WoundState = 'none' | 'fresh' | 'tended' | 'infected' | 'healed' | 'scarred';

export interface BodyPartState {
  /** 0 (whole) to 1 (destroyed). */
  damage: number;
  wound: WoundState;
}

export type Body = Record<BodyPart, BodyPartState>;

export function newBody(): Body {
  const body = {} as Body;
  for (const part of BODY_PARTS) body[part] = { damage: 0, wound: 'none' };
  return body;
}

/**
 * Relative chance of a blow landing on each part. A fight is mostly arms and
 * torso: legs are low and the head is small. Weights, not percentages.
 */
const STRIKE_WEIGHT: Record<BodyPart, number> = {
  head: 1, torso: 4, left_arm: 2, right_arm: 2, left_leg: 1.5, right_leg: 1.5,
};
const STRIKE_TOTAL = BODY_PARTS.reduce((sum, p) => sum + STRIKE_WEIGHT[p], 0);

/** The part a blow lands on. Exactly one draw from `rng`. */
export function strikePart(rng: RNG): BodyPart {
  let roll = rng.next() * STRIKE_TOTAL;
  for (const part of BODY_PARTS) {
    roll -= STRIKE_WEIGHT[part];
    if (roll < 0) return part;
  }
  return 'torso';
}

/**
 * Writes a blow into a part. `fraction` is the share of a whole person's
 * health the blow took (`damage / 100`); it accumulates on the part and the
 * part is `fresh` unless it was already worse.
 */
export function wound(body: Body, part: BodyPart, fraction: number): void {
  const state = body[part];
  state.damage = Math.min(1, state.damage + Math.max(0, fraction));
  if (state.wound === 'none' || state.wound === 'healed' || state.wound === 'scarred') {
    state.wound = 'fresh';
  }
}

/** The worst damage on any part, for a reader that wants one number. */
export function worstDamage(body: Body): number {
  let worst = 0;
  for (const part of BODY_PARTS) worst = Math.max(worst, body[part].damage);
  return worst;
}
