/**
 * Captivity — M11 phase 15d.
 *
 * The three things captivity is: a rope from somebody of another band makes
 * a person that band's (and moves them into it, which is the whole of the
 * forced labour); a captive gets away only when nobody of the captor band is
 * watching; and home takes an escapee back into the household they were
 * taken from, through the adoption door phase 5f built.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import { isCaptive, isEscapee } from '../social/Captivity.ts';
import { isBound } from '../social/Defence.ts';
import { Inventory, type GarmentUnit } from '../entities/Item.ts';
import { changeGarment } from '../core/ToolEquipment.ts';

const SMALL = {
  seed: 'captivity-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 2, peoplePerBand: 4 },
};

function settled(person: Person): void {
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
}

/** A world where somebody of band 0 has just tied up somebody of band 1. */
function aCapture(): { sim: Simulation; captor: Person; captive: Person } {
  const sim = new Simulation(SMALL);
  for (let i = 0; i < 5; i++) sim.step();
  const [captor] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
  const [captive] = sim.livingPeople().filter(p => p.bandId === 1 && !p.isChild);
  settled(captor!);
  captor!.knownTech.add('cordage');
  captor!.inventory.add('rope', 1);
  captive!.x = captor!.x + 1;
  captive!.y = captor!.y;
  captive!.heldBy = captor!.id;
  captive!.heldUntil = sim.time.tick + 200;
  expect(sim.order(captor!, 'bind', { personId: captive!.id })).toBe(true);
  for (let i = 0; i < 30 && captor!.order !== null; i++) {
    settled(captor!);
    sim.step();
  }
  return { sim, captor: captor!, captive: captive! };
}

describe('taking a captive', () => {
  it('makes whoever another band ties up a captive of that band', () => {
    const { captor, captive } = aCapture();
    expect(isCaptive(captive)).toBe(true);
    expect(captive.bandId).toBe(captor.bandId);
    expect(captive.captiveOf).toBe(captor.bandId);
    expect(captive.captiveFrom).toBe(1);
  });

  it('leaves their household where it was, so they head no house here', () => {
    const { sim, captive } = aCapture();
    const household = sim.householdsById.get(captive.householdId!);
    expect(household?.bandId).toBe(1);
  });
});

describe('escaping', () => {
  it('is off while one of the captors is watching, and says so', () => {
    const { sim, captor, captive } = aCapture();
    captive.boundUntil = -9999;
    captive.heldUntil = -9999;
    captor.x = captive.x + 2;
    captor.y = captive.y;
    captor.order = 'rest';
    captor.action = 'rest';
    expect(sim.order(captive, 'escape', {})).toBe(true);
    sim.step();
    expect(isCaptive(captive)).toBe(true);
    expect(sim.interruptions.some(n => n.personId === captive.id && n.reason === 'escape_seen')).toBe(true);
  });

  it('succeeds unwatched, and home takes them back into their own household', () => {
    const { sim, captive } = aCapture();
    captive.boundUntil = -9999;
    captive.heldUntil = -9999;
    const householdId = captive.householdId;
    // Everybody of the captor band far out of sight.
    for (const other of sim.livingPeople()) {
      if (other.bandId === captive.bandId && other.id !== captive.id) {
        other.x = 2;
        other.y = 2;
        other.order = 'rest';
        other.action = 'rest';
      }
    }
    expect(sim.order(captive, 'escape', {})).toBe(true);
    sim.step();
    expect(isCaptive(captive)).toBe(false);
    expect(isEscapee(captive)).toBe(true);

    // Put them on their own doorstep and let a couple of days turn over.
    const home = sim.bands.find(b => b.id === 1)!;
    captive.x = home.homeX + 2;
    captive.y = home.homeY;
    for (let i = 0; i < sim.config.time.ticksPerDay * 2 && captive.bandId !== 1; i++) {
      settled(captive);
      sim.step();
    }
    expect(captive.bandId).toBe(1);
    expect(captive.captiveFrom).toBeNull();
    expect(captive.householdId).toBe(householdId);
  });
});

describe('rescue from a rope', () => {
  it('does not let a bound captive escape by waiting, but another person can untie them', () => {
    const { sim, captive } = aCapture();
    const rescuer = sim.livingPeople().find(person =>
      person.bandId === 1 && !person.isChild)!;
    expect(isBound(captive, sim.time.tick)).toBe(true);

    for (let i = 0; i < 300; i++) {
      settled(captive);
      sim.step();
    }
    expect(isBound(captive, sim.time.tick)).toBe(true);

    rescuer.x = captive.x;
    rescuer.y = captive.y;
    expect(sim.order(rescuer, 'untie', { personId: captive.id })).toBe(true);
    for (let i = 0; i < 30 && rescuer.order !== null; i++) {
      settled(rescuer);
      sim.step();
    }
    expect(isBound(captive, sim.time.tick)).toBe(false);
  });

  it('lets a family ransom a captive with goods', () => {
    const { sim, captor, captive } = aCapture();
    const payer = sim.livingPeople().find(person =>
      person.bandId === 1 && !person.isChild && person.id !== captive.id)!;
    payer.inventory.add('flint', 2);
    payer.x = captive.x;
    payer.y = captive.y;

    expect(sim.ransomCaptive(payer, captive, 'flint', 2)).toBe(true);
    expect(isCaptive(captive)).toBe(false);
    expect(isEscapee(captive)).toBe(true);
    expect(payer.inventory.count('flint')).toBe(0);
    expect(captor.inventory.count('flint')).toBeGreaterThanOrEqual(2);
  });

  it('ransoms a captive for the exact physical garment and keeps its condition', () => {
    const { sim, captor, captive } = aCapture();
    captor.inventory = new Inventory();
    const payer = sim.livingPeople().find(person =>
      person.bandId === 1 && !person.isChild && person.id !== captive.id)!;
    payer.inventory.add('wool_cloak', 1);
    const unit = payer.inventory.garmentUnitsOf('wool_cloak')[0]!;
    payer.inventory.setGarmentUnitCondition(unit.unitId, 0.29, 99);
    expect(changeGarment(payer, 'wool_cloak', 'wear_garment')).toBeNull();
    payer.x = captive.x; payer.y = captive.y;

    expect(sim.ransomCaptive(payer, captive, 'wool_cloak', 1)).toBe(true);
    expect(isCaptive(captive)).toBe(false);
    expect(payer.inventory.count('wool_cloak')).toBe(0);
    expect(payer.equipment.cloak).toBeUndefined();
    expect(captor.inventory.garmentUnitsOf('wool_cloak')).toEqual([
      { unitId: unit.unitId, itemId: 'wool_cloak', wear: 0.29, repairProgress: 99 },
    ]);
  });

  it('does not release a captive or lose a garment if the ransom receiver rejects it', () => {
    class RejectGarmentInventory extends Inventory {
      override putGarmentUnit(unit: GarmentUnit): string { throw new Error(`rejected ${unit.itemId}`); }
    }
    const { sim, captor, captive } = aCapture();
    captor.inventory = new RejectGarmentInventory();
    const payer = sim.livingPeople().find(person =>
      person.bandId === 1 && !person.isChild && person.id !== captive.id)!;
    payer.inventory.add('wool_cloak', 1);
    const unit = payer.inventory.garmentUnitsOf('wool_cloak')[0]!;
    payer.inventory.setGarmentUnitCondition(unit.unitId, 0.29, 99);
    expect(changeGarment(payer, 'wool_cloak', 'wear_garment')).toBeNull();
    payer.x = captive.x; payer.y = captive.y;
    const payerBefore = payer.inventory.transferSnapshot();
    const captorBefore = captor.inventory.transferSnapshot();

    expect(sim.ransomCaptive(payer, captive, 'wool_cloak', 1)).toBe(false);
    expect(payer.inventory.transferSnapshot()).toEqual(payerBefore);
    expect(captor.inventory.transferSnapshot()).toEqual(captorBefore);
    expect(payer.equipment.cloak?.unitId).toBe(unit.unitId);
    expect(isCaptive(captive)).toBe(true);
  });

  it('rejects malformed garment ownership before a ransom can release the captive', () => {
    const { sim, captor, captive } = aCapture();
    captor.inventory = new Inventory();
    const payer = sim.livingPeople().find(person =>
      person.bandId === 1 && !person.isChild && person.id !== captive.id)!;
    payer.inventory.add('wool_cloak', 1);
    const unit = payer.inventory.garmentUnitsOf('wool_cloak')[0]!;
    payer.inventory.setGarmentUnitCondition(unit.unitId, 0.29, 99);
    payer.x = captive.x; payer.y = captive.y;
    (payer.inventory as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits.length = 0;

    expect(sim.ransomCaptive(payer, captive, 'wool_cloak', 1)).toBe(false);
    expect(payer.inventory.count('wool_cloak')).toBe(1);
    expect(captor.inventory.count('wool_cloak')).toBe(0);
    expect(isCaptive(captive)).toBe(true);
  });

  it('makes a captor order obeyed even when the captive has no standing', () => {
    const { sim, captor, captive } = aCapture();
    expect(sim.command(captor, captive, 'rest')).toBe(true);
    expect(captive.order).toBe('rest');
  });
});
