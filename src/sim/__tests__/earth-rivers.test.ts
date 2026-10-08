import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sampleEarthRiver } from '../world/EarthRivers.ts';
import { decodeWorldRaster } from '../world/WorldBinary.ts';
import { earthWorldGeography } from '../world/WorldGeography.ts';
import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { simplifyRiver } from '../../../tools/worlddata/rivers.ts';
import data from '../../data/earthRivers.json';
const raster = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin')));
const geography = earthWorldGeography({ entry: { id: 'earth-present', title: 'Earth', file: 'earth-present.bin', seaLevelMeters: 0, recommended: false }, raster }, 10);
const coord = (lon: number, lat: number) => ({ x: (lon + 180) / 360 * geography.map.width, y: (90 - lat) / 180 * geography.map.height });
describe('detailed Earth rivers', () => {
  it.each([['Ebro', -0.88, 41.65], ['Danube', 12.1, 49], ['Rhine', 6.96, 50.9], ['Tagus', -4, 39.9]] as const)(
    'retains %s at its real location with mud and reeds on its banks', (name, lon, lat) => {
      const { x, y } = coord(lon, lat);
      expect(sampleEarthRiver(x, y)?.name).toBe(name);
      const sim = new Simulation({ seed: 'earth-rivers', population: { bands: 0 }, world: { width: 64, height: 64, clayBanks: 6, reedBeds: 9, gameHerds: 0, predators: 0 } },
        new IdSpace(), { geography, x, y, comarcasWide: 4, comarcasHigh: 4 });
      expect(sim.world.isFreshWater(32, 32)).toBe(true);
      expect(sim.world.freshShore.length).toBeGreaterThan(100);
      for (const kind of ['clay', 'reeds']) {
        expect(sim.nodes.filter(n => n.kind === kind)).toHaveLength(kind === 'clay' ? 6 : 9);
        expect(sim.nodes.filter(n => n.kind === kind).every(n => sim.world.isWalkable(n.x, n.y) && sim.world.isFreshShore(n.x, n.y))).toBe(true);
      }
      if (name === 'Danube') {
        expect(Array.from(sim.world.waterKind!).some((kind, i) => kind === 1 && sim.world.depthAt(i % 64, Math.floor(i / 64)) >= sim.world.swimDepth)).toBe(true);
      }
    });
  it('gives the Danube a broader, deep core and keeps widths independent of raster resolution', () => {
    const danube = coord(12.1, 49), ebro = coord(-0.88, 41.65);
    expect(sampleEarthRiver(danube.x, danube.y)!.major).toBe(true);
    expect(sampleEarthRiver(ebro.x, ebro.y)!.major).toBe(false);
    expect(sampleEarthRiver(danube.x, danube.y)!.halfWidth).toBeGreaterThan(sampleEarthRiver(ebro.x, ebro.y)!.halfWidth);
    expect(sampleEarthRiver(danube.x * 2, danube.y * 2, 1920, 960)!.halfWidth).toBeCloseTo(sampleEarthRiver(danube.x, danube.y)!.halfWidth * 2);
  });
  it('retains actual bends rather than replacing the Ebro by its endpoint chord', () => {
    const part = data.find(r => r.name === 'Ebro')!.parts[0]!;
    const ax = part[0]!, ay = part[1]!, bx = part.at(-2)!, by = part.at(-1)!;
    const length = Math.hypot(bx - ax, by - ay);
    let bend = 0;
    for (let i = 2; i < part.length - 2; i += 2)
      bend = Math.max(bend, Math.abs((bx - ax) * (part[i + 1]! - ay) - (by - ay) * (part[i]! - ax)) / length);
    expect(bend).toBeGreaterThan(0.3);
    expect(simplifyRiver([{ x: 0, y: 0 }, { x: 1, y: 0.1 }, { x: 2, y: 0 }], 0.01)).toHaveLength(3);
    expect(simplifyRiver([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 0.01)).toHaveLength(2);
  });
});
