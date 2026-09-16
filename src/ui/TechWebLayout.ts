/**
 * Where each technology sits on the web, worked out once and cached.
 *
 * Kept apart from `TechWeb.ts` because it is pure arithmetic over the tech
 * table and touches no DOM at all, which is what lets `techweb.test.ts` assert
 * the two things that actually matter about a layout: that it is *deterministic*
 * — the same input gives byte-identical positions — and that nothing lands on
 * top of anything else.
 *
 * ## No randomness, at all
 *
 * Not `Math.random`, which the project forbids outright, and not a fork of a
 * simulation stream either: `RNG.fork()` consumes a draw from its parent, so
 * opening a panel would shift every subsequent draw in the simulation and two
 * players who pressed G at different moments would get different worlds. A
 * seeded arrangement plus a deterministic relaxation needs neither. `NewGame`
 * set the same precedent, rotating its shortlist by modular arithmetic rather
 * than randomising it.
 *
 * ## Why relaxation rather than a grid
 *
 * A grid would be readable and would say nothing. The point of the picture is
 * that areas which feed each other are *near* each other: `hafting` is stone
 * work that rests on cordage, `carpentry` is timber that rests on stone, and a
 * spring along each of those edges pulls the clusters together until the
 * cross-domain arcs are the shape of the image rather than lines drawn over it.
 */
import { TECH, TECHS, DOMAINS, type Domain, type Tech } from '../sim/knowledge/Tech.ts';
import type { Ingredient } from '../sim/knowledge/Synthesis.ts';
import { relax, settleOverlaps, shiftToOrigin, type GraphEdge } from './GraphLayout.ts';

export interface LaidOutNode {
  /** Same string as `tech`. Required by the shared relaxation engine. */
  id: Tech;
  tech: Tech;
  domain: Domain;
  /** Longest chain of prerequisites behind it. Drives the seeded radius. */
  depth: number;
  x: number;
  y: number;
}

export interface LaidOutEdge {
  from: Tech;
  to: Tech;
  /**
   * `requires` is scaffolding — you cannot understand the far end without the
   * near one. `shared` is two technologies that are sparked by some of the same
   * things, which is a real relation in the table and the one that makes this
   * read as a web rather than a family tree.
   */
  kind: 'requires' | 'shared';
  crossDomain: boolean;
}

export interface WebLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

/**
 * Shared-spark edges any one node may keep, the highest shared-count ones
 * first.
 *
 * Measured, not guessed: at today's seventeen nodes `firemaking` alone draws
 * eight of them at the two-shared-ingredient threshold below, which is most
 * of the way to the "hundreds of faint lines fighting the layout" this
 * rebuild exists to head off — and M8 triples the vocabulary of ingredients
 * as well as the node count, so the hub only gets worse from here. Raising
 * the threshold instead was tried first and measured, not assumed: at three
 * shared ingredients only three edges survive in the whole table today, which
 * is a wall of unrelated nodes rather than a web. The cap is the lever that
 * actually works at this size.
 */
const MAX_SHARED_DEGREE = 4;

/** Half the space a node needs to itself. Nothing may be laid out closer. */
export const NODE_RADIUS = 46;

/** How far apart consecutive rings of `requires` depth start out. */
const RING_GAP = 78;

/** Radius of the innermost ring, so the roots are not all on top of each other. */
const INNER_RADIUS = 96;

/** Relaxation passes. Fixed, because "until it settles" is not deterministic. */
const ITERATIONS = 260;

/** Rest length of a prerequisite spring within one domain, and across two. */
const SPRING_NEAR = 104;
const SPRING_FAR = 168;

/** Rest length of the faint "sparked by some of the same things" spring. */
const SPRING_SHARED = 150;

/** How hard nodes push each other apart, and how hard springs pull. */
const REPULSION = 9000;
const SPRING_K = 0.014;
const SHARED_K = 0.004;

/** A gentle pull toward the middle, so the picture cannot drift apart. */
const CENTRING = 0.0016;

/**
 * The longest chain of prerequisites behind a technology.
 *
 * Longest rather than shortest: depth is being used as "how far into the tree
 * is this", and a node reachable by both a short and a long route belongs on
 * the outer ring, with the things that are genuinely as far in as it is.
 * `tech.test.ts` already asserts the graph is acyclic, so this terminates.
 */
export function depthOf(tech: Tech, seen: Set<Tech> = new Set()): number {
  const requires = TECH[tech].requires;
  if (requires.length === 0) return 0;
  if (seen.has(tech)) return 0;
  seen.add(tech);
  let deepest = 0;
  for (const required of requires) {
    deepest = Math.max(deepest, depthOf(required, seen) + 1);
  }
  seen.delete(tech);
  return deepest;
}

/** Every ingredient of every spark of a technology, as comparable keys. */
function ingredientKeys(tech: Tech): Set<string> {
  const keys = new Set<string>();
  for (const spark of TECH[tech].sparks) {
    for (const ingredient of spark.needs) keys.add(keyOf(ingredient));
  }
  return keys;
}

function keyOf(ingredient: Ingredient): string {
  switch (ingredient.kind) {
    case 'knows': return 'knows:' + ingredient.tech;
    case 'holding': return 'holding:' + ingredient.item;
    case 'doing': return 'doing:' + ingredient.action;
    case 'feeling': return 'feeling:' + ingredient.need;
    case 'place': return 'place:' + ingredient.biome;
    case 'saw': return 'saw:' + ingredient.what;
    case 'season': return 'season:' + ingredient.season;
  }
}

/** Every edge the picture draws, both kinds. */
export function webEdges(): LaidOutEdge[] {
  const edges: LaidOutEdge[] = [];
  for (const tech of TECHS) {
    for (const required of TECH[tech].requires) {
      edges.push({
        from: required, to: tech, kind: 'requires',
        crossDomain: TECH[required].domain !== TECH[tech].domain,
      });
    }
  }

  // Two technologies sparked by some of the same things are related whether or
  // not either rests on the other — cold suggests both fire and clothing, and
  // that is worth seeing. The threshold is two shared ingredients rather than
  // one, because almost everything shares a single common verb with something
  // and an edge between every pair is not a picture.
  const keys = new Map<Tech, Set<string>>();
  for (const tech of TECHS) keys.set(tech, ingredientKeys(tech));
  const candidates: { a: Tech; b: Tech; shared: number; crossDomain: boolean }[] = [];
  for (let i = 0; i < TECHS.length; i++) {
    for (let j = i + 1; j < TECHS.length; j++) {
      const a = TECHS[i]!;
      const b = TECHS[j]!;
      // A prerequisite pair is already joined; a second line between them
      // would only be the first one drawn twice.
      if (TECH[b].requires.includes(a) || TECH[a].requires.includes(b)) continue;
      let shared = 0;
      for (const key of keys.get(a)!) {
        if (key.startsWith('knows:')) continue;
        if (keys.get(b)!.has(key)) shared++;
      }
      if (shared < 2) continue;
      candidates.push({ a, b, shared, crossDomain: TECH[a].domain !== TECH[b].domain });
    }
  }

  // The strongest relations first, and a hard cap on how many any one node
  // may keep — see `MAX_SHARED_DEGREE`. Sorted by shared count and then by
  // table order, never by anything that could vary between two runs of the
  // same build.
  candidates.sort((x, y) => y.shared - x.shared || TECHS.indexOf(x.a) - TECHS.indexOf(y.a));
  const degree = new Map<Tech, number>();
  for (const candidate of candidates) {
    const da = degree.get(candidate.a) ?? 0;
    const db = degree.get(candidate.b) ?? 0;
    if (da >= MAX_SHARED_DEGREE || db >= MAX_SHARED_DEGREE) continue;
    degree.set(candidate.a, da + 1);
    degree.set(candidate.b, db + 1);
    edges.push({
      from: candidate.a, to: candidate.b, kind: 'shared', crossDomain: candidate.crossDomain,
    });
  }
  return edges;
}

/**
 * Lays the whole web out.
 *
 * Called once when the panel opens and cached by the caller. It is O(n²) per
 * iteration over about ten nodes, which is nothing, and will still be nothing
 * at the two dozen the milestone ends with.
 *
 * Takes no box to fit into any more. The picture used to be squeezed into a
 * fixed 1080x720 with `fitInto`'s uniform scale, which is the defect this
 * rebuild exists to fix: at seventeen nodes the pre-fit span was already
 * ~908px, the fit scale was ~0.65, and the 92px hard separation the
 * relaxation had won landed at about 60px on screen — under a node's own
 * width. `TechWeb.ts` now owns a pan-and-zoom viewport instead, so the layout
 * only has to give every node a well-defined, non-overlapping position and
 * let the player decide how much of it to look at.
 */
export function layOutWeb(): WebLayout {
  const nodes: LaidOutNode[] = [];

  // Seed: each domain owns an angular sector, and depth sets the radius. The
  // relaxation below only ever adjusts this, so the clusters survive it.
  const byDomain = new Map<Domain, Tech[]>();
  for (const domain of DOMAINS) byDomain.set(domain, []);
  for (const tech of TECHS) byDomain.get(TECH[tech].domain)!.push(tech);

  const sector = (Math.PI * 2) / DOMAINS.length;
  DOMAINS.forEach((domain, domainIndex) => {
    const members = byDomain.get(domain)!;
    const centre = domainIndex * sector - Math.PI / 2;
    members.forEach((tech, index) => {
      const depth = depthOf(tech);
      // Fan the members of one domain across its sector rather than stacking
      // them on the sector's spine, which put same-depth siblings exactly on
      // top of each other and left the relaxation to guess which way to break
      // the tie.
      const spread = members.length <= 1
        ? 0
        : (index / (members.length - 1) - 0.5) * sector * 0.72;
      const angle = centre + spread;
      const radius = INNER_RADIUS + depth * RING_GAP;
      nodes.push({
        id: tech, tech, domain, depth,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  });

  const edges = webEdges();
  const springs: GraphEdge[] = edges.map(edge => ({
    from: edge.from,
    to: edge.to,
    rest: edge.kind === 'shared' ? SPRING_SHARED : edge.crossDomain ? SPRING_FAR : SPRING_NEAR,
    k: edge.kind === 'shared' ? SHARED_K : SPRING_K,
  }));

  relax(nodes, springs, { iterations: ITERATIONS, repulsion: REPULSION, centring: CENTRING });
  settleOverlaps(nodes, NODE_RADIUS * 2);
  const { width, height } = shiftToOrigin(nodes, NODE_RADIUS);

  return { nodes, edges, width, height };
}

/** Domain colours. One hue per area, so a cluster reads as a cluster. */
export const DOMAIN_COLORS: Record<Domain, string> = {
  fire: '#e08a4a',
  plants: '#7ddc96',
  stone: '#9aa6b8',
  cloth: '#c88ad8',
  timber: '#c8a45c',
  beasts: '#e0705c',
  water: '#4a90d0',
  // M9.5 phase 4c. Off every other hue in the table on purpose: the social
  // branch is the one cluster whose subject is not a material, and it should
  // read as somewhere else on the web at a glance.
  people: '#d8b84a',
};
