/**
 * All tunable simulation constants in one place.
 *
 * Scenarios in `tools/simcheck.ts` override slices of this, which is what makes
 * "harsh winter" or "crowded camp" a data change rather than a code change.
 */

export interface WorldConfig {
  width: number;
  height: number;
  waterLevel: number;
  /** Chunk edge in tiles; the LOD system activates and freezes whole chunks. */
  chunkSize: number;
  /** Target count of each resource node kind, before terrain suitability filtering. */
  berryBushes: number;
  flintOutcrops: number;
  deadwood: number;
  gameAnimals: number;
  reedBeds: number;
  clayBanks: number;
  /**
   * Fraction of tiles considered for a starting tree. Suitability by biome
   * thins this out a great deal; forest carries most of them.
   */
  treeDensity: number;
}

export interface TimeConfig {
  /** Simulation steps in one in-game day. */
  ticksPerDay: number;
  daysPerSeason: number;
  /**
   * Day of the year the world starts on. Mid-spring by default, so a new game
   * does not open in the middle of a winter that, until fire and clothing exist,
   * nobody can survive.
   */
  startDay: number;
  /** Default real-time steps per second. */
  tickRate: number;
  /** Ceiling on catch-up steps per rendered frame, so a stall cannot spiral. */
  maxTicksPerFrame: number;
}

export interface NeedsConfig {
  /** Points per tick, on a 0-100 scale where 100 is desperate. */
  hungerRate: number;
  thirstRate: number;
  fatigueRate: number;
  /** Extra warmth drain per tick at the coldest point of winter night. */
  coldRate: number;
  /** Loneliness per tick. Slow: a day alone is fine, a season alone is not. */
  companyRate: number;
  /** Above this, a need starts costing health. */
  criticalThreshold: number;
  /** Health lost per tick per critical need. */
  criticalDamage: number;
  /** Health regained per tick when no need is critical. */
  recoveryRate: number;
}

export interface PopulationConfig {
  bands: number;
  peoplePerBand: number;
}

export interface SimConfig {
  seed: number | string;
  world: WorldConfig;
  time: TimeConfig;
  needs: NeedsConfig;
  population: PopulationConfig;
  /** Tiles a person can see; the radius of witness and target queries. */
  sightRadius: number;
  /** A person re-scores their action every this many ticks (staggered by id). */
  thinkInterval: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 1,
  world: {
    width: 128,
    height: 128,
    waterLevel: 0.32,
    chunkSize: 16,
    berryBushes: 280,
    flintOutcrops: 60,
    deadwood: 150,
    gameAnimals: 40,
    reedBeds: 90,
    clayBanks: 60,
    treeDensity: 0.55,
  },
  time: {
    ticksPerDay: 240,
    daysPerSeason: 20,
    startDay: 10,
    tickRate: 20,
    maxTicksPerFrame: 5,
  },
  needs: {
    hungerRate: 0.055,
    thirstRate: 0.085,
    fatigueRate: 0.04,
    coldRate: 0.06,
    companyRate: 0.07,
    criticalThreshold: 85,
    criticalDamage: 0.06,
    recoveryRate: 0.02,
  },
  population: {
    bands: 2,
    peoplePerBand: 15,
  },
  sightRadius: 12,
  thinkInterval: 5,
};

/** Deep-ish merge of a partial override onto the defaults. */
export function makeConfig(overrides: DeepPartial<SimConfig> = {}): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    world: { ...DEFAULT_CONFIG.world, ...overrides.world },
    time: { ...DEFAULT_CONFIG.time, ...overrides.time },
    needs: { ...DEFAULT_CONFIG.needs, ...overrides.needs },
    population: { ...DEFAULT_CONFIG.population, ...overrides.population },
  } as SimConfig;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};
