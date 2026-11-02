import { describe, expect, it } from 'vitest';
import { rememberedHerdMatchesSpecies } from '../ai/Brain.ts';

describe('M16: remembered herds identify only their observed species', () => {
  it('accepts a matching species record', () => {
    expect(rememberedHerdMatchesSpecies('herd:deer', 'deer')).toBe(true);
    expect(rememberedHerdMatchesSpecies('herd:boar', 'boar')).toBe(true);
    expect(rememberedHerdMatchesSpecies('herd:hare', 'hare')).toBe(true);
  });

  it('cannot infer a different species from the same remembered location', () => {
    expect(rememberedHerdMatchesSpecies('herd:deer', 'boar')).toBe(false);
    expect(rememberedHerdMatchesSpecies('herd:hare', 'deer')).toBe(false);
    expect(rememberedHerdMatchesSpecies('water', 'deer')).toBe(false);
  });
});
