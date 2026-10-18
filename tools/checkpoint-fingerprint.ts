/** Stable JSON with recursively sorted object keys; arrays keep their order. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',') + '}';
}

/** 32-bit FNV-1a over UTF-8 bytes, so the result is stable across JS runtimes. */
export function checkpointFingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(stableJson(value))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
