import { describe, expect, it, vi } from 'vitest';
import { Brain } from '../ai/Brain.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { ITEMS } from '../entities/Item.ts';

function fixture() {
  const sim = new Simulation({ seed: 'smoking-rack', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 } });
  sim.possessFirst(); const person = sim.player!;
  person.knownTech.add('smoking'); person.skills.cook = 100;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  const add = (kind: string, x: number, y: number) => {
    const building = new Building(BUILDINGS[kind]!, x, y, person.bandId, sim.ids);
    building.complete = true; building.durability = building.def.workTicks;
    sim.buildings.push(building); sim.buildingsById.set(building.id, building); sim.buildingHash.insert(building);
    return building;
  };
  const rack = add('drying_rack', Math.floor(person.x), Math.floor(person.y));
  return { sim, person, rack, add };
}

describe('smoking uses the station fire', () => {
  it('explains the missing fire in the station menu and enables it when a hearth exists', () => {
    const { sim, person, rack, add } = fixture();
    person.inventory.add('meat', 2); person.inventory.add('sticks', 1);
    const options = () => availableActions(person, { kind: 'building', x: rack.x, y: rack.y, building: rack },
      { world: sim.world, nearWater: false, hearthNear: (x, y, radius) => sim.hearthNear(x, y, radius) });
    expect(options().find(option => option.recipeId === 'smoked_meat')).toMatchObject({
      enabled: false, reason: 'You need a lit hearth nearby',
    });
    add('hearth', rack.x + 2, rack.y);
    expect(options().find(option => option.recipeId === 'smoked_meat')).toMatchObject({ enabled: true, buildingId: rack.id });
  });

  it('filters an unlit nearer rack before choosing a farther rack with fire', () => {
    const { sim, person, rack, add } = fixture();
    // Keep this a station-choice test, independent of the island's shoreline.
    for (let y = rack.y - 1; y <= rack.y + 2; y++) {
      for (let x = rack.x - 1; x <= rack.x + 8; x++) sim.world.setWalkable(x, y, true);
    }
    const farRack = add('drying_rack', rack.x + 5, rack.y);
    add('hearth', farRack.x + 2, farRack.y);
    person.isPlayer = false; person.action = 'idle'; person.order = null;
    person.inventory.add('meat', 2); person.inventory.add('sticks', 1);
    person.beliefs.learn('spoils:meat', 1, 1, 'own', sim.time.tick);
    const brain = (sim as unknown as { brain: Brain }).brain, score = brain.score.bind(brain);
    let checked = false;
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
      if (actor !== person || checked) return score(actor, ctx);
      checked = true;
      expect(score(actor, ctx).found.recipe).toBe('smoked_meat');
      expect(score(actor, ctx).found.craftStation).toBe(farRack);
      return score(actor, ctx);
    });
    try { for (let tick = 0; tick < 30 && !checked; tick++) sim.step(); expect(checked).toBe(true); }
    finally { spy.mockRestore(); }
  });
  it('refuses daylight and a carried torch as replacements for a hearth at the rack', () => {
    const { sim, person, rack } = fixture();
    person.inventory.add('meat', 2); person.inventory.add('sticks', 1);
    person.inventory.add('torch', 1); person.equipment.right = { item: 'torch', count: 1, lit: 20 };
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    expect(sim.order(person, 'craft', { recipeId: 'smoked_meat', buildingId: rack.id })).toBe(false);
    expect(sim.lastRefusal).toBe('You need a lit hearth nearby');
    expect(person.inventory.count('meat')).toBe(2);
  });

  it('uses distance from the rack, not the ordering person', () => {
    const { sim, person, rack, add } = fixture();
    person.inventory.add('fish', 2); person.inventory.add('sticks', 1);
    add('hearth', rack.x + 10, rack.y); person.x = rack.x + 10; person.y = rack.y;
    expect(sim.hearthNear(person.x, person.y, 3)).toBe(true);
    expect(sim.order(person, 'craft', { recipeId: 'smoked_fish', buildingId: rack.id })).toBe(false);
    add('hearth', rack.x + 2, rack.y);
    expect(sim.order(person, 'craft', { recipeId: 'smoked_fish', buildingId: rack.id })).toBe(true);
  });

  it('banks progress when fire is lost, consumes nothing, then resumes the same recipe', () => {
    const { sim, person, rack, add } = fixture();
    const fire = add('hearth', rack.x + 2, rack.y);
    person.inventory.add('meat', 2); person.inventory.add('sticks', 1);
    expect(sim.order(person, 'craft', { recipeId: 'smoked_meat', buildingId: rack.id })).toBe(true);
    for (let tick = 0; tick < 30 && person.bankedFor('craft:smoked_meat') < 3; tick++) sim.step();
    const bank = person.bankedFor('craft:smoked_meat'); expect(bank).toBeGreaterThan(0);
    fire.durability = 0; sim.step();
    expect(person.inventory.count('meat')).toBe(2);
    expect(person.inventory.count('sticks')).toBe(1);
    expect(person.inventory.count('smoked_meat')).toBe(0);
    expect(person.bankedFor('craft:smoked_meat')).toBe(bank);
    expect(sim.interruptions.some(notice => notice.personId === person.id && notice.reason === 'no_fire_near')).toBe(true);
    fire.durability = fire.def.workTicks;
    expect(sim.order(person, 'craft', { recipeId: 'smoked_meat', buildingId: rack.id })).toBe(true);
    for (let tick = 0; tick < 1000 && person.inventory.count('smoked_meat') < 2; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    expect(person.inventory.count('smoked_meat')).toBe(2);
    expect(person.inventory.count('meat')).toBe(0); expect(person.inventory.count('sticks')).toBe(0);
  });

  it('smokes fish and makes both foods more nourishing and durable than drying', () => {
    const { sim, person, rack, add } = fixture(); add('hearth', rack.x + 2, rack.y);
    person.inventory.add('fish', 2); person.inventory.add('sticks', 1);
    expect(sim.order(person, 'craft', { recipeId: 'smoked_fish', buildingId: rack.id })).toBe(true);
    for (let tick = 0; tick < 1000 && person.inventory.count('smoked_fish') < 2; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    expect(person.inventory.count('smoked_fish')).toBe(2);
    for (const kind of ['meat', 'fish']) {
      expect(ITEMS['smoked_' + kind]!.nutrition).toBeGreaterThan(ITEMS['dried_' + kind]!.nutrition);
      expect(ITEMS['smoked_' + kind]!.spoilTicks).toBe(ITEMS['dried_' + kind]!.spoilTicks * 2);
    }
  });
});
