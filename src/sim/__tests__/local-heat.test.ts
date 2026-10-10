import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { RNG } from '../core/RNG.ts';
import type { CompactPerson } from '../compact/CompactPerson.ts';

function fixture() {
  return new Simulation({ seed: 'local-heat', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 2 } });
}

describe('physical heat sources', () => {
  it('knowledge and unlit fuel never replace an owned flame', () => {
    const person = fixture().livingPeople()[0]!;
    person.knownTech.add('firemaking'); person.knownTech.add('charcoal');
    person.inventory.add('charcoal', 3); person.inventory.add('torch', 1);
    expect(warmthFrom(person)).toBe(0);
    person.equipment.right = { item: 'torch', count: 1, lit: 2 };
    expect(warmthFrom(person)).toBeCloseTo(0.2);
    person.equipment.right.lit = 0;
    expect(warmthFrom(person)).toBe(0);
  });

  it('a completed roof does not become wildlife firelight', () => {
    const sim = fixture(), person = sim.livingPeople()[0]!;
    const roof = new Building(BUILDINGS.mud_hut!, person.x, person.y, person.bandId, sim.ids);
    roof.complete = true; sim.buildingHash.rebuild([roof]); sim.peopleHash.clear();
    expect(sim.litNear(roof.centerX, roof.centerY, 7)).toBe(false);
  });

  it('compact exposure reads the same nearby hearth and loses it when ruined or distant', () => {
    function exposure(distance: number, ruined: boolean) {
      const sim = fixture(), person = sim.livingPeople()[0]!;
      person.x = person.y = 12; person.needs.cold = 40;
      const fire = new Building(BUILDINGS.hearth!, 12 + distance, 12, person.bandId, sim.ids);
      fire.complete = true; if (ruined) fire.durability = 0;
      const compact: CompactPerson = { person, lastAdvancedTick: 0, epoch: 1,
        rng: new RNG('heat-body'), goal: { kind: 'idle', since: 0, target: null }, intake: null };
      const body = new CompactBody({ needs: sim.config.needs, time: sim.config.time,
        buildings: [fire], nextEventId: () => 1 });
      body.advance(compact, 1);
      return person.needs.cold;
    }
    expect(exposure(0, false)).toBeLessThan(exposure(12, false));
    expect(exposure(0, true)).toBe(exposure(12, false));
  });
});
