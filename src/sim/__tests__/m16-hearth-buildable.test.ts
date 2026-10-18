import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Building } from '../entities/Building.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { RNG } from '../core/RNG.ts';

describe('m16-hearth-buildable', () => {
  it('finishes a hearth from ground materials with empty hands and monotone progress', () => {
    const sim = new Simulation({
      seed: 'm16-hearth-buildable',
      world: { width: 48, height: 48, berryBushes: 0, flintOutcrops: 0, deadwood: 0, gameHerds: 0 },
      population: { bands: 1, peoplePerBand: 6, startingTech: ['firemaking'] },
    });
    for (let i = 0; i < 300; i++) sim.step();
    const player = sim.possessFirst()!;
    const worker = sim.livingPeople().find(person => person.id !== player.id)!;
    for (const other of sim.livingPeople()) {
      if (other.id === player.id || other.id === worker.id) continue;
      sim.peopleHash.remove(other);
      other.alive = false;
    }
    let hearth: Building | null = null;
    for (const [dx, dy] of [[4, 4], [-4, 4], [4, -4], [-4, -4], [6, 0], [0, 6]]) {
      hearth = sim.place('hearth', Math.round(worker.x) + dx!, Math.round(worker.y) + dy!, worker.bandId, player.id);
      if (hearth) break;
    }
    expect(hearth).not.toBeNull();
    worker.needs.hunger = worker.needs.thirst = worker.needs.cold = worker.needs.fatigue = 0;
    for (const [item, count] of worker.inventory.entries()) worker.inventory.remove(item, count);
    expect(worker.carrying).toBe(0);
    for (const kind of ['sticks', 'flint'] as const) {
      const node = new ResourceNode(kind, hearth!.centerX + (kind === 'sticks' ? 2 : 3), hearth!.centerY,
        new RNG(`m16-hearth-${kind}`), sim.ids);
      node.amount = 30;
      sim.nodes.push(node);
      sim.nodesById.set(node.id, node);
      sim.nodeHash.insert(node);
    }
    expect(hearth!.materialsReady).toBe(false);
    expect(worker.carrying).toBe(0);
    expect(sim.order(worker, 'build', { buildingId: hearth!.id })).toBe(true);
    let previous = hearth!.progress;
    for (let i = 0; i < 5000 && !hearth!.complete; i++) {
      worker.needs.hunger = worker.needs.thirst = worker.needs.cold = worker.needs.fatigue = 0;
      sim.step();
      expect(hearth!.progress).toBeGreaterThanOrEqual(previous);
      previous = hearth!.progress;
    }
    expect(hearth!.complete).toBe(true);
    expect(hearth!.progress).toBeGreaterThanOrEqual(hearth!.def.workTicks);
  });
});
