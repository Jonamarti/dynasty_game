/**
 * The macro maps carry only a few coarse resource observations. Treat those
 * observations as hard gates for resources they explicitly name; local terrain
 * still decides where a supported resource can actually be placed.
 */
import type { ResourceKind } from '../entities/ResourceNode.ts';
import type { WorldGeography } from './WorldGeography.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';

const WILD_CEREALS = WORLD_FEATURE.wildWheat | WORLD_FEATURE.wildBarley |
  WORLD_FEATURE.wildRice | WORLD_FEATURE.wildMillet | WORLD_FEATURE.wildMaize |
  WORLD_FEATURE.wildSorghum;

/**
 * Classic geography has no provenance and keeps the legacy resource table.
 * Geographic starts gate wild grain and flint only: other macro resources do
 * not yet have matching local entity types, and coarse water flags do not
 * establish a local river or shoreline.
 */
export function geographicResourceAvailable(
  geography: WorldGeography,
  x: number,
  y: number,
  kind: ResourceKind,
): boolean {
  if (geography.kind === 'legacyIsland') return true;
  if (kind !== 'wild_grain' && kind !== 'flint') return true;

  const profile = geography.profileAt(x, y);
  if (geography.kind === 'random') {
    const resources = geography.map.regionAt(profile.regionX, profile.regionY).resources;
    return kind === 'wild_grain'
      ? resources.includes('wild_grain')
      : resources.includes('flint');
  }

  if (geography.kind !== 'earth' || profile.kind !== 'earth') return true;
  const features = profile.features;
  return kind === 'wild_grain'
    ? (features & WILD_CEREALS) !== 0
    : (features & WORLD_FEATURE.flint) !== 0;
}
