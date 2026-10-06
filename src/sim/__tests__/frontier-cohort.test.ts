import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFrontierCohort, observeFrontierCohort } from '../../../tools/frontierFixture.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { telemetry } from '../core/Telemetry.ts';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';

const cohort = (seed: string) => createFrontierCohort({
  seed,
  world: { width: 64, height: 48, fishingSpots: 4 },
  population: { bands: 2, peoplePerBand: 12 },
});

describe('autonomous continental cohort fixture', () => {
  beforeEach(() => { telemetry.reset(); telemetry.enable(); });
  afterEach(() => { telemetry.disable(); telemetry.reset(); });

  it('starts a real multi-band population with freshwater fish beside an accessible bank', () => {
    const sim = cohort('frontier-cohort-shoals');
    expect(sim.livingPeople().length).toBeGreaterThanOrEqual(20);
    expect(new Set(sim.livingPeople().map(person => person.bandId)).size).toBeGreaterThan(1);
    expect(sim.world.freshShore.length).toBeGreaterThan(0);
    expect(sim.world.saltShore.length).toBeGreaterThan(0);

    const fish = sim.nodes.filter(node => node.kind === 'fish');
    const fresh = fish.filter(node => sim.world.isFreshWater(node.x, node.y));
    expect(fish).toHaveLength(4);
    expect(fresh.length).toBeGreaterThan(0);
    for (const node of fresh) {
      expect(sim.world.isShallow(node.x, node.y)).toBe(true);
      expect(sim.world.isWalkable(node.x, node.y)).toBe(true);
      const bank = sim.world.findWalkableNear(node.x, node.y, 4);
      expect(bank).toBeDefined();
      expect(sim.world.sameRegion(node.x, node.y, bank!.x, bank!.y)).toBe(true);
    }
    expect(sim.livingPeople().every(person => person.order === null)).toBe(true);
  });

  it('does not count a same-bank wading detour as a crossing', () => {
    const sim = cohort('frontier-cohort-same-bank');
    let ford: { x: number; y: number; bank: { x: number; y: number } } | null = null;
    for (let y = 1; y < sim.world.height - 1 && !ford; y++) for (let x = 1; x < sim.world.width - 1 && !ford; x++) {
      if (sim.world.biomeAt(x, y) !== 'river' || !sim.world.isWadeTile(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const bx = x + dx, by = y + dy;
        if (sim.world.isWalkable(bx, by) && !sim.world.isWater(bx, by) && sim.world.biomeAt(bx, by) !== 'river') {
          ford = { x, y, bank: { x: bx, y: by } };
          break;
        }
      }
    }
    expect(ford, 'the continental fixture should have a ford beside a dry bank').not.toBeNull();
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    person.x = ford!.bank.x + 0.5; person.y = ford!.bank.y + 0.5;
    observeFrontierCohort(sim);
    person.x = ford!.x + 0.5; person.y = ford!.y + 0.5;
    observeFrontierCohort(sim);
    person.x = ford!.bank.x + 0.5; person.y = ford!.bank.y + 0.5;
    observeFrontierCohort(sim);
    expect(telemetry.get('frontier_cohort_wading_steps')).toBeGreaterThan(0);
    expect(telemetry.get('frontier_cohort_bank_to_bank')).toBe(0);
  });

  it('keeps observation passive: the same seeded cohort has an identical checkpoint', () => {
    const observed = cohort('frontier-cohort-observer');
    const plain = cohort('frontier-cohort-observer');
    for (let tick = 0; tick < 120; tick++) {
      observed.step();
      observeFrontierCohort(observed);
      plain.step();
    }
    expect(toCheckpointRecord(observed)).toEqual(toCheckpointRecord(plain));
  }, 15000);

  it('catches an AI water hash which once again offers the salty coast', () => {
    const scenario = SCENARIOS['frontier-cohort']!;
    const report = runScenario({ ...scenario, setup: sim => {
      const person = sim.livingPeople().find(candidate => !candidate.isChild && !candidate.isPlayer)!;
      const salt = sim.world.saltShore.find(tile => sim.world.sameRegion(person.x, person.y, tile.x, tile.y)) ??
        sim.world.saltShore[0]!;
      person.isPlayer = false;
      person.x = salt.x + 0.5; person.y = salt.y + 0.5;
      person.forgetPlans(); person.needs.thirst = 88; person.needs.hunger = 0;
      sim.freshShoreHash.rebuild(sim.world.saltShore);
      (sim as unknown as { shoreSeen: number }).shoreSeen = sim.world.earthVersion;
      sim.peopleHash.rebuild(sim.livingPeople());
    } }, 400);
    expect(report.telemetry.frontier_cohort_salt_visible_people).toBeGreaterThan(0);
    expect(report.telemetry.drink_sea_ai).toBeGreaterThan(0);
    expect(report.checks.find(check => check.id === 'continental-sea-is-avoided')).toMatchObject({ ok: false });
  }, 15000);

  it('isolates freshwater as a life source and records actual dehydration in its absence', () => {
    const simulate = (removeFreshWater: boolean) => {
      telemetry.reset(); telemetry.enable();
      const sim = createFrontierCohort({
        seed: 'frontier-thirst-control',
        world: { width: 64, height: 48, treeDensity: 0, berryBushes: 0,
          fishingSpots: 0, gameHerds: 0, predators: 0, wildGrainPatches: 0 },
        population: { bands: 1, peoplePerBand: 4 },
        time: { ticksPerDay: 60 },
      });
      if (removeFreshWater) {
        const kinds = sim.world.waterKind!;
        for (let i = 0; i < kinds.length; i++) if (kinds[i] === 1) kinds[i] = 2;
        sim.freshShoreHash.rebuild(sim.world.freshShore);
        sim.saltShoreHash.rebuild(sim.world.saltShore);
        sim.shoreHash.rebuild(sim.world.shoreTiles);
        (sim as unknown as { shoreSeen: number }).shoreSeen = sim.world.earthVersion;
      }
      for (const person of sim.livingPeople()) {
        person.isPlayer = false;
        person.forgetPlans();
        person.needs.hunger = 0; person.needs.thirst = 90;
        person.needs.fatigue = 0; person.needs.cold = 0;
        for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
        // Dry calories keep hunger from hiding the thirst outcome. Nuts have
        // no hydration and fruit sources are disabled in this paired control.
        person.inventory.add('hazelnut', 12);
      }
      sim.peopleHash.rebuild(sim.livingPeople());
      for (let tick = 0; tick < 2400; tick++) sim.step();
      return { counts: telemetry.snapshot(), dead: [...sim.peopleById.values()].filter(person => !person.alive) };
    };

    const supplied = simulate(false);
    expect(supplied.counts.drink_fresh ?? 0).toBeGreaterThan(0);
    expect(supplied.counts.death_dehydration ?? 0).toBe(0);
    const dry = simulate(true);
    expect(dry.counts.death_dehydration ?? 0).toBeGreaterThan(0);
    expect(dry.dead.some(person => person.causeOfDeath === 'dehydration')).toBe(true);
  }, 30000);
});
