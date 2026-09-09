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
  /** Herds of wild animals placed at world generation, not individual beasts. */
  gameHerds: number;
  reedBeds: number;
  clayBanks: number;
  /** Fishing spots, placed on shore tiles like reed beds and clay banks. */
  fishingSpots: number;
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
  /**
   * Default real-time steps per second, and the value the speed slider opens
   * on. One source of truth: it used to be hardcoded in three places.
   */
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
  /**
   * Need levels at which a stretch of work stops.
   *
   * Here rather than as a constant in `ActionSystem` because a scenario needs
   * to be able to move them: they are the single strongest lever on how much
   * work the world gets done. `ActionSystem.workLimit` reads these as a *base*
   * and adjusts them per job — read the comment there before changing a number,
   * because a need parks at whatever line stops it.
   */
  workLimits: { thirst: number; hunger: number; cold: number };
  /**
   * Multiplier on `thirstRate` at the hottest point of a summer day.
   *
   * Hard work and hot weather are the two things that actually make somebody
   * thirsty, and until this existed neither did: a person asleep in a hut in
   * February drank at exactly the rate of one felling a tree in July.
   */
  heatThirst: number;
}

/**
 * The research lifecycle's numbers.
 *
 * Exposed here rather than left as module constants because the owner asked for
 * them to be adjustable, and because the pace of discovery is the kind of thing
 * a scenario legitimately wants to move — `craft` and `scribes` both already
 * cheat with `startingTech` for want of it.
 */
export interface KnowledgeConfig {
  /** Base chance per day that a satisfied spark actually becomes an idea. */
  conceptionBase: number;
  /** Chance per day that somebody puts a prototype to the test at all. */
  trialChance: number;
  /** Successful trials needed to prove a design. */
  trialsToProve: number;
  /**
   * What a *failed* trial is worth, as a fraction of a successful one.
   *
   * Not zero: finding out that something does not work is how you find out how
   * to make it work. At 0.34 three failures are worth about one success, so a
   * run of bad luck is a delay rather than a wall.
   */
  failedTrialCredit: number;
}

export interface PopulationConfig {
  bands: number;
  peoplePerBand: number;
  /**
   * Technologies the founding adults already hold.
   *
   * Empty in every world a player will ever start, and the reason it exists is
   * the health harness: knowledge is worked out by individuals over years, so
   * even a twenty-year run proves only a handful of technologies and anything
   * gated behind one is unreachable by any check the suite can run. Crafting
   * and the granary were both invisible to the harness for exactly this reason,
   * which is part of how the granary stayed unbuildable for its whole existence
   * without anything noticing.
   *
   * The same affordance `harsh-winter` uses when it shortens a season to six
   * days: move the starting conditions so a run can reach the thing under test,
   * rather than weaken the test until it passes.
   */
  startingTech: string[];
}

export interface SimConfig {
  seed: number | string;
  world: WorldConfig;
  time: TimeConfig;
  needs: NeedsConfig;
  population: PopulationConfig;
  knowledge: KnowledgeConfig;
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
    // Twenty-two herds, not fourteen. The `game` resource node this replaced was
    // spread over forty separate sites; the same number of animals gathered into
    // fourteen herds is far harder to *find*, and wild meat is the one food that
    // does not stop existing in winter — which is when the island kills people.
    gameHerds: 22,
    reedBeds: 90,
    clayBanks: 60,
    fishingSpots: 50,
    treeDensity: 0.55,
  },
  time: {
    ticksPerDay: 240,
    daysPerSeason: 20,
    startDay: 10,
    // Five steps a second, not twenty. At twenty the world is unreadable: a
    // harvest cycle passes in under half a second and there is no following
    // what anyone is doing. This is the one place the default lives — the
    // browser loop and the HUD slider both read it rather than repeating it.
    tickRate: 5,
    maxTicksPerFrame: 5,
  },
  needs: {
    hungerRate: 0.055,
    // 0.075, not the 0.085 this shipped with, because `EXERTION` now multiplies
    // it and the owner asked for the need itself to be lower. Hard work in high
    // summer reaches about 1.9x this, which is a touch above the old flat rate;
    // resting through a winter night is about 0.4x it. The point of the change
    // is the *spread* — a person asleep in a hut used to get thirsty at exactly
    // the rate of one felling a tree in July.
    thirstRate: 0.075,
    fatigueRate: 0.04,
    coldRate: 0.06,
    companyRate: 0.07,
    criticalThreshold: 85,
    criticalDamage: 0.06,
    recoveryRate: 0.02,
    // 42/48/50, not the 35/40/45 this shipped with. Raised because work stopped
    // so readily that the owner reported it from play — but raised only a
    // little, because a need parks *at* the line that stops it and these are
    // therefore also where the population's average hunger and thirst settle.
    // The real answer to "my forager keeps wandering off" is not this number,
    // it is `ActionSystem.workLimit` exempting a job from the need it answers.
    workLimits: { thirst: 42, hunger: 48, cold: 50 },
    heatThirst: 1.25,
  },
  population: {
    // Three tribes, not two. With two, "another band" is one specific set of
    // people, and every question about outsiders has the same answer.
    bands: 3,
    // Ten, not fifteen. Three bands of families are far more mouths than two
    // bands of unrelated adults: every family brings children, who eat a full
    // share and forage at a fraction of an adult's rate. At fifteen the island
    // carried 48 people on forage tuned for 30 and the difference came out as
    // mass starvation inside a season.
    peoplePerBand: 10,
    startingTech: [],
  },
  knowledge: {
    // 0.06, not the 0.045 this shipped with. The owner asked for ideas to come
    // a little more readily; the ceiling is not taste but the
    // `ideas-are-conceived` check, which fails above three ideas per
    // person-year and reported about one before this was raised.
    conceptionBase: 0.06,
    trialChance: 0.18,
    trialsToProve: 3,
    failedTrialCredit: 0.34,
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
    needs: {
      ...DEFAULT_CONFIG.needs,
      ...overrides.needs,
      // One level deeper than everything else: `workLimits` is an object, so a
      // scenario overriding thirst alone would otherwise drop hunger and cold.
      workLimits: {
        ...DEFAULT_CONFIG.needs.workLimits,
        ...(overrides.needs?.workLimits ?? {}),
      },
    },
    population: { ...DEFAULT_CONFIG.population, ...overrides.population },
    knowledge: { ...DEFAULT_CONFIG.knowledge, ...overrides.knowledge },
  } as SimConfig;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};
