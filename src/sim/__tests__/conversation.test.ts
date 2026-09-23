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
import { BandRelations } from '../social/BandRelations.ts';
import { Person, SKILL_INDEX } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

function edge(familiarity: number, lastContact: number) {
  return { kinship: 0, deeds: 0, familiarity, romance: 0, lastContact, bias: 0, dread: 0 };
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

  // M11 phase 7c.
  it('warms faster across a boundary between allies and slower between rivals', () => {
    const neutral = crossBand(10, false);
    expect(crossBand(10, false, 80)).toBeGreaterThan(neutral);
    expect(crossBand(10, false, -80)).toBeLessThan(neutral);
    // Same band ignores standing entirely — there is no boundary to cross.
    expect(crossBand(10, true, -100)).toBe(10);
    // However hostile, warming to a stranger never quite reaches zero.
    expect(crossBand(10, false, -1000)).toBeGreaterThan(0);
  });
});

describe('what a conversation settles', () => {
  function pair() {
    const relationships = new RelationshipGraph();
    const social = new SocialSystem(relationships, new Map(), new BandRelations());
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

describe('a night under one roof', () => {
  function roomFor(count: number) {
    const relationships = new RelationshipGraph();
    const social = new SocialSystem(relationships, new Map(), new BandRelations());
    const sleepers = Array.from({ length: count }, (_, i) =>
      new Person('Sleeper' + i, 4, 4, 0, new RNG('hearth-' + i)));
    for (const person of sleepers) person.needs.company = 100;
    return { relationships, social, sleepers };
  }

  /** Everything one sleeper took from the night, across all their housemates. */
  function gained(relationships: RelationshipGraph, who: number): number {
    return relationships.knownBy(who)
      .reduce((total, entry) => total + entry.relationship.familiarity, 0);
  }

  it('warms two people who share a windbreak', () => {
    const { relationships, social, sleepers } = roomFor(2);
    social.hearth(sleepers, 100);
    expect(gained(relationships, sleepers[0]!.id)).toBeGreaterThan(0);
  });

  it('does nothing for somebody sleeping alone', () => {
    const { relationships, social, sleepers } = roomFor(1);
    social.hearth(sleepers, 100);
    expect(relationships.knownBy(sleepers[0]!.id)).toHaveLength(0);
  });

  it('answers no loneliness at all', () => {
    // Sleeping in company is not being in company. A band that could answer
    // its loneliness by going to bed would stop talking to each other.
    const { social, sleepers } = roomFor(4);
    social.hearth(sleepers, 100);
    expect(sleepers[0]!.needs.company).toBe(100);
  });

  it('is worth no more in a longhouse than in a hut', () => {
    const pair = roomFor(2);
    pair.social.hearth(pair.sleepers, 100);
    const alone = gained(pair.relationships, pair.sleepers[0]!.id);

    const hall = roomFor(13);
    hall.social.hearth(hall.sleepers, 100);
    const crowded = gained(hall.relationships, hall.sleepers[0]!.id);

    // Twelve housemates instead of one, and at most three nights' worth of
    // warmth out of the one night.
    expect(crowded).toBeGreaterThan(alone);
    expect(crowded).toBeLessThanOrEqual(alone * 3 + 1e-9);
  });
});

describe('learning from the best hand nearby', () => {
  function worker(skill: number): Person {
    const made = new Person('Hand', 4, 4, 0, new RNG('alongside-' + skill));
    made.skills.knap = skill;
    // Held level so that the only difference between the cases below is who is
    // standing next to them.
    made.traits.intelligence = 0.5;
    return made;
  }

  it('gains faster beside somebody better', () => {
    const alone = worker(10);
    const taught = worker(10);
    taught.alongside[SKILL_INDEX.knap] = 90;

    alone.practice('knap', 1);
    taught.practice('knap', 1);
    expect(taught.skills.knap).toBeGreaterThan(alone.skills.knap);
  });

  it('gains nothing extra beside an equal', () => {
    // The caution in `next-steps.md` §O3: scaled by the neighbour's level
    // alone, a crowd of novices would teach itself expertise.
    const alone = worker(40);
    const paired = worker(40);
    paired.alongside[SKILL_INDEX.knap] = 40;

    alone.practice('knap', 1);
    paired.practice('knap', 1);
    expect(paired.skills.knap).toBeCloseTo(alone.skills.knap);
  });

  it('is never a penalty beside somebody worse', () => {
    const alone = worker(60);
    const paired = worker(60);
    paired.alongside[SKILL_INDEX.knap] = 5;

    alone.practice('knap', 1);
    paired.practice('knap', 1);
    expect(paired.skills.knap).toBeCloseTo(alone.skills.knap);
  });
});
