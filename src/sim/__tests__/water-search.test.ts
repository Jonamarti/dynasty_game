import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { lastScores } from '../ai/Brain.ts';

const SMALL = {
  seed: 'water-question',
  world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
  population: { bands: 1, peoplePerBand: 4 },
};

describe('water questions', () => {
  it('learns the shore from one nearby bandmate and records the question as spent', () => {
    const sim = new Simulation(SMALL);
    const [asker, teller] = sim.livingPeople();
    expect(asker).toBeDefined();
    expect(teller).toBeDefined();
    asker!.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
    teller!.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
    const shore = sim.world.shoreTiles.find(tile =>
      sim.world.sameRegion(asker!.x, asker!.y, tile.x, tile.y));
    expect(shore).toBeDefined();
    teller!.placeMemory.remember('water', shore!.x, shore!.y, 3, 2);

    teller!.x = asker!.x;
    teller!.y = asker!.y;
    asker!.clearTarget();
    asker!.action = 'ask_water';
    asker!.targetPersonId = teller!.id;
    asker!.needs.thirst = 90;
    asker!.actionTimer = 1;
    for (let i = 0; i < 12 && asker!.action === 'ask_water'; i++) sim.step();

    expect(asker!.placeMemory.records('water')).toContainEqual({
      kind: 'water', x: shore!.x, y: shore!.y, day: 3, amount: 2, source: 'told',
    });
    expect(asker!.waterQuestionAttempts.has(teller!.id)).toBe(true);
  });

  it('moves on to exploration instead of asking the same nearby people in a loop', () => {
    const sim = new Simulation(SMALL);
    const people = sim.livingPeople();
    const [asker] = people;
    expect(asker).toBeDefined();
    let inland = { x: 0, y: 0 };
    let inlandDistance = -1;
    for (let y = 1; y < sim.world.height; y += 2) for (let x = 1; x < sim.world.width; x += 2) {
      if (!sim.world.isWalkable(x, y)) continue;
      const distance = Math.min(...sim.world.shoreTiles
        .filter(shore => sim.world.sameRegion(x, y, shore.x, shore.y))
        .map(shore => Math.hypot(x - shore.x, y - shore.y)), Infinity);
      if (distance > inlandDistance) {
        inlandDistance = distance;
        inland = { x, y };
      }
    }
    for (const person of people) {
      person.x = inland.x;
      person.y = inland.y;
      person.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
    }
    asker!.needs.thirst = 95;
    for (const person of people) {
      if (person.bandId === asker!.bandId && person.id !== asker!.id) {
        asker!.waterQuestionAttempts.add(person.id);
      }
    }
    lastScores.delete(asker!.id);
    for (let i = 0; i < 12 && !lastScores.has(asker!.id); i++) sim.step();

    const ids = (lastScores.get(asker!.id) ?? []).map(row => row.id);
    expect(ids).not.toContain('ask_water');
    expect(ids).toContain('explore');
  });
});
