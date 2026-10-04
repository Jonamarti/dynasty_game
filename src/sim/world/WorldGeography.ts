/**
 * Pure selection and lookup facade for world-scale geography.
 *
 * This module deliberately does not construct the local simulation World or
 * consume one of Simulation's RNG streams. Legacy island play has no global
 * geography data, so it reports that absence instead of synthesizing a map.
 */
import type { ComarcaProfile, WorldMapOptions } from './WorldMap.ts';
import { WorldMap } from './WorldMap.ts';
import type { LoadedWorldMap } from './WorldAtlas.ts';
import { RealWorldMap, type RealWorldComarcaProfile } from './RealWorldMap.ts';

export interface LegacyIslandComarcaProfile {
  kind: 'legacyIsland';
  /** The queried local coordinates are known; their global placement is not. */
  x: number;
  y: number;
  regionX: UnknownGeographicValue;
  regionY: UnknownGeographicValue;
  latitude: UnknownGeographicValue;
  elevation: UnknownGeographicValue;
  biome: UnknownGeographicValue;
  climateClass: UnknownGeographicValue;
  resources: UnknownGeographicValue;
  features: UnknownGeographicValue;
  land: UnknownGeographicValue;
  water: UnknownGeographicValue;
}

export interface UnknownGeographicValue {
  readonly status: 'unknown';
  readonly reason: 'legacy-island-has-no-world-map';
}

const UNKNOWN: UnknownGeographicValue = Object.freeze({
  status: 'unknown',
  reason: 'legacy-island-has-no-world-map',
});

/** A profile retains the complete source-specific data and adds its mode. */
export type WorldGeographyProfile =
  | LegacyIslandComarcaProfile
  | ({ kind: 'random' } & ComarcaProfile)
  | ({ kind: 'earth'; mapId: string } & RealWorldComarcaProfile);

export interface LegacyIslandGeography {
  readonly kind: 'legacyIsland';
  profileAt(x: number, y: number): LegacyIslandComarcaProfile;
}

export interface RandomWorldGeography {
  readonly kind: 'random';
  readonly map: WorldMap;
  profileAt(x: number, y: number): ({ kind: 'random' } & ComarcaProfile);
}

export interface EarthWorldGeography {
  readonly kind: 'earth';
  readonly entry: LoadedWorldMap['entry'];
  readonly map: RealWorldMap;
  profileAt(x: number, y: number): ({ kind: 'earth'; mapId: string } & RealWorldComarcaProfile);
}

export type WorldGeography = LegacyIslandGeography | RandomWorldGeography | EarthWorldGeography;

/** Legacy island mode has no macro map and therefore performs no generation. */
export function legacyIslandGeography(): LegacyIslandGeography {
  return {
    kind: 'legacyIsland',
    profileAt(x, y) {
      assertCoordinates(x, y);
      return {
        kind: 'legacyIsland', x, y,
        regionX: UNKNOWN, regionY: UNKNOWN,
        latitude: UNKNOWN, elevation: UNKNOWN, biome: UNKNOWN,
        climateClass: UNKNOWN, resources: UNKNOWN, features: UNKNOWN,
        land: UNKNOWN, water: UNKNOWN,
      };
    },
  };
}

/**
 * Build a seeded macro map from its own seed. No caller-owned RNG is accepted,
 * so adding world geography cannot consume draws from Simulation's streams.
 */
export function randomWorldGeography(
  seed: number | string,
  options: WorldMapOptions = {},
): RandomWorldGeography {
  const map = new WorldMap(seed, options);
  return {
    kind: 'random',
    map,
    profileAt(x, y) {
      assertCoordinates(x, y);
      return { kind: 'random', ...map.profileAt(x, y) };
    },
  };
}

/**
 * Create a real-Earth view from an atlas entry already validated by
 * `loadWorldAtlas`; this factory does not reinterpret or repair its metadata.
 */
export function earthWorldGeography(
  loadedMap: LoadedWorldMap,
  comarcasPerRegion: number,
): EarthWorldGeography {
  const map = new RealWorldMap(loadedMap.raster, comarcasPerRegion);
  return {
    kind: 'earth',
    entry: loadedMap.entry,
    map,
    profileAt(x, y) {
      return { kind: 'earth', mapId: loadedMap.entry.id, ...map.comarcaAt(x, y) };
    },
  };
}

/** Convenience dispatch that keeps callers on the same discriminated API. */
export function profileAt(geography: WorldGeography, x: number, y: number): WorldGeographyProfile {
  return geography.profileAt(x, y);
}

function assertCoordinates(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('Geography coordinates must be finite');
  }
}
