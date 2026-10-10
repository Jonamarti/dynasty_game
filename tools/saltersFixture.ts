import type { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { TECH, type Tech } from '../src/sim/knowledge/Tech.ts';
import { RECIPES } from '../src/sim/entities/Recipe.ts';
import { ITEMS } from '../src/sim/entities/Item.ts';
import { equipContainer } from '../src/sim/core/Carry.ts';

const preserved = new Set(Object.values(RECIPES)
  .filter(recipe => recipe.tech === 'preserving' || TECH[recipe.tech].web === 'preservation')
  .flatMap(recipe => Object.keys(recipe.output)).filter(item => ITEMS[item]!.nutrition > 0));
interface Watch { knowing: number; other: number; day: number; eaten: Map<number, Map<string, number>> }
const watches = new WeakMap<Simulation, Watch>();

/** Supplied coastal opportunity, not a survival coefficient calibration. */
export function setupSalters(sim: Simulation): void {
  const bands = sim.bands.filter(band => !band.outcast).sort((a, b) => a.id - b.id);
  if (bands.length !== 2) throw new Error('salters needs two bands');
  const knowing = bands[0]!.id, other = bands[1]!.id;
  const knowledge = new Set<Tech>();
  const add = (tech: Tech) => { if (knowledge.has(tech)) return; knowledge.add(tech); for (const prerequisite of TECH[tech].requires) add(prerequisite); };
  for (const tech of ['preserving', 'pottery', 'saltmaking', 'salting', 'smoking', 'pemmican'] as const) add(tech);
  for (const person of sim.livingPeople()) {
    if (person.bandId === knowing) for (const tech of knowledge) person.knownTech.add(tech);
    if (person.isChild) continue;
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    for (const [item, count] of [['meat', 6], ['fish', 6], ['sticks', 4], ['pottery', 1], ['basket', 1]] as const) person.inventory.add(item, count);
    equipContainer(person, 'basket');
    person.skills.cook = 70; person.needs.hunger = 25;
    person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  }
  for (const tech of knowledge) sim.knownTech.add(tech);
  const maker = sim.livingPeople().find(person => person.bandId === knowing && !person.isChild)!;
  let pan = null;
  for (const tile of [...sim.world.shoreTiles].sort((a, b) => maker.distanceTo(a) - maker.distanceTo(b))) {
    pan = sim.place('salt_pan', tile.x, tile.y, knowing); if (pan) break;
  }
  if (!pan) throw new Error('salters needs a saltwater footprint');
  pan.complete = true; pan.durability = pan.def.workTicks;
  let rack = null, hearth = null;
  for (let y = pan.y - 3; y <= pan.y + 4; y++) for (let x = pan.x - 3; x <= pan.x + 4; x++) {
    if (!rack) rack = sim.place('drying_rack', x, y, knowing);
    if (!hearth && Math.hypot(x - pan.centerX, y - pan.centerY) <= 3) hearth = sim.place('hearth', x, y, knowing);
  }
  if (!rack || !hearth) throw new Error('salters needs rack and fire');
  for (const station of [rack, hearth]) { station.complete = true; station.durability = station.def.workTicks; }
  // One explicit first batch gives this short window a guaranteed executor
  // opportunity; subsequent production and all meals are autonomous.
  maker.x = rack.centerX; maker.y = rack.centerY;
  maker.targetX = maker.x; maker.targetY = maker.y; maker.path = null;
  sim.peopleHash.rebuild(sim.livingPeople());
  sim.order(maker, 'craft', { recipeId: 'dried_meat', buildingId: rack.id });
  watches.set(sim, { knowing, other, day: sim.time.day, eaten: new Map(sim.people.map(person => [person.id, new Map(person.eatenToday)])) });
}

/** Real meals, including picked food; account for the daily ledger reset once. */
export function observeSalters(sim: Simulation): void {
  const watch = watches.get(sim); if (!watch) return;
  const newDay = watch.day !== sim.time.day;
  for (const person of sim.people) {
    const previous = newDay ? undefined : watch.eaten.get(person.id);
    for (const [item, count] of person.eatenToday) {
      const meals = Math.max(0, count - (previous?.get(item) ?? 0));
      if (meals > 0 && sim.time.season === 'winter') {
        const role = person.bandId === watch.knowing ? 'knowing' : 'other';
        telemetry.count('salters_winter_meals_' + role, meals);
        if (preserved.has(item)) telemetry.count('salters_winter_preserved_' + role, meals);
      }
    }
    watch.eaten.set(person.id, new Map(person.eatenToday));
  }
  watch.day = sim.time.day;
}

export function saltersLosses(sim: Simulation): { knowing: number; other: number } | null {
  const watch = watches.get(sim); if (!watch) return null;
  return { knowing: telemetry.get('spoiled_band_' + watch.knowing + '_nutrition'), other: telemetry.get('spoiled_band_' + watch.other + '_nutrition') };
}
