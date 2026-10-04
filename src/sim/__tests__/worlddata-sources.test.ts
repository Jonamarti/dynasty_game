import { describe, expect, it } from 'vitest';
import { decodePackBits } from '../../../tools/worlddata/beck.ts';
import { parseElevationCsv, sampleClimate } from '../../../tools/worlddata/build.ts';

describe('world data reduction', () => {
  it('decodes PackBits literal, repeat, and no-op runs', () => {
    expect(Array.from(decodePackBits(Uint8Array.from([2, 4, 5, 6, 254, 7, 128, 0, 9]), 7)))
      .toEqual([4, 5, 6, 7, 7, 7, 9]);
  });

  it('maps NOAA 0–360 point samples to the atlas -180–180 longitude convention', () => {
    const rows = ['latitude,longitude,z', 'degrees_north,degrees_east,meters'];
    for (let y = 47; y >= 0; y--) {
      const latitude = (-88.125 + y * 3.75).toFixed(3);
      for (let x = 0; x < 96; x++) rows.push(`${latitude},${(1.875 + x * 3.75).toFixed(3)},${y * 100 + x}`);
    }
    const grid = parseElevationCsv(rows.join('\n'));
    // NOAA's 1.875°E sample belongs at the game's x=48 (1.875°E), while
    // 181.875°E wraps to x=0 (-178.125°), preserving the global geography.
    expect(grid[0]).toBe(4748);
    expect(grid[48]).toBe(4700);
    expect(grid[95]).toBe(4747);
    expect(grid[47 * 96]).toBe(48);
  });

  it('samples a global climate raster at region centres', () => {
    const codes = new Uint8Array(720 * 360);
    for (let y = 0; y < 360; y++) for (let x = 0; x < 720; x++) codes[y * 720 + x] = (y % 30) + 1;
    const sample = sampleClimate({ width: 720, height: 360, codes, originLongitude: -180, originLatitude: 90, pixelSize: 0.5 });
    expect(sample.length).toBe(96 * 48);
    expect(sample[0]).toBe(5); // nearest 0.5° sample to 88.125° N is row 4.
    expect(sample[47 * 96]).toBe(27); // nearest 0.5° sample to 88.125° S is row 356.
  });

  it('samples climate by signed west-to-east atlas longitude instead of clamping eastern longitudes', () => {
    const width = 720;
    const height = 360;
    const codes = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) codes[y * width + x] = Math.floor(x / 4);
    }
    const sample = sampleClimate({ width, height, codes,
      originLongitude: -180, originLatitude: 90, pixelSize: 0.5 });
    // Atlas column 0 is -178.125° (source pixel 4), and column 48 is
    // +1.875° (source pixel 364). The old positive-longitude loop clamped
    // the later half of the planet at the final source column.
    expect(sample[0]).toBe(1);
    expect(sample[48]).toBe(91);
    expect(sample[95]).toBe(179);
  });
});
