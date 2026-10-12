import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { planHideDressing, changeGarment } from '../core/ToolEquipment.ts';
import { wearWornGarments } from '../systems/GarmentSystem.ts';
import { ITEMS } from '../entities/Item.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function fixture() {
  const sim = new Simulation({ seed: 'garment-hide-dressing', world: { width: 48, height: 48 },
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

describe('hide dressing', () => {
  it('is leatherwork-gated, spends one fat, and halves wear on that unit only', () => {
    const { sim, person, helper } = fixture();
    person.inventory.add('fur_coat', 1);
    person.inventory.add('fat', 2);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    expect(planHideDressing(person, 'fur_coat')).toBe('hide_dressing_unknown');
    expect(sim.order(person, 'dress_hide', { itemId: 'fur_coat' })).toBe(false);

    person.knownTech.add('leatherwork');
    person.knownTech.add('hide_dressing');
    expect(sim.order(person, 'craft', { recipeId: 'hide_dressing' })).toBe(false);
    expect(sim.lastRefusal).toContain('Choose a hide garment');
    expect(sim.order(person, 'dress_hide', { itemId: 'fur_coat', garmentUnitId: unit.unitId })).toBe(true);
    for (let i = 0; i < 120 && person.order !== null; i++) sim.step();
    expect(person.inventory.count('fat')).toBe(1);
    expect(person.inventory.garmentUnitsOf('fur_coat')[0]).toMatchObject({
      unitId: unit.unitId, hideDressed: true, dressingProgress: 0,
    });

    person.inventory.add('fur_coat', 1);
    const untreated = person.inventory.garmentUnitsOf('fur_coat').find(candidate => candidate.unitId !== unit.unitId)!;
    expect(untreated.hideDressed).toBeUndefined();
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    // The exact treated unit stays independent from the shared ItemDef.
    expect(person.equipment.torso?.unitId).toBe(unit.unitId);
    expect(ITEMS.fur_coat!.garment!.wearPerDay).toBe(0.005);
    changeGarment(person, 'fur_coat', 'take_off_garment');
    expect(person.inventory.transferTo(helper.inventory, 'fur_coat', 1)).toBe(1);
    // Transfer preserves the treatment bit through the same physical-unit route as condition.
    expect(helper.inventory.garmentUnitsOf('fur_coat')[0]).toMatchObject({
      unitId: unit.unitId, hideDressed: true, dressingProgress: 0,
    });

    const dressed = fixture().person;
    dressed.inventory.add('fur_coat', 1);
    const dressedUnit = dressed.inventory.garmentUnitsOf('fur_coat')[0]!;
    dressed.inventory.setGarmentDressing(dressedUnit.unitId, true, 0);
    changeGarment(dressed, 'fur_coat', 'wear_garment');
    const plain = fixture().person;
    plain.inventory.add('fur_coat', 1);
    changeGarment(plain, 'fur_coat', 'wear_garment');
    wearWornGarments(dressed, 1);
    wearWornGarments(plain, 1);
    expect(dressed.inventory.garmentUnitsOf('fur_coat')[0]!.wear).toBeCloseTo(0.9975);
    expect(plain.inventory.garmentUnitsOf('fur_coat')[0]!.wear).toBeCloseTo(0.995);
  });

  it('banks dressing work on the unit, resumes it after checkpoint and transfers', () => {
    const { sim, person, helper } = fixture();
    person.knownTech.add('leatherwork');
    person.knownTech.add('hide_dressing');
    person.inventory.add('fur_coat', 1);
    person.inventory.add('fat', 2);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentDressing(unit.unitId, false, 20);
    expect(sim.order(person, 'dress_hide', { itemId: 'fur_coat', garmentUnitId: unit.unitId })).toBe(true);
    for (let i = 0; i < 5; i++) sim.step();
    const banked = person.inventory.garmentUnitsOf('fur_coat')[0]!.dressingProgress!;
    expect(banked).toBeGreaterThan(20);
    person.needs.thirst = 100;
    sim.step();
    expect(person.resume).toMatchObject({ action: 'dress_hide', garmentUnitId: unit.unitId });

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.inventory.garmentUnitsOf('fur_coat')[0]).toMatchObject({
      unitId: unit.unitId, hideDressed: false, dressingProgress: banked,
    });
    const nextWorker = loaded.peopleById.get(helper.id)!;
    nextWorker.knownTech.add('leatherwork');
    nextWorker.knownTech.add('hide_dressing');
    expect(restored.inventory.transferTo(nextWorker.inventory, 'fur_coat', 1)).toBe(1);
    expect(restored.inventory.transferTo(nextWorker.inventory, 'fat', 1)).toBe(1);
    expect(loaded.order(nextWorker, 'dress_hide', { itemId: 'fur_coat', garmentUnitId: unit.unitId })).toBe(true);
    for (let i = 0; i < 120 && nextWorker.order !== null; i++) loaded.step();
    expect(nextWorker.inventory.count('fat')).toBe(0);
    expect(nextWorker.inventory.garmentUnitsOf('fur_coat')[0]).toMatchObject({
      unitId: unit.unitId, hideDressed: true, dressingProgress: 0,
    });
  });

  it('rejects wool, already treated garments, and missing grease with a visible reason', () => {
    const { sim, person } = fixture();
    person.knownTech.add('leatherwork');
    person.knownTech.add('hide_dressing');
    person.inventory.add('wool_cloak', 1);
    expect(planHideDressing(person, 'wool_cloak')).toBe('unknown_garment');
    person.inventory.add('fur_hat', 1);
    expect(sim.order(person, 'dress_hide', { itemId: 'fur_hat' })).toBe(false);
    expect(sim.lastRefusal).toContain('one fat');
    person.inventory.add('fat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_hat')[0]!;
    person.inventory.setGarmentDressing(unit.unitId, true, 0);
    expect(planHideDressing(person, 'fur_hat')).toBe('garment_already_dressed');
  });
});
