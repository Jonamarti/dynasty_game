import { describe, expect, it } from 'vitest';
import { personLayers } from '../../../art/src/people/rig.ts';
import { ART_AGES, ART_BAKED_DIRS, ART_POSES, ART_SEXES } from '../ArtManifest.ts';

describe('hip garment layer identity', () => {
  it('retains the old base layer and replaces it only when hips are fitted', () => {
    for (const age of ART_AGES.filter(age => age !== 'infant')) {
      for (const sex of ART_SEXES) for (const dir of ART_BAKED_DIRS) for (const pose of ART_POSES) {
        const spec = { age, sex, dir, pose, wear: {}, carry: false, hair: 'short' as const,
          beard: false, expr: 'neutral' as const };
        const base = personLayers(spec).layers.filter(layer => layer.slot === 'loincloth');
        expect(base).toHaveLength(1);
        expect(base[0]!.variant).toBe('base');
        const fitted = personLayers({ ...spec, wear: { hips: 'hide_loincloth' } }).layers
          .filter(layer => layer.slot === 'loincloth');
        expect(fitted).toHaveLength(1);
        expect(fitted[0]!.variant).toBe('hide_loincloth');
      }
    }
  });
});
