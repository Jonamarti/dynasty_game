/**
 * Who would act together against whom, worked out fresh every time rather than
 * kept anywhere.
 *
 * M11 phase 5d, the owner's note 8: a plot needs no instigating grievance from
 * the chief or the victim, and no state of its own. `conspiracyAgainst`
 * answers "is there a faction against this person right now" by reading
 * straight off `RelationshipGraph` and `Person.traits`, the same way
 * `BandSystem.standingScore` answers "how well is this person regarded" —
 * nothing here is written anywhere, so calling it again tomorrow, after an
 * evening of gossip has moved opinions, may honestly say something different.
 */
import type { Person } from '../entities/Person.ts';
import type { RelationshipGraph } from './Relationships.ts';

/** How far into the negative a member's opinion of the subject must sit to count as a grudge. */
const GRUDGE_THRESHOLD = -20;

/** How warmly two people must regard each other, both ways, to act together. */
const TRUST_THRESHOLD = 15;

/**
 * Whether two people think well enough of each other, in both directions, to
 * do something together that either could hang the other for.
 *
 * Shared by `conspiracyAgainst` and `warParty` rather than written twice: they
 * are asking the identical question about very different undertakings, and
 * `AGENTS.md`'s rule about two copies of one idea drifting apart is exactly
 * what would happen to a plot and a raid holding separate thresholds.
 *
 * Note what a stranger scores here. `RelationshipGraph.opinion` returns 0 for
 * a pair that has never met, which is below the threshold, so nobody is ever
 * recruited by somebody they do not know — the "who knows whom" half of the
 * brake, and it falls straight out of the graph rather than needing a rule of
 * its own.
 */
export function trustEachOther(a: number, b: number, rels: RelationshipGraph): boolean {
  return rels.opinion(a, b) >= TRUST_THRESHOLD && rels.opinion(b, a) >= TRUST_THRESHOLD;
}

/**
 * Below this loyalty, or above the matching malice, somebody will bring a
 * faction together with no grievance of their own to answer for — the
 * conspirator or malevolent character the owner's note asked for. Everyone
 * else needs their own grudge before they will instigate one.
 */
const LOW_LOYALTY = 0.25;
const HIGH_MALICE = 0.7;

export interface Faction {
  /** Who could plausibly have brought the others together. */
  instigatorId: number;
  /** Everyone in it, instigator included. */
  memberIds: number[];
}

/**
 * The largest faction that could move against `subject` today, or null if
 * nobody has both the grudge and the nerve.
 *
 * Walked as one sparse pass over the band followed by a pass over only the
 * grudge-holders it found, not as every pair of members: `grudges` below is
 * O(members), and the O(k^2) search for who trusts whom only ever runs over
 * the handful of people who already dislike `subject`, never over the whole
 * roster. `rels.peek` is used to gather grudges so that asking about a
 * stranger nobody has an opinion of does not create an edge for them.
 */
export function conspiracyAgainst(
  subjectId: number, members: Person[], rels: RelationshipGraph
): Faction | null {
  const grudges: Person[] = [];
  for (const member of members) {
    if (member.id === subjectId || member.isChild) continue;
    if (!rels.peek(member.id, subjectId)) continue;
    if (rels.opinion(member.id, subjectId) > GRUDGE_THRESHOLD) continue;
    grudges.push(member);
  }
  if (grudges.length === 0) return null;

  let best: Faction | null = null;
  for (const instigator of grudges) {
    const willing = instigator.traits.loyalty < LOW_LOYALTY || instigator.traits.malice > HIGH_MALICE;
    if (!willing) continue;

    const memberIds = [instigator.id];
    for (const other of grudges) {
      if (other.id === instigator.id) continue;
      if (!trustEachOther(instigator.id, other.id, rels)) continue;
      memberIds.push(other.id);
    }
    if (!best || memberIds.length > best.memberIds.length) {
      best = { instigatorId: instigator.id, memberIds };
    }
  }
  return best;
}

/**
 * How much nerve a raid takes, and how hard a hand it takes to swing —
 * `warParty`'s two bars, named here so the chief and the followers are
 * measured against the same ones.
 *
 * `RAID_NERVE` sits at the midpoint of `aggression` rather than high up it:
 * this is a *pre-filter*, not the decision. What actually settles whether
 * somebody goes is the compliance roll in `Simulation.command`, against an
 * order priced at `FOREIGN_PROPERTY_COST` or worse. The filter exists so that
 * a chief does not spend the morning asking every gentle soul in camp and
 * losing three regard to each of them for having asked — a refusal is a real
 * cost to the leader, which is what makes calling a raid you cannot raise an
 * expensive mistake rather than a free one.
 *
 * `RAID_FIGHT` is read off `Person.skillFactor`, whose floor is 0.35 × vigour
 * for somebody who has never thrown a punch. A bar at 0.45 therefore means
 * "has actually practised" rather than "is an adult": before M11 phase 11a
 * gave `fight` its second and third trainers, essentially nobody in a peaceful
 * band would have cleared it, and a war party of people indistinguishable from
 * farmers is the thing `docs/bugs.md` said had to be fixed before any of this
 * could mean anything.
 */
const RAID_NERVE = 0.5;
const RAID_FIGHT = 0.45;

/**
 * Who would ride with `leader` today, strongest hand first, capped at `max`.
 *
 * The same shape as `conspiracyAgainst` above and for the same reasons:
 * nothing is stored, so asking again tomorrow — after an evening of gossip, or
 * after somebody has been hurt — may honestly say something different, and the
 * mutual-trust test is the identical one a plot uses.
 *
 * What it does *not* answer is whether anybody actually goes. That is the
 * caller's compliance roll, one per person, and the two are deliberately
 * separate: this is the list a chief could plausibly call on, and being on it
 * is not agreement.
 */
export function warParty(
  leader: Person, members: Person[], rels: RelationshipGraph, max: number
): Person[] {
  if (leader.traits.aggression < RAID_NERVE) return [];
  if (leader.skillFactor('fight') < RAID_FIGHT) return [];

  const willing: Person[] = [];
  for (const member of members) {
    if (member.id === leader.id || member.isChild || !member.alive) continue;
    if (member.traits.aggression < RAID_NERVE) continue;
    if (member.skillFactor('fight') < RAID_FIGHT) continue;
    if (!trustEachOther(leader.id, member.id, rels)) continue;
    willing.push(member);
  }

  // Strongest first, ties broken by id. The tiebreak is not cosmetic: two
  // people with identical skill and vigour are common in a young band, and a
  // sort that left their order to the engine would make the party — and every
  // world downstream of it — depend on something no seed controls.
  willing.sort((a, b) => {
    const gap = b.skillFactor('fight') - a.skillFactor('fight');
    return gap !== 0 ? gap : a.id - b.id;
  });
  return willing.slice(0, max);
}
