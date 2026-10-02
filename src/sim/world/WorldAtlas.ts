import { decodeWorldRaster, type WorldRaster } from './WorldBinary.ts';

export interface WorldMapEntry {
  id: string;
  title: string;
  file: string;
  seaLevelMeters: number;
  recommended: boolean;
}

export interface WorldAtlas {
  format: 'DWM2';
  resolution: string;
  regionDegrees: number;
  comarcasPerRegion: number;
  climate: string;
  maps: readonly WorldMapEntry[];
}

export interface LoadedWorldMap {
  entry: WorldMapEntry;
  raster: WorldRaster;
}

/**
 * Read the committed atlas at runtime. The game never downloads source data:
 * build-time preprocessing turns the public datasets into the tiny assets in
 * `public/world/`, and this loader only follows their local manifest.
 */
export async function loadWorldAtlas(
  baseUrl = 'world/',
  fetchAsset: typeof fetch = fetch,
): Promise<readonly LoadedWorldMap[]> {
  const manifestResponse = await fetchAsset(new URL('manifest.json', resolveBase(baseUrl)));
  if (!manifestResponse.ok) throw new Error(`Could not load world atlas (${manifestResponse.status})`);
  const manifest = parseManifest(await manifestResponse.json());
  const maps = await Promise.all(manifest.maps.map(async entry => {
    const response = await fetchAsset(new URL(entry.file, resolveBase(baseUrl)));
    if (!response.ok) throw new Error(`Could not load world map ${entry.id} (${response.status})`);
    const raster = decodeWorldRaster(new Uint8Array(await response.arrayBuffer()));
    if (`${raster.width}x${raster.height}` !== manifest.resolution || raster.seaLevelMeters !== entry.seaLevelMeters) {
      throw new Error(`World map ${entry.id} does not match its manifest`);
    }
    return { entry, raster };
  }));
  return maps;
}

function resolveBase(baseUrl: string): URL {
  const base = new URL(baseUrl, typeof location === 'undefined' ? 'http://localhost/' : location.href);
  return base.href.endsWith('/') ? base : new URL(`${base.href}/`);
}

function parseManifest(value: unknown): WorldAtlas {
  if (!value || typeof value !== 'object') throw new Error('Invalid world atlas manifest');
  const manifest = value as Partial<WorldAtlas>;
  if (manifest.format !== 'DWM2' || !/^\d+x\d+$/.test(manifest.resolution ?? '') ||
      !Number.isFinite(manifest.regionDegrees) || !Number.isInteger(manifest.comarcasPerRegion) ||
      !Array.isArray(manifest.maps) || manifest.maps.length === 0) {
    throw new Error('Unsupported or incomplete world atlas manifest');
  }
  const ids = new Set<string>();
  const files = new Set<string>();
  const maps = manifest.maps.map((value): WorldMapEntry => {
    if (!value || typeof value !== 'object') throw new Error('Invalid world map entry');
    const entry = value as Partial<WorldMapEntry>;
    if (typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id) ||
        typeof entry.title !== 'string' || typeof entry.file !== 'string' ||
        !/^[a-z0-9-]+\.bin$/.test(entry.file) ||
        !Number.isInteger(entry.seaLevelMeters) || typeof entry.recommended !== 'boolean' ||
        ids.has(entry.id) || files.has(entry.file)) {
      throw new Error('Invalid or duplicate world map entry');
    }
    ids.add(entry.id);
    files.add(entry.file);
    return entry as WorldMapEntry;
  });
  if (maps.filter(map => map.recommended).length !== 1) throw new Error('World atlas must recommend exactly one map');
  return { ...manifest, maps } as WorldAtlas;
}
