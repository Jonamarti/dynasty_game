import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { fromPersonRecord } from '../persistence/EntityRecords.ts';
import { deserializeSave, serializeSave } from '../persistence/SaveFile.ts';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { WorldState } from '../world/WorldState.ts';

function makeWorld(): { state: WorldState; destination: { cx: number; cy: number } } {
  const seed = 'journey-encounter-fixture';
  const geography = randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
  const found = findGlobeStart(geography, 4)!;
  const start = { x: Math.floor(found.x) + 0.5, y: Math.floor(found.y) + 0.5 };
  const state = new WorldState({ seed, population: { bands: 1, peoplePerBand: 5 }, time: { ticksPerDay: 8 }, world: { width: 32, height: 32 } },
    { geography, start, comarcasWide: 1, comarcasHigh: 1, peoples: false });
  const here = state.frontier.active!;
  const width = geography.map.width, height = geography.map.height;
  const destination = [[here.cx + 1, here.cy], [here.cx - 1, here.cy], [here.cx, here.cy + 1], [here.cx, here.cy - 1]]
    .map(([cx, cy]) => ({ cx: (cx! + width) % width, cy: cy! }))
    .find(point => point.cy >= 0 && point.cy < height && geography.profileAt(point.cx, point.cy).biome !== 'ocean');
  if (!destination) throw new Error('fixture requires a land neighbour');
  return { state, destination };
}

function snapshotFor(predicate: (draw: number) => boolean, second?: (draw: number) => boolean): ReturnType<RNG['snapshot']> {
  for (let seed = 1; seed < 100_000; seed++) {
    const candidate = new RNG(seed);
    if (predicate(candidate.next()) && (!second || second(candidate.next()))) return new RNG(seed).snapshot();
  }
  throw new Error('could not find a deterministic encounter draw');
}
function tick(state: WorldState): void { state.current.step(); state.advancePeoples(); }
function encounterState(state: WorldState) {
  const journey = state.frontier.pendingJourney;
  return journey && { arrivalTick: journey.arrivalTick, lastAdvancedTick: journey.lastAdvancedTick, rng: journey.rng, encounters: journey.encounters, provisions: journey.provisions, preservedProvisions: journey.preservedProvisions, cargoUnits: journey.cargoUnits };
}
function actorHealth(state: WorldState, actorId: number): number {
  const journey = state.frontier.pendingJourney!;
  return journey.transit.roster.people.map(fromPersonRecord).find(person => person.id === actorId)!.health;
}
function startDelayedJourney(event: 'storm' | 'wildlife' | 'settlement') {
  const { state, destination } = makeWorld();
  const actor = state.current.possessFirst()!;
  expect(state.startJourney(destination, { requireKnowledge: false })).toBeNull();
  const journey = state.frontier.pendingJourney!;
  const tpd = state.current.config.time.ticksPerDay;
  const predicate = event === 'storm' ? (draw: number) => draw < 0.04
    : event === 'wildlife' ? (draw: number) => draw >= 0.04 && draw < 0.08
      : (draw: number) => draw >= 0.08 && draw < 0.13;
  // Keep the next day's event from adding a second delay so the save/load path has a fixed end tick.
  const second = event === 'storm' ? (draw: number) => draw >= 0.04 : undefined;
  state.frontier.updateJourney({ ...journey, arrivalTick: journey.arrivalTick + tpd, rng: snapshotFor(predicate, second) });
  return { state, actor, tpd, initialArrival: journey.arrivalTick + tpd };
}

describe('persisted journey encounters', () => {
  it('records a storm delay and resumes the same encounter stream after save/load', () => {
    const { state, tpd, initialArrival } = startDelayedJourney('storm');
    for (let i = 0; i < tpd; i++) tick(state);
    const afterStorm = state.frontier.pendingJourney!;
    expect(afterStorm.encounters).toEqual(['storm']);
    expect(afterStorm.arrivalTick).toBe(initialArrival + tpd);

    const loaded = deserializeSave(serializeSave(state, 11));
    expect(loaded.frontier.pendingJourney).toEqual(afterStorm);
    for (let i = 0; i < tpd * 2; i++) {
      tick(state); tick(loaded);
      expect(encounterState(loaded)).toEqual(encounterState(state));
    }
    expect(state.frontier.pendingJourney).toBeNull();
    expect(loaded.current.player?.id).toBe(state.current.player?.id);
  }, 20_000);

  it('applies wildlife encounter damage to the traveller in the transit checkpoint', () => {
    const { state, actor, tpd } = startDelayedJourney('wildlife');
    const before = actorHealth(state, actor.id);
    for (let i = 0; i < tpd; i++) tick(state);
    const journey = state.frontier.pendingJourney!;
    expect(journey.encounters).toEqual(['wildlife']);
    expect(actorHealth(state, actor.id)).toBe(before - 5);
  });

  it('records a settlement sighting without adding a storm delay', () => {
    const { state, tpd, initialArrival } = startDelayedJourney('settlement');
    for (let i = 0; i < tpd; i++) tick(state);
    const journey = state.frontier.pendingJourney!;
    expect(journey.encounters).toEqual(['settlement']);
    expect(journey.arrivalTick).toBe(initialArrival);
  });
});
