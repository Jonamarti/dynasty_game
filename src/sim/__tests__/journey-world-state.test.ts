import { describe, expect, it } from 'vitest';
import { deserializeSave, serializeSave } from '../persistence/SaveFile.ts';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { WorldState } from '../world/WorldState.ts';
import { toWorldStateRecord } from '../persistence/WorldStateRecords.ts';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function journeyWorld(): { state: WorldState; destination: { cx: number; cy: number } } {
  const seed = 'wsp-1';
  const geography = randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
  const found = findGlobeStart(geography, 4)!;
  const start = { x: Math.floor(found.x) + 0.5, y: Math.floor(found.y) + 0.5 };
  const state = new WorldState({ seed, population: { bands: 1, peoplePerBand: 5 }, time: { ticksPerDay: 8 }, world: { width: 32, height: 32 } },
    { geography, start, comarcasWide: 1, comarcasHigh: 1, peoples: false });
  const origin = state.frontier.active!;
  const width = geography.map.width, height = geography.map.height;
  const destination = [[origin.cx + 1, origin.cy], [origin.cx - 1, origin.cy], [origin.cx, origin.cy + 1], [origin.cx, origin.cy - 1]]
    .map(([cx, cy]) => ({ cx: (cx! + width) % width, cy: cy! }))
    .find(point => point.cy >= 0 && point.cy < height && geography.profileAt(point.cx, point.cy).biome !== 'ocean');
  if (!destination) throw new Error('test geography has no land neighbour');
  return { state, destination };
}
function tick(state: WorldState): void { state.current.step(); state.advancePeoples(); }

 describe('persisted comarca journeys (phase 35)', () => {
  it('saves the in-flight route and resumes to the same arrival without duplicate traveller IDs', () => {
    const { state, destination } = journeyWorld();
    const actor = state.current.possessFirst()!;
    actor.inventory.add('berries', 5);
    expect(state.startJourney(destination, { requireKnowledge: false })).toBeNull();
    expect(state.current.player).toBeNull();
    expect(state.frontier.pendingJourney).toMatchObject({ actorId: actor.id, destination, provisions: 5, playerTravelling: true });
    for (let i = 0; i < 3; i++) tick(state);
    const loaded = deserializeSave(serializeSave(state, 10));
    expect(loaded.frontier.pendingJourney).toEqual(state.frontier.pendingJourney);
    for (let i = 0; i < 12; i++) { tick(state); tick(loaded); }
    expect(state.frontier.pendingJourney).toBeNull();
    expect(loaded.frontier.pendingJourney).toBeNull();
    expect(state.current.player?.id).toBe(actor.id);
    expect(new Set(state.current.people.map(p => p.id)).size).toBe(state.current.people.length);
    expect(toWorldStateRecord(loaded)).toEqual(toWorldStateRecord(state));
  });

  it('m16-block-advance-across-arrival: catches up the destination and keeps saves valid', () => {
    const { state, destination } = journeyWorld();
    const actor = state.current.possessFirst()!;
    expect(state.startJourney(destination, { requireKnowledge: false })).toBeNull();
    const arrivalTick = state.frontier.pendingJourney!.arrivalTick;
    const targetTick = arrivalTick + 1;

    // Some harnesses and offline callers step several times before updating
    // the world root. Arrival must still install a checkpoint at that root tick.
    while (state.current.time.tick < targetTick) state.current.step();
    state.advancePeoples();

    expect(state.frontier.pendingJourney).toBeNull();
    expect(state.current.time.tick).toBe(targetTick);
    expect(() => serializeSave(state, 10)).not.toThrow();
    expect(state.current.player?.id).toBe(actor.id);
  });

  it('rejects a saved transport range that cannot cover its recorded route', () => {
    const { state, destination } = journeyWorld();
    const actor = state.current.possessFirst()!;
    expect(state.startJourney(destination, { requireKnowledge: false })).toBeNull();
    const save = JSON.parse(serializeSave(state, 10)) as { world: { frontier: { journey: { transport: { distance: number; maximumDistance: number; days: number; mode: string } } } } };
    save.world.frontier.journey.transport.maximumDistance = save.world.frontier.journey.transport.distance - 1;
    expect(() => deserializeSave(JSON.stringify(save))).toThrow(/corrupt/i);
    save.world.frontier.journey.transport.maximumDistance = save.world.frontier.journey.transport.distance;
    save.world.frontier.journey.transport.days = 0;
    expect(() => deserializeSave(JSON.stringify(save))).toThrow(/corrupt/i);
    save.world.frontier.journey.transport.days = 1;
    save.world.frontier.journey.transport.mode = 'teleport';
    expect(() => deserializeSave(JSON.stringify(save))).toThrow(/corrupt/i);
    const dateSave = JSON.parse(serializeSave(state, 10)) as { world: { frontier: { journey: { lastAdvancedTick: number; transit: { lastAdvancedTick: number; execution: { time: { tick: number } } } } } } };
    dateSave.world.frontier.journey.lastAdvancedTick++;
    dateSave.world.frontier.journey.transit.lastAdvancedTick++;
    dateSave.world.frontier.journey.transit.execution.time.tick++;
    expect(() => deserializeSave(JSON.stringify(dateSave))).toThrow(/corrupt/i);
    expect(actor.alive).toBe(true);
  });

  it('advances only travelling lives at midnight and carries a birth through checkpoint restore', () => {
    const { state, destination } = journeyWorld();
    const mother = state.current.people.find(person => person.alive && person.canBearChildren)!;
    expect(mother).toBeDefined();
    mother.pregnant = true; mother.gestationLeft = 1; mother.pregnantBy = null;
    const resident = state.current.people.find(person => person.alive && person.id !== mother.id)!;
    const residentAge = resident.age;
    expect(state.startJourney(destination, { actor: mother, travellerIds: [mother.id], requireKnowledge: false })).toBeNull();
    const ticket = state.frontier.pendingJourney!;
    const transit = Simulation.fromCheckpointRecord(ticket.transit);
    transit.peopleById.get(mother.id)!.pregnant = true;
    transit.peopleById.get(mother.id)!.gestationLeft = 1;
    const pregnantCheckpoint = toCheckpointRecord(transit);
    state.frontier.updateJourney({ ...ticket, transit: pregnantCheckpoint });
    for (let i = 0; i < 3; i++) tick(state);
    const loaded = deserializeSave(serializeSave(state, 10));
    for (let i = 0; i < 8; i++) { tick(state); tick(loaded); }
    expect(state.frontier.pendingJourney).toBeNull();
    expect(loaded.frontier.pendingJourney).toBeNull();
    // The actor has no player seat, so arrival parks the destination checkpoint.
    // World-root lookup must include parked owners as well as the active comarca.
    const child = [...state.worldPeople().values()].find(person => person.motherId === mother.id);
    expect(child).toBeDefined();
    // The source keeps its ordinary one-per-midnight pass while the traveller
    // receives exactly one journey LifeSystem pass in the separate checkpoint.
    expect(state.worldPeople().get(resident.id)?.age).toBe(residentAge + 1);
    expect(JSON.stringify(toWorldStateRecord(loaded))).toBe(JSON.stringify(toWorldStateRecord(state)));
  });

  it('rejects a changed journey party without changing the authoritative ticket', () => {
    const { state, destination } = journeyWorld();
    const actor = state.current.possessFirst()!;
    expect(state.startJourney(destination, { requireKnowledge: false })).toBeNull();
    const ticket = state.frontier.pendingJourney!;
    const rejected = { ...ticket, travellerIds: [ticket.actorId + 1] };
    expect(() => state.frontier.updateJourney(rejected)).toThrow(/journey continuity/i);
    expect(state.frontier.pendingJourney).toEqual(ticket);
    expect(actor.alive).toBe(true);
  });

  it('refuses same-comarca and out-of-map destinations without mutating the live checkpoint', () => {
    const { state, destination } = journeyWorld();
    const actor = state.current.possessFirst()!;
    const before = JSON.stringify(toWorldStateRecord(state));
    expect(state.startJourney(state.frontier.active!, { requireKnowledge: false })).toMatch(/already in that comarca/i);
    expect(state.startJourney({ cx: -1, cy: destination.cy }, { requireKnowledge: false })).toMatch(/outside the known world/i);
    expect(JSON.stringify(toWorldStateRecord(state))).toBe(before);
    expect(state.current.player?.id).toBe(actor.id);
  });
});
