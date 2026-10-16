import { describe, expect, it } from 'vitest';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';
import { nursingPose } from '../WorkAnimation.ts';
import { personLayers, type PersonSpec } from '../../../art/src/people/rig.ts';
import { ArtAtlas } from '../ArtAtlas.ts';

describe('infant care animation', () => {
  it('cycles the adult nursing gesture only during its explicit reached action', () => {
    const adult = new Person('Nursing adult', 4, 4, 0, new RNG('nursing-animation'));
    adult.action = 'nurse'; adult.workedTicks = 1;
    expect([1, 3, 5, 7, 9].map(ticks => {
      adult.workedTicks = ticks;
      return nursingPose(adult, false, 0);
    })).toEqual(['N0', 'N1', 'N2', 'N3', 'N0']);
    expect(nursingPose(adult, true)).toBeNull();
    adult.workedTicks = 0; expect(nursingPose(adult, false)).toBeNull();
    adult.workedTicks = 1; adult.action = 'idle'; expect(nursingPose(adult, false)).toBeNull();
  });

  it('generates a horizontal awake infant while retaining the ordinary person layers', () => {
    const infant: PersonSpec = {
      age: 'infant', sex: 'f', dir: 'E', pose: 'L0', wear: {}, carry: false,
      hair: 'long', beard: false, expr: 'content',
    };
    const lying = personLayers(infant);
    expect(lying.layers.length).toBeGreaterThan(0);
    expect(lying.layers.every(layer => layer.svg.includes('rotate(90 48 48)'))).toBe(true);
    expect(lying.anchors.hr.every(Number.isFinite)).toBe(true);
  });

  it('keys a carried adult without a duplicate generic baby overlay separately', () => {
    const aspect = {
      age: 'adult', sex: 'f', dir: 'S', pose: 'idle', skin: '#c99', hair: '#332211',
      band: '#a33', hairStyle: 'long', beard: false, expression: 'neutral', wear: {},
      carryBaby: true, held: null,
    } as const;
    expect(ArtAtlas.aspectKey({ ...aspect, drawCarriedBaby: false }))
      .not.toBe(ArtAtlas.aspectKey(aspect));
  });
});
