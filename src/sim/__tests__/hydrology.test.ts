import { describe, expect, it } from 'vitest';
import { generateLocalHydrology, HYDROLOGY_FRESH } from '../world/Hydrology.ts';

const thresholds = { waterLevel: 0, wadeDepth: 0.002, swimDepth: 0.008 };

describe('local hydrology generation', () => {
  it('fills only a bounded closed depression from a coarse lake candidate', () => {
    const width = 16, height = 16, count = width * height;
    const elevation = new Float32Array(count).fill(0.2);
    // A connected 3x3 bowl sits well below the boundary spill height.
    for (let y = 6; y <= 8; y++) for (let x = 6; x <= 8; x++) elevation[y * width + x] = 0.1;
    const lakes = new Uint8Array(count).fill(1); // coarse regional flag everywhere
    const local = generateLocalHydrology({
      width, height, elevation, moisture: new Float32Array(count).fill(0.5),
      riverCandidates: new Uint8Array(count), lakeCandidates: lakes,
      flowX: new Int8Array(count), flowY: new Int8Array(count),
      globalX: Float64Array.from({ length: count }, (_, i) => i % width),
      globalY: Float64Array.from({ length: count }, (_, i) => Math.floor(i / width)),
      ...thresholds,
    });

    const lakeTiles = Array.from(local.kind).filter(kind => kind === HYDROLOGY_FRESH).length;
    expect(lakeTiles).toBe(9);
    expect(local.surface[7 * width + 7]).toBeGreaterThan(elevation[7 * width + 7]!);
    expect(local.kind[0]).toBe(0);
  });

  it('creates stable sparse springs on wet slopes without using a Simulation RNG', () => {
    const width = 128, height = 128, count = width * height;
    const elevation = Float32Array.from({ length: count }, (_, i) => 2 - (i % width) * 0.01);
    const input = {
      width, height, elevation, moisture: new Float32Array(count).fill(0.8),
      riverCandidates: new Uint8Array(count), lakeCandidates: new Uint8Array(count),
      flowX: new Int8Array(count), flowY: new Int8Array(count),
      globalX: Float64Array.from({ length: count }, (_, i) => (i % width) / 16),
      globalY: Float64Array.from({ length: count }, (_, i) => Math.floor(i / width) / 16),
      ...thresholds,
    };
    const first = generateLocalHydrology(input);
    const second = generateLocalHydrology(input);

    expect(Array.from(first.kind).filter(kind => kind === HYDROLOGY_FRESH).length).toBe(1);
    expect(second).toEqual(first);
  });
});
