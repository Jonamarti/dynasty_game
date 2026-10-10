import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { equipFor, equipItemInSlot } from '../core/ToolEquipment.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { axeFactor } from '../knowledge/Tech.ts';
import { fromPersonRecord, toPersonRecord } from '../persistence/EntityRecords.ts';

function person(): Person {
  const result = new Person('Tool user', 8, 8, 0, new RNG('tool-equipment'));
  result.age = 30 * 80;
  return result;
}

describe('automatic tool fitting', () => {
  it('releases a formerly fitted bow when a baby leaves no arm for a second-handed weapon', () => {
    const worker = person(); worker.armsTaken = 1;
    worker.knownTech.add('bow'); worker.inventory.add('bow', 1);
    worker.equipment.left = { item: 'bow', count: 1 };
    worker.equipment.right = { item: 'bow', count: 1 };
    const dropped: [string, number][] = [];
    expect(equipFor(worker, 'hunt', DEFAULT_CONFIG.carry,
      (_x, _y, item, count) => dropped.push([item, count])))
      .toEqual({ changed: true, reason: null });
    expect(worker.equipment.left).toBeUndefined();
    expect(worker.equipment.right).toBeUndefined();
    expect(worker.inventory.count('bow')).toBe(0);
    expect(dropped).toEqual([['bow', 1]]);
  });

  it('reserves the baby arm and falls back from a bow to a one-handed spear', () => {
    const worker = person();
    worker.armsTaken = 1;
    worker.knownTech.add('bow'); worker.knownTech.add('spear');
    worker.inventory.add('bow', 1); worker.inventory.add('spear', 1);
    worker.equipment.left = { item: 'bow', count: 1 };
    worker.equipment.right = { item: 'bow', count: 1 };
    const dropped: [string, number][] = [];
    expect(equipFor(worker, 'hunt', DEFAULT_CONFIG.carry,
      (_x, _y, item, count) => dropped.push([item, count]))).toEqual({ changed: true, reason: null });
    expect(Object.values(worker.equipment).filter(Boolean)).toEqual([{ item: 'spear', count: 1 }]);
    expect(dropped).toEqual([['bow', 1]]);
    expect(worker.inventory.count('spear')).toBe(1);
    expect(equipFor(worker, 'hunt', DEFAULT_CONFIG.carry, () => { throw new Error('No second drop'); }))
      .toEqual({ changed: false, reason: null });
  });

  it('releases an extra fitted item even when the desired tool is already in hand', () => {
    const worker = person();
    worker.armsTaken = 1;
    worker.knownTech.add('hafting');
    worker.inventory.add('handaxe', 1); worker.inventory.add('sticks', 1);
    worker.equipment.right = { item: 'handaxe', count: 1 };
    worker.equipment.left = { item: 'sticks', count: 1 };
    const dropped: string[] = [];
    expect(equipFor(worker, 'chop', DEFAULT_CONFIG.carry,
      (_x, _y, item) => dropped.push(item))).toEqual({ changed: true, reason: null });
    expect(worker.equipment.left).toBeUndefined();
    expect(worker.equipment.right?.item).toBe('handaxe');
    expect(dropped).toEqual(['sticks']);
  });

  it('moves a carried axe into a hand without changing possession', () => {
    const worker = person();
    worker.knownTech.add('hafting');
    worker.inventory.add('handaxe', 1);
    worker.equipment.back = { item: 'handaxe', count: 1 };
    const dropped: string[] = [];

    const result = equipFor(worker, 'chop', DEFAULT_CONFIG.carry,
      (_x, _y, item, count) => dropped.push(item + ':' + count));

    expect(result).toEqual({ changed: true, reason: null });
    expect(worker.equipment.right?.item).toBe('handaxe');
    expect(worker.equipment.back).toBeUndefined();
    expect(worker.inventory.count('handaxe')).toBe(1);
    expect(axeFactor(worker, true)).toBeCloseTo(0.5);
    expect(dropped).toEqual([]);
  });

  it('drops a displaced hand item and keeps the fitted container capacity in sync', () => {
    const worker = person();
    worker.knownTech.add('hafting');
    worker.inventory.add('handaxe', 1);
    worker.inventory.add('sticks', 1);
    worker.inventory.add('sledge', 1);
    worker.inventory.add('berries', 10);
    worker.equipment.right = { item: 'sticks', count: 1 };
    worker.equipment.left = { item: 'sledge', count: 1 };
    worker.carryContainerCapacity = 30;
    const dropped: string[] = [];

    equipFor(worker, 'chop', DEFAULT_CONFIG.carry,
      (_x, _y, item, count) => dropped.push(item + ':' + count));

    expect(worker.equipment.left?.item).toBe('handaxe');
    expect(worker.equipment.right?.item).toBe('sticks');
    expect(worker.inventory.count('sticks')).toBe(1);
    expect(worker.inventory.count('sledge')).toBe(0);
    expect(worker.carryContainerCapacity).toBe(0);
    expect(worker.carrying).toBeLessThanOrEqual(worker.carryCapacity);
    expect(dropped.sort()).toEqual(['berries:2', 'sledge:1']);
  });

  it('empties the working hands for foraging and leaves the tool on the ground', () => {
    const worker = person();
    worker.inventory.add('handaxe', 1);
    worker.equipment.right = { item: 'handaxe', count: 1 };
    const dropped: string[] = [];

    const result = equipFor(worker, 'forage', DEFAULT_CONFIG.carry,
      (_x, _y, item, count) => dropped.push(item + ':' + count));

    expect(result.changed).toBe(true);
    expect(worker.equipment.right).toBeUndefined();
    expect(worker.inventory.count('handaxe')).toBe(0);
    expect(dropped).toEqual(['handaxe:1']);
  });

  it('keeps an NPC committed for equipTicks before chopping with the axe', () => {
    const sim = new Simulation({
      seed: 'tool-equipment-action',
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const worker = sim.livingPeople()[0]!;
    for (const [item, count] of worker.inventory.entries()) worker.inventory.remove(item, count);
    worker.needs.hunger = worker.needs.thirst = worker.needs.cold = 0;
    worker.knownTech.add('hafting');
    worker.inventory.add('handaxe', 1);
    const tree = sim.trees.find(candidate => candidate.standing &&
      sim.world.sameRegion(worker.x, worker.y, candidate.x, candidate.y))!;
    worker.x = tree.x;
    worker.y = tree.y;

    expect(sim.order(worker, 'chop', { treeId: tree.id })).toBe(true);
    for (let i = 0; i < 50 &&
      worker.equipment.left?.item !== 'handaxe' && worker.equipment.right?.item !== 'handaxe'; i++) {
      sim.step();
    }

    expect(worker.action).toBe('chop');
    expect(worker.equipment.right?.item ?? worker.equipment.left?.item).toBe('handaxe');
    expect(tree.chopProgress).toBe(0);
    expect(worker.actionTimer).toBe(DEFAULT_CONFIG.carry.equipTicks);

    const restored = fromPersonRecord(JSON.parse(JSON.stringify(toPersonRecord(worker, sim.time.tick))));
    expect(restored.toolChangeAction).toBe('chop');
    expect(restored.toolChangeTicks).toBe(DEFAULT_CONFIG.carry.equipTicks);
    expect(restored.actionTimer).toBe(DEFAULT_CONFIG.carry.equipTicks);
    expect(restored.actionTotal).toBe(0);
    expect(restored.equipment.right?.item ?? restored.equipment.left?.item).toBe('handaxe');
    expect(restored.equipment).not.toBe(worker.equipment);

    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks - 1; i++) sim.step();
    expect(tree.chopProgress).toBe(0);
    sim.step();
    expect(tree.chopProgress).toBeGreaterThan(0);
    expect(axeFactor(worker, true)).toBeCloseTo(0.5);
  });

  it('finishes a forage pull after clearing the axe instead of resetting its work timer', () => {
    const sim = new Simulation({
      seed: 'tool-equipment-forage',
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const worker = sim.livingPeople()[0]!;
    for (const [item, count] of worker.inventory.entries()) worker.inventory.remove(item, count);
    worker.needs.hunger = worker.needs.thirst = worker.needs.cold = 0;
    worker.inventory.add('handaxe', 1);
    worker.equipment.right = { item: 'handaxe', count: 1 };
    const node = sim.nodes.find(candidate => candidate.kind === 'berries' && !candidate.depleted &&
      candidate.amount >= 3)!;
    worker.x = node.x;
    worker.y = node.y;
    expect(sim.order(worker, 'forage', { nodeId: node.id })).toBe(true);
    sim.step();
    expect(worker.equipment.right).toBeUndefined();
    expect(worker.inventory.count('handaxe')).toBe(0);
    expect(worker.actionTimer).toBe(DEFAULT_CONFIG.carry.equipTicks);

    for (let i = 0; i < 80 && worker.inventory.count('berries') === 0; i++) sim.step();
    expect(worker.inventory.count('berries')).toBeGreaterThan(0);
    expect(sim.piles.some(pile => pile.contents.count('handaxe') > 0)).toBe(true);
  });

  it('preserves inventory-based chopping and skips setup in the disabled ablation', () => {
    const sim = new Simulation({
      seed: 'tool-equipment-ablation', carry: { autoEquipTools: false },
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const worker = sim.livingPeople()[0]!;
    for (const [item, count] of worker.inventory.entries()) worker.inventory.remove(item, count);
    worker.needs.hunger = worker.needs.thirst = worker.needs.cold = 0;
    worker.knownTech.add('hafting'); worker.inventory.add('handaxe', 1);
    const tree = sim.trees.find(candidate => candidate.standing &&
      sim.world.sameRegion(worker.x, worker.y, candidate.x, candidate.y))!;
    worker.x = tree.x; worker.y = tree.y;
    expect(sim.order(worker, 'chop', { treeId: tree.id })).toBe(true);
    sim.step();
    expect(tree.chopProgress).toBeGreaterThan(0);
    expect(worker.actionTimer).toBe(0);
    expect(worker.toolChangeAction).toBeNull();
    expect(worker.toolChangeTicks).toBe(0);
    expect(worker.equipment.left).toBeUndefined();
    expect(worker.equipment.right).toBeUndefined();
    expect(axeFactor(worker)).toBe(0.5);
    expect(axeFactor(worker, true)).toBe(1);
  });
});

describe('manual equipment orders', () => {
  function smallSimulation() {
    return new Simulation({
      seed: 'manual-equipment',
      world: { width: 48, height: 48, berryBushes: 12, flintOutcrops: 4, deadwood: 8, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
  }

  it('equips after exactly equipTicks, retains the owned item, and drops a displaced stack', () => {
    const sim = smallSimulation();
    const worker = sim.livingPeople()[0]!;
    worker.isPlayer = true;
    worker.inventory.add('handaxe', 1);
    worker.inventory.add('sticks', 1);
    worker.equipment.right = { item: 'sticks', count: 1 };

    expect(sim.order(worker, 'equip_right', { itemId: 'handaxe' })).toBe(true);
    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks - 1; i++) {
      sim.step();
      expect(worker.equipment.right?.item).toBe('sticks');
    }
    sim.step();
    expect(worker.equipment.right?.item).toBe('handaxe');
    expect(worker.inventory.count('handaxe')).toBe(1);
    expect(worker.inventory.count('sticks')).toBe(0);
    expect(sim.piles.some(pile => pile.contents.count('sticks') === 1)).toBe(true);
    expect(worker.action).toBe('idle');
  });

  it('rejects unowned property, a hand occupied by a baby, two-handed items with one free arm, and a retired actor', () => {
    const sim = smallSimulation();
    const worker = sim.livingPeople()[0]!;
    worker.isPlayer = true;
    worker.inventory.add('handaxe', 1);
    worker.inventory.add('bow', 1);

    expect(sim.order(worker, 'equip_right', { itemId: 'basket' })).toBe(false);
    expect(sim.lastRefusal).toBe('You no longer have that item');
    expect(sim.order(worker, 'equip_left', { itemId: 'handaxe' })).toBe(true);

    worker.clearTarget(); worker.action = 'idle'; worker.order = null;
    worker.armsTaken = 1;
    expect(sim.order(worker, 'equip_left', { itemId: 'bow' })).toBe(false);
    expect(sim.lastRefusal).toContain('hands');
    expect(sim.order(worker, 'equip_right', { itemId: 'bow' })).toBe(false);
    expect(sim.lastRefusal).toContain('hands');
    expect(worker.inventory.count('bow')).toBe(1);

    worker.armsTaken = 0;
    worker.alive = false;
    expect(sim.order(worker, 'equip_right', { itemId: 'handaxe' })).toBe(false);
    expect(sim.lastRefusal).toBe('That owner is no longer alive');
  });

  it('allows the basket on the back and reconciles capacity when its last copy is dropped', () => {
    const sim = smallSimulation();
    const worker = sim.livingPeople()[0]!;
    worker.isPlayer = true;
    worker.inventory.add('basket', 1);
    worker.inventory.add('berries', 20);
    expect(sim.order(worker, 'equip_back', { itemId: 'basket' })).toBe(true);
    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks; i++) sim.step();
    expect(worker.equipment.back?.item).toBe('basket');
    expect(worker.inventory.count('basket')).toBe(1);
    expect(worker.carryContainerCapacity).toBe(24);

    expect(sim.drop(worker, 'basket', 1)).not.toBeNull();
    expect(worker.equipment.back).toBeUndefined();
    expect(worker.carryContainerCapacity).toBe(0);
    expect(worker.carrying).toBeLessThanOrEqual(worker.carryCapacity);
    expect(worker.inventory.count('berries') + sim.piles.reduce((sum, pile) =>
      sum + pile.contents.count('berries'), 0)).toBe(20);
  });

  it('shares the same atomic fitting helper and refuses an incompatible back slot without mutations', () => {
    const worker = person();
    worker.inventory.add('handaxe', 1);
    worker.inventory.add('sticks', 1);
    worker.equipment.right = { item: 'sticks', count: 1 };
    const before = JSON.stringify(worker.equipment);
    const drops: string[] = [];
    expect(equipItemInSlot(worker, 'handaxe', 'back', DEFAULT_CONFIG.carry,
      (_x, _y, item) => drops.push(item))).toBe('wrong_slot');
    expect(JSON.stringify(worker.equipment)).toBe(before);
    expect(worker.inventory.count('handaxe')).toBe(1);
    expect(worker.inventory.count('sticks')).toBe(1);
    expect(drops).toEqual([]);
  });

  it('clears both references when a one-handed item replaces one side of a two-handed tool', () => {
    const worker = person();
    worker.inventory.add('bow', 1);
    worker.inventory.add('handaxe', 1);
    worker.equipment.left = { item: 'bow', count: 1 };
    worker.equipment.right = { item: 'bow', count: 1 };
    const drops: [string, number][] = [];
    expect(equipItemInSlot(worker, 'handaxe', 'left', DEFAULT_CONFIG.carry,
      (_x, _y, item, count) => drops.push([item, count]))).toBeNull();
    expect(worker.equipment.left?.item).toBe('handaxe');
    expect(worker.equipment.right).toBeUndefined();
    expect(worker.inventory.count('bow')).toBe(0);
    expect(worker.inventory.count('handaxe')).toBe(1);
    expect(drops).toEqual([['bow', 1]]);
  });

  it('clears a fitted hand tool when the player drops its last copy', () => {
    const sim = smallSimulation();
    const worker = sim.livingPeople()[0]!;
    worker.inventory.add('handaxe', 1);
    worker.equipment.right = { item: 'handaxe', count: 1 };
    expect(sim.drop(worker, 'handaxe', 1)).not.toBeNull();
    expect(worker.equipment.right).toBeUndefined();
    expect(sim.piles.some(pile => pile.contents.count('handaxe') === 1)).toBe(true);
  });

  it('revalidates possession after the setup timer when ownership changes', () => {
    const sim = smallSimulation();
    const worker = sim.livingPeople()[0]!;
    worker.isPlayer = true;
    worker.inventory.add('handaxe', 1);
    expect(sim.order(worker, 'equip_right', { itemId: 'handaxe' })).toBe(true);
    sim.step();
    expect(worker.toolChangeTicks).toBe(DEFAULT_CONFIG.carry.equipTicks - 1);
    worker.inventory.remove('handaxe', 1);
    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks - 1; i++) sim.step();
    expect(worker.action).toBe('idle');
    expect(worker.equipment.right).toBeUndefined();
    expect(worker.inventory.count('handaxe')).toBe(0);
  });

  it('lets a need interrupt the timer before any equipment changes', () => {
    const sim = smallSimulation();
    const worker = sim.livingPeople()[0]!;
    worker.isPlayer = true;
    worker.inventory.add('handaxe', 1);
    worker.needs.hunger = 100;
    expect(sim.order(worker, 'equip_right', { itemId: 'handaxe' })).toBe(true);
    sim.step();
    expect(worker.action).toBe('idle');
    expect(worker.equipment.right).toBeUndefined();
    expect(worker.inventory.count('handaxe')).toBe(1);
  });
});
