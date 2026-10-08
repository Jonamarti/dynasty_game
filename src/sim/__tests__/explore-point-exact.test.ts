/**
 * `Brain.findExplorePoint` was rewritten (M15 step 0) so that it no longer
 * builds five arrays per step of a ring that can reach the far corner of the
 * map, and tests the cheapest condition first. That must pick the same cell for
 * the same person every time. This runs the method and a frozen copy of the
 * old one on every living person of a world that has been walked around for a
 * while (so there are explored, unexplored and stale cells), under each of the
 * option sets the scorer uses, and compares the answers.
 */
import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { withinReach, type Anchor } from '../ai/Anchor.ts';
import type { Person } from '../entities/Person.ts';

type Options = { urgentWater?: boolean; anchor?: Anchor | null; reach?: number };

/** The method as it was before the rewrite, verbatim apart from `this`/`ctx` plumbing. */
function legacy(person: Person, ctx: any, options: Options = {}): { x: number; y: number } | null {
  if (options.urgentWater && person.isChild) {
    const hasLivingParent = [person.motherId, person.fatherId].some(id => {
      const parent = id === null ? null : ctx.peopleById?.get(id);
      return !!parent?.alive && parent.bandId === person.bandId;
    });
    if (hasLivingParent) return null;
  } else if (options.urgentWater) {
    const dependants = person.childIds.map(id => ctx.peopleById?.get(id))
      .filter((child: Person | undefined): child is Person => !!child?.alive && child.isChild);
    const hasNearbyBackup = dependants.every((child: Person) => {
      const otherParentId = child.motherId === person.id ? child.fatherId : child.motherId;
      const otherParent = otherParentId === null ? null : ctx.peopleById?.get(otherParentId);
      return !!otherParent?.alive && otherParent.bandId === person.bandId &&
        otherParent.captiveOf === null && child.distanceTo(otherParent) <= 8;
    });
    if (!hasNearbyBackup) return null;
  }
  const maxDistance = Math.hypot(ctx.world.width, ctx.world.height);
  const maxCellRing = Math.ceil(maxDistance / 4);
  const firstRing = Math.max(1, Math.ceil(ctx.sightRadius / 4));
  const baseCellX = Math.floor(person.x / 4);
  const baseCellY = Math.floor(person.y / 4);
  const allowed = (x: number, y: number): boolean => options.urgentWater === true ||
    withinReach(options.anchor ?? null, options.reach ?? Number.POSITIVE_INFINITY, x, y);
  for (let ring = firstRing; ring <= maxCellRing; ring++) {
    for (let offset = -ring; offset <= ring; offset++) {
      for (const [dx, dy] of [[offset, -ring], [offset, ring], [-ring, offset], [ring, offset]]) {
        const x = (baseCellX + dx!) * 4 + 2;
        const y = (baseCellY + dy!) * 4 + 2;
        if (!allowed(x, y) || !ctx.world.isWalkable(x, y) || !ctx.world.sameRegion(person.x, person.y, x, y) ||
            person.placeMemory.seenDayAt(x, y) !== 0) continue;
        return { x, y };
      }
    }
  }
  const staleBefore = ctx.time.day - 2;
  if (staleBefore > 0) {
    for (let ring = firstRing; ring <= maxCellRing; ring++) {
      for (let offset = -ring; offset <= ring; offset++) {
        for (const [dx, dy] of [[offset, -ring], [offset, ring], [-ring, offset], [ring, offset]]) {
          const x = (baseCellX + dx!) * 4 + 2;
          const y = (baseCellY + dy!) * 4 + 2;
          const seen = person.placeMemory.seenDayAt(x, y);
          if (seen === 0 || seen > staleBefore || !allowed(x, y) || !ctx.world.isWalkable(x, y) ||
              !ctx.world.sameRegion(person.x, person.y, x, y)) continue;
          return { x, y };
        }
      }
    }
  }
  return null;
}

describe('Brain.findExplorePoint rewrite is exact', () => {
  it('picks the same cell as the old search for every person and option set', () => {
    const sim = new Simulation({
      seed: 'explore-exact',
      world: { width: 64, height: 64, berryBushes: 30, flintOutcrops: 8, deadwood: 20, gameHerds: 3 },
      population: { bands: 2, peoplePerBand: 10 },
      time: { ticksPerDay: 120 },
    } as any);
    const brain = (sim as any).brain;
    let compared = 0;
    let found = 0;
    let none = 0;
    // Several moments, so some people have walked a long way and others not.
    for (const stop of [200, 700, 1500]) {
      while (sim.time.tick < stop) sim.step();
      const ctx = { world: sim.world, sightRadius: 12, time: sim.time, peopleById: sim.peopleById };
      for (const person of sim.livingPeople()) {
        const anchor: Anchor = { x: person.x + 3, y: person.y - 2, kind: 'camp', carerId: null };
        for (const options of [{}, { urgentWater: true }, { anchor, reach: 14 }, { anchor, reach: 40 }] as Options[]) {
          const expected = legacy(person, ctx, options);
          const actual = brain.findExplorePoint(person, ctx, options);
          expect(actual, `person ${person.id} at tick ${stop} with ${JSON.stringify(options)}`).toEqual(expected);
          compared++;
          if (expected) found++; else none++;
        }
      }
    }
    // Both outcomes must have been exercised or the comparison proves little.
    expect(compared).toBeGreaterThan(100);
    expect(found).toBeGreaterThan(10);
    expect(none).toBeGreaterThan(0);
  });
});
