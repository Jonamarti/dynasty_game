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
import {
  knowledgeOfPerson, regardFromThem, regardReasons, rememberedAbout, type RegardContext,
} from '../social/Knowledge.ts';
import { DEED_WEIGHT, describeEvent, type EventType, type SocialEvent } from '../social/Events.ts';

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

describe('your own life', () => {
  // M11 phase 13f. `emit` stores its sentence with real names; the *Life*
  // tab must not hand you the name of somebody you robbed and never met.
  it('names a stranger you wronged as a stranger', () => {
    const { me, them, graph } = pair();
    me.chronicle.push({
      tick: 1, ageDays: 1, kind: 'did',
      text: describeEvent('theft', me.name, them.name),
      deed: { type: 'theft', actorId: me.id, targetId: them.id },
    });
    const people = new Map([[me.id, me], [them.id, them]]);
    const nameOf = (id: number) => knowledgeOfPerson(me, people.get(id)!, graph).displayName;

    const [line] = rememberedAbout(me, me, nameOf);
    expect(line!.text).not.toContain('Them');
    expect(line!.text).toContain('Me');
    // The stored sentence is left alone.
    expect(me.chronicle[0]!.text).toContain('Them');

    graph.edge(me.id, them.id).familiarity = 20;
    expect(rememberedAbout(me, me, nameOf)[0]!.text).toContain('Them');
  });
});

/**
 * M12 phase 3c (owner's note 7): *why* somebody feels as they do. Your own
 * reasons are yours to read; theirs about you name only what you could know
 * without being told — above all, what you did to them.
 */
describe('the reasons behind an opinion', () => {
  let nextId = 1000;
  function deed(type: EventType, actor: Person, target: Person | null, tick = 0): SocialEvent {
    return {
      id: nextId++, type, actorId: actor.id, targetId: target?.id ?? null,
      x: 0, y: 0, tick, magnitude: 1, witnesses: 1, victimBandId: target?.bandId ?? null,
    };
  }
  function context(graph: RelationshipGraph, people: Person[]): RegardContext {
    return {
      relationships: graph,
      nameOf: id => people.find(p => p.id === id)?.name ?? 'someone',
      // Stands in for `SocialSystem.deedDelta`: the sign and rough size are
      // what the ranking reads.
      weigh: (holder, _actor, entry) =>
        DEED_WEIGHT[entry.type] * (entry.targetId === holder.id ? 3 : 1),
      tick: 0,
      ticksPerDay: 240,
    };
  }

  it('names what you did to them', () => {
    const { me, them, graph } = pair();
    them.memory.record(deed('theft', me, them), true, 1);
    const reasons = regardReasons(me, them, me, context(graph, [me, them]));
    expect(reasons[0]).toEqual({ text: describeEvent('theft', 'Me', 'Them'), tone: 'neg' });
  });

  it('does not say which of your deeds against others reached them', () => {
    const { me, them, graph } = pair();
    const bystander = new Person('Velon', 6, 4, 1, new RNG('knowledge-velon'));
    them.memory.record(deed('assault', me, bystander), true, 1);
    const reasons = regardReasons(me, them, me, context(graph, [me, them, bystander]));
    expect(reasons.some(r => r.text.includes('Velon'))).toBe(false);
    expect(reasons).toContainEqual({ text: 'things they have seen or heard of you', tone: 'neg' });
  });

  it('names everything in your own view of them', () => {
    const { me, them, graph } = pair();
    const bystander = new Person('Velon', 6, 4, 0, new RNG('knowledge-velon'));
    graph.addDeed(me.id, them.id, -20, 0);
    me.memory.record(deed('assault', them, bystander), true, 1);
    const reasons = regardReasons(me, me, them, context(graph, [me, them, bystander]));
    expect(reasons[0]!.text).toBe(describeEvent('assault', 'Them', 'Velon'));
  });

  it('puts the strongest first and stops at four', () => {
    const { me, them, graph } = pair();
    const edge = graph.edge(them.id, me.id);
    edge.bias = -6;
    edge.familiarity = 30;
    edge.kinship = 40;
    them.memory.record(deed('gift', me, them), true, 1);
    them.memory.record(deed('murder', me, them), true, 1);
    const reasons = regardReasons(me, them, me, context(graph, [me, them]));
    expect(reasons).toHaveLength(4);
    expect(reasons[0]!.text).toBe(describeEvent('murder', 'Me', 'Them'));
    expect(reasons.map(r => r.text)).not.toContain('from another people');
  });
});
