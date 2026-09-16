/**
 * The tunable surface of the simulation, and the five difficulties that stamp it.
 *
 * Two lists that have to agree about thirty dotted config paths, kept in one
 * file so they cannot drift: `TUNABLES` says what a player may move and how to
 * present it, `DIFFICULTIES` says where each anchor puts it. Splitting the
 * labels out into `src/ui/` was the obvious alternative and was rejected for
 * exactly that reason — a path typed into one list and not the other is silent.
 *
 * Data only, no DOM, so `src/ui/`, `src/main.ts` and `tools/` can all read it
 * and the rule about `src/sim/` never touching the renderer still holds.
 *
 * **Normal is exactly what this game ships.** Every number in the `normal`
 * column is the value already in `DEFAULT_CONFIG`, and `config.test.ts` proves a
 * Normal world is step-for-step identical to an unconfigured one. Anything else
 * would make this file a silent retune of the whole game.
 */
import { DEFAULT_CONFIG, type DeepPartial, type SimConfig } from './Config.ts';

export type DifficultyId = 'peaceful' | 'easy' | 'normal' | 'hard' | 'extreme';

export const DIFFICULTY_IDS: readonly DifficultyId[] =
  ['peaceful', 'easy', 'normal', 'hard', 'extreme'] as const;

export const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  peaceful: 'Peaceful',
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  extreme: 'Extreme',
};

/** A line under the slider saying what each anchor is for. */
export const DIFFICULTY_NOTES: Record<DifficultyId, string> = {
  peaceful: 'A generous island. Ideas come quickly and nobody starves easily — ' +
    'for watching a dynasty grow rather than fighting for one.',
  easy: 'Forgiving. There is slack in the food supply and time to think.',
  normal: 'The game as it was tuned and measured.',
  hard: 'A thinner island and slower minds. Winter is a real question.',
  extreme: 'Scarce, cold and forgetful. Most bands will not see a second generation.',
};

export type TunableGroup = 'body' | 'land' | 'mind' | 'people' | 'clock';

export const GROUP_LABELS: Record<TunableGroup, string> = {
  body: 'Bodies and needs',
  land: 'Land and food',
  mind: 'Minds and knowledge',
  people: 'People',
  clock: 'The clock',
};

export interface Tunable {
  /** Dotted path into `SimConfig`. Asserted against the defaults by a test. */
  path: string;
  label: string;
  /** One line of prose. Says which way is harder, and any limit of scope. */
  hint: string;
  group: TunableGroup;
  min: number;
  max: number;
  step: number;
  /** Decimal places in the number box. */
  places: number;
  /**
   * True if the value is spent during construction and a change needs a new
   * world. Per *field*, not per section: `world.regrowthRate` sits in an
   * otherwise worldgen-only interface and is read live every twenty ticks.
   */
  restart: boolean;
  /**
   * Whether the difficulty slider moves this one.
   *
   * A pinned field is still exposed and still individually editable. It is
   * pinned because the direction of "harder" is either ambiguous or entangled
   * with something else — the reason is on each one below.
   */
  scaled: boolean;
}

export const TUNABLES: Tunable[] = [
  // --- bodies -------------------------------------------------------------
  { path: 'needs.hungerRate', label: 'Hunger', group: 'body', scaled: true, restart: false,
    min: 0.005, max: 0.3, step: 0.001, places: 3,
    hint: 'Hunger gained per tick. Higher is hungrier.' },
  { path: 'needs.thirstRate', label: 'Thirst', group: 'body', scaled: true, restart: false,
    min: 0.005, max: 0.4, step: 0.001, places: 3,
    hint: 'Thirst per tick, before hard work and hot weather multiply it.' },
  { path: 'needs.fatigueRate', label: 'Tiredness', group: 'body', scaled: true, restart: false,
    min: 0.005, max: 0.3, step: 0.001, places: 3,
    hint: 'Fatigue per tick. Higher means more of the day is spent asleep.' },
  { path: 'needs.coldRate', label: 'Cold', group: 'body', scaled: true, restart: false,
    min: 0, max: 0.3, step: 0.001, places: 3,
    hint: 'Extra warmth lost per tick at the coldest point of a winter night.' },
  { path: 'needs.companyRate', label: 'Loneliness', group: 'body', scaled: true, restart: false,
    min: 0, max: 0.3, step: 0.001, places: 3,
    hint: 'Loneliness per tick. A day alone is fine; a season alone is not.' },
  { path: 'needs.criticalDamage', label: 'Harm from neglect', group: 'body', scaled: true, restart: false,
    min: 0, max: 0.3, step: 0.001, places: 3,
    hint: 'Health lost per tick for each need left critical. Higher is deadlier.' },
  { path: 'needs.recoveryRate', label: 'Healing', group: 'body', scaled: true, restart: false,
    min: 0, max: 0.2, step: 0.001, places: 3,
    hint: 'Health regained per tick when nothing is critical. Higher is kinder.' },
  { path: 'needs.heatThirst', label: 'Summer thirst', group: 'body', scaled: true, restart: false,
    min: 1, max: 3, step: 0.05, places: 2,
    hint: 'How much harder a hot summer day makes somebody drink.' },
  // The four below are pinned. `Config.ts` records that a need parks *at*
  // whatever line stops work, so these are also where the band's average hunger
  // and thirst settle: moving them with difficulty would change the meaning of
  // every hunger number above them. They are calibrated against
  // `ActionSystem.workLimit`'s per-job exemptions besides.
  { path: 'needs.criticalThreshold', label: 'Critical at', group: 'body', scaled: false, restart: false,
    min: 40, max: 100, step: 1, places: 0,
    hint: 'Above this a need starts costing health. Not moved by difficulty.' },
  { path: 'needs.workLimits.thirst', label: 'Stop work — thirst', group: 'body', scaled: false, restart: false,
    min: 10, max: 100, step: 1, places: 0,
    hint: 'A need settles at the line that stops work, so this is also roughly ' +
      'where the band average sits. Not moved by difficulty.' },
  { path: 'needs.workLimits.hunger', label: 'Stop work — hunger', group: 'body', scaled: false, restart: false,
    min: 10, max: 100, step: 1, places: 0,
    hint: 'As above. Raising it gets more work done and leaves everyone hungrier.' },
  { path: 'needs.workLimits.cold', label: 'Stop work — cold', group: 'body', scaled: false, restart: false,
    min: 10, max: 100, step: 1, places: 0,
    hint: 'As above, for warmth.' },

  // --- land ---------------------------------------------------------------
  { path: 'world.regrowthRate', label: 'Regrowth speed', group: 'land', scaled: true, restart: false,
    min: 0.1, max: 5, step: 0.05, places: 2,
    hint: 'How fast berries, sticks, reeds, clay and fish come back. Trees grow ' +
      'on their own model and are not affected by this.' },
  { path: 'world.berryBushes', label: 'Berry bushes', group: 'land', scaled: true, restart: true,
    min: 0, max: 900, step: 10, places: 0,
    hint: 'Bushes placed at world generation. The staple food.' },
  { path: 'world.gameHerds', label: 'Game herds', group: 'land', scaled: true, restart: true,
    min: 0, max: 80, step: 1, places: 0,
    hint: 'Herds, not animals. Meat is the one food that does not stop existing ' +
      'in winter, which is when the island kills people.' },
  { path: 'world.fishingSpots', label: 'Fishing spots', group: 'land', scaled: true, restart: true,
    min: 0, max: 200, step: 1, places: 0,
    hint: 'Shore fisheries. They keep producing through the winter.' },
  { path: 'world.wildGrainPatches', label: 'Wild grain', group: 'land', scaled: true, restart: true,
    min: 0, max: 300, step: 5, places: 0,
    hint: 'Stands of wild cereal on open grass. Poor food, and the only place ' +
      'the first seed corn can come from — set this to zero and nobody can farm.' },
  { path: 'world.treeDensity', label: 'Forest density', group: 'land', scaled: true, restart: true,
    min: 0.05, max: 1, step: 0.01, places: 2,
    hint: 'Timber, and the fruit and nuts that come with it.' },
  { path: 'world.deadwood', label: 'Deadwood', group: 'land', scaled: true, restart: true,
    min: 0, max: 500, step: 5, places: 0,
    hint: 'Loose sticks — the material almost everything early is built from.' },
  { path: 'world.reedBeds', label: 'Reed beds', group: 'land', scaled: true, restart: true,
    min: 0, max: 300, step: 5, places: 0,
    hint: 'Thatch, for roofs and for cordage.' },
  { path: 'world.flintOutcrops', label: 'Flint outcrops', group: 'land', scaled: true, restart: true,
    min: 0, max: 250, step: 5, places: 0,
    hint: 'Flint never regrows, so this is the whole supply for the run.' },
  { path: 'world.clayBanks', label: 'Clay banks', group: 'land', scaled: true, restart: true,
    min: 0, max: 250, step: 5, places: 0,
    hint: 'Mud, for walls and later for pots.' },

  // --- minds --------------------------------------------------------------
  { path: 'knowledge.conceptionBase', label: 'Idea rate', group: 'mind', scaled: true, restart: false,
    min: 0.005, max: 0.5, step: 0.005, places: 3,
    hint: 'Daily chance a satisfied spark actually becomes an idea. The strongest ' +
      'single lever on how fast the tech tree is climbed.' },
  { path: 'knowledge.trialChance', label: 'Trial rate', group: 'mind', scaled: true, restart: false,
    min: 0.01, max: 1, step: 0.01, places: 2,
    hint: 'Daily chance somebody puts a prototype to the test at all.' },
  { path: 'knowledge.trialsToProve', label: 'Trials to prove', group: 'mind', scaled: true, restart: false,
    min: 1, max: 10, step: 1, places: 0,
    hint: 'Successful trials a design needs before it counts as known. Fewer is easier.' },
  { path: 'knowledge.failedTrialCredit', label: 'Worth of a failure', group: 'mind', scaled: true, restart: false,
    min: 0, max: 1, step: 0.01, places: 2,
    hint: 'What a failed trial is worth against a successful one. Finding out that ' +
      'something does not work is how you find out how to make it work.' },
  { path: 'learning.skillGain', label: 'Skill from work', group: 'mind', scaled: true, restart: false,
    min: 0.1, max: 5, step: 0.05, places: 2,
    hint: 'How fast doing a job makes somebody better at it. Skill sets forage ' +
      'yields, so this reaches the whole food economy.' },
  { path: 'learning.observationChance', label: 'Learning by watching', group: 'mind', scaled: true, restart: false,
    min: 0, max: 0.5, step: 0.005, places: 3,
    hint: 'Daily chance an adult picks up a technology just from being near ' +
      'somebody who already has it.' },
  { path: 'learning.childObservationChance', label: 'Children watching', group: 'mind', scaled: true, restart: false,
    min: 0, max: 0.5, step: 0.005, places: 3,
    hint: 'The same for a child, who is doing nothing else. The free channel a ' +
      'band relies on between one generation and the next.' },
  { path: 'sightRadius', label: 'Sight', group: 'mind', scaled: true, restart: false,
    min: 4, max: 30, step: 1, places: 0,
    hint: 'Tiles a person can see. Sets what they can find, and what they witness.' },

  // --- people -------------------------------------------------------------
  { path: 'population.conceptionChance', label: 'Birth rate', group: 'people', scaled: true, restart: false,
    min: 0.01, max: 0.6, step: 0.005, places: 3,
    hint: 'Daily chance a fertile couple conceive, before hunger and health scale ' +
      'it down.' },
  // Pinned: more bands is both more competition for the island and more hands on
  // it, so which direction is "harder" is genuinely ambiguous, and any number
  // here would be invented rather than measured.
  { path: 'population.bands', label: 'Tribes', group: 'people', scaled: false, restart: true,
    min: 1, max: 8, step: 1, places: 0,
    hint: 'How many bands the island starts with. Not moved by difficulty — more ' +
      'tribes is both more rivalry and more people.' },
  { path: 'population.peoplePerBand', label: 'People per tribe', group: 'people', scaled: false, restart: true,
    min: 2, max: 30, step: 1, places: 0,
    hint: 'Founding size. Families bring children, who eat a full share and forage ' +
      'at a fraction of an adult rate.' },

  // --- the clock ----------------------------------------------------------
  // All pinned: pacing and the calendar are taste, not difficulty. Difficulty
  // gets its winter pressure from `coldRate` and `regrowthRate` instead.
  { path: 'time.tickRate', label: 'Game speed', group: 'clock', scaled: false, restart: false,
    min: 1, max: 120, step: 1, places: 0,
    hint: 'Steps per second the game opens at — the same number as the speed ' +
      'slider on the top bar.' },
  { path: 'time.ticksPerDay', label: 'Day length', group: 'clock', scaled: false, restart: true,
    min: 60, max: 960, step: 10, places: 0,
    hint: 'Steps in one in-game day. A new world only: the date is derived from ' +
      'the step count, so changing it mid-run would jump the calendar by years.' },
  { path: 'time.daysPerSeason', label: 'Season length', group: 'clock', scaled: false, restart: true,
    min: 4, max: 90, step: 1, places: 0,
    hint: 'Days in a season. Changes the calendar, the weather, and the pace of ' +
      'a life — a person always reaches adulthood at fourteen years old, but a ' +
      'shorter season makes that fourteen years pass in fewer days.' },
  { path: 'time.startDay', label: 'Starting day', group: 'clock', scaled: false, restart: true,
    min: 0, max: 39, step: 1, places: 0,
    hint: 'Where in the year a new world opens. The default is mid-spring, so a ' +
      'new band does not begin in a winter it cannot yet survive.' },
];

/** The paths the difficulty slider stamps, in `TUNABLES` order. */
export const SCALED_PATHS: string[] = TUNABLES.filter(t => t.scaled).map(t => t.path);

/**
 * Where each anchor puts every scaled field.
 *
 * Roughly x0.75 and x1.33 per step from Normal — a step a player can feel
 * without any single one being a cliff. Which way "harder" runs is stated in
 * each field's `hint`; where a lever is kinder when larger (`recoveryRate`,
 * `regrowthRate`, `skillGain`, every resource count) its column runs the other
 * way, which is why this is a table rather than one multiplier.
 *
 * These are *designed* numbers, not measured ones. `sim:seeds` cannot resolve a
 * change under about ten points of mean survival, so a claim that Hard had been
 * tuned would be a claim nobody has checked. What is checked is that Normal is
 * unchanged.
 */
export const DIFFICULTIES: Record<DifficultyId, Record<string, number>> = {
  peaceful: {
    'needs.hungerRate': 0.031, 'needs.thirstRate': 0.042, 'needs.fatigueRate': 0.023,
    'needs.coldRate': 0.034, 'needs.companyRate': 0.039, 'needs.criticalDamage': 0.034,
    'needs.recoveryRate': 0.034, 'needs.heatThirst': 1.1,
    'world.regrowthRate': 1.8, 'world.berryBushes': 420, 'world.gameHerds': 34,
    'world.fishingSpots': 76, 'world.wildGrainPatches': 53, 'world.treeDensity': 0.78, 'world.deadwood': 225,
    'world.reedBeds': 135, 'world.flintOutcrops': 90, 'world.clayBanks': 90,
    'knowledge.conceptionBase': 0.12, 'knowledge.trialChance': 0.32,
    'knowledge.trialsToProve': 2, 'knowledge.failedTrialCredit': 0.55,
    'learning.skillGain': 1.8, 'learning.observationChance': 0.04,
    'learning.childObservationChance': 0.11, 'sightRadius': 16,
    'population.conceptionChance': 0.185,
  },
  easy: {
    'needs.hungerRate': 0.042, 'needs.thirstRate': 0.057, 'needs.fatigueRate': 0.031,
    'needs.coldRate': 0.045, 'needs.companyRate': 0.053, 'needs.criticalDamage': 0.045,
    'needs.recoveryRate': 0.026, 'needs.heatThirst': 1.17,
    'world.regrowthRate': 1.35, 'world.berryBushes': 340, 'world.gameHerds': 27,
    'world.fishingSpots': 61, 'world.wildGrainPatches': 43, 'world.treeDensity': 0.65, 'world.deadwood': 182,
    'world.reedBeds': 109, 'world.flintOutcrops': 73, 'world.clayBanks': 73,
    'knowledge.conceptionBase': 0.085, 'knowledge.trialChance': 0.24,
    'knowledge.trialsToProve': 2, 'knowledge.failedTrialCredit': 0.44,
    'learning.skillGain': 1.35, 'learning.observationChance': 0.028,
    'learning.childObservationChance': 0.076, 'sightRadius': 14,
    'population.conceptionChance': 0.15,
  },
  // Every number below is `DEFAULT_CONFIG`'s, and `config.test.ts` proves it.
  normal: {
    'needs.hungerRate': 0.055, 'needs.thirstRate': 0.075, 'needs.fatigueRate': 0.04,
    'needs.coldRate': 0.06, 'needs.companyRate': 0.07, 'needs.criticalDamage': 0.06,
    'needs.recoveryRate': 0.02, 'needs.heatThirst': 1.25,
    'world.regrowthRate': 1, 'world.berryBushes': 280, 'world.gameHerds': 22,
    'world.fishingSpots': 50, 'world.wildGrainPatches': 35, 'world.treeDensity': 0.55, 'world.deadwood': 150,
    'world.reedBeds': 90, 'world.flintOutcrops': 60, 'world.clayBanks': 60,
    'knowledge.conceptionBase': 0.06, 'knowledge.trialChance': 0.18,
    'knowledge.trialsToProve': 3, 'knowledge.failedTrialCredit': 0.34,
    'learning.skillGain': 1, 'learning.observationChance': 0.02,
    'learning.childObservationChance': 0.055, 'sightRadius': 12,
    'population.conceptionChance': 0.12,
  },
  hard: {
    'needs.hungerRate': 0.072, 'needs.thirstRate': 0.098, 'needs.fatigueRate': 0.052,
    'needs.coldRate': 0.078, 'needs.companyRate': 0.091, 'needs.criticalDamage': 0.078,
    'needs.recoveryRate': 0.015, 'needs.heatThirst': 1.36,
    'world.regrowthRate': 0.74, 'world.berryBushes': 210, 'world.gameHerds': 16,
    'world.fishingSpots': 37, 'world.wildGrainPatches': 26, 'world.treeDensity': 0.44, 'world.deadwood': 112,
    'world.reedBeds': 68, 'world.flintOutcrops': 45, 'world.clayBanks': 45,
    'knowledge.conceptionBase': 0.042, 'knowledge.trialChance': 0.13,
    'knowledge.trialsToProve': 4, 'knowledge.failedTrialCredit': 0.25,
    'learning.skillGain': 0.74, 'learning.observationChance': 0.014,
    'learning.childObservationChance': 0.039, 'sightRadius': 10,
    'population.conceptionChance': 0.094,
  },
  extreme: {
    'needs.hungerRate': 0.094, 'needs.thirstRate': 0.128, 'needs.fatigueRate': 0.068,
    'needs.coldRate': 0.102, 'needs.companyRate': 0.119, 'needs.criticalDamage': 0.102,
    'needs.recoveryRate': 0.011, 'needs.heatThirst': 1.5,
    'world.regrowthRate': 0.55, 'world.berryBushes': 155, 'world.gameHerds': 12,
    'world.fishingSpots': 27, 'world.wildGrainPatches': 19, 'world.treeDensity': 0.34, 'world.deadwood': 83,
    'world.reedBeds': 50, 'world.flintOutcrops': 33, 'world.clayBanks': 33,
    'knowledge.conceptionBase': 0.029, 'knowledge.trialChance': 0.09,
    'knowledge.trialsToProve': 5, 'knowledge.failedTrialCredit': 0.18,
    'learning.skillGain': 0.55, 'learning.observationChance': 0.01,
    'learning.childObservationChance': 0.027, 'sightRadius': 8,
    'population.conceptionChance': 0.072,
  },
};

/** Reads a dotted path out of a config object. */
export function readPath(config: SimConfig, path: string): number {
  let node: unknown = config;
  for (const key of path.split('.')) {
    node = (node as Record<string, unknown>)[key];
    if (node === undefined) throw new Error('no such config path: ' + path);
  }
  return node as number;
}

/**
 * Writes a dotted path into a config object, in place.
 *
 * Deliberately mutating rather than returning a copy. A live settings edit works
 * precisely *because* the systems hold references to the objects inside
 * `SimConfig` — `NeedsSystem` and `TimeManager` were handed theirs in the
 * constructor — so replacing one would disconnect the system from its own config
 * and the edit would quietly stop arriving.
 */
export function writePath(config: SimConfig, path: string, value: number): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  let node = config as unknown as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = value;
}

/** Every exposed field's value at one anchor: scaled ones stamped, pinned ones default. */
export function valuesFor(id: DifficultyId): Record<string, number> {
  const values: Record<string, number> = {};
  for (const tunable of TUNABLES) {
    values[tunable.path] = tunable.scaled
      ? DIFFICULTIES[id][tunable.path]!
      : readPath(DEFAULT_CONFIG, tunable.path);
  }
  return values;
}

/**
 * A `Simulation` override object for one anchor plus whatever the player moved.
 *
 * Handed to the constructor as a `DeepPartial`, which is the same door every
 * scenario in `tools/simcheck.ts` already goes through: a difficulty is a data
 * change, not a code path.
 */
export function configFor(
  preset: DifficultyId,
  overrides: Record<string, number> = {}
): DeepPartial<SimConfig> {
  const values = { ...valuesFor(preset), ...overrides };
  // Start from a structural copy of the defaults so every nested object exists
  // for `writePath` to write into, then hand the whole thing over as the override.
  const built = structuredClone(DEFAULT_CONFIG);
  for (const [path, value] of Object.entries(values)) {
    if (TUNABLES.some(tunable => tunable.path === path)) writePath(built, path, value);
  }
  return built as DeepPartial<SimConfig>;
}
