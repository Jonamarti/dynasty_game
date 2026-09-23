/**
 * What a band knows of the land, M11 phase 14d: written by sight, forgotten
 * when a patch seen again is gone, and never known without being seen.
 */
import { describe, it, expect } from 'vitest';
import { BandMaps } from '../social/BandMaps.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { RNG } from '../core/RNG.ts';

describe('BandMaps', () => {
  it('knows only what a member has seen', () => {
    const flint = new ResourceNode('flint', 20, 20, new RNG('bm-a'));
    const farFlint = new ResourceNode('flint', 90, 90, new RNG('bm-b'));
    const hash = new SpatialHash<ResourceNode>(8);
    hash.rebuild([flint, farFlint]);
    const maps = new BandMaps(128, 128);

    maps.observe(0, 22, 22, 12, hash);

    expect(maps.known(0, 'flint', 20, 20, 10)).toHaveLength(1);
    expect(maps.known(0, 'flint', 90, 90, 10)).toHaveLength(0);
    // Another band has seen nothing at all.
    expect(maps.known(1, 'flint', 20, 20, 10)).toHaveLength(0);
  });

  it('forgets a patch that is picked bare when it is seen again', () => {
    const clay = new ResourceNode('clay', 20, 20, new RNG('bm-c'));
    const hash = new SpatialHash<ResourceNode>(8);
    hash.rebuild([clay]);
    const maps = new BandMaps(128, 128);
    maps.observe(0, 20, 20, 12, hash);
    expect(maps.known(0, 'clay', 20, 20, 10)).toHaveLength(1);

    clay.amount = 0;
    maps.observe(0, 20, 20, 12, hash);
    expect(maps.known(0, 'clay', 20, 20, 10)).toHaveLength(0);
  });
});
