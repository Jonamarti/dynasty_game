/**
 * Build compact real-Earth region grids from NOAA ETOPO 2022 and Beck et al.'s
 * present-day 0.5-degree Köppen-Geiger raster. Raw downloads stay out of git.
 *
 * Optional offline inputs:
 *   vite-node tools/worlddata/build.ts -- --elevation <csv> --beck-zip <zip>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodeWorldRaster, encodeWorldRaster } from '../../src/sim/world/WorldBinary.ts';
import { decodeBeckClimateTiff } from './beck.ts';
import { zipEntry } from './archive.ts';

const WIDTH = 96;
const HEIGHT = 48;
const ETOPO_URL = 'https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_60s.csv?z[(-88.125):225:(88.125)][(1.875):225:(358.125)]';
const BECK_ZIP_URL = 'https://ndownloader.figshare.com/files/12407516';
const BECK_MEMBER = 'Beck_KG_V1_present_0p5.tif';

export interface WorldDataBuildOptions {
  elevationPath?: string;
  beckZipPath?: string;
  outputDir?: string;
}

export async function buildWorldData(options: WorldDataBuildOptions = {}): Promise<void> {
  const outputDir = resolve(options.outputDir ?? 'public/world');
  const [elevationCsv, beckZip] = await Promise.all([
    options.elevationPath ? readFile(options.elevationPath, 'utf8') : fetchText(ETOPO_URL),
    options.beckZipPath ? readFile(options.beckZipPath) : fetchBytes(BECK_ZIP_URL),
  ]);

  const elevation = parseElevationCsv(elevationCsv);
  const climateRaster = decodeBeckClimateTiff(zipEntry(beckZip, BECK_MEMBER));
  const koppen = sampleClimate(climateRaster);
  const present = { width: WIDTH, height: HEIGHT, elevationMeters: elevation, koppen, seaLevelMeters: 0 };
  const glacial = { ...present, elevationMeters: elevation.slice(), koppen: koppen.slice(), seaLevelMeters: -60 };

  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'earth-present.bin'), encodeWorldRaster(present));
  await writeFile(resolve(outputDir, 'earth-12000-bce.bin'), encodeWorldRaster(glacial));
  const manifest = {
    format: 'DWM1',
    resolution: `${WIDTH}x${HEIGHT}`,
    regionDegrees: 3.75,
    comarcasPerRegion: 10,
    climate: 'Köppen-Geiger present-day 1980-2016, Beck et al. (2018), sampled at 0.5 degrees',
    maps: [
      { id: 'earth-12000-bce', title: 'Earth, about 12,000 years ago', file: 'earth-12000-bce.bin', seaLevelMeters: -60, recommended: true },
      { id: 'earth-present', title: 'Earth today', file: 'earth-present.bin', seaLevelMeters: 0, recommended: false },
    ],
  };
  await writeFile(resolve(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Decode our own output before reporting success; a corrupt generated asset
  // should not look like a successful map build.
  for (const filename of ['earth-present.bin', 'earth-12000-bce.bin']) {
    decodeWorldRaster(new Uint8Array(await readFile(resolve(outputDir, filename))));
  }
  process.stdout.write(`Built two ${WIDTH}x${HEIGHT} world maps in ${outputDir}\n`);
}

export function parseElevationCsv(csv: string): Int16Array {
  const grid = new Int16Array(WIDTH * HEIGHT);
  const seen = new Uint8Array(WIDTH * HEIGHT);
  for (const line of csv.trim().split(/\r?\n/).slice(2)) {
    const fields = line.split(',');
    if (fields.length < 3) continue;
    const latitude = Number(fields[0]);
    const longitude = Number(fields[1]);
    const meters = Number(fields[2]);
    if (![latitude, longitude, meters].every(Number.isFinite)) continue;
    const x = Math.round((longitude - 1.875) / 3.75);
    // The service response runs south to north; the game grid runs north to south.
    const y = Math.round((88.125 - latitude) / 3.75);
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
    const id = y * WIDTH + x;
    grid[id] = Math.max(-32768, Math.min(32767, Math.round(meters)));
    seen[id] = 1;
  }
  if (seen.some(value => value === 0)) {
    throw new Error(`NOAA elevation response filled ${seen.reduce((sum, n) => sum + n, 0)} of ${seen.length} regions`);
  }
  return grid;
}

export function sampleClimate(raster: ReturnType<typeof decodeBeckClimateTiff>): Uint8Array {
  const codes = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const longitude = 1.875 + x * 3.75;
      const latitude = 88.125 - y * 3.75;
      const px = Math.max(0, Math.min(raster.width - 1, Math.round((longitude - raster.originLongitude) / raster.pixelSize)));
      const py = Math.max(0, Math.min(raster.height - 1, Math.round((raster.originLatitude - latitude) / raster.pixelSize)));
      codes[y * WIDTH + x] = raster.codes[py * raster.width + px]!;
    }
  }
  return codes;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return response.text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
