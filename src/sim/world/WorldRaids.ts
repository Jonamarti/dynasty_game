/** Known grievances choose routes; neither a global map nor hidden stores choose victims. */
import type { Person } from '../entities/Person.ts';
import { knowledgeOfWorld } from '../social/Knowledge.ts';
import type { Simulation } from '../core/Simulation.ts';
import type { JourneyPoint } from './Transport.ts';
import { stow } from '../core/Carry.ts';
import { ITEMS } from '../entities/Item.ts';
import { WorldNews } from '../social/WorldNews.ts';
import type { SocialEvent } from '../social/Events.ts';
import type { CaravanEvent, CaravanGoods } from './WorldCaravans.ts';

export function knownRaidDestination(actor: Person, victimBandId: number, from: JourneyPoint, width: number,
  canEnter: (cx: number, cy: number) => boolean): JourneyPoint | null {
  const candidates: (JourneyPoint & { distance: number })[] = [];
  knowledgeOfWorld(actor).each((cx, cy, lore) => {
    if ((cx === from.cx && cy === from.cy) || !lore.peoples.some(people => people.bandId === victimBandId) || !canEnter(cx, cy)) return;
    const dx = Math.abs(cx - from.cx);
    candidates.push({ cx, cy, distance: Math.min(dx, width - dx) + Math.abs(cy - from.cy) });
  });
  candidates.sort((a, b) => a.distance - b.distance || a.cy - b.cy || a.cx - b.cx);
  return candidates.length ? { cx: candidates[0]!.cx, cy: candidates[0]!.cy } : null;
}

/** Existing local verbs still own interruption, damage, loot and eyewitnesses. */
export function orderArrivingRaid(sim: Simulation, ids: readonly number[], victimBandId: number): number {
  let ordered = 0;
  for (const id of ids) {
    const person = sim.peopleById.get(id);
    if (!person?.alive) continue;
    person.raidingBandId = victimBandId;
    person.raidingUntil = sim.time.tick + sim.config.time.ticksPerDay * 8;
    const radius = sim.config.sightRadius;
    const building = sim.buildingHash.findNearest(person.x, person.y, radius,
      candidate => candidate.ownerBandId === victimBandId && candidate.complete && !candidate.ruined);
    if (building) {
      const verb = building.def.storage > 0 ? 'take' : 'sabotage';
      if (sim.order(person, verb, { buildingId: building.id })) ordered++;
      continue;
    }
    const victim = sim.peopleHash.findNearest(person.x, person.y, radius,
      candidate => candidate.alive && candidate.bandId === victimBandId && candidate.id !== id);
    if (victim && sim.order(person, 'attack', { personId: victim.id })) { ordered++; continue; }
    // A comarca is the raiders' known destination, not a revealed building.
    // When its edge is empty, they head for the named people's public camp;
    // ordinary local sight and combat still decide what happens there.
    const camp = sim.bands.find(band => band.id === victimBandId);
    if (camp && sim.order(person, 'goto', { x: camp.homeX, y: camp.homeY })) ordered++;
  }
  return ordered;
}

/** Resolve a scheduler warning only when a real hostile person is beside the convoy. */
export function resolveCaravanInterception(
  destination: Simulation,
  convoy: Simulation,
  event: Extract<CaravanEvent, { kind: 'raid-opportunity' }>,
  merchantId: number,
): CaravanGoods[] {
  const merchant = convoy.peopleById.get(merchantId);
  if (!merchant?.alive || !event.cargo.length) return [...event.cargo];
  const attacker = destination.peopleHash.findNearest(merchant.x, merchant.y, destination.config.sightRadius,
    person => person.alive && person.bandId === event.raiderPeopleId && person.bandId !== event.targetPeopleId);
  if (!attacker) return [...event.cargo];

  let stolenValue = 0;
  const remaining: CaravanGoods[] = [];
  for (const stack of event.cargo) {
    const moved = stow(attacker, destination.config.carry, stack.itemId, stack.count);
    if (moved > 0) stolenValue += (ITEM_VALUE(stack.itemId) ?? 0) * moved;
    if (moved < stack.count) remaining.push({ itemId: stack.itemId, count: stack.count - moved });
  }
  if (stolenValue > 0) {
    const theft = destination.social.emit('theft', attacker, null, Math.min(1, stolenValue / 20), destination.time.tick,
      destination.peopleHash, destination.config.sightRadius, false, event.targetPeopleId);
    // The convoy's merchant is the actual victim even though the destination's
    // local event has no canonical Person target. Give only that named person
    // the firsthand victim record; other knowledge still comes from witnesses.
    const origin = theft.originComarca ?? destination.social.worldOrigin;
    if (origin) {
      const victimEvent: SocialEvent = { ...theft, targetId: merchant.id };
      if (merchant.memory.record(victimEvent, true, 1, null)) {
        (merchant.worldNews ??= new WorldNews()).witnessTheft(victimEvent, merchant.memory, origin.cx, origin.cy);
      }
    }
  }
  return remaining;
}

function ITEM_VALUE(itemId: string): number {
  // Kept local to the transaction so scheduler cargo is valued by the same item table.
  return (ITEMS[itemId]?.baseValue ?? 0);
}
