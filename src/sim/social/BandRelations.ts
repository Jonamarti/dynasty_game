/**
 * How two bands feel about each other, as peoples rather than as individuals.
 *
 * M11 phase 7a. **Symmetric, unlike `RelationshipGraph`**, and that is a
 * deliberate departure worth explaining rather than an oversight: a directed
 * edge needs two separate histories moving in step for every event that
 * touches it, and nothing that will ever write to this structure moves only
 * one side of it — a raid, a marriage, a trade and a stretch of shared
 * territory all change what *both* peoples think of each other at once, the
 * way a wedding cannot make the bride's family fonder of the groom's without
 * the reverse also being true. How one particular *person* feels about
 * another is already rich and asymmetric, and it already exists: `Memory`
 * and `RelationshipGraph` are that, in full. This is the coarser, shared
 * question underneath it — "are our two peoples on good terms" — which is
 * what a first meeting between two strangers from different bands draws on
 * before either of them has a personal history to go by.
 *
 * Sent inert in the commit that adds it: every pair starts at 0 and nothing
 * writes to it yet, the same discipline spoilage and mood were shipped
 * under. `Simulation.accrueRenown`'s comment names the precedent; this is
 * the third.
 */

/** Standing retained per in-game day. Slower than any single-person opinion
 * decays, deliberately: a grudge between two peoples outlives the
 * individuals who were there when it started. */
const DECAY_PER_DAY = 0.998;

/** Below this magnitude a decayed edge is deleted rather than kept as noise. */
const PRUNE_BELOW = 0.05;

/**
 * What a government has declared two peoples to be to each other — M15 phase
 * 39a (M14 phase 21a). `war` and `peace` are symmetric; `tributary` names the
 * overlord. Set only by a government (`Polity.governs`, through
 * `Simulation.declare` or `BandSystem.considerStance`); never by standing,
 * which is how two peoples *feel* and goes on moving underneath.
 */
export type Stance = 'war' | 'peace' | 'tributary';

export interface StanceRecord {
  kind: Stance;
  /** Absolute day it was declared. */
  since: number;
  /** For `tributary`: the band paid. Null otherwise. */
  overlord: number | null;
}

export interface BandRelationsSnapshot {
  edges: [string, number][];
  stances: [string, StanceRecord][];
}

export class BandRelations {
  /** `min(a,b):max(a,b)` -> standing, -100 (open hostility) to 100 (close allies). */
  private edges = new Map<string, number>();

  /**
   * Declared stances, by the same key — M15 phase 39a. Unlike `edges` these
   * do not decay: a war or a peace lasts until a government ends it, or until
   * a deed breaks it (`SocialSystem.emit`'s breach).
   */
  private stances = new Map<string, StanceRecord>();

  /** Ordered defensive copy for the inert persistence codec. */
  snapshot(): BandRelationsSnapshot {
    return { edges: [...this.edges], stances: [...this.stances].map(([key, value]) => [key, { ...value }]) };
  }

  /** Hydrates owned data without changing the relation methods. */
  static fromSnapshot(snapshot: BandRelationsSnapshot): BandRelations {
    const relations = new BandRelations();
    relations.edges = new Map(snapshot.edges);
    relations.stances = new Map(snapshot.stances.map(([key, value]) => [key, { ...value }]));
    return relations;
  }

  /** The declared stance between two bands, or null for none. */
  stance(a: number, b: number): Stance | null {
    if (a === b) return null;
    return this.stances.get(this.key(a, b))?.kind ?? null;
  }

  /** The whole record, for the day it was declared and the overlord. */
  stanceRecord(a: number, b: number): StanceRecord | null {
    if (a === b) return null;
    return this.stances.get(this.key(a, b)) ?? null;
  }

  /** Declares a stance between two bands. A no-op for a band and itself. */
  setStance(a: number, b: number, kind: Stance, day: number, overlord: number | null = null): void {
    if (a === b) return;
    this.stances.set(this.key(a, b), { kind, since: day, overlord: kind === 'tributary' ? overlord : null });
  }

  /** Ends whatever stance two bands had. */
  clearStance(a: number, b: number): void {
    this.stances.delete(this.key(a, b));
  }

  /** The band `bandId` pays tribute to, or null. Ascending key order, so ties never depend on insertion. */
  overlordOf(bandId: number): number | null {
    const keys = [...this.stances.keys()].sort();
    for (const key of keys) {
      const record = this.stances.get(key)!;
      if (record.kind !== 'tributary' || record.overlord === null || record.overlord === bandId) continue;
      const colon = key.indexOf(':');
      const low = Number(key.slice(0, colon));
      const high = Number(key.slice(colon + 1));
      if (low === bandId || high === bandId) return record.overlord;
    }
    return null;
  }

  /** The bands paying tribute to `overlord`, ascending. */
  tributariesOf(overlord: number): number[] {
    const out: number[] = [];
    for (const [key, record] of this.stances) {
      if (record.kind !== 'tributary' || record.overlord !== overlord) continue;
      const colon = key.indexOf(':');
      const low = Number(key.slice(0, colon));
      const high = Number(key.slice(colon + 1));
      out.push(low === overlord ? high : low);
    }
    return out.sort((x, y) => x - y);
  }

  private key(a: number, b: number): string {
    return a < b ? a + ':' + b : b + ':' + a;
  }

  /** How band `a` and band `b` stand with each other. 0 for any pair never touched, and for a band with itself. */
  standing(a: number, b: number): number {
    if (a === b) return 0;
    return this.edges.get(this.key(a, b)) ?? 0;
  }

  /**
   * Every band `a` has any standing with at all, in ascending id order.
   *
   * The keys rather than the values, so that a caller asking "whom do we hate
   * enough to march on" walks only the pairs that have actually touched
   * instead of every band in the world crossed with every other. Ascending
   * rather than in insertion order because insertion order is a property of
   * who happened to meet whom first, and a caller that broke a tie on it
   * would make the world depend on something no seed controls.
   */
  touching(a: number): number[] {
    const others = new Set<number>();
    // M15 phase 39a: a declared stance counts as touching even once the
    // feeling behind it has decayed to nothing, so a war is never forgotten
    // by the policy that has to end it.
    for (const key of [...this.edges.keys(), ...this.stances.keys()]) {
      const colon = key.indexOf(':');
      const low = Number(key.slice(0, colon));
      const high = Number(key.slice(colon + 1));
      if (low === a) others.add(high);
      else if (high === a) others.add(low);
    }
    return [...others].sort((x, y) => x - y);
  }

  /** Moves the standing between two bands. A no-op for a band and itself. */
  add(a: number, b: number, delta: number): void {
    if (a === b) return;
    const key = this.key(a, b);
    const next = Math.max(-100, Math.min(100, (this.edges.get(key) ?? 0) + delta));
    this.edges.set(key, next);
  }

  /** Ages every edge toward 0. Called once per in-game day. */
  decay(): void {
    for (const [key, value] of this.edges) {
      const decayed = value * DECAY_PER_DAY;
      if (Math.abs(decayed) < PRUNE_BELOW) this.edges.delete(key);
      else this.edges.set(key, decayed);
    }
  }

  /** Diagnostics for the health report: how far apart the best and worst pair sit. */
  stats(): { pairs: number; friendliest: number; hostile: number } {
    let friendliest = 0;
    let hostile = 0;
    for (const value of this.edges.values()) {
      if (value > friendliest) friendliest = value;
      if (value < hostile) hostile = value;
    }
    return { pairs: this.edges.size, friendliest, hostile };
  }
}
