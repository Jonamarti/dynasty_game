/**
 * Who is scheming against whom, worked out fresh every time rather than kept
 * anywhere.
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

/** How warmly two grudge-holders must regard each other, both ways, to plot together. */
const TRUST_THRESHOLD = 15;

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
      if (rels.opinion(instigator.id, other.id) < TRUST_THRESHOLD) continue;
      if (rels.opinion(other.id, instigator.id) < TRUST_THRESHOLD) continue;
      memberIds.push(other.id);
    }
    if (!best || memberIds.length > best.memberIds.length) {
      best = { instigatorId: instigator.id, memberIds };
    }
  }
  return best;
}
