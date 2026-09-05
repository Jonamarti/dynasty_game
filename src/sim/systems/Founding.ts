/**
 * How a world starts: three tribes made of families.
 *
 * Until this existed, every founding person was the head of a household of one.
 * That exercised the succession machinery from day one, which was the point at
 * the time, but it also meant there were no families anywhere in the world until
 * somebody married one into existence — and a dynasty game whose opening
 * position contains no dynasties is starting the player a generation late.
 *
 * A founding family is a married couple, their children, and sometimes a
 * widowed parent or an unmarried adult sibling living with them. Everything
 * here goes through the same code an in-game family would: `social.wed` for the
 * marriage, `linkFamily` for the kinship edges, `inheritTraits` for the
 * children's temperament. Two copies of any of those would drift apart, and the
 * founding generation would quietly stop resembling its own descendants.
 *
 * This is also what character creation calls, so the tribe the player picks
 * from is the same tribe the simulation would have generated anyway.
 */
import type { Person } from '../entities/Person.ts';
import { DAYS_PER_YEAR, ADULT_YEARS } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import type { RNG } from '../core/RNG.ts';
import type { World } from '../core/World.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import type { SocialSystem } from '../social/SocialSystem.ts';
import { linkFamily, KIN_SIBLING } from '../social/SocialSystem.ts';
import { inheritTraits } from './LifeSystem.ts';
import { NAME_ONSETS, NAME_CODAS } from '../../data/names.ts';
import { telemetry } from '../core/Telemetry.ts';

/** Marrying age for a founding couple, in years. */
const COUPLE_MIN_AGE = 20;
const COUPLE_MAX_AGE = 45;

/** Chance a family has a widowed parent of one of the couple living with it. */
const ELDER_CHANCE = 0.22;

/** Chance a family has an unmarried adult sibling living with it. */
const SIBLING_CHANCE = 0.18;

export interface FoundingContext {
  world: World;
  rng: RNG;
  relationships: RelationshipGraph;
  social: SocialSystem;
  /**
   * Builds a bare person. Injected rather than imported so this module does not
   * take a hard dependency on the `Person` constructor and its id counter — the
   * same reason `LifeSystem` takes a child factory.
   */
  makePerson: (name: string, x: number, y: number, bandId: number, rng: RNG) => Person;
  /** Somewhere walkable near the camp for a family to stand. */
  placeNear: (x: number, y: number) => { x: number; y: number };
}

export interface FoundedBand {
  people: Person[];
  households: Household[];
}

/**
 * Fills one band with families until it has about `wanted` people.
 *
 * The last family is *shaped* to the room left rather than truncated after the
 * fact — a household missing its youngest child because a counter ran out is a
 * worse artefact than a band of eleven where ten were asked for. Sizing it up
 * front keeps the overshoot to a single person: without it, three bands asked
 * for ten each delivered thirty-eight, and a world tuned for thirty spent its
 * first fortnight burying the difference.
 */
export function foundBand(
  band: { id: number; homeX: number; homeY: number },
  wanted: number,
  ctx: FoundingContext
): FoundedBand {
  const people: Person[] = [];
  const households: Household[] = [];

  while (people.length < wanted) {
    const family = foundFamily(band, wanted - people.length, ctx);
    people.push(...family.members);
    households.push(family.household);
  }

  telemetry.count('founding_households', households.length);
  return { people, households };
}

interface FoundedFamily {
  household: Household;
  members: Person[];
}

function foundFamily(
  band: { id: number; homeX: number; homeY: number },
  /** People the band still has room for. A couple is built regardless. */
  room: number,
  ctx: FoundingContext
): FoundedFamily {
  const rng = ctx.rng;
  const surname = rng.pick(NAME_ONSETS) + rng.pick(NAME_CODAS) + 'sen';

  // Families live together, so the whole household is placed around one spot
  // rather than scattered across the camp.
  const hearth = ctx.placeNear(
    Math.round(band.homeX + rng.range(-5, 5)),
    Math.round(band.homeY + rng.range(-5, 5))
  );
  const spawn = () => ctx.placeNear(
    Math.round(hearth.x + rng.range(-1.5, 1.5)),
    Math.round(hearth.y + rng.range(-1.5, 1.5))
  );

  const make = (sex: 'male' | 'female' | null, years: number): Person => {
    const spot = spawn();
    const person = ctx.makePerson(
      rng.pick(NAME_ONSETS) + rng.pick(NAME_CODAS), spot.x, spot.y, band.id, rng
    );
    if (sex) person.sex = sex;
    person.age = years * DAYS_PER_YEAR;
    person.surname = surname;
    return person;
  };

  // Skewed young rather than uniform across the range.
  //
  // The same reasoning `Person`'s constructor already records: a population
  // that starts at the average age of its span has no breeding cohort and dies
  // out before it can produce a second generation. Drawn flat across 20–45, the
  // founding wives averaged thirty-three, most of them passed forty-five inside
  // two years, and three in-game years produced three births across the whole
  // island. Squaring the draw pulls the mean down to about twenty-eight without
  // removing the elders from the top of the range.
  const spread = COUPLE_MAX_AGE - COUPLE_MIN_AGE;
  const husbandAge = COUPLE_MIN_AGE + spread * rng.next() * rng.next();
  // Couples are of an age with each other, give or take a few years.
  const wifeAge = Math.max(
    COUPLE_MIN_AGE, Math.min(COUPLE_MAX_AGE, husbandAge + rng.range(-5, 4))
  );
  const husband = make('male', husbandAge);
  const wife = make('female', wifeAge);

  const members: Person[] = [husband, wife];

  // The household exists before the wedding: `SocialSystem.wed` hands off to
  // the simulation's household merge, and a merge with both parties already in
  // the same household is a no-op that still fixes the shared surname.
  const household = new Household(surname, husband.id, band.id, 0);
  for (const person of members) {
    household.add(person.id);
    person.householdId = household.id;
  }
  ctx.social.wed(husband, wife, 0);

  // Children, as many as the mother could plausibly have borne by now. A
  // twenty-year-old is not the mother of three.
  const plausible = Math.max(0, Math.floor((wifeAge - ADULT_YEARS - 2) / 3));
  const childCount = Math.min(3, plausible, rng.int(0, 3), Math.max(0, room - 2));
  for (let i = 0; i < childCount; i++) {
    const maxAge = Math.min(ADULT_YEARS + 3, wifeAge - ADULT_YEARS - 2);
    if (maxAge < 1) break;
    const child = make(null, rng.range(0.5, maxAge));
    child.motherId = wife.id;
    child.fatherId = husband.id;
    inheritTraits(child, wife, husband, rng);
    // Children of a founding family have had as long to learn as they have been
    // alive, and no longer: a twelve-year-old is not a novice, an infant is.
    const learned = Math.min(1, child.years / ADULT_YEARS);
    for (const skill of Object.keys(child.skills) as (keyof typeof child.skills)[]) {
      child.skills[skill] = Math.max(0, child.skills[skill] * learned);
    }

    wife.childIds.push(child.id);
    husband.childIds.push(child.id);
    linkFamily(child, [wife, husband], ctx.relationships);

    household.add(child.id);
    child.householdId = household.id;
    members.push(child);
  }

  // A widowed parent of one of the couple. This is the rung the three-tier
  // opinion ladder exists for: an in-law under your roof is family, and no
  // blood kinship edge would ever say so.
  if (members.length < room && rng.chance(ELDER_CHANCE)) {
    const theirChild = rng.chance(0.5) ? husband : wife;
    const elder = make(null, theirChild.years + rng.range(20, 34));
    elder.childIds.push(theirChild.id);
    theirChild.motherId = elder.sex === 'female' ? elder.id : theirChild.motherId;
    theirChild.fatherId = elder.sex === 'male' ? elder.id : theirChild.fatherId;
    linkFamily(theirChild, [elder], ctx.relationships);
    household.add(elder.id);
    elder.householdId = household.id;
    members.push(elder);
  }

  // An unmarried adult sibling, still living with their brother or sister.
  if (members.length < room && rng.chance(SIBLING_CHANCE)) {
    const theirSibling = rng.chance(0.5) ? husband : wife;
    const sibling = make(null, Math.max(
      ADULT_YEARS + 1, theirSibling.years + rng.range(-8, 8)
    ));
    ctx.relationships.setKinship(sibling.id, theirSibling.id, KIN_SIBLING);
    ctx.relationships.setKinship(theirSibling.id, sibling.id, KIN_SIBLING);
    household.add(sibling.id);
    sibling.householdId = household.id;
    members.push(sibling);
  }

  // The head is the eldest adult, the same rule `settleAffairs` uses when one
  // dies — so headship does not change hands for no reason on the first death.
  const head = members
    .filter(p => !p.isChild)
    .sort((a, b) => b.age - a.age)[0] ?? husband;
  household.headId = head.id;

  return { household, members };
}
