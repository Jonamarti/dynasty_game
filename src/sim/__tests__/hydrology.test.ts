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

  it('keeps ford phase global across equal-resolution local-map boundaries', () => {
    const makeSegment = (outletDistanceAtStart: number) => {
      const width = 10, height = 4, count = width * height;
      const riverCandidates = new Uint8Array(count);
      riverCandidates[width] = 1;
      const riverCorridor = new Uint8Array(count).fill(1);
      const riverDistance = Float64Array.from({ length: count }, (_, i) => outletDistanceAtStart - i % width);
      const input = {
        width, height,
        elevation: Float32Array.from({ length: count }, (_, i) => 20 - (i % width)),
        moisture: new Float32Array(count).fill(0.5), riverCandidates, riverCorridor,
        lakeCandidates: new Uint8Array(count),
        flowX: new Int8Array(count).fill(1), flowY: new Int8Array(count),
        globalX: Float64Array.from({ length: count }, (_, i) => i % width),
        globalY: Float64Array.from({ length: count }, (_, i) => Math.floor(i / width)),
        riverDistance, fordInterval: 9,
        waterLevel: 0, wadeDepth: 0.1, swimDepth: 1,
      };
      return generateLocalHydrology(input);
    };
    const west = makeSegment(20);
    const east = makeSegment(10);
    const centerFords = (result: ReturnType<typeof generateLocalHydrology>) => result.rivers[0]!.tiles
      .filter(index => result.surface[index]! - result.bed[index]! <= 0.1)
      .map(index => index % 10);

    expect(centerFords(west)).toContain(2); // distance 18 from the shared outlet origin
    expect(centerFords(east)).toContain(1); // distance 9, not a restarted local step 4
  });

  it('traces three descending macro arms through a real confluence', () => {
    const width = 12, height = 12, count = width * height;
    const riverCorridor = new Uint8Array(count);
    const riverDistance = new Float64Array(count).fill(Number.NaN);
    const flowX = new Int8Array(count), flowY = new Int8Array(count);
    const arms: Array<{ points: Array<[number, number]>; flow: [number, number]; distances: number[] }> = [
      { points: [[2, 2], [3, 3], [4, 4]], flow: [1, 1], distances: [7, 6, 5] },
      { points: [[2, 8], [3, 7], [4, 6]], flow: [1, -1], distances: [7, 6, 5] },
      { points: [[1, 5], [2, 5], [3, 5], [4, 5]], flow: [1, 0], distances: [8, 7, 6, 5] },
    ];
    const main: Array<[number, number]> = [[5, 5], [6, 5], [7, 5], [8, 5], [9, 5]];
    const set = (x: number, y: number, distance: number, dx: number, dy: number) => {
      const index = y * width + x;
      riverCorridor[index] = 1;
      riverDistance[index] = distance;
      flowX[index] = dx;
      flowY[index] = dy;
    };
    for (const arm of arms) arm.points.forEach(([x, y], i) => set(x, y, arm.distances[i]!, ...arm.flow));
    main.forEach(([x, y], i) => set(x, y, 4 - i, 1, 0));
    const result = generateLocalHydrology({
      width, height, elevation: new Float32Array(count).fill(20),
      moisture: new Float32Array(count).fill(0.5), riverCandidates: riverCorridor,
      riverCorridor, lakeCandidates: new Uint8Array(count), flowX, flowY,
      globalX: Float64Array.from({ length: count }, (_, i) => i % width),
      globalY: Float64Array.from({ length: count }, (_, i) => Math.floor(i / width)),
      riverDistance, riverSurface: Float32Array.from({ length: count }, (_, i) =>
        Number.isFinite(riverDistance[i]!) ? 10 + riverDistance[i]! * 0.1 : Number.NaN),
      fordInterval: 2, waterLevel: 0, wadeDepth: 0.1, swimDepth: 1,
    });
    const courses = result.rivers.filter(river => river.tiles.length >= 4);
    expect(courses).toHaveLength(3);
    const shared = courses[0]!.tiles.find(index => courses.every(course => course.tiles.includes(index)));
    expect(shared).toBe(5 * width + 5);
    for (const course of courses) for (let step = 1; step < course.tiles.length; step++) {
      const upstream = course.tiles[step - 1]!;
      const downstream = course.tiles[step]!;
      expect(result.surface[downstream]).toBeLessThan(result.surface[upstream]!);
    }
  });
});
