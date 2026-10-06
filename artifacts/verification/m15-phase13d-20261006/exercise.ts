// A scenario in which every node of 13d is reachable (the plan's own scenarios `hearths` and
// `craft` start without leatherwork, bone_working or cordage, so nobody can ever reach them there).
// Run from the repo root: tsx artifacts/verification/m15-phase13d-20261006/exercise.ts <steps> <seed...>
// The same file runs on the previous commit's build for the "before" side: it names only techs
// that exist in both builds, and prints the counters whose names match NODE_COUNTERS.
import { Simulation } from '../../../src/sim/core/Simulation.ts';
import { telemetry } from '../../../src/sim/core/Telemetry.ts';

const steps = Number(process.argv[2] ?? 8000);
const seeds = process.argv.slice(3);
const NODE_COUNTERS = new RegExp(process.env.NODE_COUNTERS ?? "stone_boiling|broth|flatbread|sling|fire_hardened|^harvest_bone|^armed_hunt|^hunt_(killed|missed)|^ate_|^crafted_|^death|^died|starv|^deaths");
for (const seed of seeds) {
  telemetry.reset();
  telemetry.enable();
  const sim = new Simulation({
    seed: 'exercise-' + seed,
    population: {
      bands: 2, peoplePerBand: 12,
      startingTech: ['firemaking', 'cooking', 'clothing', 'leatherwork', 'bone_working', 'hafting',
        'spear', 'cordage', 'stoneworking', 'grinding', 'pottery'],
      // EXTRA_FEW=tech1,tech2: two founders per band begin knowing these, so the *use* of a node is
      // measured even though nobody works a node out from nothing inside a short run.
      ...(process.env.EXTRA_FEW ? { startingTechFew: process.env.EXTRA_FEW.split(',').map(tech => ({ tech, perBand: 2 })) } : {}),
    },
  });
  const start = sim.livingPeople().length;
  for (let i = 0; i < steps; i++) {
    sim.step();
    // A finished hearth beside each camp from the first day (the planner raises one only some
    // seeds), so the recipes made at a hearth can be reached at all. Same on both sides.
    if (i === 300) {
      for (const band of sim.bands) {
        for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2], [4, 0], [0, 4], [-4, 0], [0, -4]]) {
          const hearth = sim.place('hearth', Math.round(band.homeX) + dx!, Math.round(band.homeY) + dy!, band.id);
          if (hearth) { hearth.complete = true; break; }
        }
      }
    }
  }
  const holders: Record<string, number> = {};
  for (const p of sim.livingPeople()) for (const t of p.knownTech) holders[t] = (holders[t] ?? 0) + 1;
  const counters = Object.fromEntries(Object.entries(telemetry.snapshot()).filter(([k]) => NODE_COUNTERS.test(k)).sort());
  console.log(JSON.stringify({ seed, steps, start, end: sim.livingPeople().length, techsKnown: Object.keys(holders).length, holders, counters }));
}
