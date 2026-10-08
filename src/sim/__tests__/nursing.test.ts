import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { NURSING_HUNGER, NURSING_THIRST } from '../ai/Nursing.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Household } from '../entities/Household.ts';
import { itemCapacityFor } from '../core/Carry.ts';
import { RNG } from '../core/RNG.ts';
import { telemetry } from '../core/Telemetry.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { commitmentGoal } from '../ai/Commitment.ts';

afterEach(() => telemetry.disable());

function interruptionFixture(seed: string, motherOnlyFeeds = true) {
  const sim = new Simulation({ seed, world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 }, childhood: { carryBaby: false },
    motivation: { motherOnlyFeeds } });
  const mother = sim.people[0]!;
  const baby = sim.people[1]!;
  const other = sim.people[2]!;
  mother.sex = 'female';
  mother.age = 30 * mother.daysPerYear;
  mother.childIds = [baby.id];
  mother.order = null;
  mother.needs.hunger = mother.needs.thirst = mother.needs.fatigue = mother.needs.cold = 0;
  mother.cryHeardTick = sim.time.tick - 100;
  baby.age = 0;
  baby.bandId = mother.bandId;
  baby.motherId = mother.id;
  baby.x = mother.x;
  baby.y = mother.y;
  baby.needs.hunger = baby.needs.thirst = 100;
  other.x = mother.x; other.y = mother.y;
  sim.peopleHash.rebuild(sim.people);
  return { sim, mother, baby, other };
}

describe('urgent maternal nursing', () => {
  it('does not interrupt work when urgent nursing is ablated', () => {
    const sim = new Simulation({ seed: 'nursing-ablated', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 }, motivation: { urgentNursing: false } });
    const mother = sim.people[0]!;
    const baby = sim.people[1]!;
    mother.age = 30 * mother.daysPerYear;
    mother.childIds = [baby.id];
    mother.action = 'chop';
    mother.actionTimer = 100;
    mother.order = 'chop';
    baby.age = 0;
    baby.motherId = mother.id;
    baby.needs.hunger = 100;
    baby.needs.thirst = 100;

    sim.step();

    expect(mother.action).not.toBe('nurse');
  });

  it('lets timed work receive a baby cry after its valid route commitment expires', () => {
    const { sim, mother } = interruptionFixture('nursing-commitment-transition');
    const node = new ResourceNode('sticks', mother.x, mother.y, new RNG('nursing-real-node'), sim.ids);
    node.amount = node.def.maxAmount;
    sim.nodes.push(node);
    sim.nodesById.set(node.id, node);
    sim.nodeHash.rebuild(sim.nodes);
    mother.action = 'gather';
    mother.actionTimer = 1;
    mother.targetNodeId = node.id;
    mother.targetX = node.x;
    mother.targetY = node.y;
    mother.commitment = { action: 'gather', drive: null, baselinePressure: 0, goal: commitmentGoal('gather', mother) };
    telemetry.reset(); telemetry.enable();

    sim.step();

    expect(telemetry.get('work_ended_baby_crying')).toBe(1);
    expect(mother.commitment).toBeNull();
  });

  it('continues the same valid gather if the cry was already consumed this tick', () => {
    const { sim, mother } = interruptionFixture('nursing-cry-consumed-control');
    const node = new ResourceNode('sticks', mother.x, mother.y, new RNG('nursing-real-node-control'), sim.ids);
    node.amount = node.def.maxAmount;
    sim.nodes.push(node);
    sim.nodesById.set(node.id, node);
    sim.nodeHash.rebuild(sim.nodes);
    mother.action = 'gather';
    mother.actionTimer = 1;
    mother.targetNodeId = node.id;
    mother.targetX = node.x;
    mother.targetY = node.y;
    mother.commitment = { action: 'gather', drive: null, baselinePressure: 0, goal: commitmentGoal('gather', mother) };
    expect(sim.cryReaches(mother)).toBe(true);
    telemetry.reset(); telemetry.enable();

    sim.step();

    expect(telemetry.get('work_ended_baby_crying')).toBe(0);
    expect(mother.action).toBe('gather');
    expect(node.amount).toBeLessThan(node.def.maxAmount);
  });

  it('keeps a food give aimed at the baby who cried, while rejecting a stone gift', () => {
    const { sim, mother, baby } = interruptionFixture('nursing-targeted-give', false);
    mother.inventory.add('berries', 3);
    mother.action = 'give';
    mother.actionTimer = 2;
    mother.targetPersonId = baby.id;
    telemetry.reset(); telemetry.enable();

    sim.step();

    expect(mother.action).toBe('give');
    expect(mother.actionTimer).toBe(1);
    expect(telemetry.get('interrupted_give_baby_crying')).toBe(0);

    const stoneCase = interruptionFixture('nursing-stone-gift', false);
    stoneCase.mother.inventory.add('berries', 3);
    stoneCase.mother.inventory.add('stone', 1);
    stoneCase.mother.action = 'give';
    stoneCase.mother.actionTimer = 2;
    stoneCase.mother.targetPersonId = stoneCase.baby.id;
    stoneCase.mother.targetItemId = 'stone';
    telemetry.reset();

    stoneCase.sim.step();

    expect(telemetry.get('interrupted_give_baby_crying')).toBe(1);
  });

  it('interrupts a food give aimed at someone other than the crying baby', () => {
    const { sim, mother, other } = interruptionFixture('nursing-other-target', false);
    mother.inventory.add('berries', 3);
    mother.action = 'give';
    mother.actionTimer = 2;
    mother.targetPersonId = other.id;
    telemetry.reset(); telemetry.enable();

    sim.step();

    expect(telemetry.get('interrupted_give_baby_crying')).toBe(1);
  });
  it('interrupts the mother and relieves a hungry, thirsty infant', () => {
    // The M13 arrangement: the baby lies where it is and the mother goes to
    // it. Kept as the `carryBaby: false` ablation since M15 phase 20.
    const sim = new Simulation({ seed: 'urgent-nursing', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 }, childhood: { carryBaby: false } });
    const mother = sim.people[0]!;
    const baby = sim.people[1]!;
    mother.age = 30 * mother.daysPerYear;
    mother.childIds = [baby.id];
    mother.needs.hunger = 100;
    mother.needs.thirst = 100;
    mother.action = 'chop';
    mother.actionTimer = 100;
    mother.order = 'chop';
    baby.age = 0;
    baby.bandId = mother.bandId;
    baby.motherId = mother.id;
    baby.x = mother.x;
    baby.y = mother.y;
    let away: { x: number; y: number } | null = null;
    for (let radius = 5; radius <= 12 && !away; radius++) {
      for (let dy = -radius; dy <= radius && !away; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = Math.floor(baby.x) + dx;
          const y = Math.floor(baby.y) + dy;
          if (sim.world.isWalkable(x, y) && sim.world.sameRegion(baby.x, baby.y, x, y)) {
            away = { x: x + 0.5, y: y + 0.5 };
            break;
          }
        }
      }
    }
    expect(away).not.toBeNull();
    mother.x = away!.x;
    mother.y = away!.y;
    baby.needs.hunger = 100;
    baby.needs.thirst = 100;
    const restingPlace = [baby.x, baby.y];
    const initialDistance = mother.distanceTo(baby);

    // The cry breaks off the chopping on the first tick and the mother, who
    // weighs a baby at a hundred above her own thirst, chooses it on the next
    // (owner, 2026-10-01: the cry is weighed, it no longer seizes her).
    for (let i = 0; i < 3 && mother.action !== 'nurse'; i++) sim.step();
    expect(mother.action).toBe('nurse');
    sim.step();
    expect(mother.distanceTo(baby)).toBeLessThan(initialDistance);

    const start = sim.time.tick;
    for (let i = 0; i < 300; i++) sim.step();

    // A nursling gets hungry enough to cry four times a day (owner,
    // 2026-10-01), so "below the cry line" at an arbitrary tick says nothing.
    // It was fed, and is nowhere near danger.
    expect(baby.lastNursedTick).toBeGreaterThan(start);
    expect(baby.needs.hunger).toBeLessThan(NURSING_HUNGER * 2);
    expect(baby.needs.thirst).toBeLessThan(NURSING_THIRST);
    expect([baby.x, baby.y]).toEqual(restingPlace);
    expect(mother.action).not.toBe('chop');
  });

  it('carries an infant to the household shelter before nursing', () => {
    const sim = new Simulation({ seed: 'nursing-home', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 }, childhood: { carryBaby: false } });
    const mother = sim.people[0]!;
    const baby = sim.people[1]!;
    mother.age = 30 * mother.daysPerYear;
    mother.childIds = [baby.id];
    baby.age = 0;
    baby.bandId = mother.bandId;
    baby.motherId = mother.id;
    baby.x = mother.x;
    baby.y = mother.y;
    const household = new Household('Family', mother.id, mother.bandId, sim.time.tick);
    household.memberIds.push(mother.id, baby.id);
    household.add(mother.id);
    household.add(baby.id);
    mother.householdId = baby.householdId = household.id;
    const home = new Building(BUILDINGS.mud_hut!, Math.max(2, Math.min(40, Math.floor(baby.x) - 5)),
      Math.max(2, Math.min(40, Math.floor(baby.y) - 5)), mother.bandId);
    home.complete = true;
    household.homeBuildingId = home.id;
    sim.households.push(household);
    sim.householdsById.set(household.id, household);
    sim.buildings.push(home);
    sim.buildingsById.set(home.id, home);
    baby.needs.hunger = 100;
    baby.needs.thirst = 100;

    const start = sim.time.tick;
    for (let i = 0; i < 500; i++) sim.step();

    expect(home.contains(baby.x, baby.y)).toBe(true);
    expect(baby.carriedBy).toBeNull();
    expect(baby.lastNursedTick).toBeGreaterThan(start);
    expect(baby.needs.hunger).toBeLessThan(NURSING_HUNGER * 2);
    expect(baby.needs.thirst).toBeLessThan(NURSING_THIRST);
  });

  it('lets another adult greet the baby but refuses food from them', () => {
    const sim = new Simulation({ seed: 'no-outsider-feeding', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    const mother = sim.people[0]!;
    const baby = sim.people[1]!;
    const neighbour = sim.people[2]!;
    mother.childIds = [baby.id];
    baby.age = 0;
    baby.motherId = mother.id;
    baby.bandId = mother.bandId;
    baby.needs.hunger = 10;
    baby.x = neighbour.x;
    baby.y = neighbour.y;
    const foodBefore = baby.inventory.count('berries');
    neighbour.inventory.add('berries', 4);
    expect(sim.order(neighbour, 'give', { personId: baby.id })).toBe(true);

    for (let i = 0; i < 40; i++) sim.step();

    expect(baby.inventory.count('berries')).toBe(foodBefore);
    expect(sim.interruptions.some(stop => stop.reason === 'still_nursing')).toBe(true);
  });

  it('allows a non-mother to feed an infant when the rule is ablated', () => {
    const sim = new Simulation({ seed: 'shared-infant-feeding', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 }, motivation: { motherOnlyFeeds: false } });
    const mother = sim.people[0]!;
    const baby = sim.people[1]!;
    const neighbour = sim.people[2]!;
    mother.childIds = [baby.id];
    baby.age = 0;
    baby.motherId = mother.id;
    baby.bandId = mother.bandId;
    baby.x = neighbour.x;
    baby.y = neighbour.y;
    neighbour.inventory.add('berries', 4);
    expect(sim.order(neighbour, 'give', { personId: baby.id })).toBe(true);

    for (let i = 0; i < 40; i++) sim.step();

    expect(baby.inventory.count('berries')).toBeGreaterThan(0);
    expect(sim.interruptions.some(stop => stop.reason === 'still_nursing')).toBe(false);
  });

  it('lets a hungry parent finish giving food to a hungrier child', () => {
    const sim = new Simulation({ seed: 'hungry-parent-feeds-child', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    const parent = sim.people[0]!;
    const child = sim.people[1]!;
    parent.age = 30 * parent.daysPerYear;
    parent.childIds = [child.id];
    parent.needs.hunger = 60;
    parent.inventory.add('berries', 4);
    child.age = 3 * child.daysPerYear;
    child.motherId = parent.id;
    child.bandId = parent.bandId;
    child.needs.hunger = 90;
    child.x = parent.x;
    child.y = parent.y;

    expect(sim.order(parent, 'give', { personId: child.id })).toBe(true);
    for (let i = 0; i < 20; i++) sim.step();

    expect(child.needs.hunger).toBeLessThan(90);
    expect(sim.interruptions.some(stop => stop.personId === parent.id && stop.reason === 'hungry')).toBe(false);
  });

  it('feeds a dependent child whose full hands cannot receive another berry', () => {
    const sim = new Simulation({ seed: 'full-child-feeding', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    const parent = sim.people[0]!;
    const child = sim.people[1]!;
    parent.age = 30 * parent.daysPerYear;
    parent.childIds = [child.id];
    child.age = 3 * child.daysPerYear;
    child.motherId = parent.id;
    child.bandId = parent.bandId;
    child.x = parent.x;
    child.y = parent.y;
    child.needs.hunger = 80;
    parent.needs.hunger = 10;
    for (const [id, count] of parent.inventory.entries()) parent.inventory.remove(id, count);
    for (const [id, count] of child.inventory.entries()) child.inventory.remove(id, count);
    parent.inventory.add('berries', 4);
    for (const id of ['sticks', 'flint', 'thatch', 'mud']) {
      const room = child.carryCapacity - child.carrying;
      if (room <= 0) break;
      child.inventory.add(id, Math.min(room, itemCapacityFor(child, sim.config.carry, id)));
    }
    expect(child.carrying).toBe(child.carryCapacity);
    const pilesBefore = sim.piles.length;

    expect(sim.order(parent, 'give', { personId: child.id })).toBe(true);
    for (let i = 0; i < 40; i++) sim.step();

    expect(child.needs.hunger).toBeLessThan(80);
    expect(child.carrying).toBeLessThanOrEqual(child.carryCapacity);
    expect(sim.piles.length).toBe(pilesBefore);
    expect(parent.inventory.count('berries')).toBeLessThan(4);
  });

  it('keeps feeding a dependent child while the parent is cold', () => {
    const sim = new Simulation({ seed: 'cold-parent-feeding', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    const parent = sim.people[0]!;
    const child = sim.people[1]!;
    parent.age = 30 * parent.daysPerYear;
    parent.childIds = [child.id];
    child.age = 3 * child.daysPerYear;
    child.motherId = parent.id;
    child.bandId = parent.bandId;
    child.x = parent.x;
    child.y = parent.y;
    parent.needs.hunger = 10;
    parent.needs.cold = 90;
    child.needs.hunger = 80;
    parent.inventory.add('berries', 4);

    expect(sim.order(parent, 'give', { personId: child.id })).toBe(true);
    for (let i = 0; i < 40; i++) sim.step();

    expect(child.needs.hunger).toBeLessThan(80);
    expect(sim.interruptions.some(stop => stop.personId === parent.id && stop.reason === 'cold')).toBe(false);
  });
});
