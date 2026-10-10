import type { Simulation } from '../src/sim/core/Simulation.ts';
import type { Person } from '../src/sim/entities/Person.ts';
import { Building, BUILDINGS } from '../src/sim/entities/Building.ts';
import { RECIPES } from '../src/sim/entities/Recipe.ts';
import { torchInHand } from '../src/sim/core/Torch.ts';

interface Watch {
  actors: Person[]; makers: Person[]; carrier: Person;
  nightWitnesses: number; dayWitnesses: number | null;
  previous: number[]; work: number[]; samples: number[]; torchSamples: number;
}
const watches = new WeakMap<Simulation, Watch>();

/** Paired opportunities isolate readers; this is not an autonomous robbery cohort. */
function deed(sim: Simulation, actors: Person[]): number {
  const [actor, victim, observer] = actors;
  for (const person of actors) { person.path = null; person.targetX = person.x; person.targetY = person.y; }
  actor!.x = victim!.x = 20; actor!.y = victim!.y = 20;
  observer!.x = 27; observer!.y = 20;
  // Hold the observer opportunity fixed: unrelated NPCs walking into range
  // by noon would make the disabled-reader mutant look like a night effect.
  sim.peopleHash.rebuild(actors);
  try {
    return sim.social.emit('theft', actor!, victim!, 0.5, sim.time.tick, sim.peopleHash, sim.config.sightRadius).witnesses;
  } finally { sim.peopleHash.rebuild(sim.livingPeople()); }
}

export function setupNights(sim: Simulation): void {
  const adults = sim.livingPeople().filter(person => !person.isChild);
  if (adults.length < 6) throw new Error('nights needs six adults');
  for (const person of sim.livingPeople()) {
    person.x = 6; person.y = 6; person.path = null;
    person.targetX = person.x; person.targetY = person.y;
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  }
  const actors = adults.slice(0, 3), makers = adults.slice(3, 5), carrier = adults[5]!;
  const fire = new Building(BUILDINGS.hearth!, 10, 10, makers[0]!.bandId, sim.ids);
  fire.complete = true; fire.durability = fire.def.workTicks;
  sim.buildings.push(fire); sim.buildingsById.set(fire.id, fire); sim.buildingHash.insert(fire);
  for (let i = 0; i < makers.length; i++) {
    const person = makers[i]!;
    person.x = i === 0 ? fire.centerX : 30; person.y = i === 0 ? fire.centerY : 30;
    person.targetX = person.x; person.targetY = person.y; person.skills.knap = 0;
    for (const [item, amount] of Object.entries(RECIPES.handaxe!.ingredients)) person.inventory.add(item, amount);
    if (!sim.order(person, 'craft', { recipeId: 'handaxe' })) throw new Error('nights craft refused');
  }
  carrier.x = fire.centerX; carrier.y = fire.centerY;
  carrier.targetX = carrier.x; carrier.targetY = carrier.y;
  carrier.inventory.add('fat_torch', 1);
  sim.peopleHash.rebuild(sim.livingPeople());
  if (!sim.order(carrier, 'light_torch', { itemId: 'fat_torch' })) throw new Error('nights ignition refused');
  watches.set(sim, { actors, makers, carrier, nightWitnesses: deed(sim, actors), dayWitnesses: null,
    previous: makers.map(person => person.bankedFor('craft:handaxe')), work: [0, 0], samples: [0, 0], torchSamples: 0 });
}

export function observeNights(sim: Simulation): void {
  const watch = watches.get(sim); if (!watch) return;
  if (watch.dayWitnesses === null && sim.time.tick % sim.config.time.ticksPerDay === sim.config.time.ticksPerDay / 2) {
    watch.dayWitnesses = deed(sim, watch.actors);
  }
  for (let i = 0; i < watch.makers.length; i++) {
    const person = watch.makers[i]!, bank = person.bankedFor('craft:handaxe');
    const delta = bank - watch.previous[i]!;
    // Completion clears the bank. Count only real positive work, never that reset.
    if (sim.time.daylight < 0.25 && delta > 0) { watch.work[i]! += delta; watch.samples[i]!++; }
    watch.previous[i] = bank;
  }
  if (sim.time.season === 'winter' && sim.time.daylight < 0.25 && torchInHand(watch.carrier)) watch.torchSamples++;
}

export function nightsMeasurements(sim: Simulation) { return watches.get(sim); }
