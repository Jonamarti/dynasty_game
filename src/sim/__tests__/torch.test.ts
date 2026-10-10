import { describe, expect, it } from 'vitest';
import { igniteTorch, advanceTorchBurn, torchInHand } from '../core/Torch.ts';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { equipFor, manualEquipRefusal } from '../core/ToolEquipment.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { toCompactRecord, fromCompactRecord, type CompactPerson } from '../compact/CompactPerson.ts';
import { RNG } from '../core/RNG.ts';

function personFixture() {
  const sim = new Simulation({ seed: 'torch-fuel', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 } });
  return sim.livingPeople()[0]!;
}

describe('carried torch fuel', () => {
  it('burns the same fuel outside the active map through sliced JSON advances', () => {
    const person = personFixture(); person.inventory.add('torch', 1);
    expect(igniteTorch(person, 'torch', 3)).toBeNull();
    const compact: CompactPerson = { person, lastAdvancedTick: 0, epoch: 1, rng: new RNG('torch-compact'),
      goal: { kind: 'idle', since: 0, target: null }, intake: null };
    const body = new CompactBody({ needs: DEFAULT_CONFIG.needs, time: DEFAULT_CONFIG.time, nextEventId: () => 1 });
    body.advance(compact, 2);
    expect(person.equipment.left?.lit).toBe(1);
    const loaded = fromCompactRecord(JSON.parse(JSON.stringify(toCompactRecord(compact))));
    body.advance(loaded, 4);
    expect(loaded.person.inventory.count('torch')).toBe(0);
    expect(loaded.person.equipment.left).toBeUndefined();
  });
  it('cannot reset a burning unit by dropping or giving it, but can drop a spare', () => {
    const sim = new Simulation({ seed: 'torch-transfer', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const [carrier, receiver] = sim.livingPeople();
    carrier!.inventory.add('torch', 2);
    expect(igniteTorch(carrier!, 'torch', 17)).toBeNull();
    const pile = sim.drop(carrier!, 'torch', 2);
    expect(pile!.contents.count('torch')).toBe(1);
    expect(carrier!.inventory.count('torch')).toBe(1);
    expect(carrier!.equipment.left?.lit).toBe(17);
    expect(sim.drop(carrier!, 'torch', 1)).toBeNull();
    expect(sim.lastRefusal).toContain('burning torch');
    expect(sim.handOver(carrier!, receiver!, 'torch', 1)).toBe(0);
    expect(carrier!.equipment.left?.lit).toBe(17);
    expect(receiver!.inventory.count('torch')).toBe(0);
  });
  it('lights in a free hand, can be relit with remaining fuel, and is consumed at zero', () => {
    const person = personFixture();
    person.inventory.add('torch', 1);
    person.equipment.right = { item: 'handaxe', count: 1 };
    expect(igniteTorch(person, 'torch', 3)).toBeNull();
    expect(torchInHand(person)).toMatchObject({ slot: 'left', item: 'torch', fuel: 3 });
    advanceTorchBurn(person);
    advanceTorchBurn(person);
    expect(person.equipment.left?.lit).toBe(1);
    expect(igniteTorch(person, 'torch', 3)).toBe('torch_already_lit');
    advanceTorchBurn(person);
    expect(person.equipment.left).toBeUndefined();
    expect(person.inventory.count('torch')).toBe(0);
    expect(person.equipment.right?.item).toBe('handaxe');
  });

  it('preserves a cold torch when both hands are occupied and relights an extinguished one', () => {
    const person = personFixture();
    person.inventory.add('fat_torch', 1);
    person.equipment.left = { item: 'spear', count: 1 };
    person.equipment.right = { item: 'handaxe', count: 1 };
    expect(igniteTorch(person, 'fat_torch', 6)).toBe('no_free_hand');
    expect(person.inventory.count('fat_torch')).toBe(1);
    delete person.equipment.right;
    person.equipment.right = { item: 'fat_torch', count: 1, lit: 0 };
    expect(igniteTorch(person, 'fat_torch', 6)).toBeNull();
    expect(person.equipment.right?.lit).toBe(6);
  });

  it('does not light, warm, or keep a ghost torch without an owned item or usable hand', () => {
    const person = personFixture();
    person.equipment.left = { item: 'torch', count: 1, lit: 0 };
    expect(torchInHand(person)).toBeNull();
    expect(warmthFrom(person)).toBe(0);
    expect(igniteTorch(person, 'torch', 20)).toBe('torch_not_owned');

    person.inventory.add('torch', 1);
    person.armsTaken = 1;
    expect(torchInHand(person)).toBeNull();
    expect(igniteTorch(person, 'torch', 20)).toBe('no_free_hand');
    expect(person.equipment.left?.lit).toBe(0);
  });

  it('preserves a lit torch while equipping another tool, and blocks manual replacement', () => {
    const person = personFixture();
    person.inventory.add('torch', 1);
    person.inventory.add('handaxe', 1);
    person.knownTech.add('hafting');
    person.equipment.left = { item: 'torch', count: 1, lit: 17 };
    expect(equipFor(person, 'chop', DEFAULT_CONFIG.carry, () => {
      throw new Error('The lit torch must not be dropped');
    })).toEqual({ changed: true, reason: null });
    expect(person.equipment.left).toMatchObject({ item: 'torch', lit: 17 });
    expect(person.equipment.right?.item).toBe('handaxe');
    expect(manualEquipRefusal(person, 'handaxe', 'left')).toBe('hands_full');
    expect(manualEquipRefusal(person, 'handaxe', 'right')).toBe('already_equipped');
  });

  it('refuses to replace a flame when a baby occupies the other arm', () => {
    const person = personFixture();
    person.inventory.add('torch', 1); person.inventory.add('handaxe', 1);
    person.knownTech.add('hafting'); person.armsTaken = 1;
    person.equipment.right = { item: 'torch', count: 1, lit: 17 };
    expect(equipFor(person, 'chop', DEFAULT_CONFIG.carry, () => {
      throw new Error('Fuel must stay in the usable hand');
    })).toEqual({ changed: false, reason: 'hands_full' });
    expect(person.equipment.right?.lit).toBe(17);
  });

  it('requires a lit hearth and takes three interruptible ticks to ignite, then burns on sim time', () => {
    const sim = new Simulation({ seed: 'torch-action', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    sim.possessFirst();
    const person = sim.player!;
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    person.inventory.add('torch', 1);
    expect(sim.order(person, 'light_torch', { itemId: 'torch' })).toBe(false);
    expect(sim.lastRefusal).toBe('You need a lit hearth nearby');
    sim.step();
    expect(person.equipment.left?.lit).toBeUndefined();

    const hearth = new Building(BUILDINGS.hearth!, Math.floor(person.x), Math.floor(person.y), person.bandId, sim.ids);
    hearth.complete = true;
    sim.buildings.push(hearth);
    sim.buildingsById.set(hearth.id, hearth);
    sim.buildingHash.insert(hearth);
    expect(sim.order(person, 'light_torch', { itemId: 'torch' })).toBe(true);
    sim.step();
    sim.step();
    expect(person.equipment.left?.lit).toBeUndefined();
    sim.step();
    expect(person.equipment.left?.lit).toBe(20);
    sim.step();
    expect(person.equipment.left?.lit).toBe(19);
    const saved = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    const loaded = Simulation.fromCheckpointRecord(saved);
    expect(loaded.peopleById.get(person.id)?.equipment.left?.lit).toBe(19);
  });
});
