import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lastScores } from '../ai/Brain.ts';
import { telemetry } from '../core/Telemetry.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { createFrontier } from '../../../tools/frontierFixture.ts';

const frontier = (startingTech: string[] = []) => createFrontier({
  seed: 'continental-water-fallback',
  world: { width: 64, height: 64, berryBushes: 0, flintOutcrops: 0, deadwood: 0,
    gameHerds: 0, predators: 0, fishingSpots: 0, wildGrainPatches: 0 },
  population: { bands: 1, peoplePerBand: 4, startingTech },
});

/** Turn the fixture's river into non-potable water and refresh the drinking index. */
function removeFreshBanks(sim: ReturnType<typeof frontier>): void {
  const waterKind = sim.world.waterKind;
  expect(waterKind, 'geographic worlds retain water provenance').toBeDefined();
  for (let i = 0; i < waterKind!.length; i++) if (waterKind![i] === 1) waterKind![i] = 2;
  sim.freshShoreHash.rebuild(sim.world.freshShore);
  expect(sim.world.freshShore).toHaveLength(0);
}

function settleThirsty(person: ReturnType<ReturnType<typeof frontier>['livingPeople']>[number]): void {
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.needs.thirst = 60;
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
}

describe('continental non-shore thirst sources', () => {
  beforeEach(() => { telemetry.reset(); telemetry.enable(); });
  afterEach(() => { telemetry.disable(); telemetry.reset(); lastScores.clear(); });

  it('finds and drinks from a finished well when no freshwater shore exists', () => {
    const sim = frontier(['stoneworking', 'carpentry', 'masonry', 'well']);
    for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
    removeFreshBanks(sim);
    let well = null;
    for (let y = 8; y < sim.world.height - 8 && !well; y++) {
      for (let x = 8; x < sim.world.width - 8 && !well; x++) {
        if (!sim.canPlace(BUILDINGS.well!, x, y)) continue;
        well = sim.place('well', x, y, sim.bands[0]!.id);
      }
    }
    expect(well, 'fixture must admit a well on dry ground').not.toBeNull();
    well!.complete = true;
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    person.x = well!.centerX;
    person.y = well!.centerY;
    settleThirsty(person);

    sim.possess(person);
    lastScores.delete(person.id);
    for (let i = 0; i < 10 && !lastScores.has(person.id); i++) sim.step();
    const drink = (lastScores.get(person.id) ?? []).find(entry => entry.id === 'drink');
    expect(drink, 'the well should be selected as the remaining potable source').toBeDefined();
    expect(drink!.score).toBeGreaterThan(0);

    expect(sim.order(person, 'drink')).toBe(true);
    for (let i = 0; i < 200 && person.needs.thirst > 0; i++) sim.step();
    expect(person.needs.thirst).toBe(0);
  });

  it('eats carried fruit and gets its hydration when no freshwater shore or well exists', () => {
    const sim = frontier();
    removeFreshBanks(sim);
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    for (const other of sim.livingPeople()) if (other !== person) sim.order(other, 'rest');
    person.isPlayer = false;
    settleThirsty(person);
    // An acute thirst tests the food bridge without relying on hunger to
    // beat this founder's ordinary urge to explore.
    person.needs.thirst = 95;
    person.inventory.add('apple', 1);
    const thirstBefore = person.needs.thirst;
    sim.peopleHash.rebuild(sim.livingPeople());

    for (let tick = 0; tick < 200 && person.inventory.count('apple') > 0; tick++) sim.step();

    expect(person.inventory.count('apple')).toBe(0);
    expect(person.needs.thirst).toBeLessThan(thirstBefore);
    expect(telemetry.get('fruit_thirst_relief')).toBeGreaterThan(0);
    expect(sim.buildings.some(building => building.def.id === 'well' && building.complete)).toBe(false);
    expect(telemetry.get('hydrating_food_candidate')).toBeGreaterThan(0);
  });
});
