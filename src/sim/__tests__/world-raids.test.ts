import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import { knownRaidDestination, orderArrivingRaid, resolveCaravanInterception } from '../world/WorldRaids.ts';
import type { CaravanEvent } from '../world/WorldCaravans.ts';

function scout(): Person {
  const person = new Person('Scout', 10, 10, 1, new RNG('raid-scout'));
  person.worldKnowledge = new WorldKnowledge();
  return person;
}

describe('world raid knowledge and physical interception', () => {
  it('orders a party at the destination against a visible real victim store', () => {
    const sim = new Simulation({
      seed: 'raid-arrival-order',
      world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
      population: { bands: 2, peoplePerBand: 5 },
    });
    const raider = sim.people.find(person => person.bandId === 0 && person.alive)!;
    const victim = sim.bands.find(band => band.id === 1)!;
    let building = null as ReturnType<typeof sim.place>;
    for (let radius = 4; !building && radius < 22; radius += 2) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1]]) {
        building = sim.place('storage_pit', Math.round(raider.x) + dx! * radius,
          Math.round(raider.y) + dy! * radius, victim.id);
        if (building) break;
      }
    }
    if (!building) throw new Error('could not place destination store');
    building.complete = true;
    raider.x = building.centerX - 2;
    raider.y = building.centerY - 2;
    sim.peopleHash.rebuild(sim.people);
    sim.buildingHash.rebuild(sim.buildings);

    expect(orderArrivingRaid(sim, [raider.id], victim.id)).toBe(1);
    expect(raider.raidingBandId).toBe(victim.id);
    expect(raider.order).toBe('take');
    expect(raider.targetBuildingId).toBe(building.id);
  });
  it('routes only to a known hostile people on a traversable comarca', () => {
    const actor = scout();
    actor.worldKnowledge!.see(0, 0, 1);
    expect(knownRaidDestination(actor, 7, { cx: 0, cy: 0 }, 5, () => true)).toBeNull();

    actor.worldKnowledge!.see(1, 0, 2);
    actor.worldKnowledge!.meet(1, 0, 7, 2);
    actor.worldKnowledge!.see(0, 1, 3);
    actor.worldKnowledge!.meet(0, 1, 7, 3);
    const destination = knownRaidDestination(actor, 7, { cx: 0, cy: 0 }, 5,
      (cx, cy) => !(cx === 1 && cy === 0));
    expect(destination).toEqual({ cx: 0, cy: 1 });
    expect(knownRaidDestination(actor, 8, { cx: 0, cy: 0 }, 5, () => true)).toBeNull();
  });

  it('takes only physical convoy goods when a real hostile is nearby and records local witnesses', () => {
    const destination = new Simulation({
      seed: 'raid-interception',
      world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
      population: { bands: 2, peoplePerBand: 5 },
    });
    const convoy = new Simulation({
      seed: 'raid-convoy',
      world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const raider = destination.people.find(person => person.bandId === 1 && person.alive)!;
    const witness = destination.people.find(person => person.bandId === 0 && person.alive)!;
    raider.x = witness.x = 20.5;
    raider.y = witness.y = 20.5;
    destination.peopleHash.rebuild(destination.people);
    destination.social.worldOrigin = { cx: 3, cy: 2 };
    const merchant = convoy.people.find(person => person.alive)!;
    merchant.x = merchant.y = 20.5;
    const event: Extract<CaravanEvent, { kind: 'raid-opportunity' }> = {
      eventId: 'caravan:raid:1', kind: 'raid-opportunity', caravanId: 1, tick: 1,
      raiderPeopleId: raider.bandId, targetPeopleId: merchant.bandId,
      stance: 'war', standing: -80,
      travellers: [{ personId: merchant.id, name: merchant.name }], escortIds: [],
      cargo: [{ itemId: 'berries', count: 1 }],
    };

    expect(resolveCaravanInterception(destination, convoy, event, merchant.id)).toEqual([]);
    expect(raider.inventory.count('berries')).toBe(1);
    const theft = witness.memory.all().find(entry => entry.type === 'theft');
    expect(theft).toMatchObject({ actorId: raider.id, firsthand: true, originComarca: { cx: 3, cy: 2 } });
    expect(merchant.memory.all().find(entry => entry.eventId === theft!.eventId)).toMatchObject({
      type: 'theft', actorId: raider.id, targetId: merchant.id, firsthand: true, originComarca: { cx: 3, cy: 2 },
    });
    expect([...merchant.worldNews!.entries()]).toMatchObject([{
      eventId: theft!.eventId, actorId: raider.id, targetId: merchant.id, originCx: 3, originCy: 2, firsthand: true,
    }]);
  });

  it('does not attack a same-band convoy even if the notice names nearby locals', () => {
    const destination = new Simulation({
      seed: 'same-band-no-raid',
      world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const convoy = new Simulation({
      seed: 'same-band-convoy',
      world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const local = destination.people.find(person => person.alive)!;
    const merchant = convoy.people.find(person => person.alive)!;
    local.x = local.y = merchant.x = merchant.y = 20.5;
    destination.peopleHash.rebuild(destination.people);
    const event: Extract<CaravanEvent, { kind: 'raid-opportunity' }> = {
      eventId: 'caravan:same-band:1', kind: 'raid-opportunity', caravanId: 3, tick: 1,
      raiderPeopleId: local.bandId, targetPeopleId: merchant.bandId,
      stance: null, standing: -80,
      travellers: [{ personId: merchant.id, name: merchant.name }], escortIds: [],
      cargo: [{ itemId: 'berries', count: 2 }],
    };

    expect(resolveCaravanInterception(destination, convoy, event, merchant.id)).toEqual(event.cargo);
    expect(local.inventory.count('berries')).toBe(0);
    expect(local.memory.all().some(entry => entry.type === 'theft')).toBe(false);
  });

  it('acknowledges a hostile notice without inventing an attacker or losing cargo', () => {
    const destination = new Simulation({
      seed: 'no-raider',
      world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const convoy = new Simulation({
      seed: 'no-raider-convoy',
      world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const merchant = convoy.people.find(person => person.alive)!;
    const event: Extract<CaravanEvent, { kind: 'raid-opportunity' }> = {
      eventId: 'caravan:raid:2', kind: 'raid-opportunity', caravanId: 2, tick: 1,
      raiderPeopleId: 99, targetPeopleId: merchant.bandId,
      stance: 'war', standing: -80,
      travellers: [{ personId: merchant.id, name: merchant.name }], escortIds: [],
      cargo: [{ itemId: 'berries', count: 3 }],
    };
    expect(resolveCaravanInterception(destination, convoy, event, merchant.id)).toEqual(event.cargo);
    expect(destination.people.some(person => person.bandId === 99)).toBe(false);
  });
});
