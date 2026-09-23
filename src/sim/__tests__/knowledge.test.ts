/**
 * M11 phase 13b: what you can tell of how somebody else regards you.
 *
 * Their opinion of you is their private state, so it goes through
 * `Knowledge.ts` like their skills and their history do: nothing for a face,
 * words for an acquaintance, a number only for somebody close.
 */
import { describe, it, expect } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { regardFromThem } from '../social/Knowledge.ts';

function pair(): { me: Person; them: Person; graph: RelationshipGraph } {
  const me = new Person('Me', 4, 4, 0, new RNG('knowledge-me'));
  const them = new Person('Them', 5, 4, 1, new RNG('knowledge-them'));
  const graph = new RelationshipGraph();
  // They dislike me, whatever I know of it.
  graph.addDeed(them.id, me.id, -30, 0);
  return { me, them, graph };
}

describe("somebody else's regard for you", () => {
  it('cannot be read at all off a stranger', () => {
    const { me, them, graph } = pair();
    expect(regardFromThem(me, them, graph)).toEqual({ words: null, opinion: null });
  });

  it('cannot be read off a face you have only crossed paths with', () => {
    const { me, them, graph } = pair();
    graph.edge(me.id, them.id).familiarity = 5;
    expect(regardFromThem(me, them, graph).words).toBeNull();
  });

  it('reads in words, and only words, off an acquaintance', () => {
    const { me, them, graph } = pair();
    graph.edge(me.id, them.id).familiarity = 20;
    const regard = regardFromThem(me, them, graph);
    expect(regard.words).toBe('They seem to dislike you.');
    expect(regard.opinion).toBeNull();
  });

  it('reads as a number off somebody close', () => {
    const { me, them, graph } = pair();
    graph.edge(me.id, them.id).familiarity = 50;
    expect(regardFromThem(me, them, graph).opinion).toBe(graph.opinion(them.id, me.id));
  });

  it('never creates an acquaintance by being asked about', () => {
    const { me, them, graph } = pair();
    regardFromThem(me, them, graph);
    expect(graph.peek(me.id, them.id)).toBeNull();
  });
});
