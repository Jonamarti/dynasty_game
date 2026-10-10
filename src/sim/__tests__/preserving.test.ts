import { describe, expect, it, vi } from 'vitest';
import { Brain } from '../ai/Brain.ts';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Inventory, ITEMS } from '../entities/Item.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function fixture() {
  const sim = new Simulation({ seed: 'drying-rack', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 } });
  sim.possessFirst(); const person = sim.player!;
  person.knownTech.add('preserving'); person.skills.cook = 100;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  const rack = new Building(BUILDINGS.drying_rack!, Math.floor(person.x), Math.floor(person.y), person.bandId, sim.ids);
  rack.complete = true; rack.durability = rack.def.workTicks;
  sim.buildings.push(rack); sim.buildingsById.set(rack.id, rack); sim.buildingHash.insert(rack);
  return { sim, person, rack };
}

describe('drying on a physical rack', () => {
  it('keeps the same food nutrition while losing ten times less to spoilage', () => {
    const inventory = new Inventory();
    for (const [raw, dried] of [['meat', 'dried_meat'], ['fish', 'dried_fish']] as const) {
      expect(ITEMS[dried]!.spoilTicks).toBe(ITEMS[raw]!.spoilTicks * 10);
      expect(ITEMS[dried]!.nutrition).toBe(ITEMS[raw]!.nutrition);
      inventory.add(raw, 100); inventory.add(dried, 100);
    }
    const loss = new Map(inventory.spoil(240, () => 1, false));
    expect(loss.get('dried_meat')).toBeCloseTo(loss.get('meat')! / 10);
    expect(loss.get('dried_fish')).toBeCloseTo(loss.get('fish')! / 10);
  });

  it('dries meat and fish at the rack, consumes each input once and persists the station', () => {
    const { sim, person, rack } = fixture();
    for (const [raw, dried] of [['meat', 'dried_meat'], ['fish', 'dried_fish']] as const) {
      person.inventory.add(raw, 2);
      expect(sim.order(person, 'craft', { recipeId: dried, buildingId: rack.id })).toBe(true);
      for (let tick = 0; tick < 1000 && person.inventory.count(dried) < 2; tick++) {
        person.needs.hunger = person.needs.thirst = 0; sim.step();
      }
      expect(person.inventory.count(dried)).toBe(2);
      expect(person.inventory.count(raw)).toBe(0);
    }
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    expect(loaded.buildingsById.get(rack.id)?.def.id).toBe('drying_rack');
    expect(loaded.peopleById.get(person.id)?.inventory.count('dried_fish')).toBe(2);
  });

  it('does not autonomously preserve until spoilage is believed and requires a reachable station', () => {
    const { sim, person, rack } = fixture();
    person.isPlayer = false; person.action = 'idle'; person.order = null;
    person.inventory.add('meat', 2);
    const brain = (sim as unknown as { brain: Brain }).brain, score = brain.score.bind(brain);
    let checked = false;
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
      if (actor !== person || checked) return score(actor, ctx);
      checked = true;
      expect(score(actor, ctx).found.recipe).not.toBe('dried_meat');
      person.beliefs.learn('spoils:meat', 1, 1, 'seen', sim.time.tick);
      expect(score(actor, ctx).found.recipe).toBe('dried_meat');
      expect(score(actor, ctx).found.craftStation).toBe(rack);
      rack.durability = 0;
      expect(score(actor, ctx).found.recipe).not.toBe('dried_meat');
      rack.durability = rack.def.workTicks;
      rack.complete = false;
      expect(score(actor, ctx).found.recipe).not.toBe('dried_meat');
      return score(actor, ctx);
    });
    try { for (let tick = 0; tick < 30 && !checked; tick++) sim.step(); expect(checked).toBe(true); }
    finally { spy.mockRestore(); }
  });

  it('reports a ruined rack before consuming the raw food', () => {
    const { sim, person, rack } = fixture(); person.inventory.add('meat', 2);
    rack.durability = 0;
    expect(sim.order(person, 'craft', { recipeId: 'dried_meat', buildingId: rack.id })).toBe(true);
    sim.step();
    expect(person.inventory.count('meat')).toBe(2);
    expect(person.inventory.count('dried_meat')).toBe(0);
    expect(sim.interruptions.some(notice => notice.personId === person.id &&
      notice.reason === 'no_station_drying_rack')).toBe(true);
  });
});
