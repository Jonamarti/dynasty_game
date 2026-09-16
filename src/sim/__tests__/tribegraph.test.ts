/**
 * The tribe graph's layout.
 *
 * The same two structural properties every graph here is held to — deterministic,
 * no overlap — plus the one thing specific to a sociogram: a peer-to-peer edge
 * between two people the subject knows, neither of whom is the subject, actually
 * appears. A layout that only ever drew spokes from the centre would pass every
 * other check here and still be the wrong picture.
 */
import { describe, it, expect } from 'vitest';
import { RelationshipGraph } from '../social/Relationships.ts';
import type { BandRank } from '../social/Rank.ts';
import { layOutTribe, tribeMembers, NODE_RADIUS } from '../../ui/TribeGraphLayout.ts';

describe('the tribe graph layout', () => {
  it('is byte-identical between two runs of the same graph', () => {
    const rel = new RelationshipGraph();
    rel.addDeed(1, 2, 40, 0);
    rel.addDeed(1, 3, -30, 0);
    rel.addDeed(2, 3, 20, 0);
    const first = layOutTribe(1, rel, 900, 600);
    const second = layOutTribe(1, rel, 900, 600);
    expect(JSON.stringify(second.nodes)).toBe(JSON.stringify(first.nodes));
  });

  it('places the subject and everyone they have an opinion of', () => {
    const rel = new RelationshipGraph();
    rel.addDeed(1, 2, 10, 0);
    rel.addDeed(1, 3, -10, 0);
    const layout = layOutTribe(1, rel, 900, 600);
    const ids = layout.nodes.map(n => n.personId).sort();
    expect(ids).toEqual([1, 2, 3]);
    expect(layout.nodes.find(n => n.personId === 1)!.isSubject).toBe(true);
  });

  it('draws a peer-to-peer edge between two people who are not the subject', () => {
    const rel = new RelationshipGraph();
    // The subject knows both 2 and 3; 2 and 3 also have an opinion of each
    // other, which is the edge that makes this a sociogram rather than a fan.
    rel.addDeed(1, 2, 30, 0);
    rel.addDeed(1, 3, 30, 0);
    rel.addDeed(2, 3, -50, 0);
    const layout = layOutTribe(1, rel, 900, 600);
    const peerEdge = layout.edges.find(e =>
      (e.from === 2 && e.to === 3) || (e.from === 3 && e.to === 2));
    expect(peerEdge).toBeDefined();
    expect(peerEdge!.opinion).toBeLessThan(0);
  });

  it('caps the graph rather than drawing an unbounded acquaintance list', () => {
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 60; id++) rel.addDeed(1, id, id, 0);
    const layout = layOutTribe(1, rel, 900, 600);
    // Subject plus the cap.
    expect(layout.nodes.length).toBeLessThanOrEqual(25);
  });

  it('never puts one person on top of another', () => {
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 15; id++) {
      rel.addDeed(1, id, (id % 2 === 0 ? 1 : -1) * (id * 3), 0);
    }
    const layout = layOutTribe(1, rel, 900, 600);
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]!;
        const b = layout.nodes[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_RADIUS);
      }
    }
  });

  it('handles a subject nobody has an opinion of', () => {
    const rel = new RelationshipGraph();
    const layout = layOutTribe(1, rel, 900, 600);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]!.isSubject).toBe(true);
  });
});

/**
 * M9.5 phase 4e — the pyramid.
 *
 * What is asserted here is the *claim the picture makes*: that a chief is
 * drawn above a head, a head above the band, and that nobody is drawn on a
 * rung at all until the band has a shape. Where exactly a person ends up
 * sideways is the relaxation's business and is covered by the flat tests
 * above, which this mode shares every line of.
 */
describe('the tribe graph in ranks', () => {
  /** The subject knows four people, and the four know each other. */
  function circle(): RelationshipGraph {
    const rel = new RelationshipGraph();
    rel.addDeed(1, 2, 40, 0);
    rel.addDeed(1, 3, 20, 0);
    rel.addDeed(1, 4, -25, 0);
    rel.addDeed(1, 5, 5, 0);
    rel.addDeed(2, 3, 30, 0);
    rel.addDeed(3, 4, -40, 0);
    return rel;
  }

  const ranks = new Map<number, BandRank>([
    [1, 'member'], [2, 'chief'], [3, 'head'], [4, 'child'], [5, 'outcast'],
  ]);

  it('draws the flat sociogram when the band has no shape', () => {
    const layout = layOutTribe(1, circle(), 900, 600);
    expect(layout.ranked).toBe(false);
    expect(layout.nodes.every(node => node.rank === null)).toBe(true);
  });

  it('is byte-identical between two runs of the same ranked graph', () => {
    const rel = circle();
    const first = layOutTribe(1, rel, 900, 600, ranks);
    const second = layOutTribe(1, rel, 900, 600, ranks);
    expect(JSON.stringify(second.nodes)).toBe(JSON.stringify(first.nodes));
  });

  it('puts the chief above the head, the head above the band, and the cast out below all', () => {
    const layout = layOutTribe(1, circle(), 900, 600, ranks);
    expect(layout.ranked).toBe(true);
    const yOf = (id: number) => layout.nodes.find(node => node.personId === id)!.y;
    expect(yOf(2)).toBeLessThan(yOf(3));
    expect(yOf(3)).toBeLessThan(yOf(1));
    expect(yOf(1)).toBeLessThan(yOf(4));
    expect(yOf(4)).toBeLessThan(yOf(5));
  });

  it('keeps everyone of one rank on one row', () => {
    const rel = circle();
    const flat = new Map<number, BandRank>([
      [1, 'chief'], [2, 'member'], [3, 'member'], [4, 'member'], [5, 'member'],
    ]);
    const layout = layOutTribe(1, rel, 900, 600, flat);
    const members = layout.nodes.filter(node => node.rank === 'member');
    expect(members).toHaveLength(4);
    for (const node of members) expect(node.y).toBeCloseTo(members[0]!.y, 6);
    expect(layout.nodes.find(node => node.rank === 'chief')!.y)
      .toBeLessThan(members[0]!.y);
  });

  it('closes up the rungs nobody stands on', () => {
    // Chief, band, cast out: three rungs that are 0, 2 and 5 apart in the
    // ladder, and three rows evenly spaced on screen. Measured as a ratio of
    // gaps rather than as absolute positions, because `fitInto` scales any
    // arrangement to fill the box and would hide an absolute difference. On a
    // build that used `RANK_ROW` as the row index directly the lower gap is
    // half again the upper one and this fails.
    const layout = layOutTribe(1, circle(), 900, 600, new Map<number, BandRank>([
      [1, 'member'], [2, 'chief'], [3, 'member'], [4, 'outcast'], [5, 'outcast'],
    ]));
    const rows = [...new Set(layout.nodes.map(node => node.y))].sort((a, b) => a - b);
    expect(rows).toHaveLength(3);
    expect(rows[1]! - rows[0]!).toBeCloseTo(rows[2]! - rows[1]!, 6);
  });

  it('stands the best regarded of a row nearest the subject, the worst at the end', () => {
    // What a row is *for*. A pinned row is a one-dimensional problem and
    // repulsion between neighbours is a wall — nobody can relax past anybody —
    // so the order has to be right in the seed or it is never right at all.
    // This fails on a build that seeds a row in id order and leaves the
    // springs to sort it out, which is what the first draft of 4e did.
    // Ids run *against* the warmth on purpose: the best regarded of the four
    // is the last of them by id, so a row that came out in id order would put
    // the subject's enemy beside them and fail.
    const rel = new RelationshipGraph();
    rel.addDeed(1, 2, -80, 0);
    rel.addDeed(1, 3, -20, 0);
    rel.addDeed(1, 4, 10, 0);
    rel.addDeed(1, 5, 80, 0);
    const layout = layOutTribe(1, rel, 900, 600, new Map<number, BandRank>([
      [1, 'chief'], [2, 'member'], [3, 'member'], [4, 'member'], [5, 'member'],
    ]));
    const xOf = (id: number) => layout.nodes.find(node => node.personId === id)!.x;
    expect(Math.abs(xOf(5) - xOf(1))).toBeLessThan(Math.abs(xOf(4) - xOf(1)));
    expect(Math.abs(xOf(4) - xOf(1))).toBeLessThan(Math.abs(xOf(2) - xOf(1)));
  });

  it('never puts one person on top of another, in ranks either', () => {
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 15; id++) {
      rel.addDeed(1, id, (id % 2 === 0 ? 1 : -1) * (id * 3), 0);
    }
    const crowd = new Map<number, BandRank>();
    crowd.set(1, 'chief');
    for (let id = 2; id <= 15; id++) crowd.set(id, id < 10 ? 'member' : 'child');
    const layout = layOutTribe(1, rel, 900, 600, crowd);
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]!;
        const b = layout.nodes[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_RADIUS);
      }
    }
  });

  it('names the people it is about to draw, subject first and capped alike', () => {
    // The panel asks the simulation for ranks *before* the layout runs, so
    // this list and the drawn nodes have to be the same set: a rank worked out
    // for somebody who is not drawn is harmless, but somebody drawn without
    // one would silently fall to the bottom row.
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 60; id++) rel.addDeed(1, id, id, 0);
    const members = tribeMembers(1, rel);
    const layout = layOutTribe(1, rel, 900, 600);
    expect(members[0]).toBe(1);
    expect(members.slice().sort((a, b) => a - b))
      .toEqual(layout.nodes.map(node => node.personId).sort((a, b) => a - b));
  });
});
