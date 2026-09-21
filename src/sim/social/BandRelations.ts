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

export class BandRelations {
  /** `min(a,b):max(a,b)` -> standing, -100 (open hostility) to 100 (close allies). */
  private edges = new Map<string, number>();

  private key(a: number, b: number): string {
    return a < b ? a + ':' + b : b + ':' + a;
  }

  /** How band `a` and band `b` stand with each other. 0 for any pair never touched, and for a band with itself. */
  standing(a: number, b: number): number {
    if (a === b) return 0;
    return this.edges.get(this.key(a, b)) ?? 0;
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
