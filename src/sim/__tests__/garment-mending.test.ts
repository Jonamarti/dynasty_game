import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment, planGarmentMending } from '../core/ToolEquipment.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { itemActions } from '../ai/ActionCatalog.ts';

function fixture() {
  const sim = new Simulation({ seed: 'garment-mending', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
  sim.config.light.enabled = false;
  const [person, helper] = sim.livingPeople();
  person!.age = helper!.age = 30 * person!.daysPerYear;
  person!.isPlayer = helper!.isPlayer = true;
  for (const owner of [person!, helper!]) {
    owner.needs.hunger = owner.needs.thirst = owner.needs.cold = owner.needs.fatigue = 0;
    owner.skills.build = 100;
  }
  return { sim, person: person!, helper: helper! };
}

describe('garment mending', () => {
  it('uses a fixed 100-work tailored repair to restore the exact unit fully', () => {
    const { sim, person } = fixture();
    person.knownTech.add('tailoring');
    person.inventory.add('fur_coat', 1);
    person.inventory.add('needle', 1);
    person.inventory.add('thread', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.4, 0);

    expect(sim.order(person, 'mend_garment', { itemId: 'fur_coat' })).toBe(true);
    for (let i = 0; i < 110 && person.order !== null; i++) sim.step();

    expect(person.inventory.garmentUnitsOf('fur_coat')).toEqual([
      { unitId: unit.unitId, itemId: 'fur_coat', wear: 1, repairProgress: 0 },
    ]);
    expect(person.inventory.count('needle')).toBe(0);
    expect(person.inventory.count('thread')).toBe(0);
  });

  it('banks work on the garment across save/load and lets another owner resume by unit id', () => {
    const { sim, person, helper } = fixture();
    person.inventory.add('fur_coat', 1);
    person.inventory.add('rope', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.5, 5);
    expect(sim.order(person, 'mend_garment', { itemId: 'fur_coat' })).toBe(true);
    for (let i = 0; i < 12; i++) sim.step();
    const banked = person.inventory.garmentUnitsOf('fur_coat')[0]!.repairProgress;
    expect(banked).toBeGreaterThan(5);
    person.needs.thirst = 95;
    sim.step();
    expect(person.resume).toMatchObject({
      action: 'mend_garment', garmentUnitId: unit.unitId, garmentMendingMethod: 'cordage',
    });
    expect(person.inventory.garmentUnitsOf('fur_coat')[0]!.repairProgress).toBe(banked);

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.inventory.garmentUnitsOf('fur_coat')[0]).toMatchObject({
      unitId: unit.unitId, wear: 0.5, repairProgress: banked,
    });
    const nextWorker = loaded.peopleById.get(helper.id)!;
    expect(restored.inventory.transferTo(nextWorker.inventory, 'fur_coat', 1)).toBe(1);
    expect(restored.inventory.transferTo(nextWorker.inventory, 'rope', 1)).toBe(1);
    expect(loaded.order(nextWorker, 'mend_garment', {
      itemId: 'fur_coat', garmentUnitId: unit.unitId, garmentMendingMethod: 'cordage',
    })).toBe(true);
    for (let i = 0; i < 120 && nextWorker.order !== null; i++) loaded.step();
    expect(nextWorker.inventory.garmentUnitsOf('fur_coat')).toEqual([
      { unitId: unit.unitId, itemId: 'fur_coat', wear: 0.75, repairProgress: 0 },
    ]);
    expect(nextWorker.inventory.count('rope')).toBe(0);
  });

  it('refuses a worn, pristine, missing, or unowned unit and explains the kit option', () => {
    const { sim, person, helper } = fixture();
    person.inventory.add('fur_coat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    expect(planGarmentMending(person, 'fur_coat')).toBe('garment_not_damaged');
    expect(sim.order(person, 'mend_garment', { itemId: 'fur_coat' })).toBe(false);
    expect(sim.lastRefusal).toContain('does not need mending');
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.5, 0);
    expect(planGarmentMending(person, 'fur_coat')).toBe('mending_tool_missing');
    expect(planGarmentMending(person, 'fur_coat', 'missing-unit')).toBe('garment_not_owned');
    expect(sim.order(person, 'mend_garment', { itemId: 'fur_coat' })).toBe(false);
    expect(sim.lastRefusal).toContain('need rope');
    person.inventory.add('rope', 1);
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    expect(planGarmentMending(person, 'fur_coat', unit.unitId)).toBe('garment_still_worn');
    expect(sim.order(person, 'mend_garment', { itemId: 'fur_coat', garmentUnitId: unit.unitId })).toBe(false);
    expect(planGarmentMending(helper, 'fur_coat', unit.unitId)).toBe('garment_not_owned');
    expect(itemActions(person, 'fur_coat', 0, null, null)
      .find(option => option.id === 'mend_garment')?.enabled).toBe(false);
  });

  it('rolls material consumption back if the exact garment cannot be updated at completion', () => {
    const { sim, person } = fixture();
    person.inventory.add('fur_coat', 1);
    person.inventory.add('rope', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.4, 99.5);
    expect(sim.order(person, 'mend_garment', { itemId: 'fur_coat' })).toBe(true);
    const original = person.inventory.setGarmentUnitCondition.bind(person.inventory);
    person.inventory.setGarmentUnitCondition = (() => false) as typeof person.inventory.setGarmentUnitCondition;

    sim.step();

    person.inventory.setGarmentUnitCondition = original;
    expect(person.inventory.count('rope')).toBe(1);
    expect(person.inventory.garmentUnitsOf('fur_coat')[0]).toMatchObject({
      unitId: unit.unitId, wear: 0.4, repairProgress: 99.5,
    });
  });
});
