import { RNG } from '../core/RNG.ts';

/** Synthetic, intentionally non-historical sound inventories used for distant residents. */
export interface RegionalPhonology {
  readonly onsets: readonly string[];
  readonly vowels: readonly string[];
  readonly codas: readonly string[];
  readonly syllables: 2 | 3;
}

const ONSET_POOL = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y', 'z', 'h', 'f', 'sh', 'th'];
const VOWEL_POOL = ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'ei', 'ia', 'oa', 'ui'];
const CODA_POOL = ['', 'm', 'n', 'r', 's', 't', 'k', 'l', 'sh', 'ng'];

function sample<T>(rng: RNG, pool: readonly T[], count: number): T[] {
  return rng.shuffle([...pool]).slice(0, count);
}

/**
 * Gives each macro-region a reproducible fictional sound inventory. Earth data
 * in this repository describes terrain and climate, not languages, so this
 * deliberately makes no claim about historical language families.
 */
export function regionalPhonology(seed: string | number, geography: 'earth' | 'random' | 'legacyIsland', regionId: number): RegionalPhonology {
  const rng = new RNG(`resident-phonology-v1|${seed}|${geography}|${regionId}`);
  return {
    onsets: sample(rng, ONSET_POOL, 5),
    vowels: sample(rng, VOWEL_POOL, 3),
    codas: sample(rng, CODA_POOL, 3),
    syllables: rng.chance(.35) ? 3 : 2,
  };
}

/** Name stream is derived from stable world/region/person identity, never a Simulation fork. */
export function regionalResidentName(seed: string | number, geography: 'earth' | 'random' | 'legacyIsland', regionId: number, personId: number): string {
  const phonology = regionalPhonology(seed, geography, regionId);
  const rng = new RNG(`resident-name-v1|${seed}|${geography}|${regionId}|${personId}`);
  const syllable = () => `${rng.pick(phonology.onsets)}${rng.pick(phonology.vowels)}${rng.pick(phonology.codas)}`;
  const raw = Array.from({ length: phonology.syllables }, syllable).join('');
  return raw[0]!.toLocaleUpperCase('en-US') + raw.slice(1);
}
