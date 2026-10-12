import { describe, expect, it } from 'vitest';
import { regionalPhonology, regionalResidentName } from '../world/RegionalNames.ts';

describe('synthetic regional resident names', () => {
  it('repeats from world, geography, region and persistent person identity', () => {
    const name = regionalResidentName('earth-seed', 'earth', 17, 402);
    expect(regionalResidentName('earth-seed', 'earth', 17, 402)).toBe(name);
    expect(name).toMatch(/^[A-Z][a-z]+$/);
  });

  it('derives separate fictional sound inventories by geography and macro-region', () => {
    const earthWest = regionalPhonology('same-seed', 'earth', 17);
    const earthEast = regionalPhonology('same-seed', 'earth', 18);
    const generated = regionalPhonology('same-seed', 'random', 17);
    expect(earthWest).not.toEqual(earthEast);
    expect(earthWest).not.toEqual(generated);
  });

  it('does not make a regional name a technology or identity rule', () => {
    expect(regionalResidentName('same-seed', 'earth', 17, 402))
      .not.toBe(regionalResidentName('same-seed', 'earth', 17, 403));
    expect(regionalResidentName('same-seed', 'earth', 17, 402))
      .not.toBe(regionalResidentName('same-seed', 'earth', 18, 402));
  });
});
