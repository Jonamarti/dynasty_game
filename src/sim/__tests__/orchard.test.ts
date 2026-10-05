/**
 * Planting a tree (M15 phase 24): the tech that unlocks the verb, the ground
 * that will take a tree, the order and its refusals, and the seedling that
 * grows by the forest's own rules.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { TECH, techPower } from '../knowledge/Tech.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import {
  ORCHARD_INNER, ORCHARD_RANGE, ORCHARD_SPACING, PLANT_TICKS, findPlantingSpot, plantable, plantingRefusal,
} from '../entities/Orchard.ts';
import { telemetry } from '../core/Telemetry.ts';
import type { Person } from '../entities/Person.ts';

function planter(sim: Simulation, fruit = 'apple'): Person {
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  person.knownTech.add('arboriculture');
  person.inventory.add(fruit, 2);
  return person;
}

function groundFor(sim: Simulation, person: Person) {
  const band = sim.bands.find(b => b.id === person.bandId)!;
  return {
    ground: { world: sim.world, treeHash: sim.treeHash, built: (x: number, y: number) => sim.buildingAt(x, y) !== null },
    anchor: { x: band.homeX, y: band.homeY },
  };
}

/** The sim's own spring day-time, so growth is above zero. */
function inGrowingSeason(sim: Simulation): void {
  for (let i = 0; i < 400 && sim.time.growth <= 0; i++) sim.step();
  expect(sim.time.growth).toBeGreaterThan(0);
}

describe('arboriculture', () => {
  it('is a practice that needs farming and the calendar, unlocked by the plant verb', () => {
    const def = TECH.arboriculture;
    expect(def.kind).toBe('practice');
    expect(def.practisedBy).toEqual(['plant']);
    expect(def.requires).toEqual(['farming', 'calendar']);
    const person = new Simulation({ seed: 'orchard' }).people[0]!;
    expect(techPower(person, 'arboriculture')).toBe(0);
    person.knownTech.add('arboriculture');
    expect(techPower(person, 'arboriculture')).toBeGreaterThan(0);
  });

  it('plants only what has a stone or a nut in it, in a fixed order', () => {
    const sim = new Simulation({ seed: 'orchard' });
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    expect(plantable(person)).toBeNull();
    person.inventory.add('hazelnut', 3);
    expect(plantable(person)?.species).toBe('hazel');
    person.inventory.add('apple', 1);
    expect(plantable(person)?.species).toBe('apple');
  });
});

describe('ground for a tree', () => {
  it('is refused under a building, on water, on rock, on a dug tile and too near another tree', () => {
    const sim = new Simulation({ seed: 'orchard' });
    const person = planter(sim);
    const { ground, anchor } = groundFor(sim, person);
    const spot = findPlantingSpot(ground, person, anchor, person.id)!;
    expect(spot).not.toBeNull();
    expect(plantingRefusal(ground, spot.x, spot.y)).toBeNull();
    // Too near a tree that stands.
    const tree = sim.plantTree('apple', spot.x, spot.y)!;
    expect(tree).not.toBeNull();
    expect(plantingRefusal(ground, spot.x, spot.y)).toBe('no_room_for_a_tree');
    expect(plantingRefusal(ground, spot.x + 1, spot.y)).toBe('no_room_for_a_tree');
    // Far enough away it is fine again, if the tile itself is.
    let beyond = false;
    for (let dx = -8; dx <= 8 && !beyond; dx++) {
      for (let dy = -8; dy <= 8 && !beyond; dy++) {
        if (Math.hypot(dx, dy) >= ORCHARD_SPACING) beyond = plantingRefusal(ground, spot.x + dx, spot.y + dy) === null;
      }
    }
    expect(beyond).toBe(true);
    // Water.
    let water: { x: number; y: number } | null = null;
    for (let y = 0; y < sim.world.height && !water; y++) {
      for (let x = 0; x < sim.world.width && !water; x++) if (sim.world.biomeAt(x, y) === 'water') water = { x, y };
    }
    expect(plantingRefusal(ground, water!.x, water!.y)).toBe('ground_unfit_for_trees');
    // Dug ground.
    const free = findPlantingSpot(ground, person, anchor, person.id + 1)!;
    sim.world.dig(free.x, free.y, 0.4);
    expect(plantingRefusal(ground, free.x, free.y)).toBe('ground_unfit_for_trees');
  });

  it('finds ground inside the ring round the camp, and does not give two planters one tile', () => {
    const sim = new Simulation({ seed: 'orchard' });
    const person = planter(sim);
    const { ground, anchor } = groundFor(sim, person);
    const a = findPlantingSpot(ground, person, anchor, 3)!;
    const b = findPlantingSpot(ground, person, anchor, 11)!;
    for (const s of [a, b]) {
      const d = Math.hypot(s.x - anchor.x, s.y - anchor.y);
      expect(d).toBeGreaterThanOrEqual(ORCHARD_INNER - 1);
      expect(d).toBeLessThanOrEqual(ORCHARD_RANGE + 1);
    }
    expect(a.x === b.x && a.y === b.y).toBe(false);
  });
});

describe('the plant verb', () => {
  it('sets a seedling that ages by the forest\'s rules, and spends one piece of fruit', () => {
    const sim = new Simulation({ seed: 'orchard' });
    inGrowingSeason(sim);
    const person = planter(sim, 'pear');
    const { ground, anchor } = groundFor(sim, person);
    const spot = findPlantingSpot(ground, person, anchor, person.id)!;
    telemetry.enable(); telemetry.reset();
    const trees = sim.trees.length;
    expect(sim.order(person, 'plant', { x: spot.x, y: spot.y })).toBe(true);
    for (let i = 0; i < PLANT_TICKS * 6 && sim.trees.length === trees; i++) {
      person.needs.hunger = 0; person.needs.thirst = 0; person.needs.fatigue = 0; person.needs.cold = 0;
      sim.step();
    }
    expect(sim.trees.length).toBe(trees + 1);
    const planted = sim.trees.find(t => t.x === spot.x && t.y === spot.y)!;
    expect(planted.def.species).toBe('pear');
    expect(planted.age).toBeLessThan(5);
    expect(planted.isSeedling).toBe(true);
    expect(sim.treesById.get(planted.id)).toBe(planted);
    expect(person.inventory.count('pear')).toBe(1);
    expect(telemetry.get('tree_planted')).toBe(1);
    telemetry.disable(); telemetry.reset();
  });

  it('is refused with a reason when the person does not know how, has no fruit or the ground is wrong', () => {
    const sim = new Simulation({ seed: 'orchard' });
    inGrowingSeason(sim);
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    const { ground, anchor } = groundFor(sim, person);
    const spot = findPlantingSpot(ground, person, anchor, person.id)!;
    expect(sim.order(person, 'plant', spot)).toBe(false);
    expect(sim.lastRefusal).toMatch(/do not know how to plant/);
    person.knownTech.add('arboriculture');
    expect(sim.order(person, 'plant', spot)).toBe(false);
    expect(sim.lastRefusal).toMatch(/no fruit to plant/);
    person.inventory.add('plum', 1);
    sim.plantTree('plum', spot.x, spot.y);
    expect(sim.order(person, 'plant', spot)).toBe(false);
    expect(sim.lastRefusal).toMatch(/no room for another tree/);
  });

  it('is offered on the menu only to somebody who knows how, greyed with the reason', () => {
    const sim = new Simulation({ seed: 'orchard' });
    inGrowingSeason(sim);
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    const { ground, anchor } = groundFor(sim, person);
    const spot = findPlantingSpot(ground, person, anchor, person.id)!;
    const ask = () => availableActions(person, { kind: 'ground', x: spot.x, y: spot.y }, {
      world: sim.world, nearWater: false,
      plantRefusal: (x, y) => sim.plantOrderRefusal(person, x, y),
    }).find(o => o.id === 'plant');
    expect(ask()).toBeUndefined();
    person.knownTech.add('arboriculture');
    expect(ask()?.enabled).toBe(false);
    expect(ask()?.reason).toMatch(/^They have no fruit to plant/);
    person.inventory.add('apple', 1);
    expect(ask()?.enabled).toBe(true);
  });
});
