import { describe, expect, it, vi } from 'vitest';
import { Renderer } from '../Renderer.ts';
import { DEFAULT_CONFIG } from '../../sim/core/Config.ts';
import { TimeManager } from '../../sim/core/TimeManager.ts';

describe('m16-night-tint-stable', () => {
  it('keeps the ground tint the same at the same night hour on consecutive days', () => {
    const time = new TimeManager({ ...DEFAULT_CONFIG.time, startDay: 5 });
    const context = {
      fillStyle: '', globalCompositeOperation: 'source-over',
      clearRect: vi.fn(), fillRect: vi.fn(),
    };
    const renderer = Object.create(Renderer.prototype) as {
      sim: { time: TimeManager };
      camera: { viewWidth: number; viewHeight: number };
      ctx: { drawImage: (...args: unknown[]) => void };
      nightLayer: { width: number; height: number };
      nightLayerCtx: typeof context;
      drawNightOverlay: (sources: readonly never[]) => void;
    };
    renderer.sim = { time };
    renderer.camera = { viewWidth: 64, viewHeight: 64 };
    renderer.ctx = { drawImage: vi.fn() };
    renderer.nightLayer = { width: 64, height: 64 };
    renderer.nightLayerCtx = context;

    const tintAt = (tick: number): string => {
      time.tick = tick;
      renderer.drawNightOverlay([]);
      return context.fillStyle;
    };
    const firstNight = tintAt(5 * DEFAULT_CONFIG.time.ticksPerDay + 230);
    const secondNight = tintAt(6 * DEFAULT_CONFIG.time.ticksPerDay + 230);
    expect(secondNight).toBe(firstNight);
  });
});
