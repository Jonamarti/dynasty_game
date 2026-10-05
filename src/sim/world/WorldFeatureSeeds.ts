/**
 * Coarse locations for resources and domesticable ancestors on real maps.
 * These are regional seed areas, not scripted peoples or guaranteed deposits.
 */
export const WORLD_FEATURE = {
  river: 1 << 0,
  lake: 1 << 1,
  wildWheat: 1 << 2,
  wildBarley: 1 << 3,
  wildRice: 1 << 4,
  wildMillet: 1 << 5,
  wildMaize: 1 << 6,
  wildPotato: 1 << 7,
  wildSorghum: 1 << 8,
  wildAurochs: 1 << 9,
  wildSheep: 1 << 10,
  wildGoat: 1 << 11,
  wildHorse: 1 << 12,
  wildLlama: 1 << 13,
  flint: 1 << 14,
  obsidian: 1 << 15,
  copper: 1 << 16,
  tin: 1 << 17,
  gold: 1 << 18,
  salt: 1 << 19,
} as const;

export type WorldFeatureName = keyof typeof WORLD_FEATURE;

export interface WorldFeatureSeed {
  feature: WorldFeatureName;
  latitude: number;
  longitude: number;
  /** Bibliography key for the broad area represented by this seed. */
  source: WorldFeatureSourceId;
}

export const WORLD_FEATURE_SOURCE_IDS = [
  'wheat-barley-fertile-crescent', 'rice-yangtze', 'millet-yellow-river', 'maize-balsas',
  'potato-southern-peru', 'sorghum-eastern-sahel', 'aurochs-southwest-asia',
  'sheep-zagros', 'goat-zagros', 'horse-volga-don', 'llama-southern-andes',
  'flint-spiennes', 'flint-levant', 'obsidian-lipari', 'obsidian-nemrut',
  'copper-cyprus', 'copper-rio-tinto', 'copper-sinai', 'tin-cornwall',
  'tin-iberia', 'tin-erzgebirge', 'tin-malay', 'tin-yunnan', 'gold-sinai',
  'gold-carpathians', 'salt-hallstatt', 'salt-wieliczka', 'salt-dead-sea',
] as const;
export type WorldFeatureSourceId = typeof WORLD_FEATURE_SOURCE_IDS[number];

/** Broad origin/source areas, sourced per row in public/world/SOURCES.md. */
export const WORLD_FEATURE_SEEDS: readonly WorldFeatureSeed[] = [
  { feature: 'wildWheat', latitude: 34, longitude: 43, source: 'wheat-barley-fertile-crescent' },
  { feature: 'wildBarley', latitude: 36, longitude: 42, source: 'wheat-barley-fertile-crescent' },
  { feature: 'wildRice', latitude: 30, longitude: 112, source: 'rice-yangtze' },
  { feature: 'wildMillet', latitude: 37, longitude: 110, source: 'millet-yellow-river' },
  { feature: 'wildMaize', latitude: 19, longitude: -97, source: 'maize-balsas' },
  { feature: 'wildPotato', latitude: -15, longitude: -70, source: 'potato-southern-peru' },
  { feature: 'wildSorghum', latitude: 13, longitude: 1, source: 'sorghum-eastern-sahel' },
  { feature: 'wildAurochs', latitude: 38, longitude: 42, source: 'aurochs-southwest-asia' },
  { feature: 'wildSheep', latitude: 36, longitude: 45, source: 'sheep-zagros' },
  { feature: 'wildGoat', latitude: 35, longitude: 46, source: 'goat-zagros' },
  { feature: 'wildHorse', latitude: 48, longitude: 35, source: 'horse-volga-don' },
  { feature: 'wildLlama', latitude: -14, longitude: -72, source: 'llama-southern-andes' },
  { feature: 'flint', latitude: 50, longitude: 5, source: 'flint-spiennes' },
  { feature: 'flint', latitude: 35, longitude: 35, source: 'flint-levant' },
  { feature: 'obsidian', latitude: 38, longitude: 14, source: 'obsidian-lipari' },
  { feature: 'obsidian', latitude: 39, longitude: 44, source: 'obsidian-nemrut' },
  { feature: 'copper', latitude: 35, longitude: 33, source: 'copper-cyprus' },
  { feature: 'copper', latitude: 37, longitude: -7, source: 'copper-rio-tinto' },
  { feature: 'copper', latitude: 29, longitude: 34, source: 'copper-sinai' },
  { feature: 'tin', latitude: 50, longitude: -5, source: 'tin-cornwall' },
  { feature: 'tin', latitude: 43, longitude: -8, source: 'tin-iberia' },
  { feature: 'tin', latitude: 50, longitude: 13, source: 'tin-erzgebirge' },
  { feature: 'tin', latitude: 4, longitude: 102, source: 'tin-malay' },
  { feature: 'tin', latitude: 25, longitude: 103, source: 'tin-yunnan' },
  { feature: 'gold', latitude: 25, longitude: 33, source: 'gold-sinai' },
  { feature: 'gold', latitude: 47, longitude: 25, source: 'gold-carpathians' },
  { feature: 'salt', latitude: 47.56, longitude: 13.65, source: 'salt-hallstatt' },
  { feature: 'salt', latitude: 49.98, longitude: 20, source: 'salt-wieliczka' },
  { feature: 'salt', latitude: 31.5, longitude: 35.5, source: 'salt-dead-sea' },
];

export function seededWorldFeatures(width = 96, height = 48): Uint32Array {
  const flags = new Uint32Array(width * height);
  for (const seed of WORLD_FEATURE_SEEDS) {
    const x = wrap(Math.floor((wrapLongitude(seed.longitude) + 180) / 360 * width), width);
    const y = clamp(Math.floor((90 - seed.latitude) / 180 * height), 0, height - 1);
    flags[y * width + x] |= WORLD_FEATURE[seed.feature];
  }
  return flags;
}

function wrapLongitude(longitude: number): number {
  const wrapped = ((longitude + 180) % 360 + 360) % 360;
  return wrapped - 180;
}
function wrap(value: number, length: number): number { return ((value % length) + length) % length; }
function clamp(value: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, value)); }
