import { describe, expect, it } from 'vitest';
import { auditRegions } from '../../../tools/regions.ts';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';

// Two disconnected islands of the same size: a size-only check would miss
// their labels being confused, which is why the final-world check recomputes
// connectivity independently of World.setWalkable.
function islands() {
  return { width: 5, walkable: new Uint8Array([1, 1, 0, 1, 1]),
    region: new Int32Array([10, 10, -1, 20, 20]), regionSizes: new Map([[10, 2], [20, 2]]) };
}

describe('regions-stay-true measurement', () => {
  it('runs as an applicable check in the ordinary scenario matrix', () => {
    const report = runScenario(SCENARIOS.tiny!, 2);
    expect(report.checks.find(check => check.id === 'regions-stay-true')).toMatchObject({ ok: true });
    expect(report.checks.find(check => check.id === 'regions-stay-true')?.skipped).not.toBe(true);
  });

  it('makes the harness fail when incremental labels are stale', () => {
    const report = runScenario({ ...SCENARIOS.tiny!, setup: sim => {
      sim.world.region.fill(-1);
    } }, 2);
    expect(report.checks.find(check => check.id === 'regions-stay-true')).toMatchObject({ ok: false });
  });
  it('accepts a matching partition with noncanonical ids', () => {
    expect(auditRegions(islands())).toEqual({ ok: true, components: 2, tileErrors: 0, sizeErrors: 0 });
  });

  it('fails on the stale bridge labels that a walkability change without repair leaves', () => {
    const world = { width: 5, walkable: new Uint8Array([1, 1, 0, 1, 1]),
      region: new Int32Array([10, 10, 10, 10, 10]), regionSizes: new Map([[10, 5]]) };
    expect(auditRegions(world).ok).toBe(false);
    expect(auditRegions(world).tileErrors).toBeGreaterThan(0);
  });

  it('detects both a falsely split island and a falsely merged pair even when sizes sum correctly', () => {
    const split = islands();
    split.region[1] = 30;
    split.regionSizes.set(10, 1);
    split.regionSizes.set(30, 1);
    expect(auditRegions(split)).toMatchObject({ ok: false, sizeErrors: 0 });
    const merged = islands();
    merged.region[3] = merged.region[4] = 10;
    merged.regionSizes.delete(20);
    merged.regionSizes.set(10, 4);
    expect(auditRegions(merged)).toMatchObject({ ok: false, sizeErrors: 0 });
  });

  it('detects an unlabelled walkable tile and a labelled blocked tile', () => {
    const world = islands();
    world.region[0] = -1;
    world.region[2] = 20;
    expect(auditRegions(world).tileErrors).toBe(2);
  });

  it('detects wrong per-region sizes and stale entries, even when the partition is right', () => {
    const world = islands();
    world.regionSizes.set(10, 3);
    world.regionSizes.set(20, 1);
    world.regionSizes.set(30, 0);
    expect(auditRegions(world)).toMatchObject({ ok: false, tileErrors: 0, sizeErrors: 3 });
  });

  it('does not wrap a row edge into the next row or count water as a component', () => {
    const world = { width: 2, walkable: new Uint8Array([0, 1, 1, 0]),
      region: new Int32Array([-1, 7, 8, -1]), regionSizes: new Map([[7, 1], [8, 1]]) };
    expect(auditRegions(world)).toMatchObject({ ok: true, components: 2 });
    expect(auditRegions({ width: 2, walkable: new Uint8Array(4),
      region: new Int32Array(4).fill(-1), regionSizes: new Map() })).toMatchObject({ ok: true, components: 0 });
  });
});
