/**
 * A person. The player is one of these and has no extra fields — every ability
 * the player has, an NPC has too. That symmetry is a design pillar, not an
 * accident: it is what makes the world feel inhabited rather than staged.
 */
import type { RNG } from '../core/RNG.ts';
import { Inventory } from './Item.ts';
import { Memory } from '../social/Memory.ts';
import type { LifeEvent } from '../social/SocialSystem.ts';
import { carryFactor } from '../knowledge/Tech.ts';
import type { Idea } from '../knowledge/Synthesis.ts';
import type { JobId } from './Job.ts';

/**
 * `farm` and `smith` are added ahead of the technologies that will use them.
 * `SKILLS` is iterated by founding, inheritance, ageing and the
 * character-creation point budget, so a new skill has to migrate through all
 * four the moment it exists — hiding that migration inside the M8 content
 * pass that first gives either of them an action would make the two changes
 * impossible to measure apart.
 */
export const SKILLS = [
  'forage', 'hunt', 'knap', 'build', 'cook',
  'fight', 'persuade', 'teach', 'heal', 'track', 'farm', 'smith',
] as const;
export type Skill = (typeof SKILLS)[number];

/**
 * Seven heritable personality axes, each in [0, 1]. They weight the utility
 * scorer, so a greedy, low-loyalty person genuinely prefers stealing to asking.
 *
 * `intelligence` is how quickly someone works an idea out, teaches it, and
 * picks it up again from somebody else. `industriousness` is how much they want
 * to be working at all — and note that it biases the *scorer* only. It is
 * deliberately not wired to how fast work actually goes: work rates set the
 * whole food economy, which is measured across ten seeds rather than in one
 * run, and a trait that quietly moved them would be invisible until a
 * population collapsed.
 *
 * Rebelliousness is *not* here. It is derived from `loyalty` and standing grief
 * in `social/Authority.ts`, because two knobs for one behaviour is how a scorer
 * becomes untunable.
 */
export const TRAITS = [
  'aggression', 'greed', 'loyalty', 'curiosity', 'tradition',
  'intelligence', 'industriousness',
] as const;
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
  /** Which recipe a set-aside `craft` was making. */
  recipe: string | null;
  /** Which record a set-aside `read` was aimed at. */
  inscriptionId: number | null;
  /** Which item and count a set-aside player-ordered `take` named. */
  itemId: string | null;
  count: number | null;
  x: number | null;
  y: number | null;
}

/** In-game days in a year. Ages, gestation and lifespans are all in days. */
export const DAYS_PER_YEAR = 80;

/** Below this a person is a child: they cannot marry, work or be held to a deed. */
export const ADULT_YEARS = 14;
/** Above this, skills start to fade and the years begin to tell. */
export const ELDER_YEARS = 50;

/**
 * How much of `lately` and `noticed` survives each day.
 *
 * Chosen so that a thing done a few times a day sits comfortably above
 * `LATELY_ENOUGH` while a thing done once a fortnight ago is gone entirely.
 */
const RECENCY_DECAY = 0.6;

/**
 * How much of a thing counts as having been doing it, or having seen it.
 *
 * With `RECENCY_DECAY` at 0.6 this works out as "at least once since
 * yesterday", which is the right sense of *lately* for verbs a person does
 * rarely. Felling is the case that set it: a tree is the better part of a day's
 * work and nobody does it twice, so a threshold that demanded repetition would
 * have made `doing: chop` an ingredient no spark could ever contain.
 */
export const LATELY_ENOUGH = 1.0;

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
  /**
   * A standing occupation, or none. Leans `Brain`'s scorer toward the job's
   * own verbs and damps the rest of `WORK_ACTIONS` a little — see `Job.ts`.
   * Assigning somebody else's is an order, subject to the same compliance
   * roll as `Simulation.command`; assigning your own always succeeds.
   */
  job: JobId | null = null;

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

  /**
   * Ideas being worked on, and how far each has got. Capped at `MAX_IDEAS`, so
   * nobody dabbles at everything.
   *
   * Per-person and lost on death, exactly like `knownTech`. Knowledge is held
   * by people, not by a civilisation, and a half-finished design dies with the
   * person who was half-finishing it.
   */
  ideas: Idea[] = [];
  /**
   * How far each proven technology has been refined by *this* holder.
   *
   * On the knower rather than the object, so a fine axe handed to a novice is
   * just an axe. See the note at `techPower`.
   */
  techLevel = new Map<string, number>();

  /**
   * A decaying tally of what this person has actually been doing.
   *
   * There was no such record anywhere before M6b phase 2, and synthesis is
   * impossible without one: `workedTicks` is zeroed on every `finish` and never
   * knew which action it counted, `skills` are cumulative, lossy and saturating
   * with ten of them covering two dozen verbs, `telemetry` is global, takes no
   * person and is disabled in the browser build, and `actionCounts()` is an
   * instantaneous census of the living rather than a history.
   *
   * Note that the two scorer aliases are invisible here: `Brain.setup` rewrites
   * `feed` to `give`, `gather_for_site` to `gather` and `teach_child` to
   * `teach` long before an action
   * ever ends, so those are the ids that arrive. If either is ever wanted as an
   * ingredient in its own right, capture it at the scorer.
   */
  lately = new Map<string, number>();
  /**
   * The same, for things that happened *to* them rather than things they chose:
   * the reasons their own work kept stopping.
   *
   * Kept apart from `lately` because they answer different questions. Giving up
   * on a tree because your hands were full is not an activity you took up, and
   * it is the sort of thing that makes a person think about carrying straps.
   */
  noticed = new Map<string, number>();

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
   * Which entry of `RECIPES` a `craft` is making.
   *
   * A string rather than an id because recipes are authored content keyed by
   * name, the way buildings are. Before the table there was only ever one thing
   * to make, so the action carried no target at all and three separate places
   * hardcoded the hand axe between them.
   */
  targetRecipe: string | null = null;
  /** Which record a `read` is aimed at. */
  targetInscriptionId: number | null = null;
  /**
   * Which item and how much a player-ordered `take` should withdraw.
   *
   * Null lets `doTake` pick sensibly on its own, which is what the AI's own
   * trips to the larder still do — this is only ever set by a player order
   * that named a specific item and count, M9 phase 2's fix for `doTake` always
   * grabbing a fixed six units of whatever the simulation felt like handing
   * over.
   */
  targetItemId: string | null = null;
  targetItemCount: number | null = null;
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

  /**
   * How far through the current pull of work this is, 0 to 1.
   *
   * Read by `ActionSystem.workLimit` so that a job nine-tenths done is allowed
   * to finish rather than being thrown away one tick short and started again
   * from nothing. Zero for anything that is not on a countdown — building,
   * felling and carving bank their progress on the thing being worked instead,
   * and cannot lose it.
   */
  /**
   * Ticks already spent on one long solo job, and which job they were spent on.
   *
   * The escape hatch `AGENTS.md` demands for anything much over 140 workTicks:
   * a novice's hand axe is 258 ticks against about 400 of thirst, so an
   * interrupted craft used to start again from nothing every time. Building,
   * felling and carving bank on the *thing being worked*, which is better —
   * anyone can pick the job up. A craft has no such thing to bank on until the
   * final tick, when the item appears, so it banks on the person instead.
   *
   * Keyed, so that starting a different job discards it rather than crediting
   * pot-shaping hours to an axe. Cleared by `forgetPlans`.
   */
  workBankKey: string | null = null;
  workBankTicks = 0;

  /**
   * Ticks already banked towards `key`, and none if the last job was different.
   */
  bankedFor(key: string): number {
    return this.workBankKey === key ? this.workBankTicks : 0;
  }

  /** Records another tick spent on `key`, discarding any other job's progress. */
  bankWork(key: string): void {
    if (this.workBankKey !== key) {
      this.workBankKey = key;
      this.workBankTicks = 0;
    }
    this.workBankTicks++;
  }

  /** Throws away banked progress, on finishing a job or on giving one up. */
  clearWorkBank(): void {
    this.workBankKey = null;
    this.workBankTicks = 0;
  }

  pullProgress(): number {
    if (this.actionTotal <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - this.timer / this.actionTotal));
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
   * Consecutive ticks `MovementSystem` has measured as making no real
   * progress toward the current target.
   *
   * Lives here rather than in a module-level `Map` keyed by person id, which
   * is what `MovementSystem` used before: that map was shared by every
   * `Simulation` in the process, so a stale entry from one world's person id
   * could pollute the next, and nothing ever deleted the id of somebody who
   * died mid-slide either. A field on the person is bounded by the person's
   * own lifetime instead.
   *
   * Deliberately *not* reset by `clearTarget()` — `MovementSystem` resets it
   * itself, at the same three points the old map was cleared (arrival,
   * sufficient progress, and giving up). Clearing it here too would also
   * clear it on every ordinary new order, which the old map never did; that
   * reads like it should not matter, but this simulation is chaotic enough
   * that changing which tick a `giveUp` roll happens on shifts every draw
   * after it, so it would have made this migration a behaviour change
   * wearing an instrumentation commit's clothes.
   */
  stuckSteps = 0;

  /**
   * The current route from `Pathfinder`, as `[x0, y0, x1, y1, …]` waypoints —
   * never the start or the destination tile, both of which `MovementSystem`
   * already knows without asking. `null` until the first route is computed;
   * kept and reused afterwards rather than reallocated, growing only the rare
   * time a route needs more room than it ever has before. One buffer per
   * person for life, not a search's worth of garbage every time somebody
   * walks somewhere.
   */
  path: Int16Array | null = null;
  /** Waypoints currently valid in `path` — 0 means "no route, walk straight". */
  pathCount = 0;
  /** Index of the next waypoint to walk toward; waypoints behind it are spent. */
  pathAt = 0;
  /** The target `path` was computed for, so a target that moved is noticed. */
  pathGoalX = 0;
  pathGoalY = 0;
  /** Tick of the last route request, whether or not it found one. */
  pathTick = -Infinity;

  /**
   * Spreads think ticks across the tick cycle so the whole population does not
   * re-plan on the same step — both a cost smoother and a look fix, since
   * synchronized NPCs move like a shoal.
   */
  readonly thinkOffset: number;

  /**
   * This world's skill-gain multiplier, stamped on by `Simulation`.
   *
   * An instance field and not a module-level global on purpose. Six simulations
   * are constructed back to back by `sim:check:all`, and a global would have
   * the last one constructed silently retune the others — a failure the
   * determinism test could never see, because it compares two runs of the same
   * build. Defaulted to 1 so a `Person` built by a unit test needs no config.
   */
  skillGain = 1;

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
    return Math.round(40 * this.vigour * carryFactor(this));
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

  /**
   * Records that a stretch of work just ended, whatever it was.
   *
   * Called from `ActionSystem.finish`, the single funnel every ended action
   * passes through — `stop` and `abandon` both delegate to it — so there is one
   * call site rather than one per verb.
   */
  noteDid(action: string): void {
    // M7: `case 'wander'` in `ActionSystem` now reaches `finish` (it used to
    // discard `MovementSystem`'s return value and never get there at all),
    // which would otherwise start entering `wander` here for the first time —
    // reviving `tracking`'s fourth spark route in `Tech.ts`, a tech-economy
    // change with no business riding inside a movement fix.
    if (action === 'idle' || action === 'dead' || action === 'wander') return;
    this.lately.set(action, (this.lately.get(action) ?? 0) + 1);
  }

  /** Records that something stopped them, or that they watched it happen. */
  noteSaw(what: string): void {
    this.noticed.set(what, (this.noticed.get(what) ?? 0) + 1);
  }

  /**
   * Ages both senses once a day.
   *
   * Fast decay on purpose. These are the ingredients of "what is on your mind
   * *right now*", and a tally that took a season to fade would mean everybody
   * had done everything lately and no spark could distinguish anybody.
   */
  decayRecent(): void {
    for (const map of [this.lately, this.noticed]) {
      for (const [key, value] of map) {
        const faded = value * RECENCY_DECAY;
        if (faded < 0.1) map.delete(key);
        else map.set(key, faded);
      }
    }
  }

  /** The idea about `tech` this person is working on, if any. */
  ideaFor(tech: string): Idea | null {
    return this.ideas.find(idea => idea.tech === tech) ?? null;
  }

  /** Practice. Gains shrink as the skill rises, so early progress feels fast. */
  practice(skill: Skill, amount = 1): void {
    const level = this.skills[skill];
    // A quick study gets more out of the same hour's work.
    //
    // A bonus only, never a penalty, and that is not generosity — it is the
    // difference between this trait costing the world food and not. Skill gain
    // is damped by the level already reached, so it is concave: a multiplier
    // centred on 1 takes more from the slow learners than it gives the quick
    // ones, average skill across the band falls, and skill is what forage
    // yields are scaled by. Measured across ten seeds, the centred version cost
    // roughly nine points of mean survival for a piece of flavour. The band is
    // narrow for a second reason: coefficients here are calibrated against each
    // other, and one lucky roll at birth should not produce somebody the rest
    // of the band can never catch.
    const wit = 1 + this.traits.intelligence * 0.25;
    this.skills[skill] =
      Math.min(100, level + amount * wit * this.skillGain * (1 - level / 110));
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
    this.targetRecipe = null;
    this.targetInscriptionId = null;
    this.targetItemId = null;
    this.targetItemCount = null;
    this.actionTimer = 0;
    // A route and the aim it was computed for have to be forgotten together —
    // this is the one place that forgets where somebody was going, and a
    // route outliving it would send them toward the last errand's bush. The
    // buffer itself is kept; only `pathCount` needs to fall to zero for
    // `MovementSystem` to compute a fresh one.
    this.pathCount = 0;
    this.pathAt = 0;
    // And the cooldown, for the same reason. `MovementSystem.REPATH_COOLDOWN`
    // justifies itself with "fifteen ticks of greedy steering between attempts
    // is exactly what a person with no route at all already does" — an
    // argument about *retrying a failed search*, which a brand-new errand
    // silently inherited because `pathTick` is stamped on every attempt and
    // nothing here cleared it. `Brain.setup` calls this on every re-plan, so
    // anybody who changed their mind within fifteen ticks of their last search
    // walked the first five tiles of the new errand with no route at all —
    // which on a coastline is precisely the stretch where people got pressed.
    //
    // Deliberately unlike `stuckSteps`, which stays: that exclusion was about
    // not smuggling a behaviour change into an instrumentation commit, not a
    // principle that `clearTarget` should forget less than it means to.
    this.pathTick = -Infinity;
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
    this.clearWorkBank();
  }
}
