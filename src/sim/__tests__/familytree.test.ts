/**
 * The family tree's layout.
 *
 * Same two properties as `techweb.test.ts`, for the same reasons: the arrangement
 * must be deterministic, and nothing may land on top of anything else. A third
 * property is specific to this graph — rows stay rows, since `y` is pinned to a
 * generation and a family tree that drifted into a circle would not read as one.
 */
import { describe, it, expect } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { layOutFamily, NODE_RADIUS } from '../../ui/FamilyTreeLayout.ts';

/** A small family: two grandparents, two parents, the subject, a spouse,
 *  two children (one married, with a grandchild), and one sibling. */
function makeFamily(): { subject: Person; peopleById: Map<number, Person> } {
  const rng = new RNG('family-test');
  const make = (name: string) => new Person(name, 0, 0, 0, rng);

  const grandma = make('Grandma');
  const grandpa = make('Grandpa');
  const mother = make('Mother');
  mother.motherId = grandma.id;
  mother.fatherId = grandpa.id;
  grandma.childIds.push(mother.id);
  grandpa.childIds.push(mother.id);

  const father = make('Father');
  const subject = make('Subject');
  subject.motherId = mother.id;
  subject.fatherId = father.id;
  mother.childIds.push(subject.id);
  father.childIds.push(subject.id);

  const sibling = make('Sibling');
  sibling.motherId = mother.id;
  sibling.fatherId = father.id;
  mother.childIds.push(sibling.id);
  father.childIds.push(sibling.id);

  const spouse = make('Spouse');
  subject.spouseId = spouse.id;
  spouse.spouseId = subject.id;

  const child = make('Child');
  child.motherId = spouse.id;
  child.fatherId = subject.id;
  subject.childIds.push(child.id);
  spouse.childIds.push(child.id);

  const childSpouse = make('ChildSpouse');
  child.spouseId = childSpouse.id;
  childSpouse.spouseId = child.id;

  const grandchild = make('Grandchild');
  grandchild.motherId = childSpouse.id;
  grandchild.fatherId = child.id;
  child.childIds.push(grandchild.id);
  childSpouse.childIds.push(grandchild.id);

  const peopleById = new Map<number, Person>();
  for (const person of [
    grandma, grandpa, mother, father, subject, sibling, spouse, child, childSpouse, grandchild,
  ]) {
    peopleById.set(person.id, person);
  }
  return { subject, peopleById };
}

describe('the family tree layout', () => {
  it('is byte-identical between two runs of the same family', () => {
    const { subject, peopleById } = makeFamily();
    const first = layOutFamily(subject, peopleById, 900, 600);
    const second = layOutFamily(subject, peopleById, 900, 600);
    expect(JSON.stringify(second.nodes)).toBe(JSON.stringify(first.nodes));
  });

  it('places the subject, and everyone gathered is placed exactly once', () => {
    const { subject, peopleById } = makeFamily();
    const layout = layOutFamily(subject, peopleById, 900, 600);
    const ids = layout.nodes.map(n => n.personId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(subject.id);
    expect(layout.nodes.find(n => n.personId === subject.id)!.isSubject).toBe(true);
  });

  it('gathers grandparents, siblings, a spouse, children and a grandchild', () => {
    const { subject, peopleById } = makeFamily();
    const layout = layOutFamily(subject, peopleById, 900, 600);
    // Ten people were wired up in `makeFamily`; every one of them is within
    // the two generations up and down `FamilyTreeLayout` traces.
    expect(layout.nodes.length).toBe(peopleById.size);
  });

  it('keeps ancestors above the subject and descendants below', () => {
    const { subject, peopleById } = makeFamily();
    const layout = layOutFamily(subject, peopleById, 900, 600);
    const byName = (id: number) => peopleById.get(id)!.name;
    const y = (name: string) => layout.nodes.find(n => byName(n.personId) === name)!.y;

    expect(y('Grandma')).toBeLessThan(y('Mother'));
    expect(y('Mother')).toBeLessThan(y('Subject'));
    expect(y('Subject')).toBeLessThan(y('Child'));
    expect(y('Child')).toBeLessThan(y('Grandchild'));
    // Spouses and siblings share a row.
    expect(y('Subject')).toBeCloseTo(y('Spouse'), 5);
    expect(y('Subject')).toBeCloseTo(y('Sibling'), 5);
  });

  it('never puts one person on top of another', () => {
    const { subject, peopleById } = makeFamily();
    const layout = layOutFamily(subject, peopleById, 900, 600);
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]!;
        const b = layout.nodes[j]!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance).toBeGreaterThan(NODE_RADIUS);
      }
    }
  });

  it('keeps every node inside the box it was given', () => {
    const { subject, peopleById } = makeFamily();
    const layout = layOutFamily(subject, peopleById, 900, 600);
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(-1);
      expect(node.x).toBeLessThanOrEqual(901);
      expect(node.y).toBeGreaterThanOrEqual(-1);
      expect(node.y).toBeLessThanOrEqual(601);
    }
  });

  it('handles a subject with no family at all', () => {
    const rng = new RNG('lonely-test');
    const alone = new Person('Alone', 0, 0, 0, rng);
    const peopleById = new Map([[alone.id, alone]]);
    const layout = layOutFamily(alone, peopleById, 900, 600);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]!.isSubject).toBe(true);
  });
});
