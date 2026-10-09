import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { TileLedger } from '../persistence/TileLedger.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { WorldState } from '../world/WorldState.ts';
import type { JourneyPoint } from '../world/Transport.ts';

function geographicWorld(): { state: WorldState; destination: JourneyPoint } {
  const seed = 'traffic-phase36';
  const geography = randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
  const start = findGlobeStart(geography, 4)!;
  const origin = { cx: Math.floor(start.x), cy: Math.floor(start.y) };
  const state = new WorldState({
    seed, population: { bands: 2, peoplePerBand: 8 },
    time: { ticksPerDay: 8 },
    world: { width: 32, height: 32, berryBushes: 30, flintOutcrops: 8, deadwood: 15, gameHerds: 3 },
  }, {
    geography, start: { x: origin.cx + 0.5, y: origin.cy + 0.5 },
    comarcasWide: 1, comarcasHigh: 1, peoples: false,
  });
  const width = geography.map.width;
  const from = state.frontier.active!;
  const destination = [
    { cx: (from.cx + 1) % width, cy: from.cy },
    { cx: (from.cx + width - 1) % width, cy: from.cy },
    { cx: from.cx, cy: from.cy + 1 },
    { cx: from.cx, cy: from.cy - 1 },
  ].find(point => point.cy >= 0 && point.cy < geography.map.height &&
    geography.profileAt(point.cx, point.cy).biome !== 'ocean');
  if (!destination) throw new Error('No land neighbor for raid integration test');
  return { state, destination };
}

function tick(state: WorldState): void {
  state.current.step();
  state.advancePeoples();
}

describe('root-owned incoming comarca raids', () => {
  it('restores a mid-route ticket and arrives once at the active victim edge with a real local order', () => {
    let { state, destination } = geographicWorld();
    const origin = state.frontier.active!;
    const player = state.current.possessFirst()!;
    const raiders = state.current.people.filter(person =>
      person.alive && !person.isChild && person.bandId !== player.bandId && person.captiveOf === null);
    const attacker = raiders[0]!;
    const partyIds = raiders.slice(0, 3).map(person => person.id);
    expect(partyIds).toHaveLength(3);

    expect(state.startJourney(destination, {
      actor: player, travellerIds: [player.id], requireKnowledge: false,
    })).toBeNull();
    for (let ticks = 0; state.frontier.pendingJourney && ticks < 80; ticks++) tick(state);
    expect(state.frontier.pendingJourney).toBeNull();
    expect(state.frontier.active).toMatchObject(destination);
    expect(state.frontier.parkedAt(origin)).not.toBeNull();

    const victimBandId = state.current.player!.bandId;
    const victim = state.current.player!;
    let store = null as ReturnType<typeof state.current.place>;
    for (let radius = 3; !store && radius < 20; radius += 2) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1]]) {
        store = state.current.place('stockpile',
          Math.round(victim.x) + dx! * radius, Math.round(victim.y) + dy! * radius, victimBandId);
        if (store) break;
      }
    }
    if (!store) throw new Error('Could not place a victim store beside the arrival edge');
    store.complete = true;
    state.current.buildingHash.rebuild(state.current.buildings);

    state.traffic.dispatchParty(state, {
      kind: 'raid', actorId: attacker.id, travellerIds: partyIds,
      source: origin, destination: state.frontier.active!, destinationBandId: victimBandId,
      victimBandId, durationTicks: 8,
    });
    for (let i = 0; i < 4; i++) tick(state);

    const saved = WorldState.fromRestored(
      Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(state.current)))),
      state.geography,
      state.initialGeographicStart,
      null,
      TileLedger.fromRecord(JSON.parse(JSON.stringify(state.tileLedger.toRecord()))),
      JSON.parse(JSON.stringify(state.frontier.toRecord())),
      JSON.parse(JSON.stringify(state.traffic.toRecord())),
    );
    state = saved;
    for (let i = 0; i < 4; i++) tick(state);

    const arrived = state.current.peopleById.get(attacker.id)!;
    expect(arrived).toBeDefined();
    expect(arrived.bandId).not.toBe(victimBandId);
    expect(arrived.x < 2 || arrived.y < 2 || arrived.x > state.current.world.width - 2 ||
      arrived.y > state.current.world.height - 2).toBe(true);
    expect(arrived.raidingBandId).toBe(victimBandId);
    expect(arrived.order).toBe('take');
    expect(arrived.targetBuildingId).toBe(store.id);
    expect(state.traffic.partyRecords.find(ticket => ticket.actorId === attacker.id)?.party).toBeNull();
    expect(state.traffic.validateOwners(state)).toBeUndefined();
    const owners = [
      ...state.current.peopleById.keys(),
      ...state.frontier.toRecord().parked.flatMap(slot => slot.checkpoint.roster.activePersonIds),
      ...state.traffic.partyRecords.flatMap(ticket => ticket.party?.roster.activePersonIds ?? []),
    ].filter(id => id === attacker.id);
    expect(owners).toHaveLength(1);
  });
});
