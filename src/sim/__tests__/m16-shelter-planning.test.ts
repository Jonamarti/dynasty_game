import { describe, expect, it, vi } from 'vitest';
import { Simulation, type Band } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { BandSystem, type BandContext } from '../systems/BandSystem.ts';
import { telemetry } from '../core/Telemetry.ts';

describe('m16 live construction queue', () => {
  it('immediately exposes a freed construction slot during the same daily planning pass', () => {
    const sim = new Simulation({
      seed: 'm16-live-construction-queue',
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const daily = vi.spyOn(sim.bandSystem, 'daily').mockImplementation((_bands, _people, ctx) => {
      const site = ctx.buildings.find(b => !b.complete && !b.playerPlaced);
      expect(site).toBeDefined();
      const before = ctx.buildings.length;
      ctx.abandonSite(site!);
      expect(sim.buildingsById.has(site!.id)).toBe(false);
      expect(ctx.buildings).toBe(sim.buildings);
      expect(ctx.buildings.some(b => b.id === site!.id)).toBe(false);
      expect(ctx.buildings.length).toBe(before - 1);
    });
    try {
      sim.time.tick = sim.config.time.ticksPerDay - 1;
      sim.step();
      expect(daily).toHaveBeenCalledTimes(1);
    } finally { daily.mockRestore(); }
  });
});

/** Exercise the real private planning pass with only the handles it needs to
 * make a shelter/store proposal. No world stepping or long cohort required. */
function planningFixture(buildings: Building[]) {
  const system = new BandSystem();
  const band = { id: 1, homeX: 20, homeY: 20 } as Band;
  const members = Array.from({ length: 6 }, (_, i) =>
    new Person('Founder ' + i, 20, 20, band.id, new RNG('shelter-founder-' + i)));
  for (const member of members) {
    member.needs.hunger = member.needs.cold = 0;
    member.mood.security = 0;
  }
  const place = vi.fn((id: string, x: number, y: number, owner: number, sponsorId?: number | null) => {
    const b = new Building(BUILDINGS[id]!, x, y, owner);
    b.sponsorId = sponsorId ?? null;
    buildings.push(b);
    return b;
  });
  const abandonSite = vi.fn();
  const ctx = { buildings, rng: new RNG('shelter-planning'), day: 3, place, abandonSite } as unknown as BandContext;
  const run = () => (system as unknown as {
    planBuildings(band: Band, members: Person[], ctx: BandContext): void;
  }).planBuildings(band, members, ctx);
  return { members, place, abandonSite, run };
}

describe('m16 completed versus planned shelter places', () => {
  it('chooses a cheap covered lean-to instead of another expensive hut when no finished roof exists', () => {
    const unfinished = new Building(BUILDINGS.mud_hut!, 10, 10, 1);
    const f = planningFixture([unfinished]);
    f.members[0]!.needs.hunger = 95;
    f.members[1]!.needs.cold = 40;
    f.members[1]!.mood.security = -20;
    f.run();
    expect(f.place).toHaveBeenCalledWith('lean_to', expect.any(Number), expect.any(Number), 1, f.members[1]!.id);
    expect(f.abandonSite).not.toHaveBeenCalled();
  });

  it('reports the real shortage even with enough promised places and a full work queue', () => {
    const huts = [new Building(BUILDINGS.mud_hut!, 10, 10, 1), new Building(BUILDINGS.mud_hut!, 15, 15, 1)];
    const f = planningFixture(huts);
    telemetry.reset();
    telemetry.enable();
    try {
      f.run();
      expect(telemetry.get('shelter_completed_places_short')).toBe(6);
      expect(telemetry.get('shelter_short_sites_full')).toBe(1);
      expect(f.place).not.toHaveBeenCalled();
      expect(f.abandonSite).not.toHaveBeenCalled();
    } finally { telemetry.disable(); telemetry.reset(); }
  });

  it('does not open another shelter when projected capacity suffices', () => {
    const hut = new Building(BUILDINGS.mud_hut!, 10, 10, 1);
    hut.complete = true;
    const pending = new Building(BUILDINGS.lean_to!, 15, 15, 1);
    const f = planningFixture([hut, pending]);
    f.run();
    expect(f.place).toHaveBeenCalledWith('storage_pit', expect.any(Number), expect.any(Number), 1, expect.any(Number));
  });

  it('still chooses a warmer hut when the existing finished places cover most people', () => {
    const hut = new Building(BUILDINGS.mud_hut!, 10, 10, 1);
    hut.complete = true;
    const f = planningFixture([hut]);
    f.run();
    expect(f.place).toHaveBeenCalledWith('mud_hut', expect.any(Number), expect.any(Number), 1, expect.any(Number));
  });
});
