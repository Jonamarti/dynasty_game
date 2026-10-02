import { expect, it } from 'vitest';
import { PixelCache } from '../PixelCache.ts';

it('evicts by pixels and preserves the recently used entry', () => {
  const cache = new PixelCache<string>(100, 10);
  cache.set('a', 'a', 30); cache.set('b', 'b', 40);
  expect(cache.get('a')).toBe('a');
  cache.set('c', 'c', 40);
  expect(cache.get('b')).toBeUndefined();
  expect(cache.get('a')).toBe('a');
  expect(cache.stats.bytes).toBe(70);
  expect(cache.stats.evictions).toBe(1);
});

it('accounts replacements and never keeps an oversized image', () => {
  const cache = new PixelCache<string>(100, 10);
  cache.set('a', 'old', 90); cache.set('a', 'new', 10);
  cache.set('huge', 'huge', 101);
  expect(cache.get('a')).toBe('new');
  expect(cache.get('huge')).toBeUndefined();
  expect(cache.stats.bytes).toBe(10);
  cache.set('a', 'too big', 200);
  expect(cache.stats.bytes).toBe(0);
});

it('also limits entry overhead when thousands of tiny images fit the pixel budget', () => {
  const cache = new PixelCache<number>(10000, 3);
  for (let i = 0; i < 5; i++) cache.set(String(i), i, 1);
  expect(cache.stats.entries).toBe(3);
  expect(cache.stats.bytes).toBe(3);
  expect(cache.get('0')).toBeUndefined();
  expect(cache.get('4')).toBe(4);
});
