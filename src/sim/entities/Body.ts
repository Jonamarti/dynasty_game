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
  /** The worst `damage` this wound reached, so a bad one can leave a scar. */
  peak: number;
}

export type Body = Record<BodyPart, BodyPartState>;

export function newBody(): Body {
  const body = {} as Body;
  for (const part of BODY_PARTS) body[part] = { damage: 0, wound: 'none', peak: 0 };
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
  state.peak = Math.max(state.peak, state.damage);
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

// ---------------------------------------------------------------------------
// 21b: what a wound does. Every reader of `body` goes through these, so the
// numbers that decide how much a wound matters sit in one place.
// ---------------------------------------------------------------------------

/**
 * Pace on a bad leg: each leg takes up to 35% off, so one destroyed leg is a
 * limp at 65% and two are a crawl at 30%. Multiplies `speedOf`, on top of the
 * pace `health` already costs.
 */
export function legPace(body: Body): number {
  const lost = body.left_leg.damage + body.right_leg.damage;
  return Math.max(0.3, 1 - 0.35 * lost);
}

/**
 * Whether somebody can run at all. Fleeing on a single leg is a limp the
 * pursuer closes on; with *both* legs half gone it is not a flight, it is a
 * wait, so the brain is not offered `flee` (see `Brain`).
 */
export function cannotRun(body: Body): boolean {
  return body.left_leg.damage >= 0.5 && body.right_leg.damage >= 0.5;
}

/**
 * Strength of the arms, as a multiplier on fighting and on manual work: each
 * takes up to 30% off, never below 40%. Somebody with a broken arm still works,
 * more slowly; nobody is made useless by it.
 */
export function armForce(body: Body): number {
  const lost = body.left_arm.damage + body.right_arm.damage;
  return Math.max(0.4, 1 - 0.3 * lost);
}

/** Torso damage below which a wound closes by itself without bleeding. */
const BLEED_FROM = 0.25;

/**
 * Health lost this tick to a torso wound nobody has dressed. A fresh wound of
 * a quarter or more bleeds in proportion to how deep it is; at 0.4 that is
 * about three health a day — a drain a healthy person outlasts while the wound
 * mends and a weak one may not, which is the point. Tending stops it.
 */
export function bleeding(body: Body): number {
  const torso = body.torso;
  if (torso.wound !== 'fresh' || torso.damage < BLEED_FROM) return 0;
  return 0.05 * (torso.damage - 0.15);
}

/** Damage a part mends per tick (about a tenth of the whole per day). */
export const MEND_RATE = 0.0004;
/** A part this close to whole is considered healed. */
const HEALED_AT = 0.02;
/** A wound that once reached this deep leaves a scar. */
const SCAR_PEAK = 0.5;

/**
 * Mends every wounded part one tick. `rate` is the damage recovered; a part
 * that gets down to `HEALED_AT` is `healed`, or `scarred` if it was once deep.
 * Nothing is drawn: healing is time, and chance belongs to 21c's infection.
 */
export function mendBody(body: Body, rate = MEND_RATE): void {
  for (const part of BODY_PARTS) {
    const state = body[part];
    if (state.wound === 'none' || state.wound === 'healed' || state.wound === 'scarred') continue;
    state.damage = Math.max(0, state.damage - rate);
    if (state.damage <= HEALED_AT) {
      state.damage = 0;
      state.wound = state.peak >= SCAR_PEAK ? 'scarred' : 'healed';
    }
  }
}

/** Head damage at which a blow knocks somebody out. */
export const KNOCKOUT_AT = 0.4;
