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
import {
  TECH, TECHS, DOMAINS, AGES, WEBS, webOf, techsOfWeb,
  type AgeId, type Domain, type Tech, type WebId,
} from '../sim/knowledge/Tech.ts';
import type { Ingredient } from '../sim/knowledge/Synthesis.ts';
import {
  relax, settleOverlaps, shiftToOrigin, type GraphEdge, type GraphNode,
} from './GraphLayout.ts';

export interface LaidOutNode {
  /** Same string as `tech`. Required by the shared relaxation engine. */
  id: Tech;
  tech: Tech;
  domain: Domain;
  /**
   * The period it belongs to, and the ring it is seeded on.
   *
   * It used to be `depth`, the longest chain of prerequisites behind a node,
   * and the two answer different questions. Depth said how far into *this
   * table* something is, so the rings were an artefact of how the tech tree
   * happens to be wired; age says how far into *history* it is, which is what
   * a picture of a tech tree is for. `bow` and `carpentry` sit three and four
   * prerequisites deep and are both Mesolithic, and drawing them on the same
   * ring is the whole gain.
   */
  age: AgeId;
  /** The web this technology lives in. A sub-web's own gate is drawn in it too, as its anchor. */
  web: WebId;
  /**
   * Which ring, counting only periods something in the table actually belongs
   * to.
   *
   * Not `ageIndex`, deliberately. Nothing in the table is Chalcolithic, so an
   * absolute index would seed `writing` two empty rings further out than
   * anything it touches and leave the relaxation to drag it back in over a
   * gap it never needed to cross.
   */
  ring: number;
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
  /** Which web this is the arrangement of. */
  web: WebId;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  /** Extent of `bounds`, margin included. */
  width: number;
  height: number;
  /**
   * The box that holds every node plus a node's own margin, in the same
   * coordinates as `x` and `y`.
   *
   * Not `0..width` any more. Coordinates are *stable*: a node placed once keeps
   * its exact `x, y` for the life of the layout, so a node added later may land
   * on the negative side of the first ones and the box simply grows to hold it.
   * The first layout is shifted to start at 0, as it always was; only growth
   * can reach below it.
   */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * Where the middle of the seeding sat after the first layout's shift, so a
   * node that arrives later is seeded in the same sector the first ones were.
   */
  origin: { x: number; y: number };
}

export interface LayOutOptions {
  /**
   * The arrangement to extend. Every node in it that is still a member of the
   * web keeps its coordinates exactly; only members it has no place for are
   * relaxed. The argument is never modified.
   */
  previous?: WebLayout | null;
  /**
   * Which technologies the web's own nodes are. Defaults to `techsOfWeb(web)`,
   * which is all the screen ever uses; the tests pass a prefix of it to stand
   * in for a table that grows between two layouts.
   */
  members?: readonly Tech[];
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

/** How far apart consecutive period rings start out. */
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
 * Longest rather than shortest: a node reachable by both a short and a long
 * route is as far into the table as its longest route says it is.
 * `tech.test.ts` already asserts the graph is acyclic, so this terminates.
 *
 * **It no longer sets the radius** — the period does, see `LaidOutNode.age`.
 * Kept, and still tested, because it is the one statement anything makes about
 * the *shape* of the table rather than its contents, and because the ring test
 * uses it to prove the two are genuinely different questions: `bow` and
 * `fish_trap` are three and four deep and both Mesolithic.
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

/**
 * The periods the table actually uses, earliest first.
 *
 * Derived rather than written down: a period gains its ring the moment the
 * first node dated to it ships, and loses it again if that node ever goes, so
 * there is no second list to fall out of step with `TECH`.
 */
export function webRings(): AgeId[] {
  const used = new Set<AgeId>(TECHS.map(tech => TECH[tech].age));
  return AGES.filter(age => used.has(age));
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
    case 'wanting': return 'wanting:' + ingredient.drive;
    case 'place': return 'place:' + ingredient.biome;
    case 'saw': return 'saw:' + ingredient.what;
    case 'season': return 'season:' + ingredient.season;
  }
}

/**
 * Every edge the picture draws, both kinds.
 *
 * Over `members` when given (a web draws only the edges between nodes it shows:
 * an edge to a node on another web would name a node the player may not know
 * exists), and over the whole table otherwise. Computed per web rather than
 * once and filtered, so the shared-spark degree cap is spent only on edges that
 * are drawn and one web's relations cannot crowd another's out.
 */
export function webEdges(members?: readonly Tech[]): LaidOutEdge[] {
  const inside = members ? new Set(members) : null;
  const universe = inside ? TECHS.filter(tech => inside.has(tech)) : TECHS;
  const edges: LaidOutEdge[] = [];
  for (const tech of universe) {
    for (const required of TECH[tech].requires) {
      if (inside && !inside.has(required)) continue;
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
  for (const tech of universe) keys.set(tech, ingredientKeys(tech));
  const candidates: { a: Tech; b: Tech; shared: number; crossDomain: boolean }[] = [];
  for (let i = 0; i < universe.length; i++) {
    for (let j = i + 1; j < universe.length; j++) {
      const a = universe[i]!;
      const b = universe[j]!;
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
 * Lays one web out — and, given the arrangement it had before, only the nodes
 * that are new.
 *
 * M15 phase 13c, the fix for the bug `docs/bugs.md` filed as "the tech web's
 * arrangement shifted": the whole picture used to be relaxed from scratch, so
 * adding one technology (or retuning one constant) moved every node on it, and a
 * player who had learned where `cooking` sits found it somewhere else. Now a
 * node that has a place keeps it exactly. The newcomers are seeded where the
 * first layout would have seeded them, relaxed with the placed nodes *frozen*
 * (`lockX`/`lockY`: they still push and pull, but the result is discarded), and
 * pushed clear of everyone by `settleOverlaps`, which also respects the locks.
 * They arrive in `TECHS` order, which is what makes this deterministic.
 *
 * A web is its own members and, for a sub-web, its gate: the gate is drawn as
 * the web's root so that every edge has somewhere to start, and it is a main-web
 * node the player already knows (a sub-web is only ever opened from a gate they
 * know). Nothing else from another web is drawn, and no edge reaches one.
 *
 * Takes no box to fit into: `TechWeb.ts` owns a pan-and-zoom viewport, so the
 * layout only has to give every node a well-defined, non-overlapping position.
 * The first layout of a web is shifted to start at the margin; later ones are
 * not, because shifting would move the nodes this exists to keep still.
 */
export function layOutWeb(web: WebId = 'main', options: LayOutOptions = {}): WebLayout {
  const gate = WEBS[web].gate;
  const own = new Set<Tech>(options.members ?? techsOfWeb(web));
  const shown = TECHS.filter(tech => own.has(tech) || tech === gate);
  const previous = options.previous ?? null;
  const kept = new Map<Tech, LaidOutNode>();
  for (const node of previous?.nodes ?? []) if (shown.includes(node.tech)) kept.set(node.tech, node);
  const origin = previous ? previous.origin : { x: 0, y: 0 };

  // Seed: each domain owns an angular sector, and the period sets the radius —
  // so the picture reads outward as history as well as around as subject
  // matter. The relaxation below only ever adjusts this, so the clusters
  // survive it.
  const rings = webRings();
  const byDomain = new Map<Domain, Tech[]>();
  for (const domain of DOMAINS) byDomain.set(domain, []);
  for (const tech of shown) byDomain.get(TECH[tech].domain)!.push(tech);
  const sector = (Math.PI * 2) / DOMAINS.length;
  const seedOf = (tech: Tech): { x: number; y: number } => {
    const domain = TECH[tech].domain;
    const members = byDomain.get(domain)!;
    const centre = DOMAINS.indexOf(domain) * sector - Math.PI / 2;
    // Fan the members of one domain across its sector rather than stacking
    // them on the sector's spine, which put same-depth siblings exactly on
    // top of each other and left the relaxation to guess which way to break
    // the tie.
    const spread = members.length <= 1
      ? 0
      : (members.indexOf(tech) / (members.length - 1) - 0.5) * sector * 0.72;
    const angle = centre + spread;
    const radius = INNER_RADIUS + rings.indexOf(TECH[tech].age) * RING_GAP;
    return { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
  };

  const work: (LaidOutNode & GraphNode)[] = shown.map(tech => {
    const old = kept.get(tech);
    const at = old ?? seedOf(tech);
    return {
      id: tech, tech, domain: TECH[tech].domain, age: TECH[tech].age, web: webOf(tech),
      ring: rings.indexOf(TECH[tech].age), x: at.x, y: at.y,
      lockX: old !== undefined, lockY: old !== undefined,
    };
  });

  const edges = webEdges(shown);
  if (work.some(node => !node.lockX)) {
    const springs: GraphEdge[] = edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      rest: edge.kind === 'shared' ? SPRING_SHARED : edge.crossDomain ? SPRING_FAR : SPRING_NEAR,
      k: edge.kind === 'shared' ? SHARED_K : SPRING_K,
    }));
    relax(work, springs, { iterations: ITERATIONS, repulsion: REPULSION, centring: CENTRING });
    settleOverlaps(work, NODE_RADIUS * 2);
  }

  if (!previous) {
    let minX = Infinity, minY = Infinity;
    for (const node of work) { minX = Math.min(minX, node.x); minY = Math.min(minY, node.y); }
    if (work.length > 0) {
      origin.x = NODE_RADIUS - minX;
      origin.y = NODE_RADIUS - minY;
    }
    shiftToOrigin(work, NODE_RADIUS);
  }

  // The locks were scaffolding for the relaxation, not part of the answer.
  const nodes: LaidOutNode[] = work.map(({ lockX: _x, lockY: _y, ...node }) => node);
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const node of nodes) {
    bounds.minX = Math.min(bounds.minX, node.x - NODE_RADIUS);
    bounds.maxX = Math.max(bounds.maxX, node.x + NODE_RADIUS);
    bounds.minY = Math.min(bounds.minY, node.y - NODE_RADIUS);
    bounds.maxY = Math.max(bounds.maxY, node.y + NODE_RADIUS);
  }
  if (nodes.length === 0) {
    bounds.minX = bounds.minY = 0;
    bounds.maxX = bounds.maxY = NODE_RADIUS * 2;
  }
  return {
    web, nodes, edges, bounds, origin: { x: origin.x, y: origin.y },
    width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY,
  };
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
  // M15 phase 37: the metals. A verdigris green, the colour copper turns, and
  // a hue nothing else in the table is near.
  metal: '#3fb8a0',
};
