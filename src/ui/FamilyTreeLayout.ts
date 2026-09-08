/**
 * Where each relative sits on the family tree, worked out once and cached.
 *
 * Reuses `GraphLayout`'s relaxation engine rather than a fresh one — see its
 * header for why a second copy of that arithmetic is worth avoiding — but
 * seeds and constrains it differently from the tech web. A family reads top
 * to bottom, ancestors above descendants, not out from a centre: `y` is
 * **pinned** to a generation the moment a person is found, and only `x` is
 * ever relaxed, which is what keeps a couple together and a child roughly
 * under its parents without the picture drifting into a family circle.
 */
import type { Person } from '../sim/entities/Person.ts';
import { relax, settleOverlaps, fitInto, type GraphEdge, type GraphNode } from './GraphLayout.ts';

export interface FamilyNode extends GraphNode {
  personId: number;
  /** Relative to the subject: negative is an ancestor, positive a descendant. */
  generation: number;
  /** True for the person the tree was opened on. */
  isSubject: boolean;
}

export interface FamilyEdgeInfo {
  from: number;
  to: number;
  kind: 'parent' | 'spouse';
}

export interface FamilyLayout {
  nodes: FamilyNode[];
  edges: FamilyEdgeInfo[];
  width: number;
  height: number;
}

/** Generations traced upward and downward from the subject. */
const ANCESTOR_SPAN = 2;
const DESCENDANT_SPAN = 2;

/** Half the space a person needs to themselves. */
export const NODE_RADIUS = 44;

/** Vertical distance between one generation and the next. */
const ROW_GAP = 108;

/** Horizontal seed spacing within a generation, before relaxation. */
const SEED_GAP = 130;

const ITERATIONS = 200;
const REPULSION = 7000;
const SPOUSE_K = 0.05;
const PARENT_K = 0.02;
const CENTRING = 0.0012;
/** Rest length of a marriage: close, but not on top of each other. */
const SPOUSE_REST = 70;
/** Rest length pulling a child roughly under the midpoint of its parents. */
const PARENT_REST = 90;

/**
 * Collects everyone within reach of `subject` along blood and marriage —
 * parents and grandparents, siblings, a spouse, children and grandchildren,
 * with each descendant's own spouse shown as a leaf but not traced further.
 * In-laws' own parents are deliberately out of scope: tracing a child's
 * spouse's family too would pull in a second, unrelated tree.
 */
function collectFamily(
  subject: Person,
  peopleById: ReadonlyMap<number, Person>
): { members: Map<number, { person: Person; generation: number }>; edges: FamilyEdgeInfo[] } {
  const members = new Map<number, { person: Person; generation: number }>();
  const edges: FamilyEdgeInfo[] = [];
  const addEdge = (from: number, to: number, kind: FamilyEdgeInfo['kind']) => {
    if (!edges.some(e => e.kind === kind &&
      ((e.from === from && e.to === to) || (e.from === to && e.to === from)))) {
      edges.push({ from, to, kind });
    }
  };
  const visit = (person: Person, generation: number): void => {
    const existing = members.get(person.id);
    if (existing) {
      // Reached by a shorter or more central route the second time: keep
      // whichever generation is closer to the subject's own row.
      if (Math.abs(generation) < Math.abs(existing.generation)) existing.generation = generation;
      return;
    }
    members.set(person.id, { person, generation });
  };

  visit(subject, 0);

  // Ancestors, generation by generation, each parent edge drawn as it is found.
  let frontier = [subject];
  for (let up = 1; up <= ANCESTOR_SPAN; up++) {
    const next: Person[] = [];
    for (const person of frontier) {
      for (const parentId of [person.motherId, person.fatherId]) {
        if (parentId === null) continue;
        const parent = peopleById.get(parentId);
        if (!parent) continue;
        visit(parent, -up);
        addEdge(parent.id, person.id, 'parent');
        next.push(parent);
      }
    }
    frontier = next;
  }

  // Siblings: not stored on `Person` directly, so found by scanning for
  // anyone else who shares one of the subject's own parents. Left out of
  // grandparents' generation, since a great-uncle is a different kind of
  // relative from the tree this is trying to be.
  if (subject.motherId !== null || subject.fatherId !== null) {
    for (const other of peopleById.values()) {
      if (other.id === subject.id) continue;
      const sharesParent =
        (subject.motherId !== null && other.motherId === subject.motherId) ||
        (subject.fatherId !== null && other.fatherId === subject.fatherId);
      if (!sharesParent) continue;
      visit(other, 0);
      if (other.motherId !== null) addEdge(other.motherId, other.id, 'parent');
      if (other.fatherId !== null) addEdge(other.fatherId, other.id, 'parent');
    }
  }

  // The subject's own spouse.
  if (subject.spouseId !== null) {
    const spouse = peopleById.get(subject.spouseId);
    if (spouse) {
      visit(spouse, 0);
      addEdge(subject.id, spouse.id, 'spouse');
    }
  }

  // Descendants, generation by generation. Each child's own spouse is shown
  // at the child's row but is a leaf: their parents are not traced.
  frontier = [subject, ...(subject.spouseId !== null ? [peopleById.get(subject.spouseId)!] : [])]
    .filter((p): p is Person => !!p);
  for (let down = 1; down <= DESCENDANT_SPAN; down++) {
    // Deduplicated by id: a child appears under both of its parents in
    // `frontier`, and without this a family with several children each
    // having children of their own would walk the same grandchild twice.
    const next = new Map<number, Person>();
    for (const parent of frontier) {
      for (const childId of parent.childIds) {
        const child = peopleById.get(childId);
        if (!child) continue;
        visit(child, down);
        addEdge(parent.id, child.id, 'parent');
        next.set(child.id, child);
        if (child.spouseId !== null) {
          const spouse = peopleById.get(child.spouseId);
          if (spouse) {
            visit(spouse, down);
            addEdge(child.id, spouse.id, 'spouse');
          }
        }
      }
    }
    frontier = [...next.values()];
  }

  return { members, edges };
}

/**
 * Lays a family out inside a box, centred on `subject`.
 *
 * Called fresh each time the panel opens on somebody new — unlike the tech
 * web's one cached arrangement, a family tree's very shape changes with who
 * it is drawn for, so there is nothing here worth caching across subjects.
 */
export function layOutFamily(
  subject: Person,
  peopleById: ReadonlyMap<number, Person>,
  width: number,
  height: number
): FamilyLayout {
  const { members, edges } = collectFamily(subject, peopleById);

  const byGeneration = new Map<number, { person: Person; generation: number }[]>();
  for (const entry of members.values()) {
    const row = byGeneration.get(entry.generation);
    if (row) row.push(entry);
    else byGeneration.set(entry.generation, [entry]);
  }
  // Stable order within a row: by id, so the seed (and therefore the
  // relaxed result) is deterministic regardless of `Map` iteration order.
  for (const row of byGeneration.values()) row.sort((a, b) => a.person.id - b.person.id);

  const nodes: FamilyNode[] = [];
  for (const [generation, row] of byGeneration) {
    row.forEach((entry, index) => {
      const x = (index - (row.length - 1) / 2) * SEED_GAP;
      nodes.push({
        id: String(entry.person.id),
        personId: entry.person.id,
        generation,
        isSubject: entry.person.id === subject.id,
        x,
        y: generation * ROW_GAP,
        lockY: true,
      });
    });
  }

  const springs: GraphEdge[] = edges.map(edge => ({
    from: String(edge.from),
    to: String(edge.to),
    rest: edge.kind === 'spouse' ? SPOUSE_REST : PARENT_REST,
    k: edge.kind === 'spouse' ? SPOUSE_K : PARENT_K,
  }));

  relax(nodes, springs, { iterations: ITERATIONS, repulsion: REPULSION, centring: CENTRING });
  settleOverlaps(nodes, NODE_RADIUS * 2);

  return {
    nodes: fitInto(nodes, width, height, NODE_RADIUS, 1.3),
    edges,
    width,
    height,
  };
}
