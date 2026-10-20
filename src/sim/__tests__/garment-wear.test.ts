import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { protectionOf, warmthFrom } from '../knowledge/Tech.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { wearWornGarments } from '../systems/GarmentSystem.ts';
import { ITEMS, type GarmentUnit } from '../entities/Item.ts';

function fixture() {
  const sim = new Simulation({ seed: 'garment-wear', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
  const person = sim.livingPeople()[0]!;
  person.age = 30 * person.daysPerYear;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}

describe('garment wear', () => {
  it('wears only the exact equipped unit once per day and reduces its insulation', () => {
    const { sim, person } = fixture();
    person.inventory.add('fur_coat', 2);
    const [worn, spare] = person.inventory.garmentUnitsOf('fur_coat');
    person.inventory.setGarmentUnitCondition(worn!.unitId, 0.8, 12);
    person.inventory.setGarmentUnitCondition(spare!.unitId, 0.6, 34);
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(0.32);
    sim.time.tick = sim.config.time.ticksPerDay - 1;

    sim.step();

    expect(person.inventory.garmentUnitsOf('fur_coat')).toEqual([
      { unitId: worn!.unitId, itemId: 'fur_coat', wear: 0.795, repairProgress: 12 },
      { unitId: spare!.unitId, itemId: 'fur_coat', wear: 0.6, repairProgress: 34 },
    ]);
    expect(warmthFrom(person)).toBeCloseTo(0.318);
  });

  it('scales garment armour with the condition of the worn unit', () => {
    const { person } = fixture();
    person.knownTech.add('leatherwork');
    person.inventory.add('hide_armour', 1);
    const unit = person.inventory.garmentUnitsOf('hide_armour')[0]!;
    expect(changeGarment(person, 'hide_armour', 'wear_garment')).toBeNull();
    expect(protectionOf(person, 'torso')).toBeCloseTo(0.5);
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.4, 0);
    expect(protectionOf(person, 'torso')).toBeCloseTo(0.2);
  });

  it('destroys a ruined worn unit and clears its layer reference', () => {
    const { sim, person } = fixture();
    person.inventory.add('fur_coat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.004, 0);
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    sim.time.tick = sim.config.time.ticksPerDay - 1;

    sim.step();

    expect(person.inventory.count('fur_coat')).toBe(0);
    expect(person.inventory.garmentUnitsOf('fur_coat')).toEqual([]);
    expect(person.equipment.torso).toBeUndefined();
    expect(person.chronicle.some(entry => entry.text.includes('wore out'))).toBe(true);
  });

  it('continues daily wear during off-map traveller ticks and preserves it through checkpoints', () => {
    const { sim, person } = fixture();
    person.inventory.add('fur_coat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.7, 51);
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    sim.time.tick = sim.config.time.ticksPerDay - 1;

    sim.advanceJourneyTick([person.id], sim.time.tick + 1);

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.inventory.garmentUnitsOf('fur_coat')).toEqual([
      { unitId: unit.unitId, itemId: 'fur_coat', wear: 0.695, repairProgress: 51 },
    ]);
    expect(restored.equipment.torso?.unitId).toBe(unit.unitId);
  });

  it('rejects inconsistent physical ownership before aging a worn unit', () => {
    const { person } = fixture();
    person.inventory.add('fur_coat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    (person.inventory as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits.length = 0;

    expect(() => wearWornGarments(person, 1)).toThrow(/garment units do not match garment counts/);
    expect(person.inventory.count('fur_coat')).toBe(1);
    expect(person.equipment.torso?.unitId).toBe(unit.unitId);
  });

  it('keeps every declared daily wear rate finite and bounded', () => {
    const garmentDefs = Object.values(ITEMS).filter(item => item.garment);
    expect(garmentDefs.length).toBeGreaterThan(0);
    for (const item of garmentDefs) {
      expect(Number.isFinite(item.garment!.wearPerDay)).toBe(true);
      expect(item.garment!.wearPerDay).toBeGreaterThan(0);
      expect(item.garment!.wearPerDay).toBeLessThanOrEqual(1);
    }
  });

  it('breaks a continuously worn pristine unit at the documented 200-day threshold', () => {
    const { person } = fixture();
    person.inventory.add('fur_coat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    for (let day = 0; day < 199; day++) expect(person.inventory.applyGarmentWear(unit.unitId, 0.005)).toBe('worn');
    expect(person.inventory.garmentUnitsOf('fur_coat')[0]?.wear).toBeCloseTo(0.005);
    expect(person.inventory.applyGarmentWear(unit.unitId, 0.005)).toBe('broken');
    expect(person.inventory.count('fur_coat')).toBe(0);
  });
});
