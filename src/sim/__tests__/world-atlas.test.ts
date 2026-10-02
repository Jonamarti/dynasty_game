import { describe, expect, it, vi } from 'vitest';
import { encodeWorldRaster } from '../world/WorldBinary.ts';
import { loadWorldAtlas } from '../world/WorldAtlas.ts';

const raster = encodeWorldRaster({
  width: 2, height: 2,
  elevationMeters: new Int16Array(4),
  koppen: new Uint8Array(4),
  features: new Uint32Array(4),
  seaLevelMeters: -60,
});
const rasterBuffer = new ArrayBuffer(raster.length);
new Uint8Array(rasterBuffer).set(raster);

const manifest = {
  format: 'DWM2', resolution: '2x2', regionDegrees: 3.75, comarcasPerRegion: 10,
  climate: 'test',
  maps: [
    { id: 'earth-past', title: 'Past Earth', file: 'earth-past.bin', seaLevelMeters: -60, recommended: true },
  ],
};

describe('runtime world atlas loader', () => {
  it('loads only the manifest-listed map and checks its metadata', async () => {
    const fetchAsset = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/manifest.json')) return new Response(JSON.stringify(manifest));
      if (url.endsWith('/earth-past.bin')) return new Response(rasterBuffer.slice(0));
      return new Response(null, { status: 404 });
    });
    const maps = await loadWorldAtlas('/world/', fetchAsset as typeof fetch);
    expect(maps).toHaveLength(1);
    expect(maps[0]!.entry.id).toBe('earth-past');
    expect(Array.from(maps[0]!.raster.features!)).toEqual([0, 0, 0, 0]);
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it('rejects a manifest path that could escape the world asset directory', async () => {
    const bad = { ...manifest, maps: [{ ...manifest.maps[0], file: '../outside.bin' }] };
    const fetchAsset = vi.fn(async () => new Response(JSON.stringify(bad)));
    await expect(loadWorldAtlas('/world/', fetchAsset as typeof fetch)).rejects.toThrow('Invalid or duplicate');
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it('rejects binary data that disagrees with the manifest sea level', async () => {
    const bad = { ...manifest, maps: [{ ...manifest.maps[0], seaLevelMeters: 0 }] };
    const fetchAsset = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/manifest.json')
      ? new Response(JSON.stringify(bad))
      : new Response(rasterBuffer.slice(0)));
    await expect(loadWorldAtlas('/world/', fetchAsset as typeof fetch)).rejects.toThrow('does not match its manifest');
  });
});
