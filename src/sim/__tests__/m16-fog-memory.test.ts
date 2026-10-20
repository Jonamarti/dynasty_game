import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { PlaceMemory, PLACE_CELL_SIZE } from '../social/PlaceMemory.ts';

function emptyWorld(seed: string): Simulation {
  return new Simulation({
    seed,
    world: { width: 48, height: 48, treeDensity: 0, berryBushes: 0, flintOutcrops: 0, deadwood: 0, gameHerds: 0 },
    population: { bands: 1, peoplePerBand: 2 },
  });
}

describe('M16 fog and place memory', () => {
  it('m16-fog-forgets-removed: seeing an empty cell forgets removed things, not absent rumors', () => {
    const sim = emptyWorld('m16-fog-forgets-removed');
    const observer = sim.livingPeople()[0]!;
    observer.x = 4.5; observer.y = 4.5;
    const memory = observer.placeMemory;
    const day = sim.time.day;
    const x = observer.x, y = observer.y;
    const tree = { type: 'tree', species: 'oak', maturity: 1, bare: false, autumn: false, fruit: 0 } as const;
    memory.remember('tree', x, y, day, 2, 'seen', tree);
    memory.remember('fruit:apple', x, y, day, 2, 'seen', tree);
    memory.remember('building:lean_to', x, y, day, 2, 'seen', { type: 'building', id: 'lean_to', complete: true });
    memory.remember('building:mud_hut', x, y, day, 1, 'seen', { type: 'building', id: 'mud_hut', complete: false });
    memory.remember('pile:sticks', x, y, day, 2);
    memory.remember('resource:berries', x, y, day, 2);
    memory.remember('herd:deer', x, y, day, 2);
    memory.remember('water', x, y, day, 2);

    (sim as any).observePlaces(observer);

    for (const kind of ['tree', 'fruit:apple', 'building:lean_to', 'building:mud_hut', 'pile:sticks', 'resource:berries', 'herd:deer']) {
      expect(memory.hasAt(kind, x, y), `${kind} remained after the cell was seen empty`).toBe(false);
    }
    expect(memory.hasAt('water', x, y), 'water is a map fact, not a removable entity').toBe(true);
  });

  it('m16-memory-while-walking: a committed walk records each newly entered memory cell', () => {
    const sim = emptyWorld('m16-memory-while-walking');
    sim.possessFirst();
    const walker = sim.people.find(person => !person.isPlayer)!;
    walker.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
    walker.placeMemoryWalkCell = Math.floor(walker.y / PLACE_CELL_SIZE) * Math.ceil(sim.world.width / PLACE_CELL_SIZE) +
      Math.floor(walker.x / PLACE_CELL_SIZE);
    walker.placeMemoryStaticDay = sim.time.day;
    walker.action = 'goto';
    walker.targetX = Math.min(sim.world.width - 2, walker.x + 24); walker.targetY = walker.y;
    walker.actionTimer = 500;
    const startX = walker.x;

    for (let i = 0; i < 180 && walker.x < startX + 20; i++) sim.step();

    expect(walker.x).toBeGreaterThan(startX + 12);
    expect(walker.placeMemory.seenDayAt(startX + 12, walker.y)).toBeGreaterThan(0);
  });
});
