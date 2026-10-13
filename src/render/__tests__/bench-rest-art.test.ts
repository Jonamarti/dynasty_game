import { describe, expect, it } from 'vitest';
import { personLayers, type PersonSpec } from '../../../art/src/people/rig.ts';
import { BENCH_REST_POSES } from '../ArtManifest.ts';

describe('bench rest art', () => {
  it('bends legs and rests both hands without painting a duplicate seat', () => {
    const base: PersonSpec = {
      age: 'adult', sex: 'f', dir: 'E', pose: 'idle', wear: { torso: 'tunic', cloak: 'cloak' },
      carry: false, hair: 'long', beard: false, expr: 'content',
    };
    const frames = BENCH_REST_POSES.map(pose => personLayers({ ...base, pose }));
    expect(frames.every(frame => frame.layers.some(layer => layer.slot === 'legs_near'))).toBe(true);
    expect(frames.every(frame => frame.layers.every(layer => layer.slot !== 'seat'))).toBe(true);
    expect(frames.every(frame => [...frame.anchors.hr, ...frame.anchors.hl].every(Number.isFinite))).toBe(true);
    expect(new Set(frames.map(frame => frame.layers.map(layer => layer.svg).join(''))).size).toBe(4);
  });

  it('uses the same seated silhouette facing front, back and either profile', () => {
    const base: PersonSpec = {
      age: 'adult', sex: 'm', dir: 'S', pose: 'j0', wear: {},
      carry: false, hair: 'short', beard: true, expr: 'neutral',
    };
    for (const dir of ['S', 'N', 'E'] as const) {
      const art = personLayers({ ...base, dir });
      expect(art.layers.some(layer => layer.slot.startsWith('legs'))).toBe(true);
      expect(art.layers.every(layer => layer.slot !== 'seat')).toBe(true);
    }
    const southFrames = BENCH_REST_POSES.map(pose => personLayers({ ...base, dir: 'S', pose }));
    expect(new Set(southFrames.map(frame => frame.layers.map(layer => layer.svg).join(''))).size).toBe(4);
  });
});
