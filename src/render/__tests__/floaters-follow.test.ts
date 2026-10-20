import { describe, expect, it, vi } from 'vitest';
import { Floaters } from '../Floaters.ts';

describe('Floaters', () => {
  it('m16-floater-follows-entity: a label follows a moving person or animal and stays at its last position when gone', () => {
    const floaters = new Floaters();
    floaters.push(1, 2, 'walking', { followId: 42 });
    // People and animals allocate ids in separate namespaces, so the kind is
    // part of the reference even when the numeric id is the same.
    floaters.push(7, 8, 'animal', { followId: 42, followKind: 'animal' });
    const camera = {
      scale: 10,
      viewWidth: 1000,
      viewHeight: 1000,
      worldToScreenX: (x: number) => x * 10,
      worldToScreenY: (y: number) => y * 10,
    } as any;
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      strokeText: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 20 })),
    } as any;

    floaters.draw(ctx, camera, (id, kind) => {
      if (id !== 42) return undefined;
      return kind === 'animal' ? { x: 3, y: 9 } : { x: 6, y: 4 };
    });
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, 'walking', 60, 32.5);
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, 'animal', 30, 82.5);

    ctx.fillText.mockClear();
    floaters.draw(ctx, camera, () => undefined);
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, 'walking', 60, 32.5);
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, 'animal', 30, 82.5);
  });
});
