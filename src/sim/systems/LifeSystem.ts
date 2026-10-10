/**
 * The life cycle: growing up, growing old, being born, dying, and what happens
 * to your things afterwards.
 *
 * This is the system that turns a survival sandbox into a dynasty game. Until
 * now the cast was fixed: the same thirty people foraged forever and nothing
 * compounded. With birth and death, a band becomes a population, skills have to
 * be *taught* before their holder dies, a household accumulates across
 * generations, and the player's own death stops being the end of the game and
 * becomes the moment they continue as someone else.
 *
 * Everything here runs once per in-game day rather than per tick. A person does
 * not perceptibly age in a fifth of a second, and doing this work 240x less
 * often is the difference between a century-long run being cheap and being the
 * most expensive thing in the simulation.
 */
import type { Person } from '../entities/Person.ts';
import { ELDER_YEARS, SKILLS, TRAITS, TRAIT_SPREAD } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import type { Building } from '../entities/Building.ts';
import { houseInteriorContains } from '../world/HouseInterior.ts';
import type { RNG } from '../core/RNG.ts';
import type { PopulationConfig } from '../core/Config.ts';
import { telemetry } from '../core/Telemetry.ts';
import {
  complicationChance, gestationDays, midwifeQuality, miscarriageRisk, type MiscarriageCause,
} from '../entities/Pregnancy.ts';

/**
 * The roof a person is asleep under right now, or null.
 *
 * The one predicate behind "slept under a roof": `Simulation.shareTheHearth`
 * samples it at midnight for the hearth and for conception, and the compact
 * LOD (`CompactAdvance`) asks it of a couple it advances out of sight. Two
 * copies would drift — the compact model would grow families the detailed one
 * forbids. Open shelters use the building margin; walled houses require the
 * sleeper to have reached the room, not merely the footprint or doorway.
 */
export function roofOverSleeper(person: Person, buildingsById: ReadonlyMap<number, Building>): Building | null {
  if (!person.alive || person.action !== 'sleep' || person.targetBuildingId === null) return null;
  const roof = buildingsById.get(person.targetBuildingId);
  const underRoof = roof?.def.interior
    ? houseInteriorContains(roof, person.x, person.y)
    : roof?.contains(person.x, person.y, 1) ?? false;
  return roof && roof.complete && roof.def.shelter > 0 && underRoof ? roof : null;
}

// Moved to `entities/Pregnancy.ts` (M15 phase 19) so the thirds of a pregnancy
// are measured against the same span the birth is; re-exported because the
// compact model's tests and callers have always imported it from here.
export { gestationDays };

/** Days a mother waits before she can conceive again: half the calendar year. */
function birthSpacingDays(mother: Person): number {
  return mother.daysPerYear / 2;
}

/** Skill lost per day past elderhood, as a fraction of the current level. */
const ELDER_SKILL_DECAY = 0.0012;

/** Share of its lifespan after which a person can die of old age. */
export const OLD_AGE_ONSET = 0.85;

/**
 * The chance of dying of old age on one day: zero before `OLD_AGE_ONSET` of the lifespan, then
 * `0.002 * overdue_years^2` (x1.8 when frail), capped at one half. A function so that the
 * aggregate model of a people (`world/PeopleDemography.ts`) integrates the very same hazard
 * the individual rolls, instead of a second copy that could drift.
 */
export function oldAgeChancePerDay(ageDays: number, lifespanDays: number, daysPerYear: number, frail: boolean): number {
  if (ageDays < lifespanDays * OLD_AGE_ONSET) return 0;
  const overdue = (ageDays - lifespanDays * OLD_AGE_ONSET) / daysPerYear;
  return Math.min(0.5, 0.002 * overdue * overdue * (frail ? 1.8 : 1));
}

export interface LifeContext {
  rng: RNG;
  /**
   * Carried for `conceptionChance` alone, which is the only member of
   * `PopulationConfig` read after the constructor — the other three are spent
   * laying out the founding bands and need a new world to change.
   */
  population: PopulationConfig;
  tick: number;
  day: number;
  peopleById: Map<number, Person>;
  /** Resolve an already conceived child's parent across comarca owners; never enables distant conception. */
  parentArchive?: (id: number) => Person | null;
  householdsById: Map<number, Household>;
  /**
   * Who slept under which roof at midnight (`Simulation.shareTheHearth`).
   * Conception reads it: a couple who did not share a roof tonight conceive
   * nothing, which is what makes the hut — not the open ground — the thing
   * that grows a family. Any shelter counts, a windbreak included.
   */
  roofTonight: ReadonlyMap<number, number>;
  /** Called with each newborn so the simulation can register and place them. */
  onBirth: (child: Person, mother: Person, father: Person | null) => void;
  /** Called when someone dies of anything this system is responsible for. */
  onDeath: (person: Person, cause: string) => void;
  /** Per-simulation birth factory; avoids a cross-world module hook. */
  makeChild: (mother: Person, rng: RNG) => Person;
  /**
   * M15 phase 19d: what can go wrong with a pregnancy. **Absent in the compact
   * model**, which has no `healthRng` and no one to tend a birth: a person out
   * of sight neither loses a child nor bleeds, and the demography calibration
   * (phase 41) is where that difference gets measured rather than guessed.
   */
  pregnancyCare?: PregnancyCare;
}

export interface PregnancyCare {
  /** `Simulation.healthRng`: fork 19, no new stream. */
  rng: RNG;
  /** The best person at hand to see her through a birth, or null. */
  midwifeFor: (mother: Person) => Person | null;
  onMiscarriage: (mother: Person, father: Person | null, cause: MiscarriageCause) => void;
  /** Called after the child is registered, so the mother's chronicle says it in order. */
  onComplicatedBirth: (mother: Person, midwife: Person | null) => void;
}

export class LifeSystem {
  /** Runs the day's aging, conception, birth and mortality. */
  daily(people: Person[], ctx: LifeContext): void {
    for (const person of people) {
      if (!person.alive) continue;

      person.age += 1;
      this.ageSkills(person);

      if (person.pregnant) this.advancePregnancy(person, ctx);
      else if (person.canBearChildren) this.tryConceive(person, ctx);

      this.checkMortality(person, ctx);
    }
  }

  /**
   * Skills fade in old age.
   *
   * This is what gives teaching a point. A band whose best hunter dies without
   * passing anything on genuinely loses the knowledge, which is the same
   * mechanism that will make technology losable in M4.
   */
  private ageSkills(person: Person): void {
    if (!person.isElder) return;
    const rate = ELDER_SKILL_DECAY * (person.years - ELDER_YEARS + 1);
    for (const skill of SKILLS) {
      person.skills[skill] = Math.max(0, person.skills[skill] * (1 - rate));
    }
  }

  private tryConceive(mother: Person, ctx: LifeContext): void {
    if (ctx.day - mother.lastBirthDay < birthSpacingDays(mother)) return;

    const father = mother.spouseId === null ? null : ctx.peopleById.get(mother.spouseId);
    if (!father || !father.alive || father.isChild) return;

    // Hunger and injury suppress conception. A band on the edge of starvation
    // does not produce a baby boom, which is what stops the population from
    // exploding exactly when it can least afford to.
    // Hunger and injury suppress conception, but only a genuinely bad state
    // should stop it: the first version multiplied three fractions together and
    // a perfectly healthy woman with mild hunger came out at a quarter of the
    // nominal rate, which was not enough to replace the generation above her.
    const condition =
      Math.max(0, 1 - mother.needs.hunger / 140) *
      Math.max(0, mother.health / 100) *
      (mother.years < 38 ? 1 : 0.6);
    if (condition <= 0) return;

    if (ctx.rng.chance(ctx.population.conceptionChance * condition)) {
      // M15 phase 18: under the same roof tonight, or not at all. The gate sits
      // *after* the draw on purpose: the life stream also feeds mortality, so a
      // gate before it removed numbers and shifted every death in the world,
      // breaking unrelated runs (`diggers`' earthworks) by pure divergence.
      // Drawn first, a refused conception changes only the conception.
      const roof = ctx.roofTonight.get(mother.id);
      if (roof === undefined || ctx.roofTonight.get(father.id) !== roof) {
        telemetry.count('conception_no_roof');
        return;
      }
      mother.pregnant = true;
      mother.gestationLeft = gestationDays(mother);
      mother.pregnantBy = father.id;
      telemetry.count('conception');
    }
  }

  private advancePregnancy(mother: Person, ctx: LifeContext): void {
    mother.gestationLeft -= 1;
    const care = ctx.pregnancyCare;
    // M15 phase 19d. The roll is made only when something endangers her
    // (`miscarriageRisk` is null otherwise), so a world with no starving, no
    // fever and no blow to the body draws nothing from `healthRng` here. Not on
    // the day she is due: that day is the birth's.
    if (care && mother.gestationLeft > 0) {
      const risk = miscarriageRisk(mother);
      if (risk) {
        telemetry.count('pregnant_days_at_risk');
        if (care.rng.next() < risk.chance) {
          const father = mother.pregnantBy === null ? null : ctx.peopleById.get(mother.pregnantBy) ?? ctx.parentArchive?.(mother.pregnantBy) ?? null;
          mother.pregnant = false;
          mother.gestationLeft = 0;
          mother.pregnantBy = null;
          // She can conceive again after half the usual wait: a loss is not a
          // birth, and the full wait would be a second punishment.
          mother.lastBirthDay = ctx.day - birthSpacingDays(mother) / 2;
          mother.health = Math.max(1, mother.health - 8);
          care.onMiscarriage(mother, father, risk.cause);
          return;
        }
      }
    }
    if (mother.gestationLeft > 0) return;

    mother.pregnant = false;
    mother.lastBirthDay = ctx.day;
    const father = mother.pregnantBy === null ? null : ctx.peopleById.get(mother.pregnantBy) ?? ctx.parentArchive?.(mother.pregnantBy) ?? null;
    mother.pregnantBy = null;

    const child = this.conceiveChild(mother, father, ctx);
    // Drawn at every birth, unlike the miscarriage: a birth is the risk, and
    // the dice are cast whether or not anybody is there to help. The help
    // only changes how often they come up wrong.
    let complicated = false;
    let midwife: Person | null = null;
    if (care) {
      midwife = care.midwifeFor(mother);
      complicated = care.rng.next() < complicationChance(midwife ? midwifeQuality(midwife) : 0);
    }
    ctx.onBirth(child, mother, father);
    if (care && complicated) care.onComplicatedBirth(mother, midwife);
  }

  /**
   * Builds the child.
   *
   * Traits are the average of the parents plus drift, so a family has a
   * recognisable temperament that is never quite fixed. Skills start near
   * nothing: nobody is born knowing how to knap flint, and everything a child
   * ends up good at, somebody had to teach them or they had to practise.
   */
  private conceiveChild(mother: Person, father: Person | null, ctx: LifeContext): Person {
    // Constructed through the mother's own class so ids and defaults stay in
    // one place; the caller supplies the constructor via a factory instead of
    // this module importing Person concretely for `new`.
    const rng = ctx.rng;
    const child = ctx.makeChild(mother, rng);
    inheritTraits(child, mother, father, rng);

    for (const skill of SKILLS) {
      // Nobody inherits the ability to stay afloat; it is practised. As with
      // founders, consuming no draw keeps the shared birth stream unchanged.
      child.skills[skill] = skill === 'swim' ? 0 : Math.max(0, rng.gaussian(1.5, 1));
    }

    child.age = 0;
    child.lifespanDays = Math.max(30, rng.gaussian(64, 9)) * child.daysPerYear;
    child.motherId = mother.id;
    child.fatherId = father?.id ?? null;
    child.bandId = mother.bandId;
    child.householdId = mother.householdId;
    child.surname = father?.surname || mother.surname;
    child.x = mother.x;
    child.y = mother.y;
    return child;
  }

  /**
   * Old age and frailty.
   *
   * Past their span, a person's daily chance of dying climbs steeply rather
   * than being a cliff, so a household cannot time a succession to the day.
   */
  private checkMortality(person: Person, ctx: LifeContext): void {
    if (person.age < person.lifespanDays * OLD_AGE_ONSET) return;

    const chance = oldAgeChancePerDay(person.age, person.lifespanDays, person.daysPerYear, person.health < 50);

    if (ctx.rng.chance(chance)) {
      ctx.onDeath(person, 'old age');
    }
  }
}

/**
 * Blends a child's temperament from their parents', plus drift.
 *
 * A family has a recognisable temperament that is never quite fixed. Shared
 * with world founding so a family the world starts with and a family grown in
 * play are built the same way — two copies of this would drift apart, and the
 * founding generation would quietly stop resembling its own children.
 */
/**
 * How far a child's temperament strays from the average of their parents'.
 *
 * Not a free parameter. Averaging two parents halves the variance of what a
 * child starts from, so the drift has to put exactly that half back or every
 * generation is more alike than the last: at the 0.09 this used to be, the
 * spread settled at 0.127 instead of `TRAIT_SPREAD`'s 0.18, and the share of
 * people past `Restraint.IN_GROUP_TAIL` fell from about one in seventy-five
 * among the founders to under one in a thousand by their great-grandchildren.
 * The owner's bell curve would have quietly become a spike. `TRAIT_SPREAD /
 * √2` is the drift at which the curve a world starts with is the curve it
 * keeps (a single parent passes on their own full variance, so for them this
 * slightly widens it — rare, and harmless).
 */
const INHERITED_DRIFT = TRAIT_SPREAD / Math.SQRT2;

export function inheritTraits(
  child: Person,
  mother: Person,
  father: Person | null,
  rng: RNG
): void {
  // M15 2c: confidence, rather than the remembered value, is softened: experience can
  // quickly replace family lore. If the mother died in childbirth, the living
  // father is the only parent whose expectations can reach the newborn.
  const beliefParent = mother.alive ? mother : father;
  child.beliefs = beliefParent
    ? beliefParent.beliefs.inherit(0.6, () => child.noteDiscovery())
    : child.beliefs;
  for (const trait of TRAITS) {
    const inherited = father
      ? (mother.traits[trait] + father.traits[trait]) / 2
      : mother.traits[trait];
    child.traits[trait] = Math.max(0, Math.min(1, inherited + rng.gaussian(0, INHERITED_DRIFT)));
  }
}

// ---------------------------------------------------------------------------
// Inheritance
// ---------------------------------------------------------------------------

/**
 * Who inherits, in order: the eldest adult child, then any child, then the
 * spouse, then the nearest surviving household member.
 *
 * Deliberately simple and deliberately explicit. Succession rules vary by
 * culture and that variation is worth having later, but a rule the player
 * cannot predict is worse than a plain one.
 */
export function findHeir(person: Person, peopleById: Map<number, Person>): Person | null {
  const children = person.childIds
    .map(id => peopleById.get(id))
    .filter((c): c is Person => !!c && c.alive)
    .sort((a, b) => b.age - a.age);

  const adultChild = children.find(c => !c.isChild);
  if (adultChild) return adultChild;
  if (children.length > 0) return children[0]!;

  const spouse = person.spouseId === null ? null : peopleById.get(person.spouseId);
  if (spouse && spouse.alive) return spouse;

  return null;
}

/**
 * Moves a dead person's goods to their heir, and reports what changed hands.
 *
 * With no heir, goods go to the household's home — the building
 * `Simulation.shareTheHearth` last saw a member of it sleeping under — or
 * land on the ground at the deceased's own feet if the household has no home
 * yet. Never a `Household` field of its own: see `Household.homeBuildingId`'s
 * comment for why that used to be a store nobody could reach.
 */
export function settleEstate(
  deceased: Person,
  heir: Person | null,
  home: Building | null,
  dropAt: (x: number, y: number, itemId: string, count: number) => void
): number {
  const goods = deceased.inventory.entries();
  let moved = 0;

  for (const [itemId, count] of goods) {
    const taken = deceased.inventory.remove(itemId, count);
    if (heir) heir.inventory.add(itemId, taken);
    else if (home) home.store.add(itemId, taken);
    else dropAt(deceased.x, deceased.y, itemId, taken);
    moved += taken;
  }

  if (moved > 0) telemetry.count('inherited_goods', moved);
  return moved;
}
