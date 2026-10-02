/** Compact, versioned asset format for pregenerated geographic grids. */
export interface WorldRaster {
  width: number;
  height: number;
  /** ETOPO elevation at every region centre, in metres above present sea level. */
  elevationMeters: Int16Array;
  /** Beck et al. Köppen-Geiger class id (0 means no classified climate). */
  koppen: Uint8Array;
  /** Sea level relative to the elevation datum; negative values expose land. */
  seaLevelMeters: number;
}

const MAGIC = [0x44, 0x57, 0x4d, 0x31]; // DWM1
const HEADER_BYTES = 12;
const CELL_BYTES = 3;

export function encodeWorldRaster(raster: WorldRaster): Uint8Array {
  const count = raster.width * raster.height;
  if (!Number.isInteger(raster.width) || !Number.isInteger(raster.height) ||
      raster.width < 2 || raster.width > 255 || raster.height < 2 || raster.height > 255 ||
      raster.elevationMeters.length !== count || raster.koppen.length !== count ||
      !Number.isInteger(raster.seaLevelMeters) || raster.seaLevelMeters < -32768 || raster.seaLevelMeters > 32767) {
    throw new RangeError('Invalid world raster dimensions or arrays');
  }
  const bytes = new Uint8Array(HEADER_BYTES + count * CELL_BYTES);
  bytes.set(MAGIC, 0);
  const view = new DataView(bytes.buffer);
  view.setUint8(4, 1);
  view.setUint8(5, raster.width);
  view.setUint8(6, raster.height);
  view.setInt16(8, raster.seaLevelMeters, true);
  for (let i = 0; i < count; i++) {
    const offset = HEADER_BYTES + i * CELL_BYTES;
    view.setInt16(offset, raster.elevationMeters[i]!, true);
    view.setUint8(offset + 2, raster.koppen[i]!);
  }
  return bytes;
}

export function decodeWorldRaster(bytes: Uint8Array): WorldRaster {
  if (bytes.length < HEADER_BYTES || MAGIC.some((byte, i) => bytes[i] !== byte)) {
    throw new Error('Not a Dynasty world raster');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(4);
  const width = view.getUint8(5);
  const height = view.getUint8(6);
  const count = width * height;
  if (version !== 1 || width < 2 || height < 2 || bytes.length !== HEADER_BYTES + count * CELL_BYTES) {
    throw new Error('Unsupported or truncated Dynasty world raster');
  }
  const elevationMeters = new Int16Array(count);
  const koppen = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const offset = HEADER_BYTES + i * CELL_BYTES;
    elevationMeters[i] = view.getInt16(offset, true);
    koppen[i] = view.getUint8(offset + 2);
  }
  return { width, height, elevationMeters, koppen, seaLevelMeters: view.getInt16(8, true) };
}
