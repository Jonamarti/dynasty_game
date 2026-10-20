import { describe, expect, it, vi } from 'vitest';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { Simulation } from '../core/Simulation.ts';

describe('M16 2.11: talk under thirst', () => {
  it('does not score talk when thirst is past the work limit', () => {
    const sim = new Simulation({ seed: 'm16-talk-under-thirst',
      world: { width: 48, height: 48, predators: 0, gameHerds: 0 },
      population: { bands: 1, peoplePerBand: 4 } });
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    const companion = sim.livingPeople().find(candidate => candidate.id !== person.id && !candidate.isChild)!;
    sim.peopleHash.remove(companion);
    companion.x = person.x + 1;
    companion.y = person.y;
    sim.peopleHash.insert(companion);
    person.needs.company = 100;
    person.socialCooldownUntil = 0;
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    let talkScore: number | undefined;
    let comfortableTalkScore: number | undefined;
    let hasCompanion = false;
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx: BrainContext) => {
      if (actor === person && talkScore === undefined) {
        companion.x = actor.x + 1;
        companion.y = actor.y;
        ctx.peopleHash.rebuild(sim.people);
        ctx.sightRadius = 200;
        vi.spyOn(ctx.world, 'sameRegion').mockReturnValue(true);
        const relationship = ctx.relationships.peek(actor.id, companion.id);
        if (relationship) relationship.lastContact = -100000;
        actor.socialCooldownUntil = 0;
        actor.action = 'idle';
        actor.needs.company = 100;
        actor.needs.thirst = 0;
        comfortableTalkScore = score(actor, ctx).scores.find(row => row.id === 'talk')?.score ?? 0;
        actor.needs.thirst = sim.config.needs.workLimits.thirst + 1;
        const result = score(actor, ctx);
        hasCompanion = result.found.companion !== null;
        talkScore = result.scores.find(row => row.id === 'talk')?.score ?? 0;
        return result;
      }
      return score(actor, ctx);
    });
    try {
      for (let i = 0; i < 30 && talkScore === undefined; i++) sim.step();
    } finally {
      spy.mockRestore();
    }
    expect(talkScore, 'the controlled person should receive a brain score').toBeDefined();
    expect(hasCompanion, 'the control must have an available conversation partner').toBe(true);
    expect(comfortableTalkScore, 'the fixture should score a conversation when comfortable').toBeGreaterThan(0);
    expect(talkScore).toBe(0);
  });
});
