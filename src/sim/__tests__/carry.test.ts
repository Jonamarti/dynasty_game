import { describe, expect, it } from 'vitest';
import { makeConfig } from '../core/Config.ts';
import { canTake, capacityFor, carrySpeedFactor, equipContainer, itemCapacityFor, reconcileCarry, stow } from '../core/Carry.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

function person(): Person {
  return new Person('Carrier', 0, 0, 0, new RNG('carry-test'));
}

describe('M15 phase 11c: hands and fitted containers', () => {
  const config = makeConfig();

  it('limits bare loads by the two hands and by the item being carried', () => {
    const carrier = person();
    expect(capacityFor(carrier, config.carry)).toBe(10);
    expect(itemCapacityFor(carrier, config.carry, 'sticks')).toBe(6);
    expect(canTake(carrier, config.carry, 'sticks', 6)).toBe(true);
    expect(canTake(carrier, config.carry, 'sticks', 7)).toBe(false);
  });

  it('equips a bundle on the shoulder and extends only its accepted class', () => {
    const carrier = person();
    expect(stow(carrier, config.carry, 'bundle', 1)).toBe(1);
    expect(carrier.equipment.shoulder?.item).toBe('bundle');
    expect(capacityFor(carrier, config.carry)).toBe(22);
    expect(itemCapacityFor(carrier, config.carry, 'sticks')).toBe(18);
    expect(itemCapacityFor(carrier, config.carry, 'berries')).toBe(10);
  });

  it('honours the legacy capacity only when a scenario explicitly asks for it', () => {
    const carrier = person();
    const legacy = makeConfig({ carry: { legacyPack: true } });
    expect(capacityFor(carrier, legacy.carry)).toBeGreaterThan(carrier.carryCapacity);
    expect(canTake(carrier, legacy.carry, 'berries', 11)).toBe(true);
  });

  it('puts transfer overflow at the carrier’s feet without losing the goods', () => {
    const carrier = person();
    carrier.inventory.add('sticks', 7);
    const dropped: Array<[string, number]> = [];
    expect(reconcileCarry(carrier, config.carry,
      (_x, _y, itemId, count) => dropped.push([itemId, count]))).toBe(1);
    expect(carrier.inventory.count('sticks')).toBe(6);
    expect(dropped).toEqual([['sticks', 1]]);
  });

  it('slows a fitted sledge to its configured drag speed', () => {
    const carrier = person();
    expect(carrySpeedFactor(carrier, config.carry.sledgeSpeed)).toBe(1);
    equipContainer(carrier, 'sledge');
    expect(carrySpeedFactor(carrier, config.carry.sledgeSpeed)).toBe(0.8);
  });
});
