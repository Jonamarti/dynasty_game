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

/**
 * The furthest one pair of nodes may shove each other in a single pass.
 *
 * Repulsion is `repulsion / distance^2`, which is unbounded as the distance
 * goes to zero: at the tribe graph's constants two nodes five pixels apart
 * throw each other three hundred and twenty pixels in one pass, and two pixels
 * apart, two thousand. That is not a strong force, it is an explosion, and it
 * is what made the ranked tribe graph detonate — with `lockY` pinning a row,
 * a pair cannot escape past each other diagonally, so they stayed close and
 * kept kicking until the row was forty thousand pixels wide. `fitInto` then
 * crushed that back into the panel, so the damage showed up not as nodes
 * flying off screen but as the whole picture changing shape every frame.
 *
 * Eight pixels only bites below about thirty-two, and every caller's overlap
 * pass already forbids anything that close — so this changes nothing about a
 * healthy arrangement and only refuses to make an unhealthy one worse.
 * Separating nodes that genuinely overlap is `settleOverlaps`'s job, and it
 * does it by measuring the overlap rather than by guessing at a force.
 */
const MAX_PUSH = 8;

/**
 * A pass that moves nothing further than this has converged, and the rest of
 * the budget is wasted work.
 *
 * A twentieth of a pixel: far below anything that can be drawn, and far below
 * the four-pixel quantisation the tribe graph's redraw digest uses. The early
 * exit is what makes a settled graph *free* — a panel left open on a paused
 * world runs one pass, finds everybody already where they belong, and stops.
 */
const AT_REST = 0.05;

export interface RelaxOptions {
  iterations: number;
  /** How hard nodes push each other apart. */
  repulsion: number;
  /** A gentle pull toward the origin, so the picture cannot drift apart. */
  centring: number;
}

/**
 * Runs the whole simulation in place: repulsion between every pair, springs
 * along every edge, a centring pull, for up to `iterations` passes.
 *
 * O(n^2) per pass from the repulsion term, same as the tech web always was.
 * Nothing this project draws is within two orders of magnitude of where that
 * would matter — the largest graph today is a tribe capped at a few dozen
 * people — and `techweb.test.ts`'s determinism check is the tripwire if a
 * future graph ever gets there first.
 *
 * ## Every force is summed before any node moves
 *
 * M9.6 phase 2d, and the fix for a bug that was invisible to every test this
 * file had. The loop used to write each node's new position the moment it
 * computed it, so the second node of a pair was already reading the first
 * one's *updated* position. That asymmetry is not physics — it is an artefact
 * of the order the array happens to be in — and it injects a small consistent
 * tangential bias into every pair.
 *
 * The visible result was that a settled flat sociogram **rotated**, rigidly,
 * for ever: measured at a steady two degrees per ten frames, with the centroid
 * fixed and every node's distance from it unchanged to within a rounding
 * error. Nothing was wrong with the *shape*, so "never puts one person on top
 * of another" and "is byte-identical between two runs" both passed happily
 * while the panel span like a wheel in front of the player.
 *
 * Summing into `fx`/`fy` and applying once per pass makes every pair
 * symmetric, and the rotation measures as exactly zero.
 *
 * ## And the passes cool
 *
 * A fixed step size is what let the arrangement overshoot its own equilibrium
 * and oscillate about it instead of arriving. `heat` ramps from 1 down to
 * 0.05 across the budget, the standard cooling schedule a force-directed
 * layout needs and this one never had, so a call *lands* somewhere rather
 * than ending wherever it happened to be mid-swing.
 */
export function relax<T extends GraphNode>(
  nodes: T[],
  edges: GraphEdge[],
  options: RelaxOptions
): void {
  const fx = new Float64Array(nodes.length);
  const fy = new Float64Array(nodes.length);
  const slot = new Map<string, number>();
  nodes.forEach((node, i) => slot.set(node.id, i));

  for (let pass = 0; pass < options.iterations; pass++) {
    // Cooling: full steps early to cross the distance, small ones late to
    // arrive without overshooting. See the header.
    const heat = 1 - (pass / options.iterations) * 0.95;
    fx.fill(0);
    fy.fill(0);

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
        const push = Math.min(MAX_PUSH, options.repulsion / (distance * distance));
        const nx = (dx / distance) * push;
        const ny = (dy / distance) * push;
        fx[i] -= nx; fy[i] -= ny;
        fx[j] += nx; fy[j] += ny;
      }
    }

    for (const edge of edges) {
      const i = slot.get(edge.from);
      const j = slot.get(edge.to);
      if (i === undefined || j === undefined) continue;
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const pull = (distance - edge.rest) * edge.k;
      const nx = (dx / distance) * pull;
      const ny = (dy / distance) * pull;
      fx[i] += nx; fy[i] += ny;
      fx[j] -= nx; fy[j] -= ny;
    }

    // The one place a node actually moves. A locked axis contributes nothing
    // to `worst` either, so a ranked graph — every `y` pinned — is judged at
    // rest on the strength of the only axis it is allowed to relax.
    let worst = 0;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      fx[i] -= node.x * options.centring;
      fy[i] -= node.y * options.centring;
      const dx = node.lockX ? 0 : fx[i]! * heat;
      const dy = node.lockY ? 0 : fy[i]! * heat;
      node.x += dx;
      node.y += dy;
      const step = dx * dx + dy * dy;
      if (step > worst) worst = step;
    }
    if (worst < AT_REST * AT_REST) break;
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
