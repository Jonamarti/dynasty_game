import type { Person } from '../src/sim/entities/Person.ts';
import { torchInHand } from '../src/sim/core/Torch.ts';

/** Person-observations gathered at regular night samples; not torches lit events. */
export interface NightTorchCohort {
  personSamples: number;
  litCarrierSamples: number;
  nightSamples: number;
}

export function emptyNightTorchCohort(): NightTorchCohort {
  return { personSamples: 0, litCarrierSamples: 0, nightSamples: 0 };
}

/** Read actual carried, fueled torches. Unlit inventory and fixed fires do not count. */
export function observeNightTorchCohort(
  cohort: NightTorchCohort,
  livingPeople: readonly Person[],
): void {
  cohort.nightSamples++;
  cohort.personSamples += livingPeople.length;
  for (const person of livingPeople) {
    if (torchInHand(person)) cohort.litCarrierSamples++;
  }
}

export function formatNightTorchCohort(cohort: NightTorchCohort): string {
  const rate = cohort.personSamples > 0
    ? (100 * cohort.litCarrierSamples / cohort.personSamples).toFixed(2) + '%'
    : 'n/a';
  return '  TORCHES night carrier samples=' + cohort.litCarrierSamples + '/' + cohort.personSamples +
    ' (' + rate + ') across ' + cohort.nightSamples + ' night snapshots';
}
