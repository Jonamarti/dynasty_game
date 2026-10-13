import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { planGarmentDye } from '../core/ToolEquipment.ts';
import { Inventory, validateInventoryTransferState } from '../entities/Item.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function fixture(seed = 'garment-dyeing') {
  const sim = new Simulation({ seed, world: { width: 64, height: 64 }, population: { bands: 1, peoplePerBand: 2 },
    carry: { legacyPack: true } });
  sim.config.light.enabled = false;
  const [person, helper] = sim.livingPeople();
  for (const owner of [person!, helper!]) {
    owner.age = 30 * owner.daysPerYear;
    owner.isPlayer = true;
    owner.needs.hunger = owner.needs.thirst = owner.needs.cold = owner.needs.fatigue = 0;
  }
  return { sim, person: person!, helper: helper! };
}

describe('physical red-ochre garment dyeing', () => {
  it('spawns finite exposed pigment deposits deterministically on rocky uplands', () => {
    const first = fixture('red-ochre-deposits').sim;
    const second = fixture('red-ochre-deposits').sim;
    const locate = (sim: Simulation) => sim.nodes.filter(node => node.kind === 'red_ochre')
      .map(({ x, y, amount }) => [x, y, amount]);
    expect(locate(first)).toEqual(locate(second));
    expect(first.nodes.filter(node => node.kind === 'red_ochre')).toHaveLength(5);
    expect(first.nodes.filter(node => node.kind === 'red_ochre').every(node =>
      ['rock', 'hills'].includes(first.world.biomeAt(node.x, node.y)))).toBe(true);
  });

  it('consumes real pigment into one unit and preserves dye/status through transfer and checkpoint', () => {
    const { sim, person, helper } = fixture();
    person.knownTech.add('dyeing');
    person.inventory.add('fur_coat', 2);
    person.inventory.add('red_ochre', 1);
    const [untouched, selected] = person.inventory.garmentUnitsOf('fur_coat');
    expect(planGarmentDye(person, 'fur_coat', selected!.unitId)).toEqual({ unitId: selected!.unitId });
    expect(sim.order(person, 'dye_garment', { itemId: 'fur_coat', garmentUnitId: selected!.unitId })).toBe(true);
    for (let tick = 0; tick < 7; tick++) sim.step();
    expect(person.workedTicks).toBe(7);
    expect(person.cycleProgress).toBe(0.875);
    expect(person.inventory.count('red_ochre')).toBe(1);
    expect(person.inventory.garmentUnitsOf('fur_coat').find(unit => unit.unitId === selected!.unitId)).not.toHaveProperty('dye');
    sim.step();

    expect(person.inventory.count('red_ochre')).toBe(0);
    const physicalUnits = person.inventory.garmentUnitsOf('fur_coat');
    expect(physicalUnits).toHaveLength(2);
    expect(physicalUnits.find(unit => unit.unitId === untouched!.unitId)).not.toHaveProperty('dye');
    expect(physicalUnits.find(unit => unit.unitId === selected!.unitId)).toMatchObject({ dye: 'ochre', status: 1 });
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.inventory.garmentUnitsOf('fur_coat')).toEqual(person.inventory.garmentUnitsOf('fur_coat'));
    const dyed = restored.inventory.garmentUnitsOf('fur_coat').find(unit => unit.unitId === selected!.unitId)!;
    const moved = restored.inventory.takeGarmentUnit('fur_coat', new Set([untouched!.unitId]));
    expect(moved).toEqual(dyed);
    const nextOwner = loaded.peopleById.get(helper.id)!;
    nextOwner.inventory.putGarmentUnit(moved!);
    expect(nextOwner.inventory.garmentUnitsOf('fur_coat')[0]).toMatchObject({ dye: 'ochre', status: 1 });
  });

  it('requires dyeing knowledge and pigment, refuses recolouring, and validates the persisted pigment id', () => {
    const { person } = fixture();
    person.inventory.add('fur_coat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    expect(planGarmentDye(person, 'fur_coat')).toBe('dyeing_unknown');
    person.knownTech.add('dyeing');
    expect(planGarmentDye(person, 'fur_coat')).toBe('dyeing_pigment_missing');
    person.inventory.add('red_ochre', 1);
    const beforeDyeVersion = person.inventory.version;
    expect(person.inventory.setGarmentUnitDye(unit.unitId, 'ochre')).toBe(true);
    expect(person.inventory.version).toBe(beforeDyeVersion + 1);
    expect(planGarmentDye(person, 'fur_coat')).toBe('garment_already_dyed');

    const malformed = new Inventory();
    malformed.add('fur_coat', 1);
    const record = malformed.transferSnapshot();
    expect(() => validateInventoryTransferState({ ...record,
      garmentUnits: [{ ...record.garmentUnits[0], dye: 'blue' }],
    })).toThrow(/supported pigment/);
  });
});
