import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Inventory, ITEMS } from '../entities/Item.ts';
import { ComarcaInventoryTransfer } from '../world/ComarcaInventoryTransfer.ts';
import { RATION_NUTRITION } from '../world/ResourceProfile.ts';
import { TECH, techsOfWeb, webOf } from '../knowledge/Tech.ts';

describe('pemmican and the populated preservation web', () => {
  it('pounds actual dried meat and fat without a station, consumes inputs once, and is edible', () => {
    const sim = new Simulation({ seed: 'pemmican', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    sim.possessFirst(); const person = sim.player!;
    person.knownTech.add('pemmican'); person.skills.cook = 100;
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('dried_meat', 2); person.inventory.add('fat', 1);
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    expect(sim.order(person, 'craft', { recipeId: 'pemmican' })).toBe(true);
    for (let tick = 0; tick < 1000 && person.inventory.count('pemmican') < 2; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    expect(person.inventory.count('pemmican')).toBe(2);
    expect(person.inventory.count('dried_meat')).toBe(0); expect(person.inventory.count('fat')).toBe(0);
    person.needs.hunger = 80;
    expect(sim.order(person, 'eat', { itemId: 'pemmican' })).toBe(true);
    for (let tick = 0; tick < 30 && person.inventory.count('pemmican') === 2; tick++) sim.step();
    expect(person.inventory.count('pemmican')).toBe(1); expect(person.needs.hunger).toBeLessThan(30);
  });

  it('keeps typed pemmican and exact nutrition through off-map JSON ration consumption', () => {
    const pack = new Inventory(); pack.add('pemmican', 2);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'pack', inventory: pack }]);
    expect(transfer.nutrition()).toBe(120);
    const loaded = ComarcaInventoryTransfer.fromRecord(JSON.parse(JSON.stringify(transfer.toRecord())), () => pack);
    const eaten = loaded.consumeRations(1, [{ sourceId: 'pack', itemId: 'pemmican' }]);
    expect(eaten.consumedNutrition).toBeCloseTo(RATION_NUTRITION);
    expect(eaten.removals[0]?.itemId).toBe('pemmican');
    loaded.restore();
    expect(pack.count('pemmican')).toBeCloseTo(2 - RATION_NUTRITION / 60);
    expect(ITEMS.pemmican!.spoilTicks).toBeGreaterThan(ITEMS.smoked_meat!.spoilTicks);
  });

  it('opens preservation only with two real dependent nodes while keeping its gate in main', () => {
    expect(TECH.preserving.opens).toBe('preservation'); expect(webOf('preserving')).toBe('main');
    expect(techsOfWeb('preservation')).toContain('smoking');
    expect(techsOfWeb('preservation')).toContain('pemmican');
    for (const tech of ['smoking', 'pemmican'] as const) expect(TECH[tech].requires).toContain('preserving');
  });
});
