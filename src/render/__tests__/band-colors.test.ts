import { describe, expect, it } from 'vitest';
import { BAND_COLORS, bandColorIndex } from '../Sprites.ts';

describe('band colours follow membership, independently of global identity', () => {
  it('keeps a low-ID outcast grey and a high-ID founding band in the tribe palette', () => {
    expect(BAND_COLORS[bandColorIndex(3, true)]).toBe('#7d7d7d');
    expect(BAND_COLORS[bandColorIndex(1003, false)]).toBe(BAND_COLORS[3]);
  });

  it('preserves the eight default founding colours', () => {
    for (let id = 0; id < 8; id++) expect(bandColorIndex(id, false)).toBe(id);
  });
});
