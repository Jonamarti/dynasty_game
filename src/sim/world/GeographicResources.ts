/**
 * The macro maps carry only a few coarse resource observations. Treat those
 * observations as hard gates for resources they explicitly name; local terrain
 * still decides where a supported resource can actually be placed.
 */
import type { ResourceKind } from '../entities/ResourceNode.ts';
import type { WorldGeography } from './WorldGeography.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';
import type { WorldResource } from './WorldMap.ts';

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
  const gate = GATED[kind];
  if (gate === undefined) return true;

  const profile = geography.profileAt(x, y);
  if (geography.kind === 'random') {
    return geography.map.regionAt(profile.regionX, profile.regionY).resources.includes(gate.resource);
  }

  if (geography.kind !== 'earth' || profile.kind !== 'earth') return true;
  return (profile.features & gate.features) !== 0;
}

/**
 * The resources a profile can forbid, and how each profile says so: the
 * generated map by name, the Earth by feature flag. M15 phase 37 adds the
 * metals: copper on the surface wants a region with copper in it.
 */
const GATED: Partial<Record<ResourceKind, { resource: WorldResource; features: number }>> = {
  wild_grain: { resource: 'wild_grain', features: WILD_CEREALS },
  flint: { resource: 'flint', features: WORLD_FEATURE.flint },
  native_copper: { resource: 'copper', features: WORLD_FEATURE.copper },
};
