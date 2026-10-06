/**
 * CLI: does the technological gap between two peoples persist? M15 phase 32c, mechanism 3 (partial learning).
 *
 *   npx vite-node tools/people-gap.ts -- [streams] [seasons]
 *
 * Two peoples of equal size (40 adults), each founded holding a different branch of the tech tree (A the weapons chain,
 * B the plant-and-kitchen chain), related at a given contact, with the model's measured KAPPA, the starting aggregate
 * `LEARN_MU_START` and the starting partial learning. After `seasons` seasons (default 40 = 10 game years) the
 * **dispersion** is the number of techniques held by exactly one of the two (symmetric difference). Prints the mean
 * over `streams` seeded worlds for several contacts, and for the *control*: a high-diffusion build (`mu` and insight
 * rate raised by orders of magnitude), which must collapse it. Contact has no writer yet (docs/m15_phase32c_peoples.md);
 * 0.1 / 0.3 / 1 are what-ifs, not measurements: the contact the detailed game's two bands keep is not measured.
 */
import { PeopleSim, closeUnderRequires, emptyCohorts } from '../src/sim/world/PeopleSim.ts';
import { knowledge, regionMaterials, LEARN_MU_START, PARTIAL_START, type PartialLearning } from '../src/sim/world/PeopleKnowledge.ts';
import type { Tech } from '../src/sim/knowledge/Tech.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const STREAMS = Number(args[0] ?? 40), SEASONS = Number(args[1] ?? 40);
const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;
const A: Tech[] = closeUnderRequires(['bow', 'atlatl', 'sling']);
const B: Tech[] = closeUnderRequires(['plant_lore', 'cooking', 'basketry', 'fishing']);

function dispersion(seed: string, contact: number, mu: number, partial: PartialLearning, seasons: number): { initial: number; final: number } {
  const region = { materials: regionMaterials(), climate: { temperature: 0.5, wetness: 0.5 } };
  const sim = new PeopleSim(seed, CLOCK, [knowledge({ regionOf: () => region, mu, partial })]);
  const cohorts = () => { const c = emptyCohorts(); for (let b = 3; b <= 10; b++) { c.male[b] = 2; c.female[b] = 3; } return c; };
  const a = sim.found({ cohorts: cohorts(), comarcas: 1, techs: A });
  const b = sim.found({ cohorts: cohorts(), comarcas: 1, techs: B });
  sim.relation(a.id, b.id).contact = contact;
  const diff = () => { let n = 0; for (const t of new Set([...a.techs.list(), ...b.techs.list()])) if (a.techs.has(t) !== b.techs.has(t)) n++; return n; };
  const initial = diff();
  sim.advanceTo(seasons * SEASON);
  return { initial, final: diff() };
}

{
  const rows: [string, number, number, PartialLearning][] = [
    ['contact 0   ', 0, LEARN_MU_START, PARTIAL_START],
    ['contact 0.1 ', 0.1, LEARN_MU_START, PARTIAL_START],
    ['contact 0.3 ', 0.3, LEARN_MU_START, PARTIAL_START],
    ['contact 1   ', 1, LEARN_MU_START, PARTIAL_START],
    ['CONTROL high diffusion, contact 1', 1, 50, { rate: 5, hintGain: 4, sufferedWeapon: 3 }],
  ];
  for (const [name, contact, mu, partial] of rows) {
    const ratios: number[] = []; let init = 0;
    for (let k = 0; k < STREAMS; k++) { const r = dispersion(`gap-${k}`, contact, mu, partial, SEASONS); init = r.initial; ratios.push(r.final / r.initial); }
    const m = ratios.reduce((x, y) => x + y, 0) / ratios.length;
    console.log(`${name.padEnd(36)} initial ${init}  final/initial mean ${m.toFixed(3)}  min ${Math.min(...ratios).toFixed(2)} max ${Math.max(...ratios).toFixed(2)}  (${STREAMS} streams, ${SEASONS} seasons)`);
  }
}
