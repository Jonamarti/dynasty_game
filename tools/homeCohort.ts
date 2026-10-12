export const HOME_SLEEP_SURFACES = [
  'outdoors', 'bare_interior', 'bedding_or_rug', 'bed', 'other',
] as const;

export type HomeSleepSurface = typeof HOME_SLEEP_SURFACES[number];

export interface HomeCohortObservations {
  completedHouseholds: number;
  livingHouseholds: number;
  nightSurfaces: Record<HomeSleepSurface, number>;
  comfortDeltaSum: number;
  securityDeltaSum: number;
  physicalQualitySum: number;
  effectiveMoodQualitySum: number;
  recoveryQualitySamples: number;
  recoveryPhysicalQualitySum: number;
  recoveryEffectiveQualitySum: number;
  moodSamples: number;
  furnitureCrafted: Record<string, number>;
  furniturePlaced: Record<string, number>;
}

function percent(numerator: number, denominator: number): string {
  return denominator > 0 ? (100 * numerator / denominator).toFixed(1) + '%' : 'n/a';
}

function mean(total: number, denominator: number): string {
  return denominator > 0 ? (total / denominator).toFixed(2) : 'n/a';
}

function furnitureSummary(values: Record<string, number>): string {
  const entries = Object.entries(values).filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0 ? 'none' : entries.map(([item, count]) => item + '=' + count).join(',');
}

export function formatHomeCohort(seed: string, observations: HomeCohortObservations): string {
  const nightTotal = HOME_SLEEP_SURFACES.reduce((total, surface) => total + observations.nightSurfaces[surface], 0);
  const surfaces = HOME_SLEEP_SURFACES.map(surface =>
    surface + '=' + observations.nightSurfaces[surface] + '(' + percent(observations.nightSurfaces[surface], nightTotal) + ')'
  ).join(' ');
  return [
    '  HOMES ' + seed + ' households=' + observations.completedHouseholds + '/' + observations.livingHouseholds +
      ' (' + percent(observations.completedHouseholds, observations.livingHouseholds) + ')',
    '    night samples=' + nightTotal + ' ' + surfaces,
    '    mood samples=' + observations.moodSamples + ' comfortΔ=' + mean(observations.comfortDeltaSum, observations.moodSamples) +
      ' securityΔ=' + mean(observations.securityDeltaSum, observations.moodSamples) +
      ' mood-quality physical/effective=' + mean(observations.physicalQualitySum, observations.moodSamples) + '/' +
      mean(observations.effectiveMoodQualitySum, observations.moodSamples),
    '    recovery quality samples=' + observations.recoveryQualitySamples + ' physical/effective=' +
      mean(observations.recoveryPhysicalQualitySum, observations.recoveryQualitySamples) + '/' +
      mean(observations.recoveryEffectiveQualitySum, observations.recoveryQualitySamples),
    '    NPC furniture crafted: ' + furnitureSummary(observations.furnitureCrafted) +
      '; placed: ' + furnitureSummary(observations.furniturePlaced),
  ].join('\n');
}

export function homeCohortObservations(
  counts: Readonly<Record<string, number>>,
  completedHouseholds: number,
  livingHouseholds: number,
): HomeCohortObservations {
  return {
    completedHouseholds,
    livingHouseholds,
    nightSurfaces: Object.fromEntries(HOME_SLEEP_SURFACES.map(surface => [
      surface, counts['homes_night_surface_' + surface] ?? 0,
    ])) as Record<HomeSleepSurface, number>,
    comfortDeltaSum: counts.homes_sleep_comfort_delta_sum ?? 0,
    securityDeltaSum: counts.homes_sleep_security_delta_sum ?? 0,
    physicalQualitySum: counts.sleep_mood_quality_sum ?? 0,
    effectiveMoodQualitySum: counts.homes_sleep_quality_effective_sum ?? 0,
    recoveryQualitySamples: counts.homes_sleep_recovery_quality_samples ?? 0,
    recoveryPhysicalQualitySum: counts.homes_sleep_recovery_physical_quality_sum ?? 0,
    recoveryEffectiveQualitySum: counts.homes_sleep_recovery_effective_quality_sum ?? 0,
    moodSamples: counts.sleep_mood_samples ?? 0,
    furnitureCrafted: Object.fromEntries(Object.entries(counts)
      .filter(([key, count]) => key.startsWith('homes_furniture_crafted_') && count > 0)
      .map(([key, count]) => [key.slice('homes_furniture_crafted_'.length), count])),
    furniturePlaced: Object.fromEntries(Object.entries(counts)
      .filter(([key, count]) => key.startsWith('homes_furniture_placed_') && count > 0)
      .map(([key, count]) => [key.slice('homes_furniture_placed_'.length), count])),
  };
}
