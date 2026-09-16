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
 *
 * ## Two modes, and why the flat one survives
 *
 * M9.5 phase 4e adds a **ranked** mode: rows, chief at the top, worked out by
 * `sim/social/Rank.ts` and handed in. It is not a second layout engine — the
 * springs, the repulsion and the overlap pass are the same ones, with `y`
 * pinned to a row exactly as `FamilyTreeLayout` pins a generation, so only `x`
 * is ever relaxed. What changes with the rows is where the *order* within a
 * row comes from: see `seedRows`, which had to take that job off the
 * relaxation.
 *
 * The flat sociogram stays, and is still what a band without the idea of
 * `division_of_labour` gets. That is the owner's note: the pyramid is
 * something the world *acquires*, and a graph that drew ranks before anyone
 * had thought of ranking anybody would be asserting a structure the
 * simulation would refuse to honour.
 */
import type { RelationshipGraph } from '../sim/social/Relationships.ts';
import { RANK_ROW, type BandRank } from '../sim/social/Rank.ts';
import { relax, settleOverlaps, fitInto, type GraphEdge, type GraphNode } from './GraphLayout.ts';

export interface TribeNode extends GraphNode {
  personId: number;
  isSubject: boolean;
  /** The subject's own opinion of them, or 0 for the subject's own node. */
  subjectOpinion: number;
  /**
   * Which rung of the band they stand on, or null when the graph is flat.
   *
   * Carried on the node rather than looked up again by the panel, so the row
   * a person is drawn in and the row they are labelled with cannot disagree.
   */
  rank: BandRank | null;
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
  /** True when rows were pinned — the band has a shape and this is a pyramid. */
  ranked: boolean;
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

/**
 * Vertical distance between one rung of the pyramid and the next.
 *
 * Wider than the family tree's 108 because a tribe node is wider than it is
 * tall and the rows have to read as rows at a glance, not as a crowd that
 * happens to be roughly level.
 */
const ROW_GAP = 116;

/** Horizontal seed spacing within a row, before relaxation moves anybody. */
const SEED_GAP = 120;

/**
 * Springs pull sideways only in ranked mode, so they may pull harder without
 * dragging the picture out of its rows: with `y` pinned, all a rest length can
 * buy is distance along the row, and it cannot pull anybody past anybody.
 */
const RANKED_SPOKE_K = 0.03;
const RANKED_PEER_K = 0.016;

/**
 * How far apart two people in the same row must end up.
 *
 * Wider than the flat graph's `NODE_RADIUS * 2`, because with `y` pinned the
 * only room left is sideways and a node is 74px wide against a radius of 34:
 * two nodes exactly 68px apart in the *same* row overlap on screen, where in
 * the flat graph the same pair would have settled diagonally and not.
 */
const RANKED_MIN_GAP = 88;

/**
 * Everyone the graph will draw for `subjectId`, subject first.
 *
 * Exported so the panel can ask the simulation for their ranks *before* the
 * layout runs, without knowing what the cap is or reimplementing it. The one
 * place `MAX_PEOPLE` is applied is here and in the layout below, off the same
 * call, so the ranks handed in can never cover a different set of people from
 * the ones drawn.
 */
export function tribeMembers(
  subjectId: number,
  relationships: RelationshipGraph
): number[] {
  return [
    subjectId,
    ...relationships.knownBy(subjectId).slice(0, MAX_PEOPLE).map(tie => tie.subjectId),
  ];
}

/** How far a spoke relaxes toward, from love (close) to hatred (far). */
function restLength(opinion: number): number {
  return 150 - opinion * 0.9;
}

/**
 * Lays the subject's visible social circle out inside a box.
 *
 * **Flat**, with no `ranks`: `subject` sits at the centre, everyone else is
 * seeded around it in a ring, closest where feeling runs strongest either
 * way, and the relaxation does the rest.
 *
 * **Ranked**, when `ranks` is given: every node is pinned to its rung's row
 * and only `x` relaxes, so allies still slide together under their own
 * rank — the thing a sociogram is for — while the picture reads top to
 * bottom. The caller decides which it gets; the rule lives in
 * `Rank.bandHasShape`, not here, because whether a band has a shape is a fact
 * about the world rather than about drawing.
 *
 * Empty rows are closed up. A band whose chief is not among the people this
 * subject knows should not be drawn with a gap where a chief would be — that
 * reads as "the chief is hidden", which is a claim about knowledge this graph
 * is not making. The order of the rows that *are* present never changes.
 */
export function layOutTribe(
  subjectId: number,
  relationships: RelationshipGraph,
  width: number,
  height: number,
  ranks?: ReadonlyMap<number, BandRank> | null
): TribeLayout {
  const known = relationships.knownBy(subjectId).slice(0, MAX_PEOPLE);
  const ranked = !!ranks && ranks.size > 0;

  const nodes: TribeNode[] = [{
    id: String(subjectId), personId: subjectId, isSubject: true, subjectOpinion: 0,
    rank: ranked ? ranks!.get(subjectId) ?? 'outsider' : null,
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
      rank: ranked ? ranks!.get(tie.subjectId) ?? 'outsider' : null,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });

  if (ranked) seedRows(nodes);

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

  const springs: GraphEdge[] = edges.map(edge => {
    const spoke = edge.from === subjectId || edge.to === subjectId;
    return {
      from: String(edge.from),
      to: String(edge.to),
      rest: restLength(edge.opinion),
      k: ranked
        ? (spoke ? RANKED_SPOKE_K : RANKED_PEER_K)
        : (spoke ? SPOKE_K : PEER_K),
    };
  });

  relax(nodes, springs, { iterations: ITERATIONS, repulsion: REPULSION, centring: CENTRING });
  settleOverlaps(nodes, ranked ? RANKED_MIN_GAP : NODE_RADIUS * 2);

  return { nodes: fitInto(nodes, width, height, NODE_RADIUS, 1.4), edges, width, height, ranked };
}

/**
 * Pins every node to its rank's row and spreads it along that row, warmest
 * nearest the subject's own column.
 *
 * **The order within a row is the seed's job, not the relaxation's.** With
 * `y` pinned a row is a one-dimensional problem, and repulsion between
 * neighbours is a wall: two people who ought to stand together cannot swap
 * past the three people between them however hard their spring pulls, so a
 * row seeded in id order stays in id order and the sociogram's whole point is
 * lost. Seeding by the subject's opinion — best regarded beside them, worst
 * out at the ends, alternating sides so the row stays balanced — puts the
 * order right up front and leaves the springs to do what they still can,
 * which is set the *distances* within that order.
 *
 * The subject itself is placed first, at the centre of its own row, so it
 * keeps the column the flat graph gives it. Everything else is sorted by
 * opinion and tie-broken by id, never by `Map` order: a seed that depends on
 * insertion order is a layout that can come out differently on two runs of
 * the same world, and `GraphLayout`'s header rules out breaking the tie with
 * a random draw.
 */
function seedRows(nodes: TribeNode[]): void {
  const byRank = new Map<BandRank, TribeNode[]>();
  for (const node of nodes) {
    const rank = node.rank ?? 'outsider';
    const row = byRank.get(rank);
    if (row) row.push(node);
    else byRank.set(rank, [node]);
  }

  const occupied = [...byRank.keys()].sort((a, b) => RANK_ROW[a] - RANK_ROW[b]);
  occupied.forEach((rank, row) => {
    const people = byRank.get(rank)!.sort((a, b) => {
      if (a.isSubject !== b.isSubject) return a.isSubject ? -1 : 1;
      if (a.subjectOpinion !== b.subjectOpinion) return b.subjectOpinion - a.subjectOpinion;
      return a.personId - b.personId;
    });
    people.forEach((node, index) => {
      // 0, +1, -1, +2, -2 … out from the middle of the row.
      node.x = Math.ceil(index / 2) * SEED_GAP * (index % 2 === 1 ? 1 : -1);
      node.y = row * ROW_GAP;
      node.lockY = true;
    });
  });
}
