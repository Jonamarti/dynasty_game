import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import type { Person } from '../entities/Person.ts';
import { availableActions, type ActionOption, type CatalogContext } from '../ai/ActionCatalog.ts';
import { RelationshipGraph } from '../social/Relationships.ts';

function flatten(options: ActionOption[]): ActionOption[] {
  return options.flatMap(option => [option, ...flatten(option.children ?? [])]);
}

describe('M16 stranger knowledge in the action menu', () => {
  it('m16-stranger-menu-does-not-reveal-known-tech', () => {
    const sim = new Simulation(makeConfig({ seed: 'm16-stranger-menu',
      world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } }));
    const [actor, informed, uninformed] = sim.people as Person[];
    actor!.age = informed!.age = uninformed!.age = 30 * actor!.daysPerYear;
    actor!.knownTech.add('hafting');
    actor!.knownTech.add('spear');
    actor!.knownTech.add('firemaking');
    actor!.ideas.push({ tech: 'spear', stage: 'researching', insight: 0.5,
      story: 'a test idea', conceivedTick: 0, effort: 0, discussedWith: [],
      trials: 0, proof: 0, failedTests: 0, tries: 0 });
    informed!.knownTech.add('hafting');
    informed!.knownTech.add('spear');
    informed!.knownTech.add('firemaking');

    const ctx: CatalogContext = { world: sim.world, nearWater: false,
      relationships: new RelationshipGraph() };
    const menu = (target: Person) => flatten(availableActions(actor!, {
      kind: 'person', x: target.x, y: target.y, person: target,
    }, ctx)).map(option => [option.id, option.enabled]);

    expect(menu(informed!)).toEqual(menu(uninformed!));
  });

  it('m16-teach-order-explains-when-there-is-nothing-new-to-teach', () => {
    const sim = new Simulation(makeConfig({ seed: 'm16-teach-refusal',
      world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } }));
    const [teacher, pupil] = sim.people as Person[];
    teacher!.age = pupil!.age = 30 * teacher!.daysPerYear;
    teacher!.knownTech.add('firemaking');
    pupil!.knownTech.add('firemaking');
    teacher!.isPlayer = true;
    teacher!.x = pupil!.x;
    teacher!.y = pupil!.y;

    expect(sim.order(teacher!, 'teach', { personId: pupil!.id, x: pupil!.x, y: pupil!.y })).toBe(true);
    sim.step();

    expect(sim.interruptions.find(event => event.personId === teacher!.id)?.reason)
      .toBe('learned_nothing');
  });

  it('m16-discuss-order-explains-when-a-stranger-cannot-help', () => {
    const sim = new Simulation(makeConfig({ seed: 'm16-discuss-refusal',
      world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } }));
    const [speaker, stranger] = sim.people as Person[];
    speaker!.age = stranger!.age = 30 * speaker!.daysPerYear;
    speaker!.ideas.push({ tech: 'spear', stage: 'researching', insight: 0.5,
      story: 'a test idea', conceivedTick: 0, effort: 0, discussedWith: [],
      trials: 0, proof: 0, failedTests: 0, tries: 0 });
    speaker!.isPlayer = true;
    speaker!.x = stranger!.x;
    speaker!.y = stranger!.y;

    expect(sim.order(speaker!, 'discuss', {
      personId: stranger!.id, techId: 'spear', x: stranger!.x, y: stranger!.y,
    })).toBe(true);
    sim.step();

    expect(sim.interruptions.find(event => event.personId === speaker!.id)?.reason)
      .toBe('partner_ignorant');
  });
});
