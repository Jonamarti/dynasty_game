import { describe, expect, it } from 'vitest';
import { waterColors } from '../WaterColor.ts';

describe('water depth palette', () => {
  it('marks both traversal boundaries with distinct water colours', () => {
    const shallow = waterColors(0.001, 0.002, 0.008);
    const swimming = waterColors(0.002, 0.002, 0.008);
    const deep = waterColors(0.008, 0.002, 0.008);
    expect(shallow).not.toEqual(swimming);
    expect(swimming).not.toEqual(deep);
    expect(waterColors(0.0079, 0.002, 0.008)).toEqual(swimming);
    expect(waterColors(2, 0.002, 0.008)).toEqual(deep);
  });
});
