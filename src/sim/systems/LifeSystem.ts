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
import { ELDER_YEARS, SKILLS, TRAITS } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import type { Building } from '../entities/Building.ts';
import type { RNG } from '../core/RNG.ts';
import type { PopulationConfig } from '../core/Config.ts';
import { telemetry } from '../core/Telemetry.ts';

/**
 * Days a pregnancy runs: a quarter of the calendar year, whatever the
 * scenario's season length says that is. Kept a function rather than a
 * constant now that a person's `daysPerYear` need not be eighty — a fixed
 * number here would silently decouple gestation from the calendar exactly as
 * `DAYS_PER_YEAR` itself used to.
 */
export function gestationDays(mother: Person): number {
  return mother.daysPerYear / 4;
}

/** Days a mother waits before she can conceive again: half the calendar year. */
function birthSpacingDays(mother: Person): number {
  return mother.daysPerYear / 2;
}

/** Skill lost per day past elderhood, as a fraction of the current level. */
const ELDER_SKILL_DECAY = 0.0012;

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
  householdsById: Map<number, Household>;
  /** Called with each newborn so the simulation can register and place them. */
  onBirth: (child: Person, mother: Person, father: Person | null) => void;
  /** Called when someone dies of anything this system is responsible for. */
  onDeath: (person: Person, cause: string) => void;
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
      mother.pregnant = true;
      mother.gestationLeft = gestationDays(mother);
      mother.pregnantBy = father.id;
      telemetry.count('conception');
    }
  }

  private advancePregnancy(mother: Person, ctx: LifeContext): void {
    mother.gestationLeft -= 1;
    if (mother.gestationLeft > 0) return;

    mother.pregnant = false;
    mother.lastBirthDay = ctx.day;
    const father = mother.pregnantBy === null ? null : ctx.peopleById.get(mother.pregnantBy) ?? null;
    mother.pregnantBy = null;

    ctx.onBirth(this.conceiveChild(mother, father, ctx.rng), mother, father);
  }

  /**
   * Builds the child.
   *
   * Traits are the average of the parents plus drift, so a family has a
   * recognisable temperament that is never quite fixed. Skills start near
   * nothing: nobody is born knowing how to knap flint, and everything a child
   * ends up good at, somebody had to teach them or they had to practise.
   */
  private conceiveChild(mother: Person, father: Person | null, rng: RNG): Person {
    // Constructed through the mother's own class so ids and defaults stay in
    // one place; the caller supplies the constructor via a factory instead of
    // this module importing Person concretely for `new`.
    const child = makeChild(mother, rng);
    inheritTraits(child, mother, father, rng);

    for (const skill of SKILLS) {
      child.skills[skill] = Math.max(0, rng.gaussian(1.5, 1));
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
    if (person.age < person.lifespanDays * 0.85) return;

    const overdue = (person.age - person.lifespanDays * 0.85) / person.daysPerYear;
    const frailty = person.health < 50 ? 1.8 : 1;
    const chance = Math.min(0.5, 0.002 * overdue * overdue * frailty);

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
export function inheritTraits(
  child: Person,
  mother: Person,
  father: Person | null,
  rng: RNG
): void {
  for (const trait of TRAITS) {
    const inherited = father
      ? (mother.traits[trait] + father.traits[trait]) / 2
      : mother.traits[trait];
    child.traits[trait] = Math.max(0, Math.min(1, inherited + rng.gaussian(0, 0.09)));
  }
}

/**
 * Factory hook.
 *
 * Set once at start-up by the simulation. It exists so this module can create
 * people without importing the concrete constructor and its id counter, which
 * would make the dependency graph circular (Person imports Memory imports
 * Events, and Simulation owns them all).
 */
let makeChild: (mother: Person, rng: RNG) => Person;

export function setChildFactory(factory: (mother: Person, rng: RNG) => Person): void {
  makeChild = factory;
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
