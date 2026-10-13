import { describe, expect, it } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import {
  emptyNightTorchCohort, formatNightTorchCohort, observeNightTorchCohort,
} from '../../../tools/nightTorchCohort.ts';

describe('phase 12f night torch cohort observer', () => {
  it('counts only actual burning torches in hands, not unlit inventory', () => {
    const lit = new Person('Lit', 0, 0, 0, new RNG('night-torch-lit'));
    lit.inventory.add('torch');
    lit.equipment.left = { item: 'torch', count: 1, lit: 20 };
    const unlit = new Person('Unlit', 0, 0, 0, new RNG('night-torch-unlit'));
    unlit.inventory.add('torch');

    const cohort = emptyNightTorchCohort();
    observeNightTorchCohort(cohort, [lit, unlit]);
    observeNightTorchCohort(cohort, [unlit]);

    expect(cohort).toEqual({ personSamples: 3, litCarrierSamples: 1, nightSamples: 2 });
    expect(formatNightTorchCohort(cohort)).toContain('1/3 (33.33%) across 2 night snapshots');
  });

  it('reports an unavailable adoption rate when no living people were sampled', () => {
    const cohort = emptyNightTorchCohort();
    observeNightTorchCohort(cohort, []);
    expect(formatNightTorchCohort(cohort)).toContain('0/0 (n/a) across 1 night snapshots');
  });
});
