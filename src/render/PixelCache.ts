/** LRU with a pixel-byte budget: a large canvas must not cost one tiny entry. */
export class PixelCache<T> {
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(readonly maxBytes: number, readonly maxEntries: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) { this.misses++; return undefined; }
    this.hits++;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, bytes: number): void {
    const previous = this.entries.get(key);
    if (previous) { this.bytes -= previous.bytes; this.entries.delete(key); }
    // A single oversized image is drawn normally but never retained. Evicting
    // every useful small image to make room for one that cannot fit buys nothing.
    if (bytes > this.maxBytes) return;
    while (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest); this.evictions++;
    }
    this.entries.set(key, { value, bytes }); this.bytes += bytes;
  }

  get stats() {
    return { entries: this.entries.size, bytes: this.bytes, maxBytes: this.maxBytes,
      hits: this.hits, misses: this.misses, evictions: this.evictions };
  }
}
