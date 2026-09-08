/**
 * A small force-relaxation engine, shared by every graph this project draws.
 *
 * Extracted from `TechWebLayout.ts`, which had this arithmetic written out for
 * one graph. Phase 7 adds two more — a family tree and a tribe's opinions —
 * and a second copy of a relaxation loop is exactly the kind of drift
 * `AGENTS.md` warns about: three slightly different repulsion constants three
 * places, and a bug fixed in one that stays broken in the other two.
 *
 * Generic over anything with an id, so a technology, a person and a node in a
 * sociogram can all be laid out with the same three functions. Nothing here
 * knows what a node *means* — only where it sits.
 *
 * ## No randomness, at all
 *
 * Not `Math.random`, which the project forbids outright, and not a fork of a
 * simulation stream either: `RNG.fork()` consumes a draw from its parent, so
 * opening a panel would shift every subsequent draw in the world and two
 * players who pressed the same key at different moments would get different
 * worlds. Every caller seeds its own starting positions deterministically —
 * by domain and depth, by generation, by opinion — and relaxation alone can
 * turn a seed into a picture without ever needing a draw.
 */

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  /**
   * Freezes an axis during relaxation: the node still repels and is pulled by
   * springs on that axis like any other, but the result is discarded rather
   * than applied. `FamilyTreeLayout` pins `y` to a generation row so a family
   * tree reads top to bottom; nothing else needs this and it defaults to free.
   */
  lockX?: boolean;
  lockY?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Distance the spring along this edge relaxes toward. */
  rest: number;
  /** How hard it pulls. Calibrated per caller; there is no universal value. */
  k: number;
}

export interface RelaxOptions {
  iterations: number;
  /** How hard nodes push each other apart. */
  repulsion: number;
  /** A gentle pull toward the origin, so the picture cannot drift apart. */
  centring: number;
}

/**
 * Runs the whole simulation in place: repulsion between every pair, springs
 * along every edge, a centring pull, for `iterations` passes.
 *
 * O(n^2) per pass from the repulsion term, same as the tech web always was.
 * Nothing this project draws is within two orders of magnitude of where that
 * would matter — the largest graph today is a tribe capped at a few dozen
 * people — and `techweb.test.ts`'s determinism check is the tripwire if a
 * future graph ever gets there first.
 */
export function relax<T extends GraphNode>(
  nodes: T[],
  edges: GraphEdge[],
  options: RelaxOptions
): void {
  const index = new Map<string, T>();
  for (const node of nodes) index.set(node.id, node);

  for (let pass = 0; pass < options.iterations; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.001) {
          // Exactly coincident: break the tie by array order rather than by a
          // random jitter, or the layout stops being reproducible.
          dx = (j - i) * 0.01;
          dy = 0.01;
          distance = Math.sqrt(dx * dx + dy * dy);
        }
        const push = options.repulsion / (distance * distance);
        const nx = (dx / distance) * push;
        const ny = (dy / distance) * push;
        if (!a.lockX) a.x -= nx;
        if (!a.lockY) a.y -= ny;
        if (!b.lockX) b.x += nx;
        if (!b.lockY) b.y += ny;
      }
    }

    for (const edge of edges) {
      const a = index.get(edge.from);
      const b = index.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const pull = (distance - edge.rest) * edge.k;
      const nx = (dx / distance) * pull;
      const ny = (dy / distance) * pull;
      if (!a.lockX) a.x += nx;
      if (!a.lockY) a.y += ny;
      if (!b.lockX) b.x -= nx;
      if (!b.lockY) b.y -= ny;
    }

    for (const node of nodes) {
      if (!node.lockX) node.x -= node.x * options.centring;
      if (!node.lockY) node.y -= node.y * options.centring;
    }
  }
}

/**
 * A last hard pass that simply moves overlapping pairs apart.
 *
 * The spring system is a compromise between several forces and can settle
 * with two nodes slightly too close; the picture cannot, or the player cannot
 * click one of them. Locked axes are respected the same way `relax` respects
 * them, so a family tree's rows stay rows even after this pass.
 */
export function settleOverlaps<T extends GraphNode>(
  nodes: T[],
  minDistance: number,
  passes = 60
): void {
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const overlap = minDistance - distance;
        if (overlap <= 0) continue;
        const nx = (dx / distance) * overlap * 0.5;
        const ny = (dy / distance) * overlap * 0.5;
        if (!a.lockX) a.x -= nx;
        if (!a.lockY) a.y -= ny;
        if (!b.lockX) b.x += nx;
        if (!b.lockY) b.y += ny;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/**
 * Shifts an arrangement so its top-left corner sits at `margin, margin`,
 * without scaling it.
 *
 * The tech web's own alternative to `fitInto`: a graph the player can pan and
 * zoom does not need to be squeezed into a box at layout time, and doing so
 * anyway was the fixed-1080x720 problem this function exists to retire. It
 * still needs *some* well-defined origin — a `<svg>` with negative coordinates
 * clips itself — so this is the smallest fix that gives one.
 */
export function shiftToOrigin<T extends GraphNode>(
  nodes: T[], margin: number
): { width: number; height: number } {
  if (nodes.length === 0) return { width: margin * 2, height: margin * 2 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y);
  }
  for (const node of nodes) {
    node.x = node.x - minX + margin;
    node.y = node.y - minY + margin;
  }
  return { width: maxX - minX + margin * 2, height: maxY - minY + margin * 2 };
}

/**
 * Scales and shifts an arrangement so it fills a box, uniformly.
 *
 * Independent axis scaling would distort a circular layout into an ellipse
 * and a family tree's rows into something no longer evenly spaced, so both
 * axes always move by the same factor. Capped at `maxScale` so a small graph
 * on a large monitor grows enough to use the space without its nodes
 * ballooning to the size of buttons on a poster.
 */
export function fitInto<T extends GraphNode>(
  nodes: T[], width: number, height: number, margin: number, maxScale = 1.5
): T[] {
  if (nodes.length === 0) return nodes;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y);
  }
  const spanX = Math.max(1, maxX - minX) + margin * 2;
  const spanY = Math.max(1, maxY - minY) + margin * 2;
  const scale = Math.min(maxScale, width / spanX, height / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  for (const node of nodes) {
    node.x = (node.x - midX) * scale + width / 2;
    node.y = (node.y - midY) * scale + height / 2;
  }
  return nodes;
}
