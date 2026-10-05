/**
 * Seeded world-scale geography for M15 phases 29a-b.
 *
 * This stays independent of Simulation: a world map never consumes the legacy
 * RNG stream, so introducing it cannot move people or resources on classic
 * island seeds.
 */
import { RNG } from '../core/RNG.ts';
import { SimplexNoise } from '../core/Noise.ts';

export const REGIONS_WIDE = 96;
export const REGIONS_HIGH = 48;
export const COMARCAS_PER_REGION = 10;
export const WORLD_BIOMES = [
  'ocean', 'ice', 'tundra', 'boreal_forest', 'temperate_forest',
  'grassland', 'steppe', 'desert', 'savanna', 'tropical_forest',
] as const;
export type WorldBiome = (typeof WORLD_BIOMES)[number];

export const WORLD_RESOURCES = ['wild_grain', 'tin', 'flint', 'obsidian', 'copper', 'salt'] as const;
export type WorldResource = (typeof WORLD_RESOURCES)[number];

export interface WorldMapOptions {
  regionsWide?: number;
  regionsHigh?: number;
}

export interface ComarcaProfile {
  /** Continuous coordinates in comarca units; integers identify comarca centres. */
  x: number;
  y: number;
  regionX: number;
  regionY: number;
  /** Degrees north, from -90 at the south pole to +90 at the north pole. */
  latitude: number;
  /** Signed normalized relief: zero is sea level, land is positive. */
  elevation: number;
  biome: WorldBiome;
}

export interface WorldRegionProfile {
  id: number;
  x: number;
  y: number;
  latitude: number;
  /** Signed normalized relief: zero is sea level, land is positive. */
  elevation: number;
  /** Annual mean, normalized from 0 (cold) to 1 (hot). */
  temperature: number;
  /** Annual precipitation, normalized from 0 (dry) to 1 (wet). */
  rainfall: number;
  biome: WorldBiome;
  resources: readonly WorldResource[];
  /** Region draining into this one; -1 means ocean or a closed map edge. */
  downstream: number;
  /** Accumulated precipitation flowing through this region. */
  riverFlow: number;
}

export interface WorldRiverSegment {
  from: number;
  to: number;
  flow: number;
}

/**
 * A deterministic world grid with continuous, seam-safe terrain. Its default
 * resolution is the plan's 96 by 48 regions, each able to contain 10 by 10
 * detailed comarcas.
 */
export class WorldMap {
  /** Canonical seed text is part of the world identity and survives checkpoints. */
  readonly seed: string;
  readonly regionsWide: number;
  readonly regionsHigh: number;
  readonly width: number;
  readonly height: number;
  readonly regions: readonly WorldRegionProfile[];
  readonly rivers: readonly WorldRiverSegment[];

  private readonly broad: SimplexNoise;
  private readonly detail: SimplexNoise;
  private readonly ridges: SimplexNoise;
  private readonly currents: SimplexNoise;

  constructor(seed: number | string, options: WorldMapOptions = {}) {
    this.seed = String(seed);
    this.regionsWide = options.regionsWide ?? REGIONS_WIDE;
    this.regionsHigh = options.regionsHigh ?? REGIONS_HIGH;
    if (!Number.isInteger(this.regionsWide) || this.regionsWide < 2 ||
        !Number.isInteger(this.regionsHigh) || this.regionsHigh < 2) {
      throw new RangeError('WorldMap needs at least two integer regions on each axis');
    }
    this.width = this.regionsWide * COMARCAS_PER_REGION;
    this.height = this.regionsHigh * COMARCAS_PER_REGION;

    // Named derived seeds make each field stable when another generator grows.
    const seedText = this.seed;
    this.broad = new SimplexNoise(new RNG(`${seedText}:worldmap:continents`));
    this.detail = new SimplexNoise(new RNG(`${seedText}:worldmap:detail`));
    this.ridges = new SimplexNoise(new RNG(`${seedText}:worldmap:ridges`));
    this.currents = new SimplexNoise(new RNG(`${seedText}:worldmap:currents`));

    const count = this.regionsWide * this.regionsHigh;
    const heights = new Float32Array(count);
    const latitude = new Float32Array(count);
    const temperature = new Float32Array(count);
    const rainfall = new Float32Array(count);
    const biome = new Array<WorldBiome>(count);
    const resources = new Array<readonly WorldResource[]>(count);
    for (let y = 0; y < this.regionsHigh; y++) {
      for (let x = 0; x < this.regionsWide; x++) {
        const id = y * this.regionsWide + x;
        const lat = 90 - (y + 0.5) / this.regionsHigh * 180;
        const elevation = this.elevationAt(x + 0.5, y + 0.5);
        const temp = this.temperatureAt(x + 0.5, y + 0.5, lat, elevation);
        const rain = this.rainfallAt(x + 0.5, y + 0.5, lat);
        const kind = classifyBiome(elevation, temp, rain);
        heights[id] = elevation;
        latitude[id] = lat;
        temperature[id] = temp;
        rainfall[id] = rain;
        biome[id] = kind;
        resources[id] = this.resourcesAt(seedText, x, y, kind, temp, elevation);
      }
    }

    const drainage = this.buildDrainage(heights, rainfall);
    const regions: WorldRegionProfile[] = new Array(count);
    const rivers: WorldRiverSegment[] = [];
    for (let id = 0; id < count; id++) {
      regions[id] = {
        id,
        x: id % this.regionsWide,
        y: Math.floor(id / this.regionsWide),
        latitude: latitude[id]!,
        elevation: heights[id]!,
        temperature: temperature[id]!,
        rainfall: rainfall[id]!,
        biome: biome[id]!,
        resources: resources[id]!,
        downstream: drainage.downstream[id]!,
        riverFlow: drainage.flow[id]!,
      };
      const to = drainage.downstream[id]!;
      if (heights[id]! > 0 && to >= 0 && drainage.flow[id]! >= 3.2) {
        rivers.push({ from: id, to, flow: drainage.flow[id]! });
      }
    }
    this.regions = regions;
    this.rivers = rivers;
  }

  profileAt(x: number, y: number): ComarcaProfile {
    const comarcaX = wrap(x, this.width);
    const comarcaY = clamp(y, 0, this.height);
    const regionX = Math.floor(comarcaX / COMARCAS_PER_REGION);
    const regionY = Math.min(this.regionsHigh - 1, Math.floor(comarcaY / COMARCAS_PER_REGION));
    const lat = 90 - comarcaY / this.height * 180;
    const elevation = this.elevationAt(comarcaX / COMARCAS_PER_REGION, comarcaY / COMARCAS_PER_REGION);
    const regionalBiome = this.regionAt(regionX, regionY).biome;
    return { x: comarcaX, y: comarcaY, regionX, regionY, latitude: lat, elevation, biome: regionalBiome };
  }

  regionAt(x: number, y: number): WorldRegionProfile {
    const regionX = mod(Math.floor(x), this.regionsWide);
    const regionY = clamp(Math.floor(y), 0, this.regionsHigh - 1);
    return this.regions[regionY * this.regionsWide + regionX]!;
  }

  /** Height at a point measured in region units; useful at exact shared edges. */
  elevationAt(regionX: number, regionY: number): number {
    regionX = wrap(regionX, this.regionsWide);
    regionY = clamp(regionY, 0.5, this.regionsHigh - 0.5);
    const gx = regionX - 0.5;
    const gy = regionY - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const a = lerp(this.regionHeight(x0, y0), this.regionHeight(x0 + 1, y0), tx);
    const b = lerp(this.regionHeight(x0, y0 + 1), this.regionHeight(x0 + 1, y0 + 1), tx);
    const broad = lerp(a, b, ty);
    // Detail noise itself is not periodic. Fade it at the longitude seam so
    // the field stays continuous when x wraps from the last region to the first.
    const seamFade = Math.sin(Math.PI * regionX / this.regionsWide) ** 2;
    const fine = (this.detail.fbm(regionX, regionY, 3, 2, 0.5, 0.9) - 0.5) * seamFade;
    const ridgeNoise = this.ridges.fbm(regionX, regionY, 3, 2, 0.5, 0.42);
    const ridge = (1 - Math.abs(ridgeNoise * 2 - 1)) * seamFade;
    // Uplift hugs the noisy continental margin, producing broken ranges rather
    // than a straight wall around each landmass.
    const coastalUplift = clamp(1 - Math.abs(broad - 0.57) / 0.13, 0, 1) * ridge * 0.09;
    return broad + fine * 0.12 + coastalUplift - 0.57;
  }

  private regionHeight(x: number, y: number): number {
    const wrappedX = mod(x, this.regionsWide);
    const clampedY = clamp(y, 0, this.regionsHigh - 1);
    return this.broad.fbm(wrappedX + 0.5, clampedY + 0.5, 4, 2, 0.5, 0.035);
  }

  private temperatureAt(x: number, y: number, lat: number, elevation: number): number {
    const seamFade = Math.sin(Math.PI * wrap(x, this.regionsWide) / this.regionsWide) ** 2;
    const current = (this.currents.fbm(x, y, 3, 2, 0.5, 0.11) - 0.5) * seamFade;
    const equatorWarmth = 1 - Math.abs(lat) / 90;
    return clamp(equatorWarmth - Math.max(0, elevation) * 0.48 + current * 0.34, 0, 1);
  }

  private rainfallAt(x: number, y: number, lat: number): number {
    const absLat = Math.abs(lat) / 90;
    const equatorialWet = Math.exp(-(((absLat - 0.08) / 0.18) ** 2)) * 0.44;
    const subtropicalWet = Math.exp(-(((absLat - 0.62) / 0.18) ** 2)) * 0.31;
    const dryBelt = Math.exp(-(((absLat - 0.31) / 0.13) ** 2)) * 0.32;
    const seamFade = Math.sin(Math.PI * wrap(x, this.regionsWide) / this.regionsWide) ** 2;
    const moistureNoise = (this.currents.fbm(x + 71.4, y - 18.2, 3, 2, 0.5, 0.16) - 0.5) * seamFade * 0.46;
    return clamp(0.28 + equatorialWet + subtropicalWet - dryBelt + moistureNoise, 0, 1);
  }

  private resourcesAt(
    seed: string, x: number, y: number, biome: WorldBiome, temperature: number, elevation: number,
  ): readonly WorldResource[] {
    if (biome === 'ocean') return [];
    const rng = new RNG(`${seed}:worldmap:resources:${x}:${y}`);
    const found: WorldResource[] = [];
    if (biome === 'steppe' && temperature >= 0.24 && temperature <= 0.84 && rng.chance(0.34)) {
      found.push('wild_grain');
    }
    // Tin is deliberately much rarer than common stone: later trade must matter.
    if (rng.chance(0.0045)) found.push('tin');
    if (rng.chance(0.14)) found.push('flint');
    if (elevation > 0.12 && rng.chance(0.035)) found.push('obsidian');
    if (elevation > 0.08 && rng.chance(0.07)) found.push('copper');
    if (biome === 'desert' && rng.chance(0.12)) found.push('salt');
    return found;
  }

  private buildDrainage(heights: Float32Array, rainfall: Float32Array): { downstream: Int32Array; flow: Float32Array } {
    const count = heights.length;
    const downstream = new Int32Array(count).fill(-1);
    const visited = new Uint8Array(count);
    const spill = new Float32Array(count);
    const order: number[] = [];
    const heap = new MinHeap();
    for (let id = 0; id < count; id++) {
      if (heights[id]! <= 0) {
        visited[id] = 1;
        spill[id] = heights[id]!;
        heap.push(id, spill[id]!);
      }
    }
    // Small maps or unusual seeds can be all land. Start drainage at the
    // lowest point in that case, so the graph is still finite and acyclic.
    if (heap.size === 0) {
      let lowest = 0;
      for (let id = 1; id < count; id++) if (heights[id]! < heights[lowest]!) lowest = id;
      visited[lowest] = 1;
      spill[lowest] = heights[lowest]!;
      heap.push(lowest, spill[lowest]!);
    }
    while (heap.size > 0) {
      const current = heap.pop()!;
      order.push(current.id);
      for (const next of this.neighbours(current.id)) {
        if (visited[next]) continue;
        visited[next] = 1;
        downstream[next] = current.id;
        spill[next] = Math.max(heights[next]!, current.priority + 0.00001);
        heap.push(next, spill[next]!);
      }
    }
    const flow = new Float32Array(count);
    for (let id = 0; id < count; id++) flow[id] = rainfall[id]!;
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i]!;
      const to = downstream[id]!;
      if (to >= 0) flow[to] += flow[id]!;
    }
    return { downstream, flow };
  }

  private neighbours(id: number): number[] {
    const x = id % this.regionsWide;
    const y = Math.floor(id / this.regionsWide);
    const neighbours: number[] = [];
    if (y > 0) neighbours.push((y - 1) * this.regionsWide + x);
    if (x > 0) neighbours.push(y * this.regionsWide + x - 1);
    else neighbours.push(y * this.regionsWide + this.regionsWide - 1);
    if (x + 1 < this.regionsWide) neighbours.push(y * this.regionsWide + x + 1);
    else neighbours.push(y * this.regionsWide);
    if (y + 1 < this.regionsHigh) neighbours.push((y + 1) * this.regionsWide + x);
    return neighbours;
  }
}

class MinHeap {
  private values: { id: number; priority: number }[] = [];
  get size(): number { return this.values.length; }
  push(id: number, priority: number): void {
    const values = this.values;
    values.push({ id, priority });
    let i = values.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (values[p]!.priority <= priority) break;
      values[i] = values[p]!;
      i = p;
    }
    values[i] = { id, priority };
  }
  pop(): { id: number; priority: number } | undefined {
    const values = this.values;
    const first = values[0];
    const last = values.pop();
    if (!first || !last || values.length === 0) return first;
    let i = 0;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      if (left >= values.length) break;
      const child = right < values.length && values[right]!.priority < values[left]!.priority ? right : left;
      if (values[child]!.priority >= last.priority) break;
      values[i] = values[child]!;
      i = child;
    }
    values[i] = last;
    return first;
  }
}

function classifyBiome(elevation: number, temperature: number, rainfall: number): WorldBiome {
  if (elevation <= 0) return 'ocean';
  if (temperature < 0.12) return 'ice';
  if (temperature < 0.23) return 'tundra';
  if (temperature < 0.36) return rainfall > 0.42 ? 'boreal_forest' : 'tundra';
  if (rainfall < 0.16) return 'desert';
  if (rainfall < 0.31) return 'steppe';
  if (temperature > 0.68 && rainfall > 0.62) return 'tropical_forest';
  if (temperature > 0.59 && rainfall > 0.36) return 'savanna';
  if (rainfall > 0.57) return 'temperate_forest';
  return 'grassland';
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function mod(n: number, divisor: number): number { return ((n % divisor) + divisor) % divisor; }
function wrap(n: number, length: number): number { return mod(n, length); }
