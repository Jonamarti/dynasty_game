import { describe, expect, it } from 'vitest';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { WorldState } from '../world/WorldState.ts';

function journeyWorld(): { state: WorldState; destination: { cx: number; cy: number } } {
  const seed = 'phase36a-carried-theft';
  const geography = randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
  const found = findGlobeStart(geography, 4)!;
  const start = { x: Math.floor(found.x) + 0.5, y: Math.floor(found.y) + 0.5 };
  const state = new WorldState({ seed, population: { bands: 1, peoplePerBand: 5, conceptionChance: 0 },
    time: { ticksPerDay: 8 }, world: { width: 32, height: 32 }, needs: { coldRate: 0 } },
  { geography, start, comarcasWide: 1, comarcasHigh: 1, peoples: false });
  const origin = state.frontier.active!;
  const destination = [[origin.cx + 1, origin.cy], [origin.cx - 1, origin.cy], [origin.cx, origin.cy + 1], [origin.cx, origin.cy - 1]]
    .map(([cx, cy]) => ({ cx: (cx! + geography.map.width) % geography.map.width, cy: cy! }))
    .find(point => point.cy >= 0 && point.cy < geography.map.height && geography.profileAt(point.cx, point.cy).biome !== 'ocean');
  if (!destination) throw new Error('test geography has no land neighbour');
  return { state, destination };
}

function tick(state: WorldState): void { state.current.step(); state.advancePeoples(); }

describe('carried theft news across comarcas', () => {
  it('arrives with the witness and is only learned after a real conversation with the archived author', () => {
    const { state, destination } = journeyWorld();
    const traveller = state.current.possessFirst()!;
    const culprit = state.current.people.find(person => person.id !== traveller.id)!;
    const victim = state.current.people.find(person => person.id !== traveller.id && person.id !== culprit.id)!;
    const listener = state.current.people.find(person => person.id !== traveller.id && person.id !== culprit.id && person.id !== victim.id)!;
    for (const person of [traveller, culprit, victim]) { person.x = 10.5; person.y = 10.5; }
    listener.x = 28.5; listener.y = 28.5;
    state.current.peopleHash.rebuild(state.current.people);
    const theft = state.current.social.emit('theft', culprit, victim, 0.7, state.current.time.tick,
      state.current.peopleHash, 12);
    expect(traveller.memory.has(theft.id)).toBe(true);
    expect(traveller.worldNews?.has(theft.id, state.frontier.active!.cx, state.frontier.active!.cy)).toBe(true);

    traveller.inventory.add('berries', 5);
    expect(state.startJourney(destination, { actor: traveller, travellerIds: [listener.id], requireKnowledge: false })).toBeNull();
    expect(state.frontier.pendingJourney?.arrivalTick).toBe(state.frontier.pendingJourney?.departureTick! + 8);
    for (let i = 0; i < 8; i++) tick(state);
    expect(state.frontier.pendingJourney).toBeNull();
    expect(state.current.player?.id).toBe(traveller.id);
    expect(state.current.peopleById.has(culprit.id)).toBe(false);
    expect(state.current.social.worldPersonById?.(culprit.id)?.id).toBe(culprit.id);

    const arrivedTraveller = state.current.peopleById.get(traveller.id)!;
    const arrivedListener = state.current.peopleById.get(listener.id)!;
    expect(arrivedListener.memory.has(theft.id)).toBe(false);
    expect(arrivedListener.worldNews?.has(theft.id, theft.originComarca!.cx, theft.originComarca!.cy) ?? false).toBe(false);
    const story = arrivedTraveller.memory.all().find(entry => entry.eventId === theft.id)!;
    state.current.social.tellStory(arrivedTraveller, arrivedListener, story, state.current.peopleById, state.current.time.tick);
    expect(arrivedListener.memory.all().find(entry => entry.eventId === theft.id)).toMatchObject({
      type: 'theft', actorId: culprit.id, firsthand: false, originComarca: theft.originComarca,
    });
    expect(arrivedListener.worldNews?.entries()).toBeDefined();
    expect([...arrivedListener.worldNews!.entries()]).toMatchObject([{
      eventId: theft.id, actorId: culprit.id, originCx: theft.originComarca!.cx,
      originCy: theft.originComarca!.cy, firsthand: false, sourceId: arrivedTraveller.id,
      channel: 'conversation', learnedTick: state.current.time.tick,
    }]);
  });
});
