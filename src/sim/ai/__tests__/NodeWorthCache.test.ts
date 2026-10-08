import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../../core/Simulation.ts';
import { Brain, type BrainContext } from '../Brain.ts';
import type { ResourceNode } from '../../entities/ResourceNode.ts';

describe('Brain node worth cache', () => {
  it('memoizes positive and zero worth by person, item, and score', () => {
    const sim = new Simulation({ seed: 'node-worth-cache', sightRadius: 10,
      world: { width: 80, height: 80, predators: 0 },
      population: { bands: 1, peoplePerBand: 4 }, ai: { choiceSpread: 0 } });
    const [person, otherPerson] = sim.livingPeople();
    const candidates = ['berries', 'sticks'].map(itemId => {
      const nodes = sim.nodes.filter(node => node.itemId === itemId).slice(0, 3);
      expect(nodes).toHaveLength(3);
      return nodes;
    }).flat();
    for (const node of sim.nodes) node.amount = 0;
    for (const node of candidates) node.amount = node.def.maxAmount;
    person.action = 'idle';
    person.actionTimer = 0;
    person.order = null;

    const brain = (sim as unknown as { brain: Brain }).brain;
    let context: BrainContext | null = null;
    const score = brain.score.bind(brain);
    vi.spyOn(brain, 'score').mockImplementation((scoredPerson, brainContext) => {
      if (scoredPerson === person) context = brainContext;
      return score(scoredPerson, brainContext);
    });
    sim.step();
    expect(context).not.toBeNull();

    // Force the same food predicate to inspect several equal harvest items.
    // The real spatial hash also prunes by distance, which would hide these
    // repeated calls and make this test depend on cell traversal details.
    let exerciseFor: typeof person | typeof otherPerson = person;
    let exercised = false;
    const findNode = (brain as unknown as { findNode: (...args: any[]) => ResourceNode | null }).findNode.bind(brain);
    vi.spyOn(brain as unknown as { findNode: (...args: any[]) => ResourceNode | null }, 'findNode')
      .mockImplementation((who: unknown, brainContext: unknown, filter: (node: ResourceNode) => boolean, ...rest: unknown[]) => {
        if (who === exerciseFor && !exercised) {
          exercised = true;
          for (const node of candidates) filter(node);
          return null;
        }
        return findNode(who, brainContext, filter, ...rest);
      });
    const worth = vi.spyOn(brain as unknown as {
      nodeWorth: (who: unknown, node: ResourceNode, ctx: unknown) => number;
    }, 'nodeWorth');
    const evaluate = (who: typeof person | typeof otherPerson) => {
      exerciseFor = who;
      exercised = false;
      brain.score(who, context!);
    };
    const callsFor = (who: typeof person | typeof otherPerson, itemId: string) =>
      worth.mock.calls.filter(([calledPerson, node]) => calledPerson === who && node.itemId === itemId).length;

    evaluate(person);
    expect(callsFor(person, 'berries')).toBe(1);
    expect(callsFor(person, 'sticks')).toBe(1); // Zero is cached too.

    evaluate(otherPerson);
    expect(callsFor(otherPerson, 'berries')).toBe(1);
    expect(callsFor(otherPerson, 'sticks')).toBe(1);

    // A changed appetite and learned aversion must be read by the next score.
    person.macroBalance.protein = 0;
    person.beliefs.learn('sick:berries', 1, 1, 'own', sim.time.tick);
    evaluate(person);
    expect(callsFor(person, 'berries')).toBe(2);
    expect(callsFor(person, 'sticks')).toBe(2);
  });
});