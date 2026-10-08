import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

/**
 * M15 step 0 (D): only the player's character writes down where it last saw
 * somebody. The record is read by the renderer's fog of war and by nothing in
 * the simulation; in a camp of three hundred it was most of `observePlaces`.
 */
const make = () => new Simulation({ seed: 'person-sightings',
  world: { width: 48, height: 48, regrowthRate: 0, predators: 0 },
  population: { bands: 1, peoplePerBand: 12 } });
const sightings = (p: { placeMemory: { records(kind: string): readonly unknown[] } }) =>
  p.placeMemory.records('person').length;

describe('who remembers where they saw people', () => {
  it('no NPC ever records a person, the player does', () => {
    const sim = make();
    const player = sim.possessFirst()!;
    for (let i = 0; i < 300; i++) sim.step();
    expect(sightings(player)).toBeGreaterThan(0);
    for (const p of sim.people) if (p !== player) expect(sightings(p)).toBe(0);
  });

  it('a character handed back to the brain stops holding sightings, and the new one starts', () => {
    const sim = make();
    const first = sim.possessFirst()!;
    for (let i = 0; i < 300; i++) sim.step();
    expect(sightings(first)).toBeGreaterThan(0);
    const second = sim.people.find(p => p !== first && p.alive)!;
    expect(sightings(second)).toBe(0);
    sim.possess(second);
    expect(sightings(first)).toBe(0);
    for (let i = 0; i < 300; i++) sim.step();
    expect(sightings(second)).toBeGreaterThan(0);
    expect(sightings(first)).toBe(0);
  });
});
