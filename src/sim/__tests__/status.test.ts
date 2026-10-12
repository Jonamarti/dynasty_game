import { describe, expect, it } from 'vitest';
import { Household, averageRenownByBand } from '../entities/Household.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { statusPressure } from '../ai/Status.ts';
import { sensitivity } from '../ai/Temperament.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { firstImpression } from '../social/SocialSystem.ts';
import { BandRelations } from '../social/BandRelations.ts';
import { validateInventoryTransferState } from '../entities/Item.ts';
import { RECIPES, recipeTechPower } from '../entities/Recipe.ts';
import { TECH } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';

describe('status motive', () => {
  it('rises below the band average and disappears at parity', () => {
    const underdog = new Household('Underdog', 1, 0, 0);
    const leading = new Household('Leading', 2, 0, 0);
    const person = new Person('Ari', 0, 0, 0, new RNG('status-pressure'));
    person.householdId = underdog.id;
    underdog.add(person.id);
    leading.add(2);
    leading.renown = 40;
    const houses = new Map([[underdog.id, underdog], [leading.id, leading]]);
    const averages = averageRenownByBand(houses);
    expect(averages.get(0)).toBe(20);
    const initial = statusPressure(person, underdog, averages.get(0)!);
    expect(initial).toBeCloseTo(20 / 24);
    person.memory.record({ id: 1, type: 'gift', actorId: person.id, targetId: null,
      x: 0, y: 0, tick: 0, magnitude: 1, witnesses: 1, victimBandId: null }, true, 1);
    expect(statusPressure(person, underdog, averages.get(0)!)).toBeLessThan(initial);
    underdog.renown = 40;
    expect(statusPressure(person, underdog, 40)).toBe(0);
    expect(statusPressure(person, null, 40)).toBe(0);
  });

  it('uses the ambition traits and keeps sensitivity within the common band', () => {
    const person = new Person('Ari', 0, 0, 0, new RNG('status-sensitivity'));
    person.traits.greed = 0.5;
    person.traits.aggression = 0.5;
    person.traits.tradition = 0.5;
    expect(sensitivity(person, 'status')).toBe(1);
    person.traits.greed = 1;
    person.traits.aggression = 1;
    person.traits.tradition = 0;
    expect(sensitivity(person, 'status')).toBe(1.4);
    person.traits.greed = 0;
    person.traits.aggression = 0;
    person.traits.tradition = 1;
    expect(sensitivity(person, 'status')).toBe(0.6);
  });

  it('reads status from the exact worn physical unit for motive and first impressions', () => {
    const household = new Household('Ari family', 1, 0, 0);
    const person = new Person('Ari', 0, 0, 1, new RNG('bead-status'));
    person.householdId = household.id;
    household.add(person.id);
    const observer = new Person('Bo', 0, 0, 2, new RNG('bead-observer'));
    const relations = new BandRelations();
    const beforeImpression = firstImpression(observer, person, relations);
    const beforePressure = statusPressure(person, household, 24);
    person.inventory.add('bone_beads', 1);
    const unit = person.inventory.garmentUnitsOf('bone_beads')[0]!;
    expect(changeGarment(person, 'bone_beads', 'wear_garment')).toBeNull();
    expect(person.equipment.head?.unitId).toBe(unit.unitId);
    expect(wornGarmentsOf(person).head).toBe('beads');
    expect(statusPressure(person, household, 24)).toBeCloseTo(beforePressure - 4 / 24);
    expect(firstImpression(observer, person, relations)).toBeCloseTo(beforeImpression + 6);

    const transfer = person.inventory.transferSnapshot();
    expect(transfer.garmentUnits.find(row => row.unitId === unit.unitId)?.status).toBe(4);
    expect(validateInventoryTransferState(JSON.parse(JSON.stringify(transfer))).garmentUnits).toEqual(transfer.garmentUnits);
    expect(changeGarment(person, 'bone_beads', 'take_off_garment')).toBeNull();
    expect(statusPressure(person, household, 24)).toBeCloseTo(beforePressure);
  });

  it('keeps the beads craft behind bone working and spends its physical materials', () => {
    const person = new Person('Ari', 0, 0, 0, new RNG('bead-recipe'));
    expect(TECH.beads.requires).toEqual(['bone_working']);
    expect(RECIPES.bone_beads?.ingredients).toEqual({ bone: 2, rope: 1 });
    expect(recipeTechPower(person, RECIPES.bone_beads!)).toBe(0);
    person.knownTech.add('beads');
    expect(recipeTechPower(person, RECIPES.bone_beads!)).toBeGreaterThan(0);
  });
});
