/**
 * M15 phase 13c: the web opens, and it does not move.
 *
 * The layout is the half of the screen that can be tested without a browser:
 * which nodes each web draws, and that a node already placed never moves when
 * another is added. Nothing here hardcodes the list of webs or their members —
 * the other agent adds nodes to `TECHS` and webs to `WEBS`, and a test that
 * counted them would be a test of this week's table.
 */
import { describe, it, expect } from 'vitest';
import {
  layOutWeb, webEdges, NODE_RADIUS, type WebLayout,
} from '../../ui/TechWebLayout.ts';
import {
  TECH, TECHS, WEBS, SUB_WEBS, webOf, techsOfWeb, type Tech, type WebId,
} from '../knowledge/Tech.ts';

const positions = (layout: WebLayout) =>
  new Map(layout.nodes.map(node => [node.tech, node.x + ',' + node.y]));

describe('a web draws only its own nodes', () => {
  it('draws the main web without a single sub-web node', () => {
    const layout = layOutWeb('main');
    expect(layout.nodes.map(n => n.tech).sort()).toEqual([...techsOfWeb('main')].sort());
    for (const node of layout.nodes) expect(webOf(node.tech), node.tech).toBe('main');
    // And no edge reaches out of it: an edge to a sub-web node would name it.
    for (const edge of layout.edges) {
      expect(webOf(edge.from), edge.from).toBe('main');
      expect(webOf(edge.to), edge.to).toBe('main');
    }
  });

  it('draws a sub-web with its own nodes and its gate, and nothing else', () => {
    for (const web of SUB_WEBS) {
      const layout = layOutWeb(web.id);
      const expected = [...techsOfWeb(web.id), web.gate!].sort();
      expect(layout.nodes.map(n => n.tech).sort(), web.id).toEqual(expected);
      const placed = new Set(layout.nodes.map(n => n.tech));
      for (const edge of layout.edges) {
        expect(placed, web.id + ' edge from ' + edge.from).toContain(edge.from);
        expect(placed, web.id + ' edge to ' + edge.to).toContain(edge.to);
      }
      // Every sub-web node hangs off the gate on the picture, or the gate is
      // there for nothing.
      const reached = new Set<Tech>([web.gate!]);
      for (let grew = true; grew;) {
        grew = false;
        for (const edge of layout.edges) {
          if (edge.kind === 'requires' && reached.has(edge.from) && !reached.has(edge.to)) {
            reached.add(edge.to); grew = true;
          }
        }
      }
      for (const tech of techsOfWeb(web.id)) expect(reached, web.id + ': ' + tech).toContain(tech);
    }
  });

  it('puts every technology in exactly one web', () => {
    const seen = new Map<Tech, WebId>();
    for (const id of Object.keys(WEBS) as WebId[]) {
      for (const node of layOutWeb(id).nodes) {
        if (webOf(node.tech) !== id) continue; // a gate shown as the anchor
        expect(seen.has(node.tech), node.tech).toBe(false);
        seen.set(node.tech, id);
      }
    }
    expect([...seen.keys()].sort()).toEqual([...TECHS].sort());
  });

  it('keeps shared-spark edges inside the web they are drawn in', () => {
    const members = techsOfWeb('main');
    const inside = new Set(members);
    for (const edge of webEdges(members)) {
      expect(inside, edge.from).toContain(edge.from);
      expect(inside, edge.to).toContain(edge.to);
    }
  });
});

describe('the layout is fixed', () => {
  it('gives the same output for the same input, in every web', () => {
    for (const id of Object.keys(WEBS) as WebId[]) {
      expect(JSON.stringify(layOutWeb(id)), id).toBe(JSON.stringify(layOutWeb(id)));
    }
  });

  it('never moves a node that is already placed when more nodes arrive', () => {
    // The table grows by adding techs; simulate it by laying out the first
    // part of the main web and then all of it, handing the first layout back.
    const all = techsOfWeb('main');
    const half = all.slice(0, Math.floor(all.length / 2));
    const before = layOutWeb('main', { members: half });
    const after = layOutWeb('main', { members: all, previous: before });
    expect(after.nodes).toHaveLength(all.length);

    const was = positions(before);
    const now = positions(after);
    for (const tech of half) expect(now.get(tech), tech).toBe(was.get(tech));
    // The same again in two steps: growth does not have to arrive at once.
    const third = all.slice(0, Math.floor(all.length * 0.75));
    const stepped = layOutWeb('main', {
      members: all, previous: layOutWeb('main', { members: third, previous: before }),
    });
    for (const tech of half) expect(positions(stepped).get(tech), tech).toBe(was.get(tech));
  });

  it('places the newcomers deterministically, clear of everyone', () => {
    const all = techsOfWeb('main');
    const half = all.slice(0, Math.floor(all.length / 2));
    const before = layOutWeb('main', { members: half });
    const a = layOutWeb('main', { members: all, previous: before });
    const b = layOutWeb('main', { members: all, previous: before });
    expect(JSON.stringify(b.nodes)).toBe(JSON.stringify(a.nodes));
    for (let i = 0; i < a.nodes.length; i++) {
      for (let j = i + 1; j < a.nodes.length; j++) {
        const p = a.nodes[i]!;
        const q = a.nodes[j]!;
        expect(Math.hypot(p.x - q.x, p.y - q.y), p.tech + ' / ' + q.tech)
          .toBeGreaterThan(NODE_RADIUS);
      }
    }
  });

  it('does not touch the layout it was handed', () => {
    const all = techsOfWeb('main');
    const before = layOutWeb('main', { members: all.slice(0, 10) });
    const frozen = JSON.stringify(before);
    layOutWeb('main', { members: all, previous: before });
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('keeps the layouts of two webs independent', () => {
    const main = JSON.stringify(layOutWeb('main'));
    layOutWeb(SUB_WEBS[0]!.id);
    expect(JSON.stringify(layOutWeb('main'))).toBe(main);
  });

  it('reports bounds that hold every node, even after growth', () => {
    const all = techsOfWeb('main');
    const grown = layOutWeb('main', {
      members: all, previous: layOutWeb('main', { members: all.slice(0, 12) }),
    });
    for (const node of grown.nodes) {
      expect(node.x, node.tech).toBeGreaterThanOrEqual(grown.bounds.minX);
      expect(node.x, node.tech).toBeLessThanOrEqual(grown.bounds.maxX);
      expect(node.y, node.tech).toBeGreaterThanOrEqual(grown.bounds.minY);
      expect(node.y, node.tech).toBeLessThanOrEqual(grown.bounds.maxY);
    }
    expect(grown.width).toBeCloseTo(grown.bounds.maxX - grown.bounds.minX, 6);
    expect(TECH[all[0]!]).toBeDefined();
  });
});
