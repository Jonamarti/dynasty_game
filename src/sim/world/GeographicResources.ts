/**
 * The macro maps carry only a few coarse resource observations. Treat those
 * observations as hard gates for resources they explicitly name; local terrain
 * still decides where a supported resource can actually be placed.
 */
import type { ResourceKind } from '../entities/ResourceNode.ts';
import type { WorldGeography, WorldGeographyProfile } from './WorldGeography.ts';
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
  if (GATED[kind] === undefined) return true;
  return profileHasResource(geography, geography.profileAt(x, y), kind);
}

/**
 * Whether a comarca's profile carries the gate a resource kind needs. Exported for M15 step 1a: the resource
 * profile (`ResourceProfile.ts`) lists a comarca's minerals by asking this same question of every gated kind, so
 * the compact model and the detailed generator cannot disagree about where the copper is. A kind with no gate is
 * always available, as before.
 */
export function profileHasResource(
  geography: Exclude<WorldGeography, { kind: 'legacyIsland' }>,
  profile: WorldGeographyProfile,
  kind: ResourceKind,
): boolean {
  const gate = GATED[kind];
  if (gate === undefined) return true;
  if (geography.kind === 'random') {
    if (profile.kind !== 'random') return true;
    return geography.map.regionAt(profile.regionX, profile.regionY).resources.includes(gate.resource);
  }
  if (profile.kind !== 'earth') return true;
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
  copper_ore: { resource: 'copper', features: WORLD_FEATURE.copper },
  tin_ore: { resource: 'tin', features: WORLD_FEATURE.tin },
  // Gold lies with copper in the generated map, which has no resource of its own
  // for it (the ore bodies are the same hills); the Earth carries it as a feature.
  gold: { resource: 'copper', features: WORLD_FEATURE.gold },
};

/** The kinds a profile can forbid, in a fixed order. */
export const GATED_KINDS: readonly ResourceKind[] = Object.keys(GATED) as ResourceKind[];
