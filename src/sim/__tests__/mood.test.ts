/**
 * Mood — M9.6 phase 4a / M11 phase 5a's bundled migration.
 *
 * Nothing outside `core/Mood.ts` and the inspector reads a channel yet, so the
 * only thing worth holding to brute force is the machinery itself: a new
 * person starts at rest rather than jarred against their own temperament,
 * `decayMood` actually closes the gap to that resting point by the stated
 * fraction and no more, and `Mood.add` clamps and keeps only the last few
 * reasons rather than growing without bound.
 */
import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Person, TRAITS, type Trait } from '../entities/Person.ts';
import { MOOD_CHANNELS, Mood, moodBaseline, decayMood } from '../core/Mood.ts';

function traitsAt(value: number): Record<Trait, number> {
  const traits = {} as Record<Trait, number>;
  for (const trait of TRAITS) traits[trait] = value;
  return traits;
}

describe('a new person starts at rest', () => {
  it('sets every channel to its own baseline, not zero', () => {
    const person = new Person('Ann', 0, 0, 0, new RNG('mood-founding'));
    for (const channel of MOOD_CHANNELS) {
      expect(person.mood[channel]).toBeCloseTo(moodBaseline(person.traits, channel), 9);
    }
  });
});

describe('moodBaseline', () => {
  it('reads comfort from tradition, belonging from loyalty, purpose from industriousness', () => {
    const traditional = traitsAt(1);
    const untraditional = traitsAt(0);
    expect(moodBaseline(traditional, 'comfort')).toBeGreaterThan(moodBaseline(untraditional, 'comfort'));

    const loyal = traitsAt(1);
    const disloyal = traitsAt(0);
    expect(moodBaseline(loyal, 'belonging')).toBeGreaterThan(moodBaseline(disloyal, 'belonging'));

    const industrious = traitsAt(1);
    const idle = traitsAt(0);
    expect(moodBaseline(industrious, 'purpose')).toBeGreaterThan(moodBaseline(idle, 'purpose'));
  });

  it('reads security from aggression inverted: a quick temper settles lower', () => {
    const calm = traitsAt(0);
    const hotheaded = traitsAt(1);
    expect(moodBaseline(hotheaded, 'security')).toBeLessThan(moodBaseline(calm, 'security'));
  });

  it('stays within the declared band around neutral', () => {
    for (const value of [0, 0.5, 1]) {
      const traits = traitsAt(value);
      for (const channel of MOOD_CHANNELS) {
        expect(Math.abs(moodBaseline(traits, channel))).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('decayMood', () => {
  it('closes exactly 8% of the gap to baseline in one call, no more', () => {
    const person = new Person('Bo', 0, 0, 0, new RNG('mood-decay'));
    const baseline = moodBaseline(person.traits, 'comfort');
    person.mood.comfort = baseline + 40;

    decayMood(person);

    expect(person.mood.comfort).toBeCloseTo(baseline + 40 * 0.92, 9);
  });

  it('converges toward baseline and stays there, never overshooting', () => {
    const person = new Person('Cai', 0, 0, 0, new RNG('mood-converge'));
    const baseline = moodBaseline(person.traits, 'purpose');
    person.mood.purpose = baseline - 60;

    for (let i = 0; i < 200; i++) decayMood(person);

    expect(person.mood.purpose).toBeCloseTo(baseline, 4);
  });
});

describe('Mood.add', () => {
  it('clamps to [-100, 100]', () => {
    const mood = new Mood();
    mood.add('security', 500, 'overjoyed', 10);
    expect(mood.security).toBe(100);
    mood.add('security', -1000, 'catastrophe', 11);
    expect(mood.security).toBe(-100);
  });

  it('keeps only the last few reasons', () => {
    const mood = new Mood();
    for (let i = 0; i < 10; i++) mood.add('purpose', 1, 'reason ' + i, i);
    expect(mood.recent.length).toBeLessThanOrEqual(4);
    expect(mood.recent.at(-1)!.reason).toBe('reason 9');
  });
});
