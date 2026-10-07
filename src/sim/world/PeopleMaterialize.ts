/**
 * Materialising and dissolving: the bridge between a people's cohorts and individual persons. M15 phase 32c;
 * `docs/m15_simulation_lod.md` sections 3 and 4.
 *
 * **One authority over every person** (section 4). A person is either a head in a cohort cell or an individual somebody
 * else holds, never both and never neither. `materialize` subtracts *exactly* the persons it hands over from the cohorts and
 * counts them in `People.away`; `dissolve` adds exactly the persons it is given and subtracts them from `away`, and refuses
 * more than were handed out. Entering and leaving over and over therefore conserves the total (test): it cannot be used to
 * mint people, to lose them, or to move a death out of reach.
 *
 * **What is drawn, and from what.** Persons are drawn *without replacement* from the cohort cells (a cell is chosen in
 * proportion to the heads left in it, then an age inside its band): the sample is the people's own age-and-sex structure,
 * nobody's idea of a typical band. Techniques are shared out so that the group knows what the people knows, **without
 * every person knowing everything** ("knowing a technique as a people does not mean every inhabitant can practise it"): each
 * technique the people holds goes to one person chosen at random and to each other with chance `KNOWER_SHARE`, and a person who gets a
 * technique gets what it requires, so every person's set is closed under `requires` (the same rule `TechSet` enforces).
 * The draws come from the **stream the caller gives**, never from the people's own: asking to see a people up close does not move its
 * future (test: the people's stream and its seasonal evolution are untouched), and so the caller's choice of when to look cannot
 * bend what the people does.
 *
 * **Coming back.** A person who returns is placed in the cell for their current age and sex, so somebody who aged while
 * away is in the right band; techniques the group learned are added to the people's (the union, closed under `requires`:
 * what a band that went out learned, the people knows). What is *not* done here, and the doc says so: persons already known to
 * the player keep their identity in the owner's registry (`Person` objects, names, histories), which is not this module's;
 * and "the same person drawn again" is the registry's rule, not a re-draw of skills. `KNOWER_SHARE` is a design assumption.
 */
import type { RNG } from '../core/RNG.ts';
import { TECHS, TECH, type Tech } from '../knowledge/Tech.ts';
import { AGE_BANDS, AGE_BAND_YEARS, ageBandOfYears, populationOf, TechSet, type People } from './PeopleSim.ts';

/** Chance that a person other than the one who must know it also knows a technique the people holds. Design assumption. */
export const KNOWER_SHARE = 0.5;

export interface MaterialisedPerson {
  readonly sex: 'male' | 'female';
  /** Whole years. The last band (60+) is drawn from 60 to 84. */
  readonly ageYears: number;
  /** Closed under `requires`. */
  readonly techs: readonly Tech[];
}

/**
 * Take `count` persons out of the cohorts, as individuals. Throws if the people has fewer than `count`. The result is a
 * function of the cohorts, the techniques and the stream given.
 */
export function materialize(people: People, count: number, rng: RNG): MaterialisedPerson[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a non-negative integer');
  if (count > populationOf(people)) throw new RangeError(`cannot materialise ${count} of ${populationOf(people)}`);
  const out: { sex: 'male' | 'female'; ageYears: number }[] = [];
  for (let i = 0; i < count; i++) {
    let pick = Math.floor(rng.next() * populationOf(people));
    let found: { sex: 'male' | 'female'; band: number } | null = null;
    for (const sex of ['male', 'female'] as const) {
      for (let b = 0; b < AGE_BANDS && !found; b++) {
        const n = people.cohorts[sex][b]!;
        if (pick < n) found = { sex, band: b }; else pick -= n;
      }
      if (found) break;
    }
    if (!found) throw new Error('cohort draw ran off the end');   // unreachable: pick < population
    people.cohorts[found.sex][found.band]!--;
    const width = found.band === AGE_BANDS - 1 ? 25 : AGE_BAND_YEARS;
    out.push({ sex: found.sex, ageYears: found.band * AGE_BAND_YEARS + Math.floor(rng.next() * width) });
  }
  people.away += count;

  // Techniques, in TECHS order so the draw sequence is fixed.
  const sets = out.map(() => new TechSet());
  if (count > 0) {
    for (const tech of TECHS) {
      if (!people.techs.has(tech)) continue;
      const must = Math.floor(rng.next() * count);
      for (let i = 0; i < count; i++) {
        const draw = rng.next();
        if (i === must || draw < KNOWER_SHARE) give(sets[i]!, tech);
      }
    }
  }
  return out.map((p, i) => ({ sex: p.sex, ageYears: p.ageYears, techs: sets[i]!.list() }));
}

/** Give a person a technique and, first, what it requires. */
function give(set: TechSet, tech: Tech): void {
  for (const r of TECH[tech].requires) if (!set.has(r)) give(set, r);
  set.add(tech);
}

/**
 * Return persons to their people: each into the cell of their current age and sex, and what they know added to what the
 * people knows. Refuses to take back more than were handed out.
 */
export function dissolve(people: People, persons: readonly Pick<MaterialisedPerson, 'sex' | 'ageYears' | 'techs'>[]): void {
  if (persons.length > people.away) throw new RangeError(`${persons.length} persons returned but only ${people.away} are away`);
  for (const p of persons) {
    if (!(p.ageYears >= 0) || !Number.isFinite(p.ageYears)) throw new RangeError('a person needs an age');
    people.cohorts[p.sex][ageBandOfYears(p.ageYears)]!++;
  }
  people.away -= persons.length;
  const learned = new TechSet(persons.flatMap(p => p.techs));
  people.techs.union(learned);
}

/** Heads the people answers for: the cohorts and those away as individuals. Constant across materialise and dissolve. */
export const headsOf = (people: Pick<People, 'cohorts' | 'away'>): number => populationOf(people) + people.away;
