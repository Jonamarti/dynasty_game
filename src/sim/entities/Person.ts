/**
 * A person. The player is one of these and has no extra fields — every ability
 * the player has, an NPC has too. That symmetry is a design pillar, not an
 * accident: it is what makes the world feel inhabited rather than staged.
 */
import type { RNG } from '../core/RNG.ts';
import { Inventory } from './Item.ts';
import { Memory } from '../social/Memory.ts';
import type { LifeEvent } from '../social/SocialSystem.ts';

export const SKILLS = [
  'forage', 'hunt', 'knap', 'build', 'cook',
  'fight', 'persuade', 'teach', 'heal', 'track',
] as const;
export type Skill = (typeof SKILLS)[number];

/**
 * Five heritable personality axes, each in [0, 1]. They weight the utility
 * scorer, so a greedy, low-loyalty person genuinely prefers stealing to asking.
 */
export const TRAITS = ['aggression', 'greed', 'loyalty', 'curiosity', 'tradition'] as const;
export type Trait = (typeof TRAITS)[number];

/**
 * `company` is a real need, not decoration: it is what pushes people to seek
 * each other out, and conversation is the channel gossip travels down. Without
 * a drive to talk, a band of strangers never exchanges a word and the whole
 * social layer stays inert.
 */
export const NEEDS = ['hunger', 'thirst', 'fatigue', 'cold', 'company'] as const;

/**
 * The needs that can actually kill you.
 *
 * Exhaustion and loneliness are deliberately not among them. Both make a person
 * worse at everything — a tired forager is slow, a lonely one seeks company
 * over work — but neither is fatal, and treating them as fatal made exhaustion
 * the leading cause of death in a stone-age band, which is nonsense. Hunger,
 * thirst and cold kill. Everything else degrades.
 */
export const LETHAL_NEEDS = ['hunger', 'thirst', 'cold'] as const;
export type Need = (typeof NEEDS)[number];

export type Sex = 'male' | 'female';

/** An order set aside while a need is dealt with. See `Person.resume`. */
export interface ResumedOrder {
  action: string;
  /** Tick after which it is forgotten rather than resumed. */
  expiresAt: number;
  nodeId: number | null;
  treeId: number | null;
  buildingId: number | null;
  personId: number | null;
  animalId: number | null;
  x: number | null;
  y: number | null;
}

/** In-game days in a year. Ages, gestation and lifespans are all in days. */
export const DAYS_PER_YEAR = 80;

/** Below this a person is a child: they cannot marry, work or be held to a deed. */
export const ADULT_YEARS = 14;
/** Above this, skills start to fade and the years begin to tell. */
export const ELDER_YEARS = 50;

let nextPersonId = 1;

export function resetPersonIds(): void {
  nextPersonId = 1;
}

export class Person {
  readonly id: number;
  name: string;
  x: number;
  y: number;
  sex: Sex;
  /** In days. The needs and skills systems both read it; aging arrives in M2. */
  age: number;
  alive = true;
  causeOfDeath: string | null = null;
  /** True once goods, household headship and succession have been resolved. */
  affairsSettled = false;

  bandId: number;
  isPlayer = false;

  // --- Family ---------------------------------------------------------------
  /** Household this person belongs to; null only before the world is settled. */
  householdId: number | null = null;
  /** Family name, carried from the household they were born into. */
  surname = '';
  spouseId: number | null = null;
  motherId: number | null = null;
  fatherId: number | null = null;
  childIds: number[] = [];

  /**
   * The day this person will die of nothing in particular, drawn at birth.
   *
   * A fixed span with a little variation, rather than a per-tick roll, so that
   * a life has a shape you can plan around: you know roughly how long you have
   * to raise an heir, and so does the simulation.
   */
  lifespanDays: number;

  pregnant = false;
  /** Days of gestation remaining; only meaningful while pregnant. */
  gestationLeft = 0;
  /** Who fathered the child being carried. */
  pregnantBy: number | null = null;
  /** Day of the last birth, so nobody bears children back to back. */
  lastBirthDay = -9999;

  health = 100;
  /** All needs are 0 (satisfied) to 100 (desperate). */
  needs: Record<Need, number> = { hunger: 0, thirst: 0, fatigue: 0, cold: 0, company: 0 };
  skills: Record<Skill, number>;
  traits: Record<Trait, number>;
  inventory = new Inventory();

  /** What this person has seen and been told. See `social/Memory.ts`. */
  memory: Memory;
  /**
   * What this person knows how to do.
   *
   * Not a copy of a global tech tree — this *is* where knowledge lives. A thing
   * exists in the world exactly as long as somebody alive has it in this set,
   * and it is lost the moment the last of them dies without teaching it.
   */
  knownTech = new Set<string>();
  /**
   * The record of a life, in order. This is the thing a dynasty game is
   * ultimately about: when the player dies and continues as an heir, the
   * chronicle is what remains of who they were.
   */
  chronicle: LifeEvent[] = [];

  /** Current action id, for the inspector and for the AI-variety health check. */
  action = 'idle';
  /** Who the current action is aimed at, for social actions. */
  targetPersonId: number | null = null;
  /** Which structure the current action is aimed at, for building and storage. */
  targetBuildingId: number | null = null;
  /** Which tree the current action is aimed at, for felling and picking. */
  targetTreeId: number | null = null;
  /** Which animal the current action is aimed at, for the hunt. */
  targetAnimalId: number | null = null;
  /**
   * The last person to draw blood, and when. Fear is what stops a grudge
   * cascade from consuming a band: without somewhere to run, every fight
   * continues until someone dies.
   */
  lastHarmedBy: number | null = null;
  lastHarmedTick = -9999;
  /**
   * Earliest tick at which this person will start another deliberate social
   * act. Approaching someone, saying your piece and parting again takes a
   * while, and without this every social action degenerates into a per-tick
   * loop: two people talk, or hand the same berries back and forth, or pick
   * each other's pockets, thousands of times a day. Fighting is exempt — a
   * brawl really is a rapid exchange.
   */
  socialCooldownUntil = 0;
  /**
   * An order that was interrupted by a need, waiting to be picked back up.
   *
   * This is what makes a long job and a short one behave the same from the
   * player's side. The interruption thresholds are absolute need levels, so
   * whether a job is ever interrupted depends almost entirely on how long it
   * runs: a berry bush is stripped in 148 ticks and never crosses the line, a
   * flint outcrop takes 400 and always does. Same rule, same code — but from
   * outside it looked like berries were uninterruptible and flint was not, and
   * an order the player gave simply evaporated halfway through.
   *
   * Now the order is remembered, the person goes and drinks, and then goes back
   * to it. Cleared by any new order and by an expiry, so a task nobody can get
   * back to cannot haunt someone forever.
   */
  resume: ResumedOrder | null = null;

  /**
   * A player-issued order overrides the utility scorer until it completes or
   * becomes impossible. This is how the radial menu reaches the world, and it
   * applies to any person the player commands, not only the one they inhabit.
   */
  order: string | null = null;
  /**
   * Ticks left in the current action's work phase, and how many it started at.
   *
   * The setter is here so that `actionTotal` is captured wherever a timer is
   * armed — eleven places and counting — without every one of them having to
   * remember. Without a denominator there is no way to draw a progress bar, and
   * without a progress bar a novice digging clay for thirty-five ticks looks
   * exactly like a game that has stopped responding.
   */
  private timer = 0;
  actionTotal = 0;
  workedTicks = 0;

  get actionTimer(): number {
    return this.timer;
  }

  set actionTimer(value: number) {
    // Rising means a fresh stretch of work; falling is the countdown.
    if (value > this.timer) this.actionTotal = value;
    this.timer = value;
  }

  /** 0-1 through the current work cycle, or null when not working to a timer. */
  get cycleProgress(): number | null {
    if (this.timer <= 0 || this.actionTotal <= 0) return null;
    return Math.max(0, Math.min(1, 1 - this.timer / this.actionTotal));
  }
  targetX: number | null = null;
  targetY: number | null = null;
  targetNodeId: number | null = null;

  /**
   * Spreads think ticks across the tick cycle so the whole population does not
   * re-plan on the same step — both a cost smoother and a look fix, since
   * synchronized NPCs move like a shoal.
   */
  readonly thinkOffset: number;

  constructor(name: string, x: number, y: number, bandId: number, rng: RNG) {
    this.id = nextPersonId++;
    this.name = name;
    this.x = x;
    this.y = y;
    this.bandId = bandId;
    this.sex = rng.chance(0.5) ? 'male' : 'female';
    // A founding band skews young: a population that starts at the average age
    // of its lifespan has no breeding cohort and dies out before it can produce
    // a second generation, whatever else is working.
    this.age = rng.range(16, 32) * DAYS_PER_YEAR;
    // Most people who reach adulthood see their sixties; a few see much more.
    this.lifespanDays = rng.gaussian(64, 9) * DAYS_PER_YEAR;
    this.thinkOffset = this.id;
    this.memory = new Memory(this.id);

    this.skills = {} as Record<Skill, number>;
    for (const skill of SKILLS) this.skills[skill] = Math.max(0, rng.gaussian(8, 5));

    this.traits = {} as Record<Trait, number>;
    for (const trait of TRAITS) this.traits[trait] = Math.max(0, Math.min(1, rng.gaussian(0.5, 0.18)));
  }

  get years(): number {
    return Math.floor(this.age / DAYS_PER_YEAR);
  }

  get isChild(): boolean {
    return this.years < ADULT_YEARS;
  }

  get isElder(): boolean {
    return this.years >= ELDER_YEARS;
  }

  /** Women bear children between coming of age and about forty-five. */
  get canBearChildren(): boolean {
    return this.sex === 'female' && !this.pregnant &&
      this.years >= ADULT_YEARS + 2 && this.years < 45;
  }

  get fullName(): string {
    return this.surname ? this.name + ' ' + this.surname : this.name;
  }

  /**
   * Everything a person can do, scaled by their age.
   *
   * Children are slower and weaker at everything; the very old fade. This is
   * one multiplier rather than a special case in every system, so a nine-year
   * old forages badly and fights badly without either being coded twice.
   */
  get vigour(): number {
    const years = this.years;
    if (years < ADULT_YEARS) return 0.3 + (years / ADULT_YEARS) * 0.5;
    if (years < ELDER_YEARS) return 1;
    return Math.max(0.35, 1 - (years - ELDER_YEARS) * 0.02);
  }

  /**
   * How much this person can carry at once.
   *
   * A limit is what makes a harvest *end*: without one a forager strips a bush,
   * a wood and a clay bank in one unbroken errand and never goes home. Children
   * and the very old carry less, through the same vigour multiplier that slows
   * everything else they do.
   */
  get carryCapacity(): number {
    return Math.round(40 * this.vigour);
  }

  get carrying(): number {
    return this.inventory.total;
  }

  get isLaden(): boolean {
    return this.inventory.total >= this.carryCapacity;
  }

  /** The most pressing need's urgency, 0-1. Drives the utility scorer. */
  urgency(need: Need): number {
    return this.needs[need] / 100;
  }

  worstNeed(): { need: Need; value: number } {
    let worst: Need = 'hunger';
    let value = -1;
    for (const need of NEEDS) {
      if (this.needs[need] > value) {
        value = this.needs[need];
        worst = need;
      }
    }
    return { need: worst, value };
  }

  /** Practice. Gains shrink as the skill rises, so early progress feels fast. */
  practice(skill: Skill, amount = 1): void {
    const level = this.skills[skill];
    this.skills[skill] = Math.min(100, level + amount * (1 - level / 110));
  }

  /** Skill as a multiplier, floored so a novice is slow rather than useless. */
  skillFactor(skill: Skill): number {
    return (0.35 + (this.skills[skill] / 100) * 0.85) * this.vigour;
  }

  distanceTo(other: { x: number; y: number }): number {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  die(cause: string): void {
    if (!this.alive) return;
    this.alive = false;
    this.causeOfDeath = cause;
    this.action = 'dead';
  }

  clearTarget(): void {
    this.targetX = null;
    this.targetY = null;
    this.targetNodeId = null;
    this.targetPersonId = null;
    this.targetBuildingId = null;
    this.targetTreeId = null;
    this.targetAnimalId = null;
    this.actionTimer = 0;
  }

  /**
   * Abandons any player order, returning the person to their own judgement.
   *
   * Deliberately leaves `resume` alone: this is called by `finish` at the end of
   * *every* action, including the interruption that set `resume` a moment
   * earlier, so clearing it here silently made resumption impossible. Callers
   * that mean "forget the whole errand" — a refusal, an exile, the player
   * taking the controls — use `forgetPlans`.
   */
  clearOrder(): void {
    this.order = null;
  }

  /** Drops the current order *and* anything set aside to come back to. */
  forgetPlans(): void {
    this.order = null;
    this.resume = null;
  }
}
