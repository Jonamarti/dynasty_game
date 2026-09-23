/**
 * Who thinks what of whom.
 *
 * Sparse and directed. Sparse because in a world of thousands almost every pair
 * of people has no relationship at all, and storing an N x N matrix would be
 * the second structure (after memory) to grow without limit. Directed because
 * regard is not symmetric: you can adore someone who despises you, and that
 * asymmetry is where a great deal of drama lives.
 *
 * Opinion is assembled from separate components that age at different rates.
 * Familiarity fades quickly when you stop seeing someone; kinship never fades;
 * deeds fade slowly. Keeping them apart means the UI can answer *why* one person
 * dislikes another, rather than only *that* they do.
 */

export interface Relationship {
  /** Blood and marriage. Set by the family system; never decays. */
  kinship: number;
  /** Accumulated from witnessed and reported deeds. Decays slowly. */
  deeds: number;
  /** Mere acquaintance, from proximity and conversation. Decays fastest. */
  familiarity: number;
  /** Courtship and attachment. */
  romance: number;
  /** Tick of the last interaction, for "you have not spoken in a season". */
  lastContact: number;
  /**
   * Standing regard owed to who someone *is* rather than what they have done:
   * warmth for one's own band, wariness toward outsiders. Set once, when the
   * edge is created, and never decays — a stranger stays a stranger until
   * their deeds say otherwise.
   */
  bias: number;
}

function empty(): Relationship {
  return { kinship: 0, deeds: 0, familiarity: 0, romance: 0, lastContact: 0, bias: 0 };
}

/** Retained per in-game day. Familiarity is the volatile one. */
const DECAY_PER_DAY = { deeds: 0.985, familiarity: 0.94, romance: 0.99 };

export class RelationshipGraph {
  /** viewerId -> subjectId -> relationship. */
  private edges = new Map<number, Map<number, Relationship>>();

  /** The relationship as it stands, without creating one. */
  peek(viewerId: number, subjectId: number): Relationship | null {
    return this.edges.get(viewerId)?.get(subjectId) ?? null;
  }

  /** The relationship, creating it if this is their first contact. */
  edge(viewerId: number, subjectId: number): Relationship {
    let row = this.edges.get(viewerId);
    if (!row) {
      row = new Map();
      this.edges.set(viewerId, row);
    }
    let rel = row.get(subjectId);
    if (!rel) {
      rel = empty();
      row.set(subjectId, rel);
    }
    return rel;
  }

  /** Net regard, -100 (hatred) to 100 (devotion). */
  opinion(viewerId: number, subjectId: number): number {
    const rel = this.peek(viewerId, subjectId);
    if (!rel) return 0;
    const raw = rel.bias + rel.kinship + rel.deeds + rel.familiarity * 0.35 + rel.romance;
    return Math.max(-100, Math.min(100, raw));
  }

  /**
   * What two people think of each other, as one number: the mean of whichever
   * directions exist, or null when neither has an opinion of the other.
   *
   * Shared by the tribe graph's peer lines and the family tree's, which both
   * draw one line per pair and must colour a pair the same way in both panels.
   * A one-sided tie is not averaged with a zero it does not have — somebody
   * who hates a stranger who has never noticed them draws as hatred.
   */
  mutualOpinion(a: number, b: number): number | null {
    const ab = this.peek(a, b);
    const ba = this.peek(b, a);
    if (!ab && !ba) return null;
    return ((ab ? this.opinion(a, b) : 0) + (ba ? this.opinion(b, a) : 0)) /
      ((ab ? 1 : 0) + (ba ? 1 : 0));
  }

  /** Everyone this person has an opinion about, strongest feeling first. */
  knownBy(viewerId: number): { subjectId: number; relationship: Relationship; opinion: number }[] {
    const row = this.edges.get(viewerId);
    if (!row) return [];
    return [...row.entries()]
      .map(([subjectId, relationship]) => ({
        subjectId,
        relationship,
        opinion: this.opinion(viewerId, subjectId),
      }))
      .sort((a, b) => Math.abs(b.opinion) - Math.abs(a.opinion));
  }

  /**
   * Creates the edge if it is new and stamps a first impression on it.
   * Returns true if this was in fact the first time.
   */
  introduce(viewerId: number, subjectId: number, bias: number): boolean {
    if (this.peek(viewerId, subjectId)) return false;
    this.edge(viewerId, subjectId).bias = bias;
    return true;
  }

  /** Adds to the deeds component, keeping it inside the opinion range. */
  addDeed(viewerId: number, subjectId: number, delta: number, tick: number): void {
    const rel = this.edge(viewerId, subjectId);
    rel.deeds = Math.max(-100, Math.min(100, rel.deeds + delta));
    rel.lastContact = tick;
  }

  addRomance(viewerId: number, subjectId: number, delta: number, tick: number): void {
    const rel = this.edge(viewerId, subjectId);
    rel.romance = Math.max(0, Math.min(100, rel.romance + delta));
    rel.lastContact = tick;
  }

  /** Blood and marriage. Set once and never decayed. */
  setKinship(viewerId: number, subjectId: number, value: number): void {
    this.edge(viewerId, subjectId).kinship = value;
  }

  romance(viewerId: number, subjectId: number): number {
    return this.peek(viewerId, subjectId)?.romance ?? 0;
  }

  kinship(viewerId: number, subjectId: number): number {
    return this.peek(viewerId, subjectId)?.kinship ?? 0;
  }

  addFamiliarity(viewerId: number, subjectId: number, delta: number, tick: number): void {
    const rel = this.edge(viewerId, subjectId);
    rel.familiarity = Math.max(0, Math.min(100, rel.familiarity + delta));
    rel.lastContact = tick;
  }

  /** Ages every edge. Called once per in-game day. */
  decay(): void {
    for (const row of this.edges.values()) {
      for (const [subjectId, rel] of row) {
        rel.deeds *= DECAY_PER_DAY.deeds;
        rel.familiarity *= DECAY_PER_DAY.familiarity;
        rel.romance *= DECAY_PER_DAY.romance;
        // An edge with nothing left in it is just noise in a map that will hold
        // centuries of acquaintances.
        if (
          Math.abs(rel.deeds) < 0.5 && rel.familiarity < 0.5 &&
          Math.abs(rel.romance) < 0.5 && rel.kinship === 0 && rel.bias === 0
        ) {
          row.delete(subjectId);
        }
      }
    }
  }

  /** Diagnostics for the health report. */
  stats(): { viewers: number; edges: number; positive: number; negative: number } {
    let edges = 0;
    let positive = 0;
    let negative = 0;
    for (const [viewerId, row] of this.edges) {
      for (const subjectId of row.keys()) {
        edges++;
        const opinion = this.opinion(viewerId, subjectId);
        if (opinion > 5) positive++;
        else if (opinion < -5) negative++;
      }
    }
    return { viewers: this.edges.size, edges, positive, negative };
  }
}
