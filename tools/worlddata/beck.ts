/** Minimal reader for Beck et al.'s tiled 8-bit GeoTIFF, compression PackBits. */
export interface ClimateRaster {
  width: number;
  height: number;
  codes: Uint8Array;
  /** GeoTIFF origin at the upper-left pixel centre/anchor, degrees. */
  originLongitude: number;
  originLatitude: number;
  pixelSize: number;
}

export function decodeBeckClimateTiff(bytes: Uint8Array): ClimateRaster {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0x4949 || view.getUint16(2, true) !== 42) {
    throw new Error('Expected a little-endian classic TIFF');
  }
  const ifd = view.getUint32(4, true);
  const count = view.getUint16(ifd, true);
  const tags = new Map<number, { type: number; count: number; entry: number; raw: number }>();
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + 12 * i;
    tags.set(view.getUint16(entry, true), {
      type: view.getUint16(entry + 2, true),
      count: view.getUint32(entry + 4, true),
      entry,
      raw: view.getUint32(entry + 8, true),
    });
  }
  const values = (tag: number): number[] => {
    const item = tags.get(tag);
    if (!item) throw new Error(`Beck GeoTIFF is missing tag ${tag}`);
    const bytesPerValue = item.type === 3 ? 2 : item.type === 4 ? 4 : 0;
    if (!bytesPerValue) throw new Error(`Unsupported TIFF field type ${item.type} in tag ${tag}`);
    const start = item.count * bytesPerValue <= 4 ? item.entry + 8 : item.raw;
    return Array.from({ length: item.count }, (_, i) => bytesPerValue === 2
      ? view.getUint16(start + 2 * i, true)
      : view.getUint32(start + 4 * i, true));
  };
  const scalar = (tag: number) => values(tag)[0]!;
  const width = scalar(256);
  const height = scalar(257);
  const bits = scalar(258);
  const compression = scalar(259);
  const samples = scalar(277);
  const tileWidth = scalar(322);
  const tileHeight = scalar(323);
  if (bits !== 8 || samples !== 1 || compression !== 32773) {
    throw new Error('Beck climate TIFF changed from the expected 8-bit PackBits layout');
  }
  const offsets = values(324);
  const lengths = values(325);
  const across = Math.ceil(width / tileWidth);
  const down = Math.ceil(height / tileHeight);
  if (offsets.length !== across * down || lengths.length !== offsets.length) {
    throw new Error('Beck GeoTIFF tile index does not match raster dimensions');
  }
  const codes = new Uint8Array(width * height);
  for (let ty = 0; ty < down; ty++) {
    for (let tx = 0; tx < across; tx++) {
      const tile = ty * across + tx;
      const raw = decodePackBits(bytes.subarray(offsets[tile]!, offsets[tile]! + lengths[tile]!), tileWidth * tileHeight);
      for (let row = 0; row < tileHeight && ty * tileHeight + row < height; row++) {
        const sourceStart = row * tileWidth;
        const targetStart = (ty * tileHeight + row) * width + tx * tileWidth;
        const copy = Math.min(tileWidth, width - tx * tileWidth);
        codes.set(raw.subarray(sourceStart, sourceStart + copy), targetStart);
      }
    }
  }
  const scaleEntry = tags.get(33550);
  const tieEntry = tags.get(33922);
  if (!scaleEntry || !tieEntry || scaleEntry.type !== 12 || tieEntry.type !== 12) {
    throw new Error('Beck GeoTIFF is missing geographic coordinates');
  }
  const scale = view.getFloat64(scaleEntry.raw, true);
  const originLongitude = view.getFloat64(tieEntry.raw + 24, true);
  const originLatitude = view.getFloat64(tieEntry.raw + 32, true);
  return { width, height, codes, originLongitude, originLatitude, pixelSize: scale };
}

export function decodePackBits(input: Uint8Array, expectedLength: number): Uint8Array {
  const output = new Uint8Array(expectedLength);
  let source = 0;
  let target = 0;
  while (source < input.length && target < expectedLength) {
    const control = input[source]! > 127 ? input[source]! - 256 : input[source]!;
    source++;
    if (control >= 0) {
      const length = control + 1;
      if (source + length > input.length || target + length > expectedLength) throw new Error('Invalid PackBits literal run');
      output.set(input.subarray(source, source + length), target);
      source += length;
      target += length;
    } else if (control !== -128) {
      const length = 1 - control;
      if (source >= input.length || target + length > expectedLength) throw new Error('Invalid PackBits repeat run');
      output.fill(input[source]!, target, target + length);
      source++;
      target += length;
    }
  }
  if (target !== expectedLength) throw new Error(`PackBits decoded ${target} of ${expectedLength} bytes`);
  return output;
}
