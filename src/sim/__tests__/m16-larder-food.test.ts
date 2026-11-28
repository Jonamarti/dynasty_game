import { describe, expect, it, vi } from 'vitest';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { withdrawableLarderFood } from '../ai/LarderFood.ts';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { makeConfig } from '../core/Config.ts';
import { canTake, capacityFor, itemCapacityFor } from '../core/Carry.ts';

function fixture() {
  const person = new Person('food', 10, 10, 1, new RNG('larder'));
  const config = makeConfig();
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id,count);
  const store = new Building(BUILDINGS.storage_pit!, 10, 10, 1);
  store.complete = true;
  store.durability = store.def.workTicks;
  const buildings = new Map([[store.id, store]]);
  const people = new Map([[person.id, person]]);
  const food = (s = store) => withdrawableLarderFood(person, s, config.carry, people, buildings);
  return { person, config, store, buildings, people, food };
}

describe('M16: withdrawable food, not merely a stocked larder', () => {
  it('skips an unsafe food only when the actor knows it is poisonous', () => {
    const f = fixture();
    f.store.store.add('toxic_berries', 3);
    f.person.knownTech.delete('plant_lore');
    expect(f.food()).toBe('toxic_berries');
    f.person.knownTech.add('plant_lore');
    expect(f.food()).toBeNull();
    f.store.store.add('berries', 3);
    expect(f.food()).toBe('berries');
  });

  it('does not send a person with full hands to collect food', () => {
    const f = fixture();
    f.store.store.add('berries', 6);
    f.person.inventory.add('sticks', Math.max(f.person.carryCapacity, capacityFor(f.person, f.config.carry)));
    expect(f.food()).toBeNull();
    expect(f.store.store.count('berries')).toBe(6);
  });

  it('uses the next viable stack when the highest nutrition stack cannot fit', () => {
    const f = fixture(), p = f.person;
    const cap = itemCapacityFor(p, f.config.carry, 'apple');
    p.inventory.add('apple', cap);
    f.store.store.add('apple', 6);
    f.store.store.add('berries', 6);
    expect(canTake(p, f.config.carry, 'apple', 1)).toBe(false);
    expect(canTake(p, f.config.carry, 'berries', 1)).toBe(true);
    expect(f.food()).toBe('berries');
  });

  it('rejects unfinished and ruined buildings and nonfood stocks', () => {
    const f = fixture();
    f.store.store.add('sticks', 6);
    expect(f.food()).toBeNull();
    f.store.store.add('berries', 3);
    f.store.complete = false;
    expect(f.food()).toBeNull();
    f.store.complete = true; f.store.durability = 0;
    expect(f.food()).toBeNull();
  });

  it('does not confuse edible fat with lamp fuel when scoring a real larder trip', () => {
    const sim = new Simulation({ seed: 'larder-food-contract',
      world: { width:48, height:48, predators:0, gameHerds:0 },
      population: { bands:1, peoplePerBand:4 } });
    const person = sim.livingPeople().find(p => !p.isChild)!;
    const brain = (sim as unknown as { brain:Brain }).brain;
    const originalScore = brain.score.bind(brain);
    let context: BrainContext | undefined;
    const spy = vi.spyOn(brain, 'score').mockImplementation((p, ctx) => {
      if (p === person) context = ctx;
      return originalScore(p, ctx);
    });
    try {
      for (let i=0; i<sim.config.thinkInterval*2 && !context; i++) sim.step();
    } finally { spy.mockRestore(); }
    const captured = context as BrainContext | undefined;
    if (!captured) throw new Error('fixture did not score the actor');
    person.forgetPlans(); person.action='idle'; person.order=null;
    for (const [id,count] of person.inventory.entries()) person.inventory.remove(id,count);
    person.needs.hunger=80; person.needs.thirst=person.needs.cold=person.needs.fatigue=0;
    person.knownTech.add('plant_lore');
    const store = new Building(BUILDINGS.storage_pit!,person.x-0.5,person.y-0.5,person.bandId,sim.ids);
    store.complete=true; store.durability=store.def.workTicks;
    store.store.add('toxic_berries',6); store.store.add('fat',6);
    const ctx:BrainContext={...captured, buildings:[store],
      buildingsById:new Map([...captured.buildingsById,[store.id,store]])};
    expect(canTake(person,sim.config.carry,'fat',1)).toBe(true);
    const scored=brain.score(person,ctx);
    expect(scored.found.larderTarget).toBe(store);
    expect(scored.found.lampFatStore).toBeNull();
    expect(scored.found.takeItemId).toBe('fat');
    expect(scored.scores.some(r=>r.id==='take')).toBe(true);
    (brain as unknown as { setup(p:Person,a:string,c:BrainContext,f:typeof scored.found):void })
      .setup(person,'take',ctx,scored.found);
    expect(person.targetBuildingId).toBe(store.id);
    expect(person.targetItemId).toBe('fat');
    store.store.remove('fat',6);
    person.forgetPlans(); person.action='idle';
    const unavailable=brain.score(person,ctx);
    expect(unavailable.found.larderTarget).toBeNull();
    expect(unavailable.scores.some(r=>r.id==='take')).toBe(false);
  });
});
