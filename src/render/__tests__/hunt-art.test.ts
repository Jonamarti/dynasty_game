import { describe, expect, it } from 'vitest';
import { personLayers } from '../../../art/src/people/rig.ts';
import { HUNT_POSES } from '../ArtManifest.ts';

describe('human hunting art', () => {
  it('draws four distinct, anchored aim-and-release poses from front and side', () => {
    for (const dir of ['S', 'E'] as const) {
      const figures = HUNT_POSES.map(pose => personLayers({ age: 'adult', sex: 'm', dir, pose,
        wear: {}, carry: false, hair: 'short', beard: false, expr: 'neutral' }));
      const signatures = figures.map(figure => figure.layers.map(layer => `${layer.slot}:${layer.svg}`).join('|'));
      expect(new Set(signatures).size).toBe(4);
      expect(figures.every(figure => figure.anchors.hr.every(Number.isFinite) && figure.anchors.hl.every(Number.isFinite))).toBe(true);
    }
  });
});
