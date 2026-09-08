/**
 * The tech web's layout.
 *
 * Two properties matter and neither is about how it looks. It must be
 * **deterministic** — this project forbids `Math.random` outright, and a fork
 * of a simulation stream would be worse than random, because `RNG.fork()`
 * consumes a draw from its parent and opening a panel would then shift every
 * subsequent draw in the world. And nothing may land on top of anything else,
 * because an overlapped node is a node the player cannot click or read.
 */
import { describe, it, expect } from 'vitest';
import {
  layOutWeb, webEdges, depthOf, NODE_RADIUS, DOMAIN_COLORS,
} from '../../ui/TechWebLayout.ts';
import { TECH, TECHS, DOMAINS, type Tech } from '../knowledge/Tech.ts';

describe('the tech web layout', () => {
  it('is byte-identical between two runs', () => {
    const first = layOutWeb();
    const second = layOutWeb();
    expect(JSON.stringify(second.nodes)).toBe(JSON.stringify(first.nodes));
    expect(JSON.stringify(second.edges)).toBe(JSON.stringify(first.edges));
  });

  it('places every technology exactly once', () => {
    const layout = layOutWeb();
    expect(layout.nodes.map(n => n.tech).sort()).toEqual([...TECHS].sort());
  });

  it('never puts one node on top of another', () => {
    const layout = layOutWeb();
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]!;
        const b = layout.nodes[j]!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance, a.tech + ' overlaps ' + b.tech).toBeGreaterThan(NODE_RADIUS);
      }
    }
  });

  it('keeps every node within the layout\'s own bounds', () => {
    // No box is handed in any more — `TechWeb.ts` pans and zooms a viewport
    // over whatever extent the relaxation settles on — so what this asserts
    // is that `shiftToOrigin` did its job: everything sits at or after the
    // margin, and at or before the reported width and height.
    const layout = layOutWeb();
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y), node.tech).toBe(true);
      expect(node.x, node.tech).toBeGreaterThanOrEqual(0);
      expect(node.x, node.tech).toBeLessThanOrEqual(layout.width);
      expect(node.y, node.tech).toBeGreaterThanOrEqual(0);
      expect(node.y, node.tech).toBeLessThanOrEqual(layout.height);
    }
  });

  it('gives every edge two endpoints that are really on the web', () => {
    const placed = new Set(layOutWeb().nodes.map(n => n.tech));
    for (const edge of webEdges()) {
      expect(placed, 'edge from ' + edge.from).toContain(edge.from);
      expect(placed, 'edge to ' + edge.to).toContain(edge.to);
      expect(edge.from).not.toBe(edge.to);
    }
  });

  it('caps how many shared-spark edges any one node keeps', () => {
    // The measured defect this rebuild fixes: `firemaking` alone drew eight
    // of these before the cap existed, most of the way to the "hundreds of
    // faint lines" problem `next-steps.md` describes.
    const degree = new Map<Tech, number>();
    for (const edge of webEdges()) {
      if (edge.kind !== 'shared') continue;
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    for (const [tech, count] of degree) {
      expect(count, tech).toBeLessThanOrEqual(4);
    }
  });

  it('draws one edge per prerequisite, and no prerequisite pair twice', () => {
    const edges = webEdges();
    const required = edges.filter(e => e.kind === 'requires');
    const expected = TECHS.reduce((total, tech) => total + TECH[tech].requires.length, 0);
    expect(required).toHaveLength(expected);

    const seen = new Set<string>();
    for (const edge of edges) {
      const key = [edge.from, edge.to].sort().join('|');
      expect(seen.has(key), edge.from + ' and ' + edge.to + ' are joined twice').toBe(false);
      seen.add(key);
    }
  });

  it('finds the cross-domain arcs that are the point of the picture', () => {
    // Hafting is stone work resting on cordage, which is cloth; carpentry is
    // timber resting on stone. If these stop being cross-domain the layout has
    // nothing to pull the clusters together with.
    const crossing = webEdges().filter(e => e.crossDomain);
    expect(crossing.length).toBeGreaterThan(0);
  });

  it('agrees with the tech table about how deep everything is', () => {
    expect(depthOf('firemaking')).toBe(0);
    expect(depthOf('cordage')).toBe(0);
    expect(depthOf('cooking')).toBe(1);
    expect(depthOf('hafting')).toBe(1);
    // Carpentry rests on stoneworking, which rests on hafting, which rests on
    // cordage: the longest chain, not the shortest.
    expect(depthOf('carpentry')).toBe(3);
  });

  it('gives every domain a colour', () => {
    for (const domain of DOMAINS) {
      expect(DOMAIN_COLORS[domain]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
