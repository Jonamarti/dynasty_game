import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { createWaterLakeSimulation } from '../../../tools/waterFishFixture.ts';
import { earthWorldGeography, randomWorldGeography } from '../world/WorldGeography.ts';

const geography = randomWorldGeography('resources');
function generate(x: number, y: number, clayBanks = 6, reedBeds = 9, bands = 0) {
  return new Simulation({ seed: 'resource-audit', population: { bands },
    world: { width: 64, height: 64, clayBanks, reedBeds, gameHerds: 2, predators: 0 } },
    new IdSpace(), { geography, x: x * 10 + 5, y: y * 10 + 5,
      comarcasWide: 10, comarcasHigh: 10 });
}

describe('random map bank resources', () => {
  it('places clay and reeds on forest river banks without a beach biome', () => {
    const sim = generate(64, 6);
    expect(sim.world.countBiomes().beach).toBe(0);
    expect(sim.world.freshShore.length).toBeGreaterThan(0);
    for (const [kind, quota] of [['clay', 6], ['reeds', 9]] as const) {
      const nodes = sim.nodes.filter(n => n.kind === kind);
      expect(nodes).toHaveLength(quota);
      for (const node of nodes) {
        expect(sim.world.isWalkable(node.x, node.y)).toBe(true);
        expect(sim.world.isShore(node.x, node.y)).toBe(true);
        expect(sim.world.biomeAt(node.x, node.y)).toBe('forest');
      }
    }
  });

  it('fills a small bank quota instead of losing it to random land sampling', () => {
    const sim = generate(44, 5, 6, 9);
    expect(sim.world.freshShore.length).toBeGreaterThan(0);
    expect(sim.nodes.filter(n => n.kind === 'clay')).toHaveLength(6);
    expect(sim.nodes.filter(n => n.kind === 'reeds')).toHaveLength(9);
  });

  it('also fills the bank quotas on continental lake starts', () => {
    const sim = createWaterLakeSimulation('lake-banks', {
      population: { bands: 0 }, world: { clayBanks: 6, reedBeds: 9 },
    });
    for (const [kind, quota] of [['clay', 6], ['reeds', 9]] as const) {
      const nodes = sim.nodes.filter(n => n.kind === kind);
      expect(nodes).toHaveLength(quota);
      expect(nodes.every(n => sim.world.isWalkable(n.x, n.y) && sim.world.isFreshShore(n.x, n.y))).toBe(true);
    }
  });

  it('does not invent bank resources when there is no water', () => {
    const dry = earthWorldGeography({
      entry: { id: 'dry-banks', title: 'Dry banks', file: 'dry.bin', seaLevelMeters: 0, recommended: false },
      raster: { width: 4, height: 2, elevationMeters: new Int16Array(8).fill(100),
        koppen: new Uint8Array(8), features: new Uint32Array(8), seaLevelMeters: 0 },
    }, 10);
    const sim = new Simulation({ population: { bands: 0 },
      world: { width: 32, height: 32, clayBanks: 6, reedBeds: 9, gameHerds: 0, predators: 0 } },
      new IdSpace(), { geography: dry, x: 20, y: 10 });
    expect(sim.world.freshShore).toHaveLength(0);
    expect(sim.world.saltShore).toHaveLength(0);
    expect(sim.nodes.filter(n => n.kind === 'clay' || n.kind === 'reeds')).toHaveLength(0);
  });

  it('keeps per-kind placement deterministic and leaves other resource and herd streams alone', () => {
    const withBanks = generate(64, 6, 6, 9, 1);
    const repeated = generate(64, 6, 6, 9, 1);
    expect(repeated.nodes.map(n => [n.kind, n.x, n.y, n.amount]))
      .toEqual(withBanks.nodes.map(n => [n.kind, n.x, n.y, n.amount]));
    const withoutBanks = generate(64, 6, 0, 0, 1);
    expect(withBanks.people.map(p => [p.name, p.x, p.y]))
      .toEqual(withoutBanks.people.map(p => [p.name, p.x, p.y]));
    const otherNodes = (sim: Simulation) => sim.nodes.filter(n => n.kind !== 'clay' && n.kind !== 'reeds')
      .map(n => [n.kind, n.x, n.y, n.amount]);
    expect(otherNodes(withBanks)).toEqual(otherNodes(withoutBanks));
    expect(withBanks.animals.map(a => [a.species, a.x, a.y]))
      .toEqual(withoutBanks.animals.map(a => [a.species, a.x, a.y]));
  });
});
