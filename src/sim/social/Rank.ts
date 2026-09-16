/**
 * The shape of a band: who stands where, as one ordered ladder of ranks.
 *
 * M9.5 phase 4e. The tribe graph wants to draw a pyramid, and a pyramid is a
 * claim about who outranks whom — so it may not be worked out in the UI. The
 * rows here are derived from exactly the terms `Authority.standingOver`
 * already adds up: the chief of the band, the heads of houses inside it who
 * carry `chiefdom`'s middle rank, everybody else, the children, and below all
 * of them the people who belong to another band or to no band at all. A
 * drawn rank that no order would actually respect is the inert-content defect
 * in picture form, so `headsAHouseIn` is imported from `Authority.ts` rather
 * than reimplemented — the same mistake `Progress.ts`'s header records, where
 * a panel recomputed something the simulation owned and the two drifted.
 *
 * Nothing here draws or rolls. Every function is pure and free of RNG, so the
 * graph can ask it sixty times a second and a test can ask it without a world.
 */
import type { Person } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import type { Band } from '../core/Simulation.ts';
import { headsAHouseIn } from './Authority.ts';
import { techPower } from '../knowledge/Tech.ts';

/** Where somebody stands relative to one particular band. */
export type BandRank = 'chief' | 'head' | 'member' | 'child' | 'outsider' | 'outcast';

/**
 * What `rankIn` needs to answer. A narrowed slice of `AuthorityContext` plus
 * the people themselves, since rank asks what a person *knows* and authority's
 * own context never had to.
 */
export interface RankContext {
  householdsById: ReadonlyMap<number, Household>;
  /** Band chiefs, by band id — `BandSystem.chiefByBand`. */
  chiefByBand: ReadonlyMap<number, number>;
  peopleById: ReadonlyMap<number, Person>;
  bands: readonly Band[];
}

/**
 * Top to bottom. Chief above heads above the band, children below the adults
 * they are not yet, and beneath the band itself the two kinds of person who
 * are not in it: the neighbour from the next camp and the one who was cast out.
 *
 * An outcast sits below an outsider on purpose. A stranger from another band
 * is merely elsewhere; somebody exiled was in this band and is no longer, and
 * that is a lower place to stand than never having belonged.
 */
export const RANK_ROW: Record<BandRank, number> = {
  chief: 0,
  head: 1,
  member: 2,
  child: 3,
  outsider: 4,
  outcast: 5,
};

/** What a row is called on screen, in the words the rest of the game uses. */
export const RANK_LABEL: Record<BandRank, string> = {
  chief: 'chief',
  head: 'heads of houses',
  member: 'the band',
  child: 'children',
  outsider: 'other bands',
  outcast: 'cast out',
};

/**
 * Whether this band has a shape to draw at all.
 *
 * The same gate `BandSystem.assignJobs` tests before it parcels out any work
 * ([BandSystem.ts](../systems/BandSystem.ts)): the **chief's own** copy of
 * `division_of_labour`. Held by a person, like every technology here — a band
 * whose chief has never had the idea is flat however clever its members are,
 * and it goes flat again the day it elects a chief who has not had it. That
 * is the note 4e is built on: the layers appear when somebody is actually
 * setting one person to one task, not when a table says they could.
 *
 * A band with no chief has no shape, which also covers the outcast band: it
 * is defined as having none.
 */
export function bandHasShape(bandId: number, ctx: RankContext): boolean {
  const chiefId = ctx.chiefByBand.get(bandId);
  if (chiefId === undefined) return false;
  const chief = ctx.peopleById.get(chiefId);
  if (!chief || !chief.alive) return false;
  return techPower(chief, 'division_of_labour') > 0;
}

/**
 * Which band somebody counts as belonging to.
 *
 * Exile moves the *person* and leaves their house where it was
 * (`Simulation.removeBandMembership` sets `person.bandId` and nothing else),
 * so the outcast band is read off the person and checked first. Everything
 * after that is read off the household, because `bandId` is not reassigned on
 * marriage and somebody who married across a band line still carries their
 * birth band — the same gap `headsAHouseIn` documents and `simcheck`'s
 * `kin-outrank-strangers` records.
 */
export function bandOf(person: Person, ctx: RankContext): number {
  if (ctx.bands.some(band => band.outcast && band.id === person.bandId)) return person.bandId;
  if (person.householdId !== null) {
    const household = ctx.householdsById.get(person.householdId);
    if (household) return household.bandId;
  }
  return person.bandId;
}

/**
 * Where `person` stands in `bandId`'s ladder.
 *
 * Read the branches in order: cast out beats everything, then not being in
 * this band at all, then the two offices, then age. The middle rung asks the
 * *same* question `standingOver` asks before it adds `RANK_AUTHORITY` — heads
 * a house in this band, and has the idea — so a head drawn on the middle row
 * is exactly a head whose orders the band would actually weigh differently.
 * A head who has never had the idea stands with everybody else, which is what
 * a flat band looks like and is the truth about them.
 */
export function rankIn(person: Person, bandId: number, ctx: RankContext): BandRank {
  const own = bandOf(person, ctx);
  if (ctx.bands.some(band => band.outcast && band.id === own)) return 'outcast';
  if (own !== bandId) return 'outsider';
  if (ctx.chiefByBand.get(bandId) === person.id) return 'chief';
  if (headsAHouseIn(person, bandId, ctx) && techPower(person, 'chiefdom') > 0) return 'head';
  if (person.isChild) return 'child';
  return 'member';
}
