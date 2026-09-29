import { describe, expect, it } from 'vitest';
import { BandSystem, type BandContext } from '../systems/BandSystem.ts';
import { makeConfig } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Person } from '../entities/Person.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import type { Band } from '../core/Simulation.ts';

function setup() {
  const rng = new RNG('relocation-test');
  const adults = [new Person('Aru', 10, 10, 0, rng), new Person('Ena', 11, 10, 0, rng)];
  adults.forEach(person => { person.chronic.hunger = 0.9; });
  adults[0]!.placeMemory.remember('resource:berries', 50, 50, 1, 2);
  adults[0]!.placeMemory.remember('water', 52, 50, 1, 2);

  const local = [new ResourceNode('berries', 10, 10, rng), new ResourceNode('fish', 12, 10, rng)];
  local.forEach(node => { node.amount = 0; });
  const destination = new ResourceNode('berries', 50, 50, rng);
  destination.amount = 12;
  const nodeHash = new SpatialHash<ResourceNode>(8);
  nodeHash.rebuild([...local, destination]);
  const band: Band = {
    id: 0, name: 'the reeds', homeX: 10, homeY: 10, norms: {} as Band['norms'],
    strangerRegard: 0.5, chiefId: null, chiefSince: null,
  };
  const ctx = {
    motivation: makeConfig({ motivation: { relocateAfter: 30, reachAdult: 36 } }).motivation,
    day: 0, tick: 0, nodeHash, relationships: new RelationshipGraph(),
    sameRegion: () => true, onInsight: () => {},
  } as unknown as BandContext;
  return { adults, band, ctx };
}

describe('camp relocation', () => {
  it('moves after sustained food exhaustion when the band knows a fed, watered place', () => {
    const { adults, band, ctx } = setup();
    const system = new BandSystem();
    const consider = (system as unknown as { considerRelocation: (band: Band, people: Person[], ctx: BandContext) => void })
      .considerRelocation.bind(system);
    for (let day = 1; day <= 31; day++) {
      ctx.day = day;
      consider(band, adults, ctx);
    }
    expect(band.homeX).toBe(50);
    expect(band.homeY).toBe(50);
    expect(adults[0]!.chronicle.some(event => event.text.includes('led the'))).toBe(true);
  });

  it('does not move when nobody knows a better place', () => {
    const { adults, band, ctx } = setup();
    adults[0]!.placeMemory = new Person('blank', 10, 10, 0, new RNG('blank')).placeMemory;
    const system = new BandSystem();
    const consider = (system as unknown as { considerRelocation: (band: Band, people: Person[], ctx: BandContext) => void })
      .considerRelocation.bind(system);
    for (let day = 1; day <= 31; day++) {
      ctx.day = day;
      consider(band, adults, ctx);
    }
    expect(band.homeX).toBe(10);
    expect(band.homeY).toBe(10);
    expect(adults[0]!.chronicle.some(event => event.text.includes('no better place'))).toBe(true);
  });
});
