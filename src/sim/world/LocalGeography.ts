/**
 * Projects a global comarca profile into one detailed local World. This is a
 * terrain adapter only: regional categories remain provenance/modifiers and
 * are not interpreted as local coastlines, lakes or river courses.
 */
import type { WorldConfig } from '../core/Config.ts';
import type { WorldGeography, WorldGeographyProfile } from './WorldGeography.ts';

export interface LocalGeographyBounds {
  /** Global comarca coordinate of the local map's north-west corner. */
  originX: number;
  originY: number;
  /** Continuous comarca dimensions covered by this detailed local map. */
  comarcasWide: number;
  comarcasHigh: number;
}

export interface LocalTerrainSample {
  /** Unmodified regional/geographic source data for provenance and resources. */
  profile: Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;
  /** Height in World elevation units; config.waterLevel denotes sea level. */
  elevation: number;
  /** Coarse regional wetness mapped to [0, 1], not local rainfall. */
  moisture: number;
  /** Derived from continuous elevation, never from a regional land/water flag. */
  land: boolean;
}

export interface LocalGeographySource {
  readonly kind: 'random' | 'earth';
  readonly bounds: Readonly<LocalGeographyBounds>;
  /** Local tile coordinates (0..width, 0..height) to continuous global profile. */
  profileAtLocal(x: number, y: number): Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;
  sample(x: number, y: number): LocalTerrainSample;
}

/**
 * The random world map's relief is dimensionless. One relief unit becomes
 * 1.8 World elevation units: enough for local water/beach/hill bands while
 * keeping its explicitly normalized source scale separate from Earth metres.
 */
export const RANDOM_RELIEF_TO_WORLD_UNITS = 1.8;

export function createLocalGeography(
  geography: WorldGeography,
  bounds: LocalGeographyBounds,
  config: Pick<WorldConfig, 'width' | 'height' | 'waterLevel' | 'metresPerUnit'>,
): LocalGeographySource {
  if (geography.kind === 'legacyIsland') {
    throw new RangeError('Legacy island geography has no global profile to project');
  }
  if (![bounds.originX, bounds.originY, bounds.comarcasWide, bounds.comarcasHigh].every(Number.isFinite) ||
      bounds.comarcasWide <= 0 || bounds.comarcasHigh <= 0) {
    throw new RangeError('Local geography bounds must be finite and have positive dimensions');
  }
  if (!Number.isInteger(config.width) || config.width <= 0 ||
      !Number.isInteger(config.height) || config.height <= 0 ||
      !Number.isFinite(config.waterLevel) || !Number.isFinite(config.metresPerUnit) || config.metresPerUnit <= 0) {
    throw new RangeError('Local geography needs a valid World size, sea level and metres-per-unit scale');
  }

  const frozenBounds = Object.freeze({ ...bounds });
  const width = config.width;
  const height = config.height;
  const waterLevel = config.waterLevel;
  const metresPerUnit = config.metresPerUnit;
  const profileAtLocal = (x: number, y: number) => {
    assertLocalCoordinates(x, y, width, height);
    const globalX = frozenBounds.originX + x / width * frozenBounds.comarcasWide;
    const globalY = frozenBounds.originY + y / height * frozenBounds.comarcasHigh;
    return geography.profileAt(globalX, globalY) as Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;
  };
  const sample = (x: number, y: number): LocalTerrainSample => {
    const profile = profileAtLocal(x, y);
    const elevation = profile.kind === 'earth'
      ? waterLevel + profile.elevationAboveSeaMeters / metresPerUnit
      : waterLevel + profile.elevation * RANDOM_RELIEF_TO_WORLD_UNITS;
    return {
      profile,
      elevation,
      moisture: regionalMoisture(profile),
      // Categorical regional hydrography is too coarse to paint local water.
      land: elevation >= waterLevel,
    };
  };
  return { kind: geography.kind, bounds: frozenBounds, profileAtLocal, sample };
}

function regionalMoisture(profile: Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>): number {
  if (profile.kind === 'random') {
    switch (profile.biome) {
      case 'ocean': return 0.65;
      case 'ice': return 0.12;
      case 'tundra': return 0.34;
      case 'boreal_forest': return 0.68;
      case 'temperate_forest': return 0.72;
      case 'grassland': return 0.52;
      case 'steppe': return 0.30;
      case 'desert': return 0.08;
      case 'savanna': return 0.47;
      case 'tropical_forest': return 0.88;
    }
  }

  // Beck's IDs 1–30 follow Af, Am, Aw, BWh…EF; the atlas has regional annual
  // climate only, so this is deliberately a broad wetness policy, not local rain.
  const code = profile.climateClass;
  if (code >= 1 && code <= 3) return 0.82; // tropical
  if (code >= 4 && code <= 7) return 0.12; // arid
  if (code >= 8 && code <= 16) return 0.58; // temperate
  if (code >= 17 && code <= 28) return 0.62; // continental
  if (code >= 29 && code <= 30) return 0.42; // polar
  return 0.50; // unclassified; neutral rather than fabricated drought
}

function assertLocalCoordinates(x: number, y: number, width: number, height: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) {
    throw new RangeError('Local geography coordinates must be finite and inside the local World');
  }
}
