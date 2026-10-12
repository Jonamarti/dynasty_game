import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { Building, BUILDINGS, isStation } from '../entities/Building.ts';
import type { SocialEvent } from '../social/Events.ts';
import type { BandContext } from '../systems/BandSystem.ts';

function proposeAfterIncident(firsthand: boolean) {
  const sim = new Simulation({
    seed: 'defensive-ditch-proposal',
    world: { width: 48, height: 48, berryBushes: 30, flintOutcrops: 8, deadwood: 15, gameHerds: 3 },
    population: { bands: 2, peoplePerBand: 6 },
  });
  const band = sim.bands[0]!;
  const witness = sim.livingPeople().find(person => person.bandId === band.id && !person.isChild)!;
  const raider = sim.livingPeople().find(person => person.bandId !== band.id && !person.isChild)!;
  witness.knownTech.clear();
  witness.knownTech.add('earthworks');
  witness.inventory.add('sticks', 1);
  sim.knownTech.clear();
  sim.knownTech.add('earthworks');
  sim.bandSystem.chiefByBand.set(band.id, witness.id);

  const event: SocialEvent = {
    id: 900001,
    type: 'sabotage',
    actorId: raider.id,
    targetId: null,
    x: witness.x,
    y: witness.y,
    tick: sim.time.tick,
    magnitude: 1,
    witnesses: 1,
    victimBandId: band.id,
  };
  witness.memory.record(event, firsthand, 1);

  const buildings = [
    new Building(BUILDINGS.longhouse!, 1, 1, band.id, sim.ids),
    new Building(BUILDINGS.storage_pit!, 12, 1, band.id, sim.ids),
    ...Object.values(BUILDINGS)
      .filter(isStation)
      .map((def, index) => new Building(def, 20 + index * 3, 1, band.id, sim.ids)),
  ];
  for (const building of buildings) building.complete = true;

  const placed: { id: string; x: number; y: number; sponsorId: number | null }[] = [];
  const plannerRng = new RNG('proposal-test');
  const range = vi.spyOn(plannerRng, 'range');
  const ctx = {
    day: sim.time.day,
    rng: plannerRng,
    buildings,
    personById: (id: number) => sim.peopleById.get(id),
    abandonSite: () => undefined,
    place: (id: string, x: number, y: number, ownerBandId: number, sponsorId?: number | null) => {
      placed.push({ id, x, y, sponsorId: sponsorId ?? null });
      const def = BUILDINGS[id];
      if (!def) return null;
      const site = new Building(def, x, y, ownerBandId, sim.ids);
      site.sponsorId = sponsorId ?? null;
      buildings.push(site);
      return site;
    },
  } as unknown as BandContext;

  (sim.bandSystem as unknown as {
    planBuildings: (owner: typeof band, members: typeof sim.people, context: BandContext) => void;
  }).planBuildings(band, [witness], ctx);
  return { placed, witness, band, draws: range.mock.calls.length };
}

describe('autonomous defensive ditch proposal (M15 phase 26e)', () => {
  it('proposes one ditch at a stable camp ring and names the firsthand witness as sponsor', () => {
    const first = proposeAfterIncident(true);
    const second = proposeAfterIncident(true);
    const ditches = first.placed.filter(site => site.id === 'ditch');

    expect(ditches).toHaveLength(1);
    expect(ditches[0]!.sponsorId).toBe(first.witness.id);
    expect(Math.max(Math.abs(ditches[0]!.x - Math.round(first.band.homeX)),
      Math.abs(ditches[0]!.y - Math.round(first.band.homeY)))).toBe(5);
    expect(second.placed.find(site => site.id === 'ditch')).toMatchObject({
      x: ditches[0]!.x, y: ditches[0]!.y, sponsorId: first.witness.id,
    });
    expect(first.draws).toBe(0);
  });

  it('does not treat an unwitnessed rumour as a security reason', () => {
    const { placed } = proposeAfterIncident(false);
    expect(placed.some(site => site.id === 'ditch')).toBe(false);
  });
});
