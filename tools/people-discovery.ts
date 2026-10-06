/**
 * CLI: how often does the detailed game invent a technique, and how often does one band learn from another?
 * M15 phase 32c, mechanism 3 (Kremer). Read-only: it watches `knownTech` after each completed step and never
 * draws from any stream.
 *
 *   npx vite-node tools/people-discovery.ts -- invent <seed,seed,...> [steps] [out.json]
 *   npx vite-node tools/people-discovery.ts -- transfer <seed,seed,...> [steps] [out.json]
 *
 * `invent` runs the default world (`century`'s config) from founders who know nothing, and counts, season by
 * season, the techniques that appear for the first time among the living. The exposure, in the units the model
 * uses, is `sum over seasons of N x sum over open candidates of 1 / difficulty`, where a candidate is a technique
 * not yet known by anybody whose `requires` somebody holds and whose prototype materials the world has. The model's
 * per-person invention rate is then `events / exposure`.
 *
 * `transfer` runs two bands of the `craft` world, the first of which starts knowing three techniques the other
 * does not (`startingTechByBand`), and counts how many of those the second band comes to hold (one living member
 * is enough, as the model's bitset says "the people knows it"). Exposure is seasons x open candidates (known to
 * the first band, unknown to the second, requires held by the second). The model's learning rate at full contact
 * and similar climate is `events / exposure`, after the expected independent inventions are taken out.
 *
 * Both are single-digit-event measurements; the printed Poisson interval says how little that is.
 */
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { TECHS, TECH, prerequisitesMet, type Tech } from '../src/sim/knowledge/Tech.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const mode = args[0] ?? 'invent';
const seeds = (args[1] ?? 'alpha').split(',');
const stepsArg = args.find((a, i) => i >= 2 && /^\d+$/.test(a));
const out = args.find(a => a.endsWith('.json'));

/** Items a prototype may need that a world can lack (the same two the macro map gates: wild grain and flint). */
const keysOf = (tech: Tech) => Object.keys(TECH[tech].prototype);

function poisson95(k: number): [number, number] {
  // Exact-ish: Garwood interval via the chi-square quantiles for the small counts we have.
  const lower = [0, 0.025, 0.242, 0.619, 1.09, 1.62, 2.20, 2.81, 3.45, 4.12, 4.80, 5.49, 6.20, 6.92, 7.65, 8.40];
  const upper = [3.69, 5.57, 7.22, 8.77, 10.24, 11.67, 13.06, 14.42, 15.76, 17.08, 18.39, 19.68, 20.96, 22.23, 23.49, 24.74];
  if (k < lower.length) return [lower[k]!, upper[k]!];
  return [k - 1.96 * Math.sqrt(k), k + 1.96 * Math.sqrt(k)];
}

const result: Record<string, unknown> = { mode, seeds };

if (mode === 'invent') {
  const scenario = SCENARIOS.century!;
  let events = 0, exposure = 0, seasons = 0, personSeasons = 0;
  const found: { seed: string; tech: string; difficulty: number; season: number; population: number }[] = [];
  for (const seed of seeds) {
    const config = { ...makeConfig(scenario.config), seed };
    const sim = new Simulation(config);
    const kinds = new Set(sim.nodes.map(r => r.kind));
    console.log(`seed ${seed}: bands ${config.population.bands}, people ${sim.people.length}, resource kinds ${[...kinds].join(',')}`);
    const has = (item: string) => item === 'grain' ? kinds.has('wild_grain') : item === 'flint' ? kinds.has('flint') : item === 'mud' ? kinds.has('clay')
      : item === 'thatch' ? kinds.has('reeds') : true;
    const tpd = sim.config.time.ticksPerDay, dps = sim.config.time.daysPerSeason, sps = tpd * dps;
    const steps = stepsArg ? Number(stepsArg) : scenario.steps;
    const known = new Set<string>();
    const union = (): Set<string> => { const u = new Set<string>(); for (const p of sim.people) if (p.alive) for (const t of p.knownTech) u.add(t); return u; };
    let seasonIndex = 0, pop = sim.people.filter(p => p.alive).length;
    const t0 = Date.now();
    let candidates = (): number => TECHS.filter(t => !known.has(t) && prerequisitesMet(t, known) && keysOf(t).every(has)).reduce((n, t) => n + 1 / TECH[t].difficulty, 0);
    let open = candidates();
    for (let i = 1; i <= steps; i++) {
      sim.step();
      if (i % tpd === 0) {
        for (const t of union()) if (!known.has(t)) {
          known.add(t); events++;
          found.push({ seed, tech: t, difficulty: TECH[t as Tech].difficulty, season: seasonIndex, population: pop });
        }
      }
      if (i % sps === 0) {
        // Exposure is booked at the season's end with the season's starting state, so a technique found this
        // season counts as open for the whole of it, as the model's one draw per candidate does.
        exposure += pop * open; personSeasons += pop; seasons++;
        seasonIndex++;
        pop = sim.people.filter(p => p.alive).length;
        open = candidates();
      }
    }
    console.log(`  ${steps} steps, ${((Date.now() - t0) / 1000).toFixed(1)} s, known now ${[...known].join(',')}`);
  }
  const [lo, hi] = poisson95(events);
  const rate = events / exposure;
  console.log(`\nINVENT: ${events} techniques found in ${seasons} seasons (${personSeasons} person-seasons); exposure ${exposure.toFixed(1)} person-seasons x (1/difficulty)`);
  console.log(`  kappa = ${rate.toExponential(3)} per person-season per (1/difficulty)  [95% ${(lo / exposure).toExponential(2)} .. ${(hi / exposure).toExponential(2)}]`);
  for (const f of found) console.log(`  season ${f.seed} #${f.season}: ${f.tech} (difficulty ${f.difficulty}) with ${f.population} alive`);
  Object.assign(result, { events, exposure, seasons, personSeasons, kappa: rate, interval: [lo / exposure, hi / exposure], found });
} else if (mode === 'transfer') {
  const scenario = SCENARIOS.craft!;
  const gift = ['firemaking', 'plant_lore', 'cooking'];
  let events = 0, exposure = 0, seasonsObserved = 0, inventionsExpected = 0;
  const kappaGuess = args.find(a => a.startsWith('kappa='))?.slice(6);
  const found: { seed: string; tech: string; season: number }[] = [];
  const perTech: Record<string, number> = {};
  for (const seed of seeds) {
    const config = makeConfig({ ...scenario.config, population: { ...scenario.config.population, bands: 2, peoplePerBand: 12, startingTech: [], startingTechByBand: [gift, []] } });
    const sim = new Simulation({ ...config, seed });
    const tpd = sim.config.time.ticksPerDay, sps = tpd * sim.config.time.daysPerSeason;
    const steps = stepsArg ? Number(stepsArg) : scenario.steps;
    const band = (b: number) => { const u = new Set<string>(); for (const p of sim.people) if (p.alive && p.bandId === b) for (const t of p.knownTech) u.add(t); return u; };
    const bandIds = [...new Set(sim.people.map(p => p.bandId))].sort((a, b) => a - b);
    const [giver, taker] = [bandIds[0]!, bandIds[1]!];
    console.log(`seed ${seed}: bands ${bandIds.join(',')}, giver knows ${[...band(giver)].join(',')}, taker knows ${[...band(taker)].join(',') || 'nothing'}`);
    const learned = new Set<string>();
    let seasonIndex = 0;
    let open = 0, takerPop = 0;
    const refresh = () => {
      const g = band(giver), t = band(taker);
      // Only the gift counts: the other things the giver holds it found itself, and so may the taker.
      const candidates = [...g].filter(c => gift.includes(c) && !t.has(c) && !learned.has(c) && prerequisitesMet(c as Tech, t));
      open = candidates.length;
      takerPop = sim.people.filter(p => p.alive && p.bandId === taker).length;
      if (kappaGuess) inventionsExpected += candidates.reduce((n, c) => n + Number(kappaGuess) * takerPop / TECH[c as Tech].difficulty, 0);
      for (const c of candidates) perTech[c] = (perTech[c] ?? 0) + 1;
    };
    refresh();
    const t0 = Date.now();
    for (let i = 1; i <= steps; i++) {
      sim.step();
      if (i % tpd === 0) {
        const t = band(taker);
        for (const c of band(giver)) if (gift.includes(c) && t.has(c) && !learned.has(c)) { learned.add(c); events++; found.push({ seed, tech: c, season: seasonIndex }); }
      }
      if (i % sps === 0) { exposure += open; seasonsObserved++; seasonIndex++; refresh(); }
    }
    void takerPop;
    console.log(`  ${steps} steps, ${((Date.now() - t0) / 1000).toFixed(1)} s; taker now ${[...band(taker)].join(',') || 'nothing'}`);
  }
  const [lo, hi] = poisson95(events);
  console.log(`\nTRANSFER: ${events} techniques reached the second band in ${seasonsObserved} band-seasons; exposure ${exposure} open candidate-seasons`);
  console.log(`  mu = ${(events / exposure).toExponential(3)} per candidate-season at full contact  [95% ${(lo / exposure).toExponential(2)} .. ${(hi / exposure).toExponential(2)}]`);
  console.log(`  open candidate-seasons per technique: ${JSON.stringify(perTech)}; expected independent inventions of the gift by the taker (kappa ${kappaGuess ?? 'not given'}): ${inventionsExpected.toFixed(2)}`);
  if (kappaGuess) console.log(`  mu after taking the expected inventions out: ${(Math.max(0, events - inventionsExpected) / exposure).toExponential(3)}`);
  for (const f of found) console.log(`  ${f.seed}: ${f.tech} at season ${f.season}`);
  Object.assign(result, { events, exposure, inventionsExpected, perTech, mu: events / exposure, interval: [lo / exposure, hi / exposure], found });
} else {
  console.error('mode is invent or transfer'); process.exit(2);
}
if (out) writeFileSync(out, JSON.stringify(result, null, 1));
