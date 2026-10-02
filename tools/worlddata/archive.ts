import { inflateRawSync } from 'node:zlib';

/** Extract one named ZIP member without expanding the source archive to disk. */
export function zipEntry(zip: Uint8Array, wantedName: string): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  const floor = Math.max(0, zip.length - 22 - 0xffff);
  for (let p = zip.length - 22; p >= floor; p--) {
    if (view.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-directory record was not found');
  const entries = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  let cursor = directoryOffset;
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const method = view.getUint16(cursor + 10, true);
    const compressedLength = view.getUint32(cursor + 20, true);
    const plainLength = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(zip.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === wantedName) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Invalid ZIP member: ${name}`);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataOffset, dataOffset + compressedLength);
      const plain = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (!plain) throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
      if (plain.byteLength !== plainLength) throw new Error(`ZIP member size mismatch for ${name}`);
      return new Uint8Array(plain.buffer, plain.byteOffset, plain.byteLength);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP member not found: ${wantedName}`);
}
