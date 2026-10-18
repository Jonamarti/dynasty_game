import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Building } from '../entities/Building.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { stopReasonLabel } from '../../render/Floaters.ts';
import { placeFixtureStation } from '../../../tools/territoryFixture.ts';

const SMALL = {
  seed: 'm16-work-on-fetches-materials',
  world: { width: 48, height: 48, berryBushes: 0, flintOutcrops: 0, deadwood: 0, gameHerds: 0 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['firemaking'] },
};

function resetGround(sim: Simulation): void {
  sim.nodes.splice(0);
  sim.nodesById.clear();
  sim.nodeHash.clear();
}

function addNode(sim: Simulation, kind: 'sticks' | 'flint', x: number, y: number): ResourceNode {
  const node = new ResourceNode(kind, x, y, new RNG(`m16-${kind}-${x}-${y}`), sim.ids);
  node.amount = 30;
  sim.nodes.push(node);
  sim.nodesById.set(node.id, node);
  sim.nodeHash.insert(node);
  return node;
}

function settle(person: Person): void {
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
}

function placeHearth(sim: Simulation, worker: Person): Building {
  for (const [dx, dy] of [[4, 4], [-4, 4], [4, -4], [-4, -4], [6, 0], [0, 6]]) {
    const x = Math.round(worker.x) + dx!, y = Math.round(worker.y) + dy!;
    const hearth = placeFixtureStation(sim, 'hearth', x, y, worker.bandId);
    if (hearth) return hearth;
  }
  throw new Error('Could not place a hearth near the worker');
}

function buildFromNearbyGround(directedPlayer: boolean): void {
  const sim = new Simulation(SMALL);
  for (let i = 0; i < 300; i++) sim.step();
  const player = sim.possessFirst()!;
  const worker = directedPlayer ? player : sim.livingPeople().find(person => person.id !== player.id)!;
  if (directedPlayer) expect(sim.autonomy).toBe('manual');
  for (const other of sim.livingPeople()) {
    if (other.id === worker.id) continue;
    sim.peopleHash.remove(other);
    other.alive = false;
  }
  settle(worker);
  resetGround(sim);
  const hearth = placeHearth(sim, worker);
  const nodes = [
    addNode(sim, 'sticks', worker.x + 1, worker.y),
    addNode(sim, 'flint', worker.x + 2, worker.y),
  ];
  telemetry.reset();
  telemetry.enable();
  expect(sim.order(worker, 'build', { buildingId: hearth.id })).toBe(true);
  let previous = hearth.progress;
  for (let i = 0; i < 5000 && !hearth.complete; i++) {
    worker.needs.hunger = worker.needs.thirst = worker.needs.cold = worker.needs.fatigue = 0;
    sim.step();
    expect(hearth.progress).toBeGreaterThanOrEqual(previous);
    previous = hearth.progress;
  }
  expect(hearth.complete, JSON.stringify({ progress: hearth.progress, delivered: hearth.delivered.entries(),
    action: worker.action, order: worker.order, lastRefusal: sim.lastRefusal,
    stops: sim.interruptions.slice(-4), nodes: nodes.map(node => [node.kind, node.amount]) })).toBe(true);
  expect(hearth.progress).toBeGreaterThanOrEqual(hearth.def.workTicks);
  expect(nodes.some(node => node.amount < 30)).toBe(true);
  expect(telemetry.get('gather_for_site')).toBeGreaterThan(0);
  telemetry.disable();
}

afterEach(() => telemetry.disable());

describe('m16-work-on-fetches-materials', () => {
  it('lets an NPC ordered to build fetch the missing materials and finish', () => {
    buildFromNearbyGround(false);
  });

  it('lets the manually directed player fetch the missing materials and finish', () => {
    buildFromNearbyGround(true);
  });

  it('explains when nobody knows where to find the missing site materials', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 300; i++) sim.step();
    const player = sim.possessFirst()!;
    for (const other of sim.livingPeople()) {
      if (other.id === player.id) continue;
      sim.peopleHash.remove(other);
      other.alive = false;
    }
    settle(player);
    resetGround(sim);
    const hearth = placeHearth(sim, player);
    expect(sim.order(player, 'build', { buildingId: hearth.id })).toBe(true);
    for (let i = 0; i < 100 && !sim.interruptions.some(stop => stop.reason === 'site_material_unavailable'); i++) sim.step();

    expect(sim.interruptions.some(stop => stop.reason === 'site_material_unavailable')).toBe(true);
    expect(stopReasonLabel('site_material_unavailable')).toBe('nobody knew where to find the missing materials');
  });
});
