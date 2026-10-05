import { describe, expect, it } from 'vitest';
import { telemetry } from '../core/Telemetry.ts';
import { Simulation } from '../core/Simulation.ts';
import { isOnValidGround, runScenario, SCENARIOS } from '../../../tools/simcheck.ts';

describe('shallows mechanism checks', () => {
  const scenario = SCENARIOS.shallows!;
  const byId = (report: ReturnType<typeof runScenario>, id: string) =>
    report.checks.find(check => check.id === id)!;

  it('places the configured number of fish nodes in walkable shallows', () => {
    const sim = new Simulation(scenario.config);
    const fish = sim.nodes.filter(node => node.kind === 'fish');
    expect(fish).toHaveLength(sim.config.world.fishingSpots);
    expect(fish.every(node => sim.world.isShallow(node.x, node.y) && sim.world.isWalkable(node.x, node.y))).toBe(true);
  });

  it('fails fishing and crossing when their event streams are absent', () => {
    const report = runScenario(scenario, 0);
    expect(byId(report, 'fish-caught-in-water')).toMatchObject({ ok: false });
    expect(byId(report, 'fish-caught-in-water')).not.toHaveProperty('skipped');
    expect(byId(report, 'swimmers-cross')).toMatchObject({ ok: false });
    expect(byId(report, 'swimmers-cross')).not.toHaveProperty('skipped');
  });

  it('fails the drowning invariant if a shallow-water death is reported', () => {
    const report = runScenario({
      ...scenario,
      setup: sim => {
        scenario.setup!(sim);
        // Negative control: a reported death must trip the zero-deaths check.
        telemetry.count('drowned_shallows');
      },
    }, 0);
    expect(byId(report, 'nobody-drowns-in-the-shallows')).toMatchObject({ ok: false });
    expect(byId(report, 'nobody-drowns-in-the-shallows')).not.toHaveProperty('skipped');
  });

  it('measures land and safe swimming while rejecting deep water and a loaded swimmer', () => {
    const sim = new Simulation(scenario.config);
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    expect(isOnValidGround(sim, person)).toBe(true);

    const findTile = (predicate: (x: number, y: number) => boolean) => {
      for (let y = 0; y < sim.world.height; y++) {
        for (let x = 0; x < sim.world.width; x++) if (predicate(x, y)) return { x: x + 0.5, y: y + 0.5 };
      }
      throw new Error('fixture has no tile for ground-measurement control');
    };
    const swim = findTile((x, y) => sim.world.isSwimTile(x, y));
    person.x = swim.x;
    person.y = swim.y;
    expect(isOnValidGround(sim, person)).toBe(true); // Positive control: empty-handed mid-swim snapshot.

    const deep = findTile((x, y) => sim.world.isWater(x, y) && sim.world.depthAt(x, y) >= sim.world.swimDepth);
    person.x = deep.x;
    person.y = deep.y;
    expect(isOnValidGround(sim, person)).toBe(false); // Negative control: deep water has no swimming support.

    person.x = swim.x;
    person.y = swim.y;
    person.inventory.add('stone', 1);
    expect(isOnValidGround(sim, person)).toBe(false); // Negative control: a loose load cannot cross water.
  });

  it('keeps a threshold-fatigued person safe in the shallows and catches a broken swim-depth guard', () => {
    const shoal = (sim: Simulation) => {
      for (let y = 0; y < sim.world.height; y++) {
        for (let x = 0; x < sim.world.width; x++) if (sim.world.isShallow(x, y)) return { x: x + 0.5, y: y + 0.5 };
      }
      throw new Error('shallows fixture has no shallow tile');
    };
    const locateThresholdPerson = (sim: Simulation) => {
      const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
      const tile = shoal(sim);
      person.x = tile.x;
      person.y = tile.y;
      person.needs.fatigue = 100;
      return person;
    };

    const safePerson: { current: ReturnType<typeof locateThresholdPerson> | null } = { current: null };
    const safe = runScenario({
      ...scenario,
      setup: sim => {
        scenario.setup?.(sim);
        safePerson.current = locateThresholdPerson(sim);
      },
    }, 1);
    expect(safePerson.current?.alive).toBe(true);
    expect(byId(safe, 'nobody-drowns-in-the-shallows')).toMatchObject({ ok: true });

    const brokenPerson: { current: ReturnType<typeof locateThresholdPerson> | null } = { current: null };
    const broken = runScenario({
      ...scenario,
      setup: sim => {
        scenario.setup?.(sim);
        brokenPerson.current = locateThresholdPerson(sim);
        const original = sim.world.isSwimTile.bind(sim.world);
        // Negative control: the old erroneous guard treated any water as swim-depth water.
        sim.world.isSwimTile = (x: number, y: number) => original(x, y) || sim.world.isShallow(x, y);
      },
    }, 1);
    expect(brokenPerson.current?.alive).toBe(false);
    expect(byId(broken, 'nobody-drowns-in-the-shallows')).toMatchObject({ ok: false });
  });
});
