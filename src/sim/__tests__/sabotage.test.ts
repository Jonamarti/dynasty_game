/**
 * M11 phase 11b: `Building.durability` and `sabotage`.
 *
 * Three layers, cheapest first. `Building`'s own arithmetic (`damage`,
 * `repair`, `ruined`, `soundness`) needs no simulation at all. The property
 * question — whose building this is, and whether anybody is watching — is
 * `mayUse`'s, already covered for `theft`/`trespass` in `property.test.ts`;
 * what is new here is that `sabotage` must refuse a target `mayUse` calls
 * `ours`, which no other property verb ever has to. And a ruin has to be
 * inert in the same ways a sabotaged building's `def` promises it is not:
 * no shelter, no water, no fresh storage, until `build` repairs it.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS, Building, isWell, type BuildingDef } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'sabotage-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 2, peoplePerBand: 4 },
};

/** A world one day old. See `traps.test.ts` for why this matters on tick zero. */
function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

/**
 * A clear spot near `(cx, cy)`, searched outward in rings.
 *
 * A day of autonomous band life (`aDayIn`) leaves every camp with real huts
 * and pits of its own — `BandSystem.planBuildings` does not stand idle for a
 * whole day — so a test that simply placed at a person's exact position
 * collided with whatever the band had already built there. Searching for
 * room, the way `well.test.ts`'s `findInlandSpot` searches for dry ground,
 * is what a test claiming its own patch of world has to do instead.
 */
function openSpotNear(
  sim: Simulation, def: BuildingDef, cx: number, cy: number
): { x: number; y: number } {
  for (let ring = 0; ring < 30; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        if (sim.canPlace(def, x, y)) return { x, y };
      }
    }
  }
  throw new Error('no open spot found near ' + cx + ',' + cy);
}

/**
 * A finished structure, completed the way `addWork` really completes one —
 * `durability` included — rather than by the `complete = true` fiat several
 * other test files use. Every test below reads `durability`, so it has to go
 * through the path that actually sets it. Sited automatically, near
 * `(nearX, nearY)` rather than on top of it — see `openSpotNear`.
 */
function finishedBuilding(
  sim: Simulation, defId: string, nearX: number, nearY: number, bandId: number
): Building {
  const def = BUILDINGS[defId]!;
  const spot = openSpotNear(sim, def, nearX, nearY);
  const placed = sim.place(defId, spot.x, spot.y, bandId);
  expect(placed, 'could not site a ' + defId + ' near ' + nearX + ',' + nearY).not.toBeNull();
  const site = placed!;
  for (const [itemId, needed] of Object.entries(site.def.materials)) site.delivered.add(itemId, needed);
  expect(site.addWork(site.def.workTicks + 1)).toBe(true);
  expect(site.complete).toBe(true);
  expect(site.durability).toBe(site.def.workTicks);
  return site;
}

/** Somebody with nothing pressing, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

describe('Building.durability', () => {
  it('is null on a design with nothing to knock down', () => {
    const site = new Building(BUILDINGS.stockpile!, 5, 5, 0);
    expect(site.complete).toBe(true); // A stockpile finishes the moment it is placed.
    expect(site.durability).toBeNull();
    expect(site.ruined).toBe(false);
    expect(site.soundness).toBe(1);
    // Neither `damage` nor `repair` can do anything to it either.
    expect(site.damage(9999)).toBe(false);
    expect(site.repair(9999)).toBe(false);
  });

  it('is null on an unfinished frame', () => {
    const site = new Building(BUILDINGS.windbreak!, 5, 5, 0);
    expect(site.complete).toBe(false);
    expect(site.durability).toBeNull();
    expect(site.ruined).toBe(false); // Not yet built is not the same as wrecked.
  });

  it('is set to def.workTicks the moment addWork finishes it', () => {
    const site = new Building(BUILDINGS.windbreak!, 5, 5, 0);
    for (const [itemId, needed] of Object.entries(site.def.materials)) site.delivered.add(itemId, needed);
    expect(site.addWork(site.def.workTicks)).toBe(true);
    expect(site.durability).toBe(site.def.workTicks);
    expect(site.ruined).toBe(false);
    expect(site.soundness).toBe(1);
  });

  it('reduces toward ruin under damage, and reports the moment it arrives', () => {
    const site = new Building(BUILDINGS.windbreak!, 5, 5, 0);
    for (const [itemId, needed] of Object.entries(site.def.materials)) site.delivered.add(itemId, needed);
    site.addWork(site.def.workTicks);
    const half = site.def.workTicks / 2;

    expect(site.damage(half)).toBe(false); // Half gone, still standing.
    expect(site.ruined).toBe(false);
    expect(site.soundness).toBeCloseTo(0.5, 6);

    expect(site.damage(half)).toBe(true); // The blow that finishes it.
    expect(site.ruined).toBe(true);
    expect(site.soundness).toBe(0);

    // Further damage to an already-ruined building reports no new milestone.
    expect(site.damage(50)).toBe(false);
    expect(site.durability).toBe(0); // Floored, not negative.
  });

  it('repairs back toward full, and reports the moment it arrives', () => {
    const site = new Building(BUILDINGS.windbreak!, 5, 5, 0);
    for (const [itemId, needed] of Object.entries(site.def.materials)) site.delivered.add(itemId, needed);
    site.addWork(site.def.workTicks);
    site.damage(site.def.workTicks); // Fully ruined.

    const half = site.def.workTicks / 2;
    expect(site.repair(half)).toBe(false); // Half sound, but not yet full.
    expect(site.ruined).toBe(false); // "Ruined" means nothing left, not "not yet full".
    expect(site.soundness).toBeCloseTo(0.5, 6);
    expect(site.repair(half)).toBe(true);
    expect(site.ruined).toBe(false);
    expect(site.soundness).toBe(1);

    // Overshooting the repair caps at full rather than banking a surplus.
    expect(site.repair(999)).toBe(true);
    expect(site.durability).toBe(site.def.workTicks);
  });

  it('storageFree is zero on a ruin, whatever the store can otherwise hold', () => {
    const site = new Building(BUILDINGS.storage_pit!, 5, 5, 0);
    for (const [itemId, needed] of Object.entries(site.def.materials)) site.delivered.add(itemId, needed);
    site.addWork(site.def.workTicks);
    expect(site.storageFree).toBe(site.def.storage);

    site.damage(site.def.workTicks);
    expect(site.storageFree).toBe(0);
    expect(site.accept(site.store, 'flint', 5)).toBe(0); // Nothing new goes in.

    site.repair(site.def.workTicks);
    expect(site.storageFree).toBe(site.def.storage); // And it resumes on its own.
  });
});

describe('sabotage', () => {
  it('wrecks a foreign, unwatched building over repeated visits', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [attacker] = sim.livingPeople().filter(p => p.bandId === 0);
    settle(attacker!);
    // Owned by a band nobody belongs to, deliberately: an *unwatched* target
    // is the point of this test, and a real band 1 goes about its own day
    // over the thousands of ticks a mud hut takes to wreck — long enough for
    // one of its own people to wander home, catch sight of the wreck in
    // progress, and either fight the intruder off or repair the hut behind
    // them, either of which this test would measure instead of the one thing
    // it is about: that repeated damage actually banks and adds up. `mayUse`
    // does not care whether `ownerBandId` names anybody living.
    const hut = finishedBuilding(sim, 'mud_hut', attacker!.x, attacker!.y, 99);
    attacker!.x = hut.centerX;
    attacker!.y = hut.centerY;

    // A mud hut took 520 ticks to raise; wrecking it costs the same, well
    // past AGENTS.md's roughly-140-tick ceiling for one uninterrupted pull —
    // which is exactly why `durability` banks the way `progress` does. Settled
    // periodically so an ordinary need cannot expire the standing order before
    // the actor gets back to it; see `AGENTS.md`'s note on why any pull this
    // long needs its progress kept on the thing being worked on, not the actor.
    for (let i = 0; i < 4000 && !hut.ruined; i++) {
      if (i % 40 === 0) {
        settle(attacker!);
        sim.order(attacker!, 'sabotage', { buildingId: hut.id });
      }
      sim.step();
    }
    expect(hut.ruined).toBe(true);
    expect(hut.def.shelter).toBeGreaterThan(0); // The design still claims shelter…
  });

  it('refuses a target from the actor’s own band, and says why', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [attacker] = sim.livingPeople().filter(p => p.bandId === 0);
    settle(attacker!);
    const own = finishedBuilding(sim, 'mud_hut', attacker!.x, attacker!.y, 0);
    attacker!.x = own.centerX;
    attacker!.y = own.centerY;

    expect(sim.order(attacker!, 'sabotage', { buildingId: own.id })).toBe(true);
    for (let i = 0; i < 50 && attacker!.order !== null; i++) sim.step();
    expect(own.ruined).toBe(false);
    expect(sim.interruptions.some(stop => stop.reason === 'not_foreign_property')).toBe(true);
  });

  it('refuses bare ground with nothing built on it, and says why', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [attacker] = sim.livingPeople().filter(p => p.bandId === 0);
    settle(attacker!);
    const spot = openSpotNear(sim, BUILDINGS.stockpile!, attacker!.x, attacker!.y);
    const stockpile = sim.place('stockpile', spot.x, spot.y, 1)!;
    expect(stockpile).not.toBeNull();
    attacker!.x = stockpile.centerX;
    attacker!.y = stockpile.centerY;

    expect(sim.order(attacker!, 'sabotage', { buildingId: stockpile.id })).toBe(true);
    for (let i = 0; i < 50 && attacker!.order !== null; i++) sim.step();
    expect(sim.interruptions.some(stop => stop.reason === 'nothing_to_sabotage')).toBe(true);
  });

  // M11 phase 15a. This used to be "is stopped by a member of the owning
  // band close enough to see it", asserting the hut untouched and a
  // `property_guarded` stop: phase 4 shipped being seen as a veto, the
  // reverse of its own plan. Being seen is now the deed's cost — the owner
  // remembers it, firsthand — and the player is told who saw.
  it('goes ahead in front of an owner, who sees it done', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [attacker] = sim.livingPeople().filter(p => p.bandId === 0);
    const [guard] = sim.livingPeople().filter(p => p.bandId === 1);
    settle(attacker!);
    const hut = finishedBuilding(sim, 'mud_hut', attacker!.x, attacker!.y, 1);
    attacker!.x = hut.centerX;
    attacker!.y = hut.centerY;
    guard!.x = hut.centerX + 1;
    guard!.y = hut.centerY;

    expect(sim.order(attacker!, 'sabotage', { buildingId: hut.id })).toBe(true);
    for (let i = 0; i < 100 && attacker!.order !== null; i++) sim.step();
    expect(hut.durability!).toBeLessThan(hut.def.workTicks);
    const seen = guard!.memory.all().find(m => m.type === 'sabotage' && m.actorId === attacker!.id);
    expect(seen?.firsthand).toBe(true);
    // Once for the whole action, however long it ran in front of them.
    expect(guard!.memory.all().filter(m => m.type === 'sabotage').length).toBe(1);
    expect(sim.watchedUses.some(n => n.personId === attacker!.id && n.use.seen === guard)).toBe(true);
    expect(sim.interruptions.some(stop => stop.reason === 'property_guarded')).toBe(false);
  });

  it('announces a use begun unseen once more when an owner walks in on it', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [attacker] = sim.livingPeople().filter(p => p.bandId === 0);
    const owners = sim.livingPeople().filter(p => p.bandId === 1);
    settle(attacker!);
    const hut = finishedBuilding(sim, 'mud_hut', attacker!.x, attacker!.y, 1);
    attacker!.x = hut.centerX;
    attacker!.y = hut.centerY;
    // Every owner far out of sight to begin with.
    for (const owner of owners) {
      owner.x = hut.centerX + 40;
      owner.y = hut.centerY + 40;
    }
    const guard = owners[0]!;

    expect(sim.order(attacker!, 'sabotage', { buildingId: hut.id })).toBe(true);
    for (let i = 0; i < 3; i++) sim.step();
    expect(guard.memory.all().some(m => m.type === 'sabotage')).toBe(false);

    guard.x = hut.centerX + 1;
    guard.y = hut.centerY;
    guard.targetX = guard.x;
    guard.targetY = guard.y;
    for (let i = 0; i < 100 && attacker!.order !== null; i++) sim.step();
    const seen = guard.memory.all().filter(m => m.type === 'sabotage' && m.actorId === attacker!.id);
    expect(seen.length).toBe(1);
    expect(seen[0]!.firsthand).toBe(true);
  });

  it('is not offered against a close ally band’s building', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [attacker] = sim.livingPeople().filter(p => p.bandId === 0);
    settle(attacker!);
    const hut = finishedBuilding(sim, 'mud_hut', attacker!.x, attacker!.y, 1);
    attacker!.x = hut.centerX;
    attacker!.y = hut.centerY;
    sim.bandRelations.add(0, 1, 100); // Well past ALLY_STANDING.

    expect(sim.order(attacker!, 'sabotage', { buildingId: hut.id })).toBe(true);
    for (let i = 0; i < 50 && attacker!.order !== null; i++) sim.step();
    expect(hut.ruined).toBe(false);
    expect(sim.interruptions.some(stop => stop.reason === 'not_foreign_property')).toBe(true);
  });
});

describe('what a ruin cannot do until it is repaired', () => {
  it('gives no shelter', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const hut = finishedBuilding(sim, 'mud_hut', Math.round(person.x), Math.round(person.y), person.bandId);
    hut.damage(hut.def.workTicks);
    person.x = hut.centerX;
    person.y = hut.centerY;
    settle(person);
    person.needs.cold = 60;

    sim.step();
    expect(person.needs.cold).toBeGreaterThan(0); // A roof with no roof left warms nobody.
  });

  it('answers no thirst', () => {
    // `well` sits behind its own technology; every other building in this
    // file needs none, so only this test has to grant it.
    const sim = new Simulation({
      ...SMALL, population: { ...SMALL.population, startingTech: ['well'] },
    });
    aDayIn(sim);
    // An inland spot, so the only water in reach is the well itself.
    let spot: { x: number; y: number } | null = null;
    for (let y = 8; y < sim.world.height - 8 && !spot; y += 4) {
      for (let x = 8; x < sim.world.width - 8 && !spot; x += 4) {
        let dry = true;
        for (let dy = -6; dy <= 6 && dry; dy++) {
          for (let dx = -6; dx <= 6 && dry; dx++) {
            if (sim.world.isWater(x + dx, y + dy)) dry = false;
          }
        }
        if (dry) spot = { x, y };
      }
    }
    expect(spot, 'this map has no inland spot to test with').not.toBeNull();
    const person = sim.livingPeople()[0]!;
    const well = finishedBuilding(sim, 'well', spot!.x, spot!.y, person.bandId);
    expect(isWell(well.def)).toBe(true);
    well.damage(well.def.workTicks);
    person.x = well.centerX;
    person.y = well.centerY;
    settle(person);
    person.needs.thirst = 60;

    expect(sim.order(person, 'drink')).toBe(true);
    for (let i = 0; i < 200 && person.order !== null; i++) sim.step();
    expect(person.needs.thirst).toBeGreaterThan(0);
    expect(sim.interruptions.some(stop => stop.reason === 'no_water')).toBe(true);
  });
});

describe('repair', () => {
  it('answers `build` on a damaged, complete structure, and needs no fresh materials', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const hut = finishedBuilding(sim, 'mud_hut', Math.round(person.x), Math.round(person.y), person.bandId);
    hut.damage(hut.def.workTicks * 0.6);
    person.x = hut.centerX;
    person.y = hut.centerY;
    settle(person);
    expect(person.inventory.total).toBe(0); // Nothing delivered, nothing carried.

    expect(sim.order(person, 'build', { buildingId: hut.id })).toBe(true);
    for (let i = 0; i < 3000 && hut.soundness < 1; i++) sim.step();
    expect(hut.soundness).toBe(1);
    expect(hut.ruined).toBe(false);
  });

  it('still refuses `build` on a building that was never damaged', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const hut = finishedBuilding(sim, 'mud_hut', Math.round(person.x), Math.round(person.y), person.bandId);
    person.x = hut.centerX;
    person.y = hut.centerY;
    settle(person);

    expect(sim.order(person, 'build', { buildingId: hut.id })).toBe(true);
    for (let i = 0; i < 50 && person.order !== null; i++) sim.step();
    expect(sim.interruptions.some(stop => stop.reason === 'already_built')).toBe(true);
  });
});

// M11 phase 15a. Not sabotage, but it lives beside it because the helpers
// that site a finished foreign building do: the inventory panel's shortcut to
// a store is the second place being watched used to refuse outright.
describe('storing in a watched store', () => {
  it('goes ahead, is remembered by the owner, and tells the player who saw', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [actor] = sim.livingPeople().filter(p => p.bandId === 0);
    const [owner] = sim.livingPeople().filter(p => p.bandId === 1);
    settle(actor!);
    const store = finishedBuilding(sim, 'storage_pit', actor!.x, actor!.y, 1);
    actor!.x = store.centerX;
    actor!.y = store.centerY;
    owner!.x = store.centerX + 1;
    owner!.y = store.centerY;
    sim.peopleHash.rebuild(sim.people);
    actor!.inventory.add('sticks', 3);

    expect(sim.mayUseBuilding(actor!, store).watched).toBe(true);
    expect(sim.storeItem(actor!, store, 'sticks')).toBe(3);
    expect(store.store.count('sticks')).toBeGreaterThanOrEqual(3);
    expect(owner!.memory.all().some(m => m.type === 'trespass' && m.actorId === actor!.id)).toBe(true);
    expect(sim.watchedUses.some(n => n.personId === actor!.id && n.use.seen === owner)).toBe(true);
  });
});

// M11 phase 17c. A field was excluded from sabotage while ruining it would
// have changed nothing; now it tramples what was sown and the plot is not
// sown again until mended.
describe('a trampled field', () => {
  it('loses what was growing, and is not sown until it is mended', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [raider] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    const [farmer] = sim.livingPeople().filter(p => p.bandId === 1 && !p.isChild);
    settle(raider!);
    settle(farmer!);
    for (const owner of sim.livingPeople().filter(p => p.bandId === 1)) owner.knownTech.add('farming');
    // `place` reads the world's recount, which runs once a day.
    sim.knownTech.add('farming');
    // Wherever the ground takes a plot — `farming.test.ts`'s own search.
    let placed: Building | null = null;
    for (let ring = 3; ring <= 20 && !placed; ring++) {
      for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring]]) {
        placed = sim.place('field', Math.round(farmer!.x) + dx!, Math.round(farmer!.y) + dy!, 1);
        if (placed) break;
      }
    }
    expect(placed, 'no ground for a field').not.toBeNull();
    const field = placed!;
    for (const [itemId, needed] of Object.entries(field.def.materials)) field.delivered.add(itemId, needed);
    field.addWork(field.def.workTicks + 1);
    expect(field.crop).not.toBeNull();
    field.crop!.sow(sim.time.day);
    // Owners well out of sight, so the raid is not interrupted by the ladder.
    for (const owner of sim.livingPeople().filter(p => p.bandId === 1)) {
      owner.x = field.centerX + 40;
      owner.y = field.centerY + 40;
    }
    raider!.x = field.centerX;
    raider!.y = field.centerY;
    field.durability = 1;

    expect(sim.order(raider!, 'sabotage', { buildingId: field.id })).toBe(true);
    for (let i = 0; i < 100 && raider!.order !== null; i++) {
      settle(raider!);
      sim.step();
    }
    expect(field.ruined).toBe(true);
    expect(field.crop!.isFallow).toBe(true);
    expect(field.crop!.lost).toBe(1);

    // The farmer cannot sow it back.
    farmer!.inventory.add('grain', 10);
    farmer!.x = field.centerX;
    farmer!.y = field.centerY;
    expect(sim.order(farmer!, 'sow', { buildingId: field.id })).toBe(true);
    for (let i = 0; i < 20 && farmer!.order !== null; i++) {
      settle(farmer!);
      sim.step();
    }
    expect(field.crop!.isFallow).toBe(true);
    expect(sim.interruptions.some(n => n.personId === farmer!.id && n.reason === 'field_ruined_or_gone')).toBe(true);
  });
});
