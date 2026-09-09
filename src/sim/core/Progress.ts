/**
 * How far through their current job somebody is.
 *
 * Work is measured three different ways in this game, and that is not an
 * accident of implementation — it is what the three kinds of work actually are:
 *
 *  - a **countdown timer** for a harvest cycle, which is one repeated pull;
 *  - **progress on the trunk** for felling, which accumulates across visits so
 *    a woodcutter can leave for a drink and come back to it;
 *  - the **site's own completion** for building, which is shared between
 *    everyone who works on it.
 *
 * This lives here, in the simulation, rather than in the renderer, because two
 * places need it and the second one got it wrong. The renderer had all three
 * cases; the character panel reimplemented only the first, so the bar above a
 * woodcutter's head filled while the panel beside it showed nothing at all for
 * the entire ninety seconds of felling a tree by hand.
 */
import type { Person } from '../entities/Person.ts';
import type { Tree } from '../entities/Tree.ts';
import type { Building } from '../entities/Building.ts';

/** Just enough of the world to answer the question. */
export interface ProgressView {
  treesById: Map<number, Tree>;
  buildingsById: Map<number, Building>;
}

/** 0-1 through the current job, or null when they are not working to one. */
export function workProgressOf(person: Person, world: ProgressView): number | null {
  const cycle = person.cycleProgress;
  if (cycle !== null) return cycle;

  if (person.action === 'chop' && person.targetTreeId !== null) {
    const tree = world.treesById.get(person.targetTreeId);
    if (tree && tree.fellingTicks > 0) {
      // Mirrors `doChop`: a hand axe halves the work, so it must halve the
      // denominator too or the bar lies to whoever is holding one.
      const required = tree.fellingTicks * (person.inventory.has('handaxe') ? 0.5 : 1);
      return Math.max(0, Math.min(1, tree.chopProgress / required));
    }
  }

  if (person.action === 'build' && person.targetBuildingId !== null) {
    const site = world.buildingsById.get(person.targetBuildingId);
    if (site && !site.complete) return site.completion;
  }

  return null;
}

/**
 * Turns a fractional per-day rate into whole items, keeping the remainder.
 *
 * A snare that catches a hare every other day yields 0.5 a day, and a rate
 * below 1 rounded or floored at the point of use produces **nothing, for
 * ever** — which is how a passive yield ends up looking like a broken trap
 * rather than a slow one. The remainder has to live somewhere between sweeps,
 * so the caller owns it and hands it back on the next call.
 *
 * It lives here, beside `workProgressOf`, because passive traps are not the
 * only customer: spoilage is the same arithmetic pointed the other way (a
 * fractional number of items lost per sweep), and mechanism 1 of
 * `m8_plan_the_ages.md` is explicit that writing it twice is the drift this
 * project's house style exists to prevent.
 *
 * Deliberately free of any `RNG`. Accrual runs once a day over every trap in
 * the world, and a draw in here would make what a trap catches depend on how
 * many traps were swept before it.
 */
export function accrueUnits(carry: number, rate: number): { units: number; carry: number } {
  if (!(rate > 0)) return { units: 0, carry };
  const total = carry + rate;
  const units = Math.floor(total);
  return { units, carry: total - units };
}
