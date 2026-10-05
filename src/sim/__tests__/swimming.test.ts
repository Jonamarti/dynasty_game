import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { equipContainer } from '../core/Carry.ts';
import { Pathfinder, PathStatus } from '../core/Pathfinder.ts';
import { RNG } from '../core/RNG.ts';
import { handsEmptyForSwimming } from '../core/Swimming.ts';
import { World } from '../core/World.ts';
import { Person } from '../entities/Person.ts';
import { MovementSystem } from '../systems/MovementSystem.ts';
import { Simulation } from '../core/Simulation.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toExecutionRecord } from '../persistence/ExecutionRecords.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { telemetry } from '../core/Telemetry.ts';

function shoreAndSwimTile(seed: string): { world: World; x: number; y: number } {
  const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG(seed));
  for (let y = 1; y < world.height - 1; y++) for (let x = 1; x < world.width - 1; x++) {
    const i = world.index(x, y);
    if (world.biome[i] !== 0 || world.walkable[i] !== 0) continue;
    const adjacentLand = [world.index(x - 1, y), world.index(x + 1, y), world.index(x, y - 1), world.index(x, y + 1)]
      .some(n => world.walkable[n] === 1);
    if (!adjacentLand) continue;
    world.elevation[i] = world.waterLevel - (world.wadeDepth + world.swimDepth) / 2;
    world.setWalkable(x, y, false);
    return { world, x, y };
  }
  throw new Error('expected deep water beside a land tile');
}

describe('swimming', () => {
  it('keeps the new skill at zero without consuming carry capacity or allowing hand loads', () => {
    const rng = new RNG('swim-skill');
    const person = new Person('Swimmer', 0, 0, 0, rng);
    expect(person.skills.swim).toBe(0);
    // The new skill is deterministic zero: it must not advance the founder's
    // stream and thereby change traits, equipment, or later founders.
    expect(rng.snapshot()).toEqual({
      version: 1,
      words: [450356406, 1401127953, 3736966411, 2066260836],
    });
    expect(handsEmptyForSwimming(person)).toBe(true);

    person.inventory.add('sticks', 1);
    expect(handsEmptyForSwimming(person)).toBe(false);
    person.inventory.remove('sticks', 1);
    person.equipment.shoulder = { item: 'bundle', count: 1 };
    expect(handsEmptyForSwimming(person)).toBe(false);
  });

  it('allows only valid basket-stowed cargo and refuses excessive or incompatible loads', () => {
    const person = new Person('Basket swimmer', 0, 0, 0, new RNG('swim-basket'));
    equipContainer(person, 'basket');
    person.inventory.add('berries', 12);
    expect(handsEmptyForSwimming(person)).toBe(true);
    person.inventory.add('sticks', 1);
    expect(handsEmptyForSwimming(person)).toBe(false);
    person.inventory.remove('sticks', 1);
    person.inventory.remove('berries', 12);
    person.inventory.add('berries', 25);
    expect(handsEmptyForSwimming(person)).toBe(false);
  });

  it('charges the swim cold and fatigue rates from position, even while resting', () => {
    const { world, x, y } = shoreAndSwimTile('swim-needs');
    const dryIndex = world.walkable.findIndex((walkable, i) => walkable === 1 && world.biome[i] !== 0);
    const dry = new Person('Dry rest', dryIndex % world.width + 0.5,
      Math.floor(dryIndex / world.width) + 0.5, 0, new RNG('dry-rest'));
    const wet = new Person('Water rest', x + 0.5, y + 0.5, 0, new RNG('water-rest'));
    dry.action = 'rest'; wet.action = 'rest';
    dry.needs.fatigue = wet.needs.fatigue = 20;
    const fatigueBefore = wet.needs.fatigue;
    new NeedsSystem(DEFAULT_CONFIG.needs, world).update([dry, wet], new TimeManager(DEFAULT_CONFIG.time), [], undefined);
    expect(dry.needs.fatigue).toBe(fatigueBefore);
    expect(wet.needs.fatigue - fatigueBefore).toBeCloseTo(DEFAULT_CONFIG.needs.fatigueRate * 3);
    expect(wet.needs.cold).toBeGreaterThan(dry.needs.cold);
  });

  it('finds a water-connected route but movement enters the swim tile only when unladen', () => {
    const { world, x, y } = shoreAndSwimTile('swim-route');
    const land = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .find(([tx, ty]) => world.isWalkable(tx!, ty!))!;
    const pathfinder = new Pathfinder(world);
    expect(world.sameSwimRegion(land[0]!, land[1]!, x, y)).toBe(true);
    expect(pathfinder.find(land[0]! + 0.5, land[1]! + 0.5, x + 0.5, y + 0.5, undefined, -1, 'swim'))
      .toBe(PathStatus.Found);

    const person = new Person('Test swimmer', x - 0.02, y + 0.5, 0, new RNG('swim-step'));
    const movement = new MovementSystem(world, new RNG('swim-movement'), pathfinder);
    person.inventory.add('sticks', 1);
    const blockedAt = person.x;
    expect(movement.nudge(person, 1, 0)).toBe('hands_not_empty');
    expect(person.x).toBe(blockedAt);

    person.inventory.remove('sticks', 1);
    expect(movement.nudge(person, 1, 0)).toBeNull();
    expect(person.x).toBeGreaterThan(blockedAt);
    expect(world.isSwimTile(person.x, person.y)).toBe(true);
    expect(person.wet).toBe(world.wetTicks);
    expect(person.skills.swim).toBeGreaterThan(0);

    const ordered = new Person('Ordered swimmer', land[0]! + 0.5 + Math.sign(x - land[0]!) * 0.45,
      land[1]! + 0.5 + Math.sign(y - land[1]!) * 0.45, 0, new RNG('swim-order-arrival'));
    ordered.action = 'swim'; ordered.order = 'swim';
    ordered.targetX = x + 0.5; ordered.targetY = y + 0.5;
    expect(Math.hypot(ordered.targetX - ordered.x, ordered.targetY - ordered.y)).toBeLessThan(0.6);
    movement.advance(ordered, 1);
    expect(world.isSwimTile(ordered.x, ordered.y)).toBe(true);
  });

  it('refuses direct control into boat-only depth with a clear reason', () => {
    const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('deep-nudge'));
    let deep = -1;
    for (let y = 1; y < world.height - 1 && deep < 0; y++) for (let x = 1; x < world.width - 1 && deep < 0; x++) {
      const i = world.index(x, y);
      if (world.biome[i] === 0 && world.walkable[i] === 0 &&
          [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
            .some(([tx, ty]) => world.isWalkable(tx!, ty!))) deep = i;
    }
    expect(deep).toBeGreaterThanOrEqual(0);
    const x = deep % world.width, y = Math.floor(deep / world.width);
    const land = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .find(([tx, ty]) => world.isWalkable(tx!, ty!))!;
    const person = new Person('Dry approach', land[0]! + 0.5 + Math.sign(x - land[0]!) * 0.45,
      land[1]! + 0.5 + Math.sign(y - land[1]!) * 0.45, 0, new RNG('deep-nudge-person'));
    const before = { x: person.x, y: person.y };
    const movement = new MovementSystem(world, new RNG('deep-nudge-movement'), new Pathfinder(world));
    expect(movement.nudge(person, x - land[0]!, y - land[1]!)).toBe('too_deep');
    expect(person.x).toBe(before.x);
    expect(person.y).toBe(before.y);
  });

  it('allows a dry island route in Walk here, while the load reason matches the order gate', () => {
    const sim = new Simulation({ seed: 'swim-menu-dry-target', world: { width: 64, height: 64 } });
    const actor = sim.livingPeople()[0]!;
    let route: { ax: number; ay: number; tx: number; ty: number } | undefined;
    const land: [number, number][] = [];
    for (let y = 1; y < sim.world.height - 1; y++) for (let x = 1; x < sim.world.width - 1; x++) {
      if (sim.world.isWalkable(x, y)) land.push([x, y]);
    }
    outer: for (const [ax, ay] of land) for (const [tx, ty] of land) {
      if (sim.world.sameRegion(ax, ay, tx, ty)) continue;
      if (sim.world.sameSwimRegion(ax, ay, tx, ty)) { route = { ax, ay, tx, ty }; break outer; }
    }
    expect(route).toBeDefined();
    actor.x = route!.ax + 0.5; actor.y = route!.ay + 0.5;
    const context = { world: sim.world, nearWater: false, drownAt: sim.config.world.drownAt };
    const target = { kind: 'ground' as const, x: route!.tx, y: route!.ty };
    expect(availableActions(actor, target, context).find(option => option.id === 'goto'))
      .toMatchObject({ enabled: true, reason: undefined });
    actor.inventory.add('sticks', 1);
    expect(availableActions(actor, target, context).find(option => option.id === 'goto'))
      .toMatchObject({ enabled: false, reason: 'Put down what you are holding before swimming' });
  });

  it('interrupts an autonomous drink for hunger in the water, but lets a hungry food search answer hunger', () => {
    const sim = new Simulation({ seed: 'swim-autonomous-interruption', world: { width: 64, height: 64 } });
    const person = sim.livingPeople()[0]!;
    let spot: { x: number; y: number; shore: [number, number] } | undefined;
    outer: for (let y = 1; y < sim.world.height - 1; y++) for (let x = 1; x < sim.world.width - 1; x++) {
      if (sim.world.biome[sim.world.index(x, y)] !== 0 || sim.world.walkable[sim.world.index(x, y)] !== 0) continue;
      const shore = ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as [number, number][])
        .find(([tx, ty]) => sim.world.isWalkable(tx!, ty!));
      if (!shore) continue;
      const index = sim.world.index(x, y);
      sim.world.elevation[index] = sim.world.waterLevel - (sim.world.wadeDepth + sim.world.swimDepth) / 2;
      sim.world.setWalkable(x, y, true);
      sim.world.setWalkable(x, y, false);
      spot = { x, y, shore };
      break outer;
    }
    expect(spot).toBeDefined();
    person.isPlayer = false;
    person.x = spot!.x + 0.5; person.y = spot!.y + 0.5;
    person.targetX = spot!.shore[0] + 0.5; person.targetY = spot!.shore[1] + 0.5;
    person.action = 'drink'; person.order = null; person.actionTimer = 20;
    person.needs.hunger = 90; person.needs.thirst = 10;
    sim.world.swimRegionAt(spot!.x, spot!.y);
    sim.shoreHash.rebuild(sim.world.shoreTiles);
    sim.step();
    expect(sim.world.isSwimTile(person.x, person.y)).toBe(true);
    expect(person.action).toBe('swim');
    expect(person.order).toBeNull();
    expect(person.targetX).not.toBeNull();

    const brain = (sim as any).brain;
    const think = vi.spyOn(brain, 'think');
    const interval = sim.config.thinkInterval;
    (person as any).thinkOffset = (interval - ((sim.time.tick + 1) % interval)) % interval;
    sim.step();
    expect(think.mock.calls.some(([candidate]) => candidate === person)).toBe(false);
    expect(person.action).toBe('swim');
    for (let i = 0; i < 120 && person.action === 'swim'; i++) sim.step();
    expect(sim.world.isSwimTile(person.x, person.y)).toBe(false);
    expect(person.action).toBe('idle');
    (person as any).thinkOffset = (interval - ((sim.time.tick + 1) % interval)) % interval;
    sim.step();
    expect(think.mock.calls.some(([candidate]) => candidate === person)).toBe(true);
    think.mockRestore();

    // A real food node on the far bank exercises doHarvest's hunger exemption
    // while it crosses water. This must reach the harvest instead of aborting
    // on the need the harvest is meant to answer.
    const node = new ResourceNode('berries', spot!.shore[0], spot!.shore[1], new RNG('swim-food-node'), sim.ids);
    sim.nodes.push(node);
    sim.nodesById.set(node.id, node);
    sim.nodeHash.rebuild(sim.nodes);
    person.action = 'gather'; person.order = null; person.actionTimer = 20;
    person.targetNodeId = node.id;
    person.x = spot!.x + 0.5; person.y = spot!.y + 0.5;
    person.targetX = node.x; person.targetY = node.y;
    person.needs.hunger = 80; person.needs.thirst = 0;
    telemetry.reset(); telemetry.enable();
    sim.step();
    const workTelemetry = telemetry.snapshot();
    telemetry.disable();
    expect(person.action).toBe('gather');
    expect(person.targetNodeId).toBe(node.id);
    expect(workTelemetry.pushed_on_hunger_gather).toBeGreaterThan(0);
  });

  it('keeps a valid swimmer through unrelated earth edits and drowns deterministically into a shore corpse', () => {
    const sim = new Simulation({ seed: 'swim-death', world: { width: 64, height: 64, drownAt: 2 } });
    const person = sim.people.find(p => p.alive)!;
    const waterIndex = sim.world.biome.findIndex((biome, i) => biome === 0 && sim.world.walkable[i] === 0);
    const x = waterIndex % sim.world.width, y = Math.floor(waterIndex / sim.world.width);
    sim.world.elevation[waterIndex] = sim.world.waterLevel -
      (sim.world.wadeDepth + sim.world.swimDepth) / 2;
    sim.world.setWalkable(x, y, false);
    person.x = x + 0.5; person.y = y + 0.5;
    person.action = 'swim'; person.order = 'swim';
    person.targetX = x + 2.5; person.targetY = y + 0.5;

    // An unrelated edit rebuilds the shore index and sweeps lost ground. A
    // valid swim tile must survive that sweep rather than being teleported.
    sim.world.pile(4, 4, 0.1);
    sim.step();
    expect(person.alive).toBe(true);
    expect(sim.world.isSwimTile(person.x, person.y)).toBe(true);

    person.needs.cold = 100;
    const shore = sim.shoreHash.findNearest(person.x, person.y,
      Math.hypot(sim.world.width, sim.world.height));
    sim.step();
    expect(person.alive).toBe(false);
    expect(person.causeOfDeath).toBe('drowned');
    const corpse = sim.corpses.find(c => c.person === person);
    expect(corpse).toBeDefined();
    if (shore) {
      expect(corpse!.x).toBeCloseTo(shore.x + 0.5);
      expect(corpse!.y).toBeCloseTo(shore.y + 0.5);
    }
  });

  it('round-trips a mid-swim order and continues deterministically from its checkpoint', () => {
    const sim = new Simulation({ seed: 'swim-checkpoint', world: { width: 64, height: 64 } });
    sim.possessFirst();
    const person = sim.player!;
    let route: { x: number; y: number; nextX: number; nextY: number } | undefined;
    for (let y = 1; y < sim.world.height - 2 && !route; y++) for (let x = 1; x < sim.world.width - 2 && !route; x++) {
      const i = sim.world.index(x, y), ni = sim.world.index(x + 1, y);
      if (sim.world.biome[i] !== 0 || sim.world.walkable[i] !== 0 ||
          sim.world.biome[ni] !== 0 || sim.world.walkable[ni] !== 0) continue;
      for (const tx of [x, x + 1]) {
        const ti = sim.world.index(tx, y);
        sim.world.elevation[ti] = sim.world.waterLevel -
          (sim.world.wadeDepth + sim.world.swimDepth) / 2;
        sim.world.setWalkable(tx, y, true);
        sim.world.setWalkable(tx, y, false);
      }
      route = { x, y, nextX: x + 1, nextY: y };
    }
    expect(route).toBeDefined();
    sim.world.swimRegionAt(route!.x, route!.y);
    person.x = route!.x + 0.5; person.y = route!.y + 0.5;
    expect(sim.order(person, 'swim', { x: route!.nextX + 0.5, y: route!.nextY + 0.5 })).toBe(true);
    expect(person.action).toBe('swim');
    const saved = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    const restored = Simulation.fromCheckpointRecord(saved);
    const resumedPerson = restored.player!;
    expect(resumedPerson.action).toBe('swim');
    expect(resumedPerson.order).toBe('swim');
    expect(resumedPerson.targetX).toBe(person.targetX);
    sim.step();
    restored.step();
    expect(toExecutionRecord(sim)).toEqual(toExecutionRecord(restored));
  });
});
