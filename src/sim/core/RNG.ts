/**
 * Deterministic pseudo-random number generator.
 *
 * The whole simulation draws from one of these. Nothing anywhere may call
 * `Math.random()` — determinism is the property that makes every bug in a
 * 200-year run reproducible from a seed and a step count, and it is very hard to
 * retrofit once a stray `Math.random()` has been sprinkled through the systems.
 *
 * Algorithm is xorshift128, chosen because its state is four 32-bit integers:
 * that serializes exactly into a save file, unlike a float-based generator.
 */
export class RNG {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number | string = 1) {
    const n = typeof seed === 'string' ? hashString(seed) : Math.floor(seed) || 1;
    // splitmix32 the scalar seed out into four words so that adjacent seeds
    // (1, 2, 3…) produce completely unrelated streams.
    let x = n >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next() || 1;
  }

  /** Raw 32-bit unsigned draw. */
  nextUint32(): number {
    let t = this.s3;
    const s = this.s0;
    this.s3 = this.s2;
    this.s2 = this.s1;
    this.s1 = s;
    t ^= t << 11;
    t ^= t >>> 8;
    this.s0 = (t ^ s ^ (s >>> 19)) >>> 0;
    return this.s0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** A uniformly chosen element. Throws on an empty array rather than returning undefined. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('RNG.pick called on an empty array');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Approximately normal, via the sum of three uniforms. Cheap and good enough for traits. */
  gaussian(mean = 0, stdDev = 1): number {
    const u = this.next() + this.next() + this.next() - 1.5;
    return mean + u * 1.4142135623730951 * stdDev;
  }

  /** In-place Fisher-Yates. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }

  /**
   * A child generator derived from this one. Used to give each subsystem its own
   * stream, so that adding a draw in (say) world generation does not shift every
   * later draw in the AI and change an unrelated test's outcome.
   */
  fork(): RNG {
    return new RNG(this.nextUint32());
  }

  /** Serializable state, for saves and for the determinism test. */
  getState(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  setState(state: readonly [number, number, number, number]): void {
    this.s0 = state[0];
    this.s1 = state[1];
    this.s2 = state[2];
    this.s3 = state[3];
  }
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0 || 1;
}
