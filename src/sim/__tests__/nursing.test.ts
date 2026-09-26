import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { NURSING_HUNGER, NURSING_THIRST } from '../ai/Nursing.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Household } from '../entities/Household.ts';

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

  it('interrupts the mother and relieves a hungry, thirsty infant', () => {
    const sim = new Simulation({ seed: 'urgent-nursing', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
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

    sim.step();
    expect(mother.action).toBe('nurse');
    expect(mother.distanceTo(baby)).toBeLessThan(initialDistance);

    for (let i = 0; i < 300; i++) sim.step();

    expect(baby.needs.hunger).toBeLessThan(NURSING_HUNGER);
    expect(baby.needs.thirst).toBeLessThan(NURSING_THIRST);
    expect([baby.x, baby.y]).toEqual(restingPlace);
    expect(mother.action).not.toBe('chop');
  });

  it('carries an infant to the household shelter before nursing', () => {
    const sim = new Simulation({ seed: 'nursing-home', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
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

    for (let i = 0; i < 500; i++) sim.step();

    expect(home.contains(baby.x, baby.y)).toBe(true);
    expect(baby.carriedBy).toBeNull();
    expect(baby.needs.hunger).toBeLessThan(NURSING_HUNGER);
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
    expect(sim.interruptions.some(stop => stop.reason === 'not_the_mother')).toBe(true);
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
    expect(sim.interruptions.some(stop => stop.reason === 'not_the_mother')).toBe(false);
  });
});
