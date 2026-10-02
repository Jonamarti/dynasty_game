import { describe, expect, it } from 'vitest';
import { decodePackBits } from '../../../tools/worlddata/beck.ts';
import { parseElevationCsv, sampleClimate } from '../../../tools/worlddata/build.ts';

describe('world data reduction', () => {
  it('decodes PackBits literal, repeat, and no-op runs', () => {
    expect(Array.from(decodePackBits(Uint8Array.from([2, 4, 5, 6, 254, 7, 128, 0, 9]), 7)))
      .toEqual([4, 5, 6, 7, 7, 7, 9]);
  });

  it('maps NOAA point samples to north-first region rows', () => {
    const rows = ['latitude,longitude,z', 'degrees_north,degrees_east,meters'];
    for (let y = 47; y >= 0; y--) {
      const latitude = (-88.125 + y * 3.75).toFixed(3);
      for (let x = 0; x < 96; x++) rows.push(`${latitude},${(1.875 + x * 3.75).toFixed(3)},${y * 100 + x}`);
    }
    const grid = parseElevationCsv(rows.join('\n'));
    expect(grid[0]).toBe(4700);
    expect(grid[95]).toBe(4795);
    expect(grid[47 * 96]).toBe(0);
  });

  it('samples a global climate raster at region centres', () => {
    const codes = new Uint8Array(720 * 360);
    for (let y = 0; y < 360; y++) for (let x = 0; x < 720; x++) codes[y * 720 + x] = (y % 30) + 1;
    const sample = sampleClimate({ width: 720, height: 360, codes, originLongitude: -180, originLatitude: 90, pixelSize: 0.5 });
    expect(sample.length).toBe(96 * 48);
    expect(sample[0]).toBe(5); // nearest 0.5° sample to 88.125° N is row 4.
    expect(sample[47 * 96]).toBe(27); // nearest 0.5° sample to 88.125° S is row 356.
  });
});
