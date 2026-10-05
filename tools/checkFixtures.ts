/** Controlled opportunities, not desired outcomes: no opinions or AI choices are injected. */
import type { Simulation } from '../src/sim/core/Simulation.ts';
import { PlaceMemory } from '../src/sim/social/PlaceMemory.ts';

export function setupFoodNews(sim: Simulation): void {
  const adults = sim.livingPeople().filter(p => !p.isChild);
  const learner = adults[0]!;
  const teller = adults[1]!;
  // A shoal's spawn order is unrelated to its distance from the listener.
  // The first generated fish moved farther away when phase 27 put fish in
  // shallow water; that made rest beat the rumour without testing whether
  // conversation transfers a location. Keep the nearest opportunity beyond
  // sight, through the same spatial query the simulation uses.
  const food = sim.nodeHash.findNearest(learner.x, learner.y, 30, n => n.kind === 'fish' &&
    learner.distanceTo(n) > sim.sightOf(learner) + 4 && learner.distanceTo(n) < 30 &&
    sim.world.sameRegion(learner.x, learner.y, n.x, n.y));
  if (!food) throw new Error('food-news fixture needs fish beyond sight on the same landmass');
  for (const node of sim.nodes) node.amount = node === food ? node.def.maxAmount : 0;
  for (const tree of sim.trees) { tree.fruit = 0; tree.standing = false; }
  for (const animal of sim.animals) animal.alive = false;
  for (const person of sim.people) {
    person.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
    person.placeMemoryStaticCell = -1;
    person.placeMemoryStaticDay = -1;
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    person.needs.hunger = 0; person.needs.thirst = 0; person.needs.fatigue = 0;
    person.needs.cold = 0; person.needs.company = 0;
    if (person !== learner) sim.order(person, 'rest');
  }
  learner.forgetPlans();
  learner.needs.hunger = 80;
  teller.placeMemory.remember('resource:fish', food.x, food.y, sim.time.day, 2, 'seen');
  // Real conversation is the only route by which the learner gets this place.
  sim.social.converse(teller, learner, sim.time.tick, sim.peopleById, 'chat');
}

export function setupConflicts(sim: Simulation): void {
  const actor = sim.livingPeople().find(p => !p.isChild)!;
  const victim = sim.livingPeople().find(p => !p.isChild && p.bandId !== actor.bandId)!;
  victim.x = actor.x; victim.y = actor.y;
  for (const person of sim.people) {
    person.needs.hunger = 0; person.needs.thirst = 0; person.needs.fatigue = 0;
    person.needs.cold = 0; person.needs.company = 0;
    if (person !== actor) sim.order(person, 'rest');
  }
  sim.peopleHash.rebuild(sim.livingPeople());
  // A witnessed assault must travel through ActionSystem and SocialSystem.
  // Existing family ties supply the positive control; hostility is not seeded.
  if (!sim.order(actor, 'attack', { personId: victim.id })) throw new Error('conflicts fixture cannot start assault');
}
