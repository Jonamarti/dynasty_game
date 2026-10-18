import { describe, expect, it } from 'vitest';
import { WorldState } from '../world/WorldState.ts';
import { frontierGeography } from '../../../tools/frontierFixture.ts';

function world(): WorldState {
  return new WorldState({ seed: 'm16-scout-roundtrip', world: { width: 32, height: 32 },
    population: { bands: 1, peoplePerBand: 4, conceptionChance: 0 },
    time: { ticksPerDay: 40, daysPerSeason: 20, startDay: 0 }, needs: { coldRate: 0 } },
  { geography: frontierGeography(), start: { x: 40.5, y: 20.5 }, peoples: false });
}

function cross(state: WorldState, id: number, direction: 'e' | 'w', scout = false): void {
  const person = state.current.peopleById.get(id)!;
  expect(state.current.comarcaTravel!.arrive({ person, direction, scout, travellerIds: [id] })).toBeNull();
  expect(state.commitPendingCross()).toBe(true);
}

describe('M16 map travel after scouting', () => {
  it('m16-scout-roundtrip: keeps living family at home while an NPC scout returns', () => {
    const state = world();
    const player = state.current.possessFirst()!;
    const scout = state.current.livingPeople().find(person => person.id !== player.id && !person.isChild)!;
    const home = state.frontier.active!;

    cross(state, scout.id, 'e', true);
    expect(state.frontier.active).toEqual(home);
    expect(state.current.peopleById.has(player.id)).toBe(true);
    expect(state.frontier.parkedAt(state.frontier.scouts[0]!.destination)).toBeDefined();

    const ticket = state.frontier.scouts[0]!;
    while (state.current.time.tick < ticket.returnTick) {
      state.current.step();
      state.advancePeoples();
    }

    expect(state.frontier.scouts).toHaveLength(0);
    expect(state.frontier.active).toEqual(home);
    expect(state.current.player?.id).toBe(player.id);
    expect(state.current.peopleById.get(scout.id)?.alive).toBe(true);
    expect(state.current.people.some(person => person.alive && person.bandId === player.bandId)).toBe(true);
  });

  it('m16-scout-identity: after going east, the land home is not refused as sea to the west', () => {
    const state = world();
    const player = state.current.possessFirst()!;
    const home = state.frontier.active!;

    cross(state, player.id, 'e', true);
    const east = state.frontier.active!;
    expect(east).not.toEqual(home);
    expect(state.current.player?.id).toBe(player.id);
    expect(state.current.people.some(person => person.alive)).toBe(true);
    expect(state.current.comarcaTravel!.refusal(state.current.player!, 'w', false)).toBeNull();

    cross(state, player.id, 'w', true);
    expect(state.frontier.active).toEqual(home);
    expect(state.current.player?.id).toBe(player.id);
    expect(state.current.people.some(person => person.alive && person.bandId === player.bandId)).toBe(true);
  });
});
