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
import { layOutTribe, NODE_RADIUS } from '../../ui/TribeGraphLayout.ts';

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
