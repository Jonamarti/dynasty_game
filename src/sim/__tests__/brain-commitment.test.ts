import { describe, expect, it, vi } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { actionsForDrive, chooseCommitmentDrive, commitmentGoal, shouldBreakCommitment } from '../ai/Commitment.ts';
import type { DrivePressures } from '../ai/Drives.ts';
import { Simulation } from '../core/Simulation.ts';
import { ItemPile } from '../entities/ItemPile.ts';


function scriptedThink(sim: Simulation, person: ReturnType<Simulation['people']['find']> & {}, rows: { id: string; score: number }[], patch: Record<string, unknown>): string | null {
  const brain = (sim as any).brain;
  const realThink = brain.think.bind(brain);
  const realScore = brain.score.bind(brain);
  let selected: string | null | undefined;
  vi.spyOn(brain, 'think').mockImplementation((candidate, ctx, allowed) => {
    if (candidate === person && selected === undefined) {
      const found = realScore(candidate, ctx).found;
      vi.spyOn(brain, 'score').mockImplementation((target, scoreCtx) => target === person
        ? { scores: rows, found: { ...found, ...patch } as typeof found }
        : realScore(target, scoreCtx));
    }
    const result = realThink(candidate, ctx, allowed);
    if (candidate === person && selected === undefined) selected = result;
    return result;
  });
  for (let i = 0; i < 30 && selected === undefined; i++) sim.step();
  if (selected === undefined) throw new Error('fixture person did not think');
  return selected;
}

const pressures = (overrides: Partial<DrivePressures> = {}): DrivePressures => ({
  hunger: 0, thirst: 0, rest: 0, warmth: 0, company: 0, home: 0, variety: 1, safety: 0,
  ...overrides,
});

describe('action commitment policy', () => {
  it('steers to water for thirst, never credits meat as water, and leaves calm work available', () => {
    const waterSim = new Simulation({ seed: 'commitment-water', world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 2, peoplePerBand: 4 } });
    waterSim.possessFirst();
    const thirsty = waterSim.people.find(candidate => !candidate.isPlayer)!;
    thirsty.needs.thirst = 99; thirsty.needs.hunger = 85;
    const action = scriptedThink(waterSim, thirsty, [{ id: 'eat', score: 200 }, { id: 'drink', score: 100 }],
      { foodToEat: 'meat', water: { x: thirsty.x + 2, y: thirsty.y } });
    expect(action).toBe('drink');
    expect(thirsty.commitment?.drive).toBe('thirst');

    const fruitSim = new Simulation({ seed: 'commitment-hydrating-fruit', world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 2, peoplePerBand: 4 } });
    fruitSim.possessFirst();
    const fruitEater = fruitSim.people.find(candidate => !candidate.isPlayer)!;
    fruitEater.needs.thirst = 99; fruitEater.needs.hunger = 0; fruitEater.inventory.add('apple', 1);
    const fruitAction = scriptedThink(fruitSim, fruitEater, [{ id: 'craft', score: 200 }, { id: 'eat', score: 100 }],
      { foodToEat: 'apple', water: null, recipe: 'basket' });
    expect(fruitAction).toBe('eat');
    // Eating carried fruit is immediate, so it answers thirst but has no route to persist.
    expect(fruitEater.commitment).toBeNull();

    const meatSim = new Simulation({ seed: 'commitment-meat', world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 2, peoplePerBand: 4 } });
    meatSim.possessFirst();
    const hungry = meatSim.people.find(candidate => !candidate.isPlayer)!;
    hungry.needs.thirst = 99; hungry.needs.hunger = 20; hungry.inventory.add('meat', 1);
    const meatAction = scriptedThink(meatSim, hungry, [{ id: 'eat', score: 100 }], { foodToEat: 'meat' });
    expect(meatAction).toBe('eat');
    expect(hungry.commitment?.drive).not.toBe('thirst');

    const calmSim = new Simulation({ seed: 'commitment-calm-work', world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 2, peoplePerBand: 4 } });
    calmSim.possessFirst();
    const calm = calmSim.people.find(candidate => !candidate.isPlayer)!;
    const workAction = scriptedThink(calmSim, calm, [{ id: 'craft', score: 100 }], { recipe: 'basket' });
    expect(workAction).toBe('craft');
  });

  it('steers a hungry NPC to a real edible pickup target even when another row scores higher', () => {
    const sim = new Simulation({ seed: 'commitment-pickup', world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 2, peoplePerBand: 4 } });
    sim.possessFirst();
    const person = sim.people.find(candidate => !candidate.isPlayer)!;
    person.needs.hunger = 85; person.needs.thirst = 0;
    const pile = new ItemPile(person.x + 3, person.y, null, sim.time.tick);
    pile.contents.add('meat', 4);
    sim.piles.push(pile); sim.pilesById.set(pile.id, pile); sim.pileHash.rebuild(sim.piles);
    const action = scriptedThink(sim, person, [{ id: 'talk', score: 200 }, { id: 'pickup', score: 50 }],
      { pickupPile: pile, pickupItem: 'meat' });
    expect(action).toBe('pickup');
    expect(person.commitment?.drive).toBe('hunger');
    expect(person.commitment?.goal).toContain(String(pile.id));
  });

  it('breaks a critical route for a much worse competing need but holds near-equal critical needs', () => {
    const make = (seed: string, hunger: number, thirst: number) => {
      const sim = new Simulation({ seed, world: { width: 48, height: 48, treeDensity: 0.1 },
        population: { bands: 2, peoplePerBand: 4 } });
      sim.possessFirst();
      const person = sim.people.find(candidate => !candidate.isPlayer)!;
      person.action = 'wander'; person.actionTimer = 0; person.order = null;
      person.targetX = person.x + 20; person.targetY = person.y; person.needs.hunger = hunger; person.needs.thirst = thirst;
      person.commitment = { action: 'wander', drive: 'hunger', baselinePressure: 0.8, goal: commitmentGoal('wander', person) };
      return { sim, person };
    };
    const dominated = make('commitment-critical-dominance', 85, 99);
    dominated.sim.step();
    expect(dominated.person.commitment?.drive).not.toBe('hunger');
    const tied = make('commitment-critical-tie', 89, 88);
    tied.sim.step();
    expect(tied.person.commitment?.drive).toBe('hunger');
  });

  it('holds a real route without re-scoring and still observes, then reports an urgent stop', () => {
    const sim = new Simulation({ seed: 'commitment-route', world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 2, peoplePerBand: 4 } });
    sim.possessFirst();
    const person = sim.people.find(candidate => !candidate.isPlayer)!;
    person.action = 'wander'; person.actionTimer = 0; person.order = null;
    person.targetX = person.x + 20; person.targetY = person.y;
    person.commitment = { action: 'wander', drive: null, baselinePressure: 1, goal: commitmentGoal('wander', person) };
    Object.defineProperty(person, 'thinkOffset', { value: 1 });
    const think = vi.spyOn((sim as any).brain, 'think');
    const observe = vi.spyOn(sim as any, 'observePlaces');
    for (let i = 0; i < 15; i++) sim.step();
    expect(think.mock.calls.some(([candidate]) => candidate === person), JSON.stringify({ action: person.action, target: [person.targetX, person.targetY], commitment: person.commitment, calls: think.mock.calls.filter(([candidate]) => candidate === person).length })).toBe(false);
    expect(observe.mock.calls.some(([candidate]) => candidate === person)).toBe(true);

    person.resume = null;
    person.lastHarmedTick = sim.time.tick + 1;
    sim.step();
    expect(sim.interruptions.some(notice => notice.personId === person.id && notice.reason === 'injured' &&
      notice.autonomousCommitment === true)).toBe(true);
    expect(person.resume).toBeNull();
  });

  it('clears stale route intent when targets or plans are cleared', () => {
    const sim = new Simulation({ seed: 'commitment-clear', world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 1, peoplePerBand: 4 } });
    const person = sim.people[0]!;
    person.commitment = { action: 'forage', drive: 'hunger', baselinePressure: 0.22, goal: 'forage' };
    person.clearTarget();
    expect(person.commitment).toBeNull();
    person.commitment = { action: 'forage', drive: 'hunger', baselinePressure: 0.22, goal: 'forage' };
    person.forgetPlans();
    expect(person.commitment).toBeNull();
  });

  it('excludes variety from choosing a trip while retaining authored drive action families', () => {
    expect(chooseCommitmentDrive(pressures(), 0.16, 0.02, new RNG(1))).toBeNull();
    expect(actionsForDrive('hunger')).toContain('forage');
  });

  it('chooses the strongest eligible need and uses only the seeded stream for close ties', () => {
    expect(chooseCommitmentDrive(pressures({ hunger: 0.25, thirst: 0.31 }), 0.16, 0.02, new RNG(1))).toBe('thirst');
    const a = new RNG(41), b = new RNG(41);
    expect(chooseCommitmentDrive(pressures({ hunger: 0.31, thirst: 0.30 }), 0.16, 0.02, a))
      .toBe(chooseCommitmentDrive(pressures({ hunger: 0.31, thirst: 0.30 }), 0.16, 0.02, b));
  });

  it('keeps destination identity stable for moving entities and distinguishes target kinds', () => {
    const target = { targetX: 2, targetY: 3, targetNodeId: 5, targetTreeId: null, targetAnimalId: null,
      targetBuildingId: null, targetPersonId: null, targetPileId: null, targetInscriptionId: null,
      targetRecipe: null, targetItemId: null, targetTech: null, targetSubjectId: null,
      targetCorpseId: null, fleeFromId: null };
    const goal = commitmentGoal('forage', target);
    expect(commitmentGoal('forage', { ...target, targetX: 11, targetY: 12 })).toBe(goal);
    expect(commitmentGoal('forage', { ...target, targetNodeId: null, targetBuildingId: 5 })).not.toBe(goal);
  });

  it('keeps a route while its driver remains competitive and yields to a clear pressure change', () => {
    expect(shouldBreakCommitment({ drive: 'hunger', baselinePressure: 0.2 },
      pressures({ hunger: 0.24, thirst: 0.28 }), 0.16, 0.08)).toBe(false);
    expect(shouldBreakCommitment({ drive: 'hunger', baselinePressure: 0.2 },
      pressures({ hunger: 0.18, thirst: 0.3 }), 0.16, 0.08)).toBe(true);
  });

  it('lets a route with no need driver yield at entry or after a large pressure rise', () => {
    expect(shouldBreakCommitment({ drive: null, baselinePressure: 0.04 },
      pressures({ company: 0.1 }), 0.16, 0.08)).toBe(false);
    expect(shouldBreakCommitment({ drive: null, baselinePressure: 0.04 },
      pressures({ company: 0.17 }), 0.16, 0.08)).toBe(true);
    expect(shouldBreakCommitment({ drive: null, baselinePressure: 0.2 },
      pressures({ company: 0.2 }), 0.16, 0.08)).toBe(false);
  });
});
