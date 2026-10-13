import { describe, expect, it } from 'vitest';
import { personLayers, type PersonSpec } from '../../../art/src/people/rig.ts';
import { SLEEP_POSES } from '../ArtManifest.ts';

describe('human sleeping art', () => {
  it('lays every layer and hand anchor down together in four generated frames', () => {
    const base: PersonSpec = {
      age: 'adult', sex: 'f', dir: 'E', pose: 'idle', wear: { torso: 'tunic', cloak: 'cloak' },
      carry: false, hair: 'long', beard: false, expr: 'content',
    };
    const frames = SLEEP_POSES.map(pose => personLayers({ ...base, pose }));
    for (const frame of frames) {
      expect(frame.layers.length).toBeGreaterThan(0);
      expect(frame.layers.every(layer => layer.svg.includes('rotate('))).toBe(true);
      expect([...frame.anchors.hr, ...frame.anchors.hl].every(Number.isFinite)).toBe(true);
    }
    expect(new Set(frames.map(frame => frame.layers.map(layer => layer.svg).join(''))).size).toBe(4);
    const hand = personLayers(base).anchors.hr;
    const angle = 88.5 * Math.PI / 180, dx = hand[0] - 48, dy = hand[1] - 48;
    expect(frames[0]!.anchors.hr[0]).toBeCloseTo(48 + dx * Math.cos(angle) - dy * Math.sin(angle));
    expect(frames[0]!.anchors.hr[1]).toBeCloseTo(48 + dx * Math.sin(angle) + dy * Math.cos(angle));
  });
});
