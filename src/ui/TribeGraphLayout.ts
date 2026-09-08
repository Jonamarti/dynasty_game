/**
 * Where each acquaintance sits on the tribe graph, worked out once and cached.
 *
 * The third graph this project draws, and the richest: not spokes from the
 * subject alone, but a sociogram — an edge between *any* two people on the
 * graph who have an opinion of each other, not only between the subject and
 * everyone else. Two people the subject knows who despise one another is
 * exactly the kind of thing a "map of somebody's ties" ought to show, and a
 * graph that only ever drew spokes from the centre would flatten that into a
 * wheel with no story in it.
 */
import type { RelationshipGraph } from '../sim/social/Relationships.ts';
import { relax, settleOverlaps, fitInto, type GraphEdge, type GraphNode } from './GraphLayout.ts';

export interface TribeNode extends GraphNode {
  personId: number;
  isSubject: boolean;
  /** The subject's own opinion of them, or 0 for the subject's own node. */
  subjectOpinion: number;
}

export interface TribeEdgeInfo {
  from: number;
  to: number;
  /** Net of both directions where both exist, so one line answers for the pair. */
  opinion: number;
}

export interface TribeLayout {
  nodes: TribeNode[];
  edges: TribeEdgeInfo[];
  width: number;
  height: number;
}

/** Beyond this the graph is a smear of faint acquaintances rather than a tribe. */
const MAX_PEOPLE = 24;

export const NODE_RADIUS = 34;

const ITERATIONS = 220;
const REPULSION = 8000;
const CENTRING = 0.0014;

/** Spokes from the subject pull harder than peer-to-peer lines, to anchor the shape. */
const SPOKE_K = 0.024;
const PEER_K = 0.012;

/** How far a spoke relaxes toward, from love (close) to hatred (far). */
function restLength(opinion: number): number {
  return 150 - opinion * 0.9;
}

/**
 * Lays the subject's visible social circle out inside a box.
 *
 * `subject` sits at the centre, seeded there and left unrelaxed by the
 * springs pulling on it — everyone else is seeded around it by rank, closest
 * where feeling runs strongest either way, and the relaxation does the rest.
 */
export function layOutTribe(
  subjectId: number,
  relationships: RelationshipGraph,
  width: number,
  height: number
): TribeLayout {
  const known = relationships.knownBy(subjectId).slice(0, MAX_PEOPLE);

  const nodes: TribeNode[] = [{
    id: String(subjectId), personId: subjectId, isSubject: true, subjectOpinion: 0,
    x: 0, y: 0,
  }];

  const count = known.length;
  known.forEach((tie, index) => {
    const angle = count === 0 ? 0 : (index / count) * Math.PI * 2 - Math.PI / 2;
    // Closer to the centre the more strongly the subject feels, either way.
    const radius = 60 + (1 - Math.min(1, Math.abs(tie.opinion) / 100)) * 220;
    nodes.push({
      id: String(tie.subjectId),
      personId: tie.subjectId,
      isSubject: false,
      subjectOpinion: tie.opinion,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });

  const edges: TribeEdgeInfo[] = [];
  const seen = new Set<string>();
  const addEdge = (a: number, b: number, opinion: number) => {
    const key = [a, b].sort((x, y) => x - y).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: a, to: b, opinion });
  };

  for (const tie of known) {
    addEdge(subjectId, tie.subjectId, tie.opinion);
  }
  // Peer to peer: anyone else on the graph who has an opinion of anyone else
  // on it, in either direction, averaged into one line. Bounded at
  // `MAX_PEOPLE`^2 pairs, which is at most a few hundred lookups — nothing
  // beside the O(n^2) repulsion the relaxation below already does.
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const a = known[i]!.subjectId;
      const b = known[j]!.subjectId;
      const ab = relationships.peek(a, b);
      const ba = relationships.peek(b, a);
      if (!ab && !ba) continue;
      const opinion = ((ab ? relationships.opinion(a, b) : 0) +
        (ba ? relationships.opinion(b, a) : 0)) / ((ab ? 1 : 0) + (ba ? 1 : 0));
      addEdge(a, b, opinion);
    }
  }

  const springs: GraphEdge[] = edges.map(edge => ({
    from: String(edge.from),
    to: String(edge.to),
    rest: restLength(edge.opinion),
    k: edge.from === subjectId || edge.to === subjectId ? SPOKE_K : PEER_K,
  }));

  relax(nodes, springs, { iterations: ITERATIONS, repulsion: REPULSION, centring: CENTRING });
  settleOverlaps(nodes, NODE_RADIUS * 2);

  return { nodes: fitInto(nodes, width, height, NODE_RADIUS, 1.4), edges, width, height };
}
