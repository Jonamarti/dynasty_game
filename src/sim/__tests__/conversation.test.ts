/**
 * What kind of conversation two people have, and what it is worth.
 *
 * The rung is chosen from state that already existed — `familiarity` and
 * `lastContact` — so these tests are the only place that says out loud which
 * relationship produces which conversation. A statistical check over a whole
 * run cannot answer that: it can say people talked, not that the stranger got
 * a greeting and the brother got an evening.
 */
import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_MODES, MODE_LADDER, chooseMode, crossBand, meetingOfMinds, modeAllowed,
} from '../social/Conversation.ts';
import { SocialSystem } from '../social/SocialSystem.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

function edge(familiarity: number, lastContact: number) {
  return { kinship: 0, deeds: 0, familiarity, romance: 0, lastContact, bias: 0 };
}

describe('choosing a conversation', () => {
  it('greets a stranger', () => {
    expect(chooseMode(null, 5000)).toBe('greet');
    expect(chooseMode(edge(0, 5000), 5000)).toBe('greet');
  });

  it('climbs the ladder as familiarity grows', () => {
    expect(chooseMode(edge(11, 1000), 1000)).toBe('greet');
    expect(chooseMode(edge(12, 1000), 1000)).toBe('chat');
    expect(chooseMode(edge(24, 1000), 1000)).toBe('interests');
    expect(chooseMode(edge(35, 1000), 1000)).toBe('deep');
    expect(chooseMode(edge(99, 1000), 1000)).toBe('deep');
  });

  it('has more to say after a long silence', () => {
    // Same familiarity, five days apart: an acquaintance not seen in a week is
    // caught up with rather than nodded at.
    expect(chooseMode(edge(12, 1000), 1100)).toBe('chat');
    expect(chooseMode(edge(12, 1000), 3000)).toBe('interests');
  });

  it('still greets a stranger however long the world has run', () => {
    // The guard that matters: an edge that does not exist has `lastContact` 0,
    // so without it every first meeting late in a run would open with a
    // heart-to-heart.
    expect(chooseMode(null, 100000)).toBe('greet');
    expect(chooseMode(edge(3, 0), 100000)).toBe('greet');
  });

  it('prices the ladder in the order it climbs', () => {
    for (let i = 1; i < MODE_LADDER.length; i++) {
      const cheaper = CONVERSATION_MODES[MODE_LADDER[i - 1]!]!;
      const dearer = CONVERSATION_MODES[MODE_LADDER[i]!]!;
      expect(dearer.ticks).toBeGreaterThan(cheaper.ticks);
      expect(dearer.cooldown).toBeGreaterThan(cheaper.cooldown);
      expect(dearer.warmth).toBeGreaterThan(cheaper.warmth);
      expect(dearer.relief).toBeGreaterThanOrEqual(cheaper.relief);
      expect(dearer.from).toBeGreaterThan(cheaper.from);
    }
  });

  it('warms more slowly across a band boundary', () => {
    expect(crossBand(10, false)).toBeLessThan(crossBand(10, true));
    expect(crossBand(10, true)).toBe(10);
  });
});

describe('what a conversation settles', () => {
  function pair() {
    const relationships = new RelationshipGraph();
    const social = new SocialSystem(relationships, new Map());
    const a = new Person('Ana', 4, 4, 0, new RNG('conv-a'));
    const b = new Person('Bo', 5, 4, 0, new RNG('conv-b'));
    a.needs.company = 100;
    b.needs.company = 100;
    return { relationships, social, a, b };
  }

  it('answers only part of the loneliness on the cheap rungs', () => {
    const { social, a, b } = pair();
    social.converse(a, b, 100, new Map(), 'greet');
    expect(a.needs.company).toBeCloseTo(75);
    expect(b.needs.company).toBeCloseTo(75);
  });

  it('answers all of it on the longest one', () => {
    const { social, a, b } = pair();
    social.converse(a, b, 100, new Map(), 'deep');
    expect(a.needs.company).toBe(0);
  });

  it('grows familiarity both ways, by the rung', () => {
    const { relationships, social, a, b } = pair();
    social.converse(a, b, 100, new Map(), 'chat');
    const there = relationships.peek(a.id, b.id)!;
    const back = relationships.peek(b.id, a.id)!;
    expect(there.familiarity).toBeCloseTo(CONVERSATION_MODES.chat.warmth);
    expect(back.familiarity).toBeCloseTo(CONVERSATION_MODES.chat.warmth);
  });
});

describe('which conversations may be asked for', () => {
  it('allows the rung the relationship warrants and every cheaper one', () => {
    const acquaintance = edge(12, 1000);
    expect(modeAllowed(acquaintance, 1000, 'greet')).toBe(true);
    expect(modeAllowed(acquaintance, 1000, 'chat')).toBe(true);
    expect(modeAllowed(acquaintance, 1000, 'interests')).toBe(false);
    expect(modeAllowed(acquaintance, 1000, 'deep')).toBe(false);
  });

  it('always lets somebody nod at a stranger', () => {
    expect(modeAllowed(null, 9000, 'greet')).toBe(true);
    expect(modeAllowed(null, 9000, 'deep')).toBe(false);
  });

  it('lets a close friend have any of them', () => {
    const close = edge(60, 1000);
    for (const mode of MODE_LADDER) expect(modeAllowed(close, 1000, mode)).toBe(true);
  });
});

describe('what a shared problem is worth as company', () => {
  function thinker(intelligence: number): Person {
    const made = new Person('Thinker', 4, 4, 0, new RNG('minds-' + intelligence));
    made.traits.intelligence = intelligence;
    return made;
  }

  it('is worth more to somebody who finds the problem interesting', () => {
    expect(meetingOfMinds(thinker(1), 0.5))
      .toBeGreaterThan(meetingOfMinds(thinker(0), 0.5));
  });

  it('is never the whole of it, however clever they are', () => {
    // A lesson is not an evening by the fire. If it were, nobody would ever
    // choose `talk` again.
    expect(meetingOfMinds(thinker(1), 1)).toBeLessThan(1);
  });
});
