import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment, planGarmentMending } from '../core/ToolEquipment.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { itemActions } from '../ai/ActionCatalog.ts';
import { lastScores } from '../ai/Brain.ts';
import type { Brain } from '../ai/Brain.ts';

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
  it('lets an unhurried adult NPC choose an owned damaged unit and its available method', () => {
    const { sim, person } = fixture();
    person.isPlayer = false;
    person.inventory.add('fur_coat', 1);
    person.inventory.add('rope', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.4, 12);
    sim.time.tick = Math.floor(sim.config.time.ticksPerDay / 2);
    lastScores.delete(person.id);
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    vi.spyOn(brain, 'score').mockImplementation((actor, context) => {
      const result = score(actor, context);
      return actor === person
        ? { ...result, scores: result.scores.filter(row => row.id === 'mend_garment') }
        : result;
    });

    for (let i = 0; i < 40 && !lastScores.has(person.id); i++) sim.step();

    const repairScore = lastScores.get(person.id)?.find(row => row.id === 'mend_garment')?.score ?? 0;
    expect(repairScore).toBeGreaterThan(0);
    expect(person.action).toBe('mend_garment');
    expect(person.targetItemId).toBe('fur_coat');
    expect(person.targetGarmentUnitId).toBe(unit.unitId);
    expect(person.targetGarmentMendingMethod).toBe('cordage');
    expect(person.inventory.garmentUnitsOf('fur_coat')[0]!.repairProgress).toBeGreaterThan(12);
  });

  it('does not offer autonomous repairs to the player, a worn garment, or a pressured NPC', () => {
    const { sim, person } = fixture();
    person.inventory.add('fur_coat', 1);
    person.inventory.add('rope', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.4, 0);
    lastScores.delete(person.id);
    sim.step();
    expect(lastScores.get(person.id)?.some(row => row.id === 'mend_garment') ?? false).toBe(false);

    person.isPlayer = false;
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    lastScores.delete(person.id);
    for (let i = 0; i < 40 && !lastScores.has(person.id); i++) sim.step();
    expect(lastScores.get(person.id)?.some(row => row.id === 'mend_garment') ?? false).toBe(false);

    expect(changeGarment(person, 'fur_coat', 'take_off_garment')).toBeNull();
    person.needs.thirst = 90;
    lastScores.delete(person.id);
    for (let i = 0; i < 40 && !lastScores.has(person.id); i++) sim.step();
    expect(lastScores.get(person.id)?.some(row => row.id === 'mend_garment') ?? false).toBe(false);
  });

  it('does not offer autonomous repairs to a child', () => {
    const { sim, person } = fixture();
    person.isPlayer = false;
    person.age = 13 * person.daysPerYear;
    expect(person.isChild).toBe(true);
    person.inventory.add('fur_coat', 1);
    person.inventory.add('rope', 1);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.4, 0);
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    let childScores: string[] | null = null;
    vi.spyOn(brain, 'score').mockImplementation((actor, context) => {
      const result = score(actor, context);
      if (actor === person) childScores = result.scores.map(row => row.id);
      return result;
    });

    for (let i = 0; i < 40 && childScores === null; i++) sim.step();

    expect(childScores).not.toBeNull();
    expect(childScores).not.toContain('mend_garment');
  });

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
