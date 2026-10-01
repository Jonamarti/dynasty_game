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
import { t } from '../../i18n/i18n.ts';

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

/** The share of blows that land on a part, 0 to 1 and summing to 1 over the body. */
export function strikeShare(part: BodyPart): number {
  return STRIKE_WEIGHT[part] / STRIKE_TOTAL;
}

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
/** A dressed wound mends this many times faster than an open one. */
const TENDED_MEND = 3;
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
    // A festering wound does not mend; it is the infection that has to turn.
    if (state.wound === 'infected') continue;
    state.damage = Math.max(0, state.damage - (state.wound === 'tended' ? rate * TENDED_MEND : rate));
    if (state.damage <= HEALED_AT) {
      state.damage = 0;
      state.wound = state.peak >= SCAR_PEAK ? 'scarred' : 'healed';
    }
  }
}

/** Head damage at which a blow knocks somebody out. */
export const KNOCKOUT_AT = 0.4;

// ---------------------------------------------------------------------------
// 21c: infection and fever. A fresh wound nobody dresses can fester; a
// festering one gives a fever, which grows worse by the day until it turns by
// itself or somebody tends it.
// ---------------------------------------------------------------------------

export type Severity = 'mild' | 'moderate' | 'severe';
const SEVERITIES: readonly Severity[] = ['mild', 'moderate', 'severe'];

/**
 * A lasting illness, with a grade. Two kinds: the fever an infected wound
 * brings (21c) and the poisoning a bad meal brings (phase 22). Each has its own
 * clock, because they end for different reasons: a fever when its wound turns
 * or is dressed, a poisoning when it has run its days.
 */
export interface Fever {
  kind: 'fever';
  severity: Severity;
  /** Days since it began, which is what raises its grade. */
  days: number;
  /** The infected part it comes from. */
  part: BodyPart;
}

export interface Poisoning {
  kind: 'poisoning';
  severity: Severity;
  /** Days it still has to run; at zero it is over. */
  daysLeft: number;
  /** What was eaten. Remembered so the sheet and the chronicle can say it. */
  item: string;
}

export type Condition = Fever | Poisoning;

/** Daily chance a fresh, undressed wound of any size festers, before depth. */
export const INFECT_DAILY = 0.07;
/** A dressed wound is this fraction as likely to fester: cleaner, not immune. */
export const TENDED_INFECT = 0.25;
/** Wounds shallower than this are a graze and never fester. */
const GRAZE = 0.1;
/** Daily chance a festering wound turns by itself and starts to mend. */
export const INFECTION_TURNS = 0.08;
/** Days after which a fever worsens a grade. */
const WORSEN_EVERY = 3;
/** Health a tick costs, per grade of fever (1, 2, 3). */
const FEVER_DRAIN = 0.005;

function findFever(conditions: readonly Condition[], part: BodyPart): Fever | undefined {
  return conditions.find((c): c is Fever => c.kind === 'fever' && c.part === part);
}

export type WoundEvent =
  | { kind: 'festered'; part: BodyPart }
  | { kind: 'turned'; part: BodyPart };

/**
 * Whether a part has a wound worth somebody's time: festering, or fresh and
 * deeper than a graze. A grazed knee is not a reason to down tools.
 */
export function needsTending(body: Body): boolean {
  return BODY_PARTS.some(p => {
    const w = body[p];
    return w.wound === 'infected' || (w.wound === 'fresh' && w.damage >= GRAZE);
  });
}

/** Health a tick this person's fevers cost them. */
export function feverDrain(conditions: readonly Condition[]): number {
  let grade = 0;
  for (const c of conditions) if (c.kind === 'fever') grade += SEVERITIES.indexOf(c.severity) + 1;
  return grade * FEVER_DRAIN;
}

/**
 * One day passes over somebody's wounds. Draws from `rng` exactly once for
 * every part that could fester or turn, whatever the outcome, so that a world
 * is the same however the dice fall.
 */
export function woundsDaily(body: Body, conditions: Condition[], rng: RNG): WoundEvent[] {
  const events: WoundEvent[] = [];
  for (const part of BODY_PARTS) {
    const state = body[part];
    if (state.wound === 'fresh' || state.wound === 'tended') {
      if (state.damage < GRAZE) continue;
      const chance = INFECT_DAILY * (0.5 + state.damage) *
        (state.wound === 'tended' ? TENDED_INFECT : 1);
      if (rng.next() < chance) {
        state.wound = 'infected';
        conditions.push({ kind: 'fever', severity: 'mild', days: 0, part });
        events.push({ kind: 'festered', part });
      }
    } else if (state.wound === 'infected') {
      const fever = findFever(conditions, part);
      if (rng.next() < INFECTION_TURNS) {
        state.wound = 'tended';
        if (fever) conditions.splice(conditions.indexOf(fever), 1);
        events.push({ kind: 'turned', part });
      } else if (fever) {
        fever.days++;
        const grade = Math.min(2, Math.floor(fever.days / WORSEN_EVERY));
        fever.severity = SEVERITIES[Math.max(grade, SEVERITIES.indexOf(fever.severity))]!;
        // It eats the part away while it festers.
        state.damage = Math.min(1, state.damage + 0.01 * (grade + 1));
        state.peak = Math.max(state.peak, state.damage);
      }
    }
  }
  return events;
}

export interface Dressing {
  part: BodyPart;
  /** `dressed` closes a fresh wound; `eased` drops a fever a grade; `cured` ends the infection. */
  result: 'dressed' | 'eased' | 'cured';
  /** Whether the dressing used the herb it was offered (`dress`'s `herb`). */
  herbUsed?: boolean;
}

/**
 * Somebody tends a body: the worst open wound first, a festering one before a
 * fresh one. Returns what was done, or null if there was nothing to treat.
 */
export function dress(body: Body, conditions: Condition[], herb = false): Dressing | null {
  let pick: BodyPart | null = null;
  for (const part of BODY_PARTS) {
    const w = body[part];
    const open = w.wound === 'infected' || (w.wound === 'fresh' && w.damage >= GRAZE);
    if (!open) continue;
    if (pick === null) { pick = part; continue; }
    const best = body[pick];
    if ((w.wound === 'infected' ? 1 : 0) > (best.wound === 'infected' ? 1 : 0) ||
      ((w.wound === 'infected') === (best.wound === 'infected') && w.damage > best.damage)) pick = part;
  }
  if (pick === null) return null;
  const state = body[pick];
  if (state.wound === 'fresh') {
    state.wound = 'tended';
    return { part: pick, result: 'dressed' };
  }
  const fever = findFever(conditions, pick);
  const grade = fever ? SEVERITIES.indexOf(fever.severity) : 0;
  if (!fever || grade === 0 || herb) {
    // A herb draws the infection out whatever the grade (21d); without one only
    // a fever that has already eased to mild is cured outright.
    state.wound = 'tended';
    if (fever) conditions.splice(conditions.indexOf(fever), 1);
    return herb && grade > 0
      ? { part: pick, result: 'cured', herbUsed: true }
      : { part: pick, result: 'cured' };
  }
  fever.severity = SEVERITIES[grade - 1]!;
  // Hold the clock back so the next dressing is not undone by tomorrow.
  fever.days = Math.min(fever.days, (grade - 1) * WORSEN_EVERY);
  return { part: pick, result: 'eased' };
}

/**
 * A part's name as a noun in a sentence ("a wound of the {part}"). Written as
 * literal `t` calls so the i18n scan sees every one, and kept article-less so
 * Spanish can say "herida de pierna izquierda" without agreeing a gender.
 */
export function partWord(part: BodyPart): string {
  switch (part) {
    case 'head': return t('head');
    case 'torso': return t('torso');
    case 'left_arm': return t('left arm');
    case 'right_arm': return t('right arm');
    case 'left_leg': return t('left leg');
    case 'right_leg': return t('right leg');
  }
}

// ---------------------------------------------------------------------------
// Phase 22: a bad meal. Raw meat and raw fish carry a chance of poisoning that
// roasting, drying and salting remove; a toxic berry (21d) carries a far larger
// one. The chance is a property of the *food*, so cooking is not a bonus the
// code hands out but the absence of a risk the food had.
// ---------------------------------------------------------------------------

/**
 * Chance that one unit of this food makes the eater ill. An id absent from the
 * table is safe, which is what keeps roast meat, bread and everything cooked
 * from needing a line of their own.
 */
export const SICKENS: Readonly<Record<string, number>> = {
  meat: 0.12,
  fish: 0.10,
  // M15 phase 21d: the baneberry. Most mouthfuls make somebody ill, because the
  // point of the plant is that eating it unknowing is a mistake.
  toxic_berries: 0.6,
};

/** Days each grade of poisoning runs. */
const POISON_DAYS: Record<Severity, number> = { mild: 1, moderate: 2, severe: 4 };
/** Health a tick a *severe* poisoning costs; the lesser grades only weaken. */
const POISON_DRAIN = 0.004;

/** Whether this food can make anybody ill at all. */
export function isRisky(itemId: string): boolean {
  return (SICKENS[itemId] ?? 0) > 0;
}

/**
 * Rolls one unit of food against the eater. Draws from `rng` exactly once for
 * a risky food, whether or not it makes them ill, and never for a safe one, so
 * a world is the same however the dice fall and eating roast meat costs the
 * stream nothing. The same draw sets the grade: the unluckiest few are severe.
 * Returns the condition it left them with, or null if they were spared.
 */
export function sicken(conditions: Condition[], itemId: string, rng: RNG): Poisoning | null {
  const risk = SICKENS[itemId] ?? 0;
  if (risk <= 0) return null;
  const roll = rng.next();
  if (roll >= risk) return null;
  const share = roll / risk;
  const severity: Severity = share < 0.15 ? 'severe' : share < 0.5 ? 'moderate' : 'mild';
  const existing = conditions.find((c): c is Poisoning => c.kind === 'poisoning');
  if (existing) {
    // A second bad meal on top of the first does not stack two illnesses; it
    // deepens and prolongs the one they have.
    if (SEVERITIES.indexOf(severity) > SEVERITIES.indexOf(existing.severity)) existing.severity = severity;
    existing.daysLeft = Math.max(existing.daysLeft, POISON_DAYS[existing.severity]);
    existing.item = itemId;
    return existing;
  }
  const poisoning: Poisoning = { kind: 'poisoning', severity, daysLeft: POISON_DAYS[severity], item: itemId };
  conditions.push(poisoning);
  return poisoning;
}

/** The grade of somebody's poisoning, 0 (none) to 3. */
export function poisonGrade(conditions: readonly Condition[]): number {
  for (const c of conditions) if (c.kind === 'poisoning') return SEVERITIES.indexOf(c.severity) + 1;
  return 0;
}

/** Health a tick poisoning costs: only a severe one drains. */
export function poisonDrain(conditions: readonly Condition[]): number {
  return poisonGrade(conditions) === 3 ? POISON_DRAIN : 0;
}

/**
 * Multiplier on heavy work and on pace while poisoned: the sick do not haul or
 * hew, and they do not walk as fast. One grade costs a fifth of the work and a
 * tenth of the pace.
 */
export function poisonWork(conditions: readonly Condition[]): number {
  return Math.max(0.4, 1 - 0.2 * poisonGrade(conditions));
}
export function poisonPace(conditions: readonly Condition[]): number {
  return Math.max(0.7, 1 - 0.1 * poisonGrade(conditions));
}

/**
 * Extra thirst and hunger per tick: vomiting and a flux empty a body faster
 * than eating fills it. Added to the ordinary rates by `NeedsSystem`.
 */
export function poisonThirst(conditions: readonly Condition[]): number {
  return 0.03 * poisonGrade(conditions);
}
export function poisonHunger(conditions: readonly Condition[]): number {
  return 0.015 * poisonGrade(conditions);
}

/** One day passes over a poisoning. Returns whether it just ended. */
export function poisonDaily(conditions: Condition[]): Poisoning | null {
  const index = conditions.findIndex(c => c.kind === 'poisoning');
  if (index < 0) return null;
  const poisoning = conditions[index] as Poisoning;
  poisoning.daysLeft--;
  if (poisoning.daysLeft > 0) return null;
  conditions.splice(index, 1);
  return poisoning;
}

/**
 * A herb given to somebody poisoned: one grade lighter, or gone if it was mild.
 * Returns what it did, or null if there was nothing to treat.
 */
export function soothe(conditions: Condition[]): 'eased' | 'cured' | null {
  const index = conditions.findIndex(c => c.kind === 'poisoning');
  if (index < 0) return null;
  const poisoning = conditions[index] as Poisoning;
  const grade = SEVERITIES.indexOf(poisoning.severity);
  if (grade === 0) {
    conditions.splice(index, 1);
    return 'cured';
  }
  poisoning.severity = SEVERITIES[grade - 1]!;
  poisoning.daysLeft = Math.min(poisoning.daysLeft, POISON_DAYS[poisoning.severity]);
  return 'eased';
}
