import { describe, expect, it, vi } from 'vitest';
import { BUILDINGS, type Building } from '../../sim/entities/Building.ts';
import { Renderer } from '../Renderer.ts';

type TestBuilding = Pick<Building, 'def' | 'complete' | 'crop' | 'ruined' | 'soundness' | 'ownerBandId' | 'x' | 'y'>;

function building(id: string): TestBuilding {
  return {
    def: BUILDINGS[id]!, complete: true, crop: null, ruined: false, soundness: 1,
    ownerBandId: 0, x: 4, y: 5,
  } as TestBuilding;
}

function rendererHarness() {
  const drawAsset = vi.fn();
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const renderer = Object.create(Renderer.prototype) as Renderer & Record<string, unknown>;
  Object.assign(renderer, {
    sim: { bands: [{ id: 0, outcast: false }] },
    art: {
      manifest: () => ({ keys: Object.fromEntries(
        Object.keys(BUILDINGS).map(id => [`b/${id}/ext`, true])),
        meta: { groundY: 0, interiors: [] },
      }),
      assetBox: () => ({ w: 10, h: 10, ox: 0, oy: 0 }),
      drawAsset,
    },
    ctx,
    camera: { scale: 16, worldToScreenX: (x: number) => x * 16, worldToScreenY: (y: number) => y * 16 },
    tallBuildings: [],
    roofLifted: () => false,
    hasInteriorArt: () => false,
    drawInteriorLayer: vi.fn(),
  });
  return { renderer, ctx, drawAsset };
}

const drawArt = (renderer: Renderer, value: TestBuilding) =>
  (renderer as unknown as { drawBuildingArt: (b: Building, selected: boolean, px: number, py: number, w: number, h: number) => boolean })
    .drawBuildingArt(value as Building, false, 10, 20, 32, 32);

const drawSprite = (renderer: Renderer, value: TestBuilding) =>
  (renderer as unknown as { drawBuildingSprite: (b: Building, layer: 'ext' | 'plan') => void })
    .drawBuildingSprite(value as Building, 'ext');

describe('M16 furniture and station building art', () => {
  it('does not draw a tribe ring around furniture or stations', () => {
    for (const id of ['bed', 'quern', 'fireplace']) {
      const { renderer, ctx } = rendererHarness();
      expect(drawArt(renderer, building(id))).toBe(true);
      expect(ctx.ellipse).not.toHaveBeenCalled();
    }
    const { renderer, ctx } = rendererHarness();
    expect(drawArt(renderer, building('mud_hut'))).toBe(true);
    expect(ctx.ellipse).toHaveBeenCalledOnce();
  });

  it('does not draw a tribe pennant on furniture or stations', () => {
    for (const id of ['bed', 'quern', 'fireplace']) {
      const { renderer, drawAsset } = rendererHarness();
      drawSprite(renderer, building(id));
      expect(drawAsset.mock.calls.map(call => call[2])).not.toContain('banner/pole');
      expect(drawAsset.mock.calls.map(call => call[2])).not.toContain('banner/cloth');
    }
    const { renderer, drawAsset } = rendererHarness();
    drawSprite(renderer, building('mud_hut'));
    expect(drawAsset.mock.calls.map(call => call[2])).toContain('banner/pole');
    expect(drawAsset.mock.calls.map(call => call[2])).toContain('banner/cloth');
  });
});
