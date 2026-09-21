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
  // --- M9.6 phase 2: the graph must hold still -----------------------------
  //
  // The owner's note was that the tribe graph changes shape very fast. It is
  // not random and never was: the seed order is the opinion order, the spring
  // rest lengths are continuous in opinion, and opinions move every tick — so
  // a layout re-derived from scratch every frame lands somewhere slightly
  // different every frame. These two are the guard on the fix, and both were
  // checked against the build without it: the first reported moves of well
  // over a hundred pixels, the second a swapped row order.

  it('eases rather than jumps when an opinion drifts', () => {
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 12; id++) rel.addDeed(1, id, id * 4 - 20, 0);
    const first = layOutTribe(1, rel, 900, 600);

    // A day of ordinary drift: everybody's regard moves a little, which is
    // enough to reorder `knownBy` around the middle of the list.
    for (let id = 2; id <= 12; id++) rel.addDeed(1, id, id % 3 === 0 ? 3 : -2, 60);

    const fresh = layOutTribe(1, rel, 900, 600);
    const eased = layOutTribe(1, rel, 900, 600, null, first.settled);
    const moved = (layout: typeof fresh) => Math.max(...layout.nodes.map(node => {
      const before = first.nodes.find(n => n.personId === node.personId)!;
      return Math.hypot(node.x - before.x, node.y - before.y);
    }));
    expect(moved(eased)).toBeLessThan(moved(fresh));
    expect(moved(eased)).toBeLessThan(40);
  });

  it('keeps a row in the order it was already in', () => {
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 9; id++) rel.addDeed(1, id, id * 5, 0);
    const ranks = new Map<number, BandRank>([[1, 'chief']]);
    for (let id = 2; id <= 9; id++) ranks.set(id, 'member');
    const first = layOutTribe(1, rel, 900, 600, ranks);
    const orderOf = (layout: typeof first) => layout.nodes
      .filter(node => !node.isSubject)
      .sort((a, b) => a.x - b.x)
      .map(node => node.personId);

    // Two neighbours in the row trade places on the opinion scale by a couple
    // of points. Seeded afresh they would swap ends of the row; carried over,
    // the springs may move them but may not reorder them.
    rel.addDeed(1, 5, 12, 60);
    rel.addDeed(1, 6, -12, 60);
    const eased = layOutTribe(1, rel, 900, 600, ranks, first.settled);
    expect(orderOf(eased)).toEqual(orderOf(first));
  });

  it('keeps somebody already drawn when they slip just past the cap', () => {
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 40; id++) rel.addDeed(1, id, 100 - id, 0);
    const first = layOutTribe(1, rel, 900, 600);
    const drawn = first.nodes.map(node => node.personId);
    expect(drawn).toContain(25);

    // 25 slips below the cap by a hair. Without the slack they would vanish
    // from the picture and reappear the next time somebody walked past them.
    rel.addDeed(1, 25, -6, 60);
    const eased = layOutTribe(1, rel, 900, 600, null, first.settled);
    expect(eased.nodes.map(node => node.personId)).toContain(25);
  });
});

/**
 * M9.6 phase 2d — the graph must come to a *stop*.
 *
 * Phase 2b and 2c stopped the graph re-deriving itself from scratch and stopped
 * it rebuilding its DOM on a pixel of drift, and the owner reported it moving
 * anyway: "it moves, and when it gets layers it behaves very chaotic, changing
 * shapes dozens if not hundreds of times per second even if paused." Both
 * halves of that were real, and they were two different bugs.
 *
 * These are the guards. The numbers below are what the *broken* build measured
 * on the same inputs, which is the only reason to trust them:
 *
 * | check                        | before      | after |
 * |------------------------------|-------------|-------|
 * | ranked, world frozen         | ~600 px/fr  | 0     |
 * | flat, world frozen, rotation | 2°/10 fr    | 0     |
 *
 * "Even if paused" is the load-bearing word. Nothing about the world changes
 * between these frames, so any movement at all is the layout arguing with
 * itself rather than tracking anything the player did.
 */
describe('the tribe graph holds still', () => {
  /** A crowded circle: enough people for a row to be a real queue. */
  function crowd(): RelationshipGraph {
    const rel = new RelationshipGraph();
    for (let id = 2; id <= 26; id++) {
      rel.addDeed(1, id, (id % 2 ? -1 : 1) * ((id * 7) % 90), 0);
    }
    for (let a = 2; a <= 20; a++) {
      for (let b = a + 1; b <= 26; b++) {
        if ((a * b) % 5 === 0) rel.addDeed(a, b, (a * b) % 71 - 35, 0);
      }
    }
    return rel;
  }

  /** Runs `frames` easing passes over an unchanging world, newest drawn last. */
  function frames(rel: RelationshipGraph, ranks: Map<number, BandRank> | null, count: number) {
    let layout = layOutTribe(1, rel, 900, 600, ranks);
    const drawn: Map<number, { x: number; y: number }>[] = [];
    for (let frame = 0; frame < count; frame++) {
      layout = layOutTribe(1, rel, 900, 600, ranks, layout.settled);
      drawn.push(new Map(layout.nodes.map(node => [node.personId, { x: node.x, y: node.y }])));
    }
    return drawn;
  }

  /** The furthest any one person moved between two drawn frames. */
  function moved(
    a: Map<number, { x: number; y: number }>,
    b: Map<number, { x: number; y: number }>
  ): number {
    let worst = 0;
    for (const [id, to] of b) {
      const from = a.get(id);
      if (from) worst = Math.max(worst, Math.hypot(to.x - from.x, to.y - from.y));
    }
    return worst;
  }

  const rungs = (): Map<number, BandRank> => {
    const ranks = new Map<number, BandRank>([[1, 'member']]);
    for (let id = 2; id <= 26; id++) {
      ranks.set(id, id === 2 ? 'chief' : id < 6 ? 'head' : id < 22 ? 'member' : 'child');
    }
    return ranks;
  };

  it('stops moving entirely once a flat graph has settled', () => {
    const drawn = frames(crowd(), null, 90);
    // The last twenty frames of a world in which nothing whatever happened.
    for (let frame = 71; frame < 90; frame++) {
      expect(moved(drawn[frame - 1]!, drawn[frame]!)).toBeLessThan(0.01);
    }
  });

  it('stops moving entirely once a ranked graph has settled', () => {
    // The owner's "when it gets layers". On the build without the fix this is
    // the violent one: a row of sixteen fought its own minimum spacing and
    // threw every node the width of the panel and back, every frame, for ever.
    const drawn = frames(crowd(), rungs(), 90);
    for (let frame = 71; frame < 90; frame++) {
      expect(moved(drawn[frame - 1]!, drawn[frame]!)).toBeLessThan(0.01);
    }
  });

  it('does not slowly rotate once it has settled', () => {
    // The quiet half of the bug, and the one no other check here could see.
    // The shape was right and stayed right — the whole wheel simply turned,
    // about two degrees every ten frames, so "nobody overlaps" and "the same
    // input gives the same output" both passed while the panel span.
    const drawn = frames(crowd(), null, 90);
    const first = drawn[70]!;
    const last = drawn[89]!;
    const centre = (at: Map<number, { x: number; y: number }>) => {
      let x = 0, y = 0;
      for (const point of at.values()) { x += point.x; y += point.y; }
      return { x: x / at.size, y: y / at.size };
    };
    const from = centre(first);
    const to = centre(last);
    for (const [id, after] of last) {
      const before = first.get(id)!;
      let turned = Math.atan2(after.y - to.y, after.x - to.x) -
        Math.atan2(before.y - from.y, before.x - from.x);
      while (turned > Math.PI) turned -= Math.PI * 2;
      while (turned < -Math.PI) turned += Math.PI * 2;
      expect(Math.abs(turned) * 180 / Math.PI).toBeLessThan(0.05);
    }
  });

  it('never lets one pair of nodes throw each other across the panel', () => {
    // The mechanism behind the ranked explosion, measured directly rather than
    // through the picture. `fitInto` scales whatever it is given back into the
    // box, so an arrangement that had blown out to forty thousand pixels still
    // *arrived* looking panel-sized — which is exactly why this went unnoticed.
    // The pre-fit span is the honest reading.
    const layout = layOutTribe(1, crowd(), 900, 600, rungs());
    const xs = [...layout.settled.values()].map(point => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(4000);
  });
});
