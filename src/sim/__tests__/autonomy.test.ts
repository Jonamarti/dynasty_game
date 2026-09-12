/**
 * M9 phase 6: how much the player's character looks after itself.
 *
 * These are unit tests and not `simcheck` checks, and the reason is stronger
 * here than for the other files in this folder: **no scenario can see any of
 * this at all.** The headless harness never calls `possess`, so every world
 * `sim:check` builds is one in which `autonomy` is unreachable. The only gate
 * this phase has is the one in this file.
 *
 * Every test drives `Simulation.step` rather than calling `steerPlayer`
 * directly. The two invariants worth protecting — an order always wins, held
 * keys always win — are enforced by *where* it is called from, so a test that
 * called it directly would pass with both of them broken.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import {
  NEED_ACTIONS, URGENT_MARGIN, nextAutonomy, stallReason, survivalActions, urgentNeeds,
} from '../ai/Autonomy.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'autonomy',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

/** A possessed character with nothing pressing and nothing in hand. */
function playerWithNothingPressing(sim: Simulation): Person {
  const player = sim.possessFirst()!;
  settle(player);
  return player;
}

function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.needs.company = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
  person.action = 'idle';
  person.clearTarget();
  person.order = null;
}

/**
 * Steps long enough for every think offset to have come round several times,
 * holding the needs where the test put them.
 *
 * Needs climb every tick, and each of these tests is about one need at a time:
 * without the hold, a "does nothing" test would eventually pass or fail on
 * thirst rather than on the thing it was written to measure.
 */
function steps(sim: Simulation, player: Person, count = 30): void {
  const held = { ...player.needs };
  for (let i = 0; i < count; i++) {
    sim.step();
    Object.assign(player.needs, held);
  }
}

describe('urgentNeeds', () => {
  it('fires below the killing line, not at it', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    const line = sim.config.needs.criticalThreshold - URGENT_MARGIN;

    player.needs.thirst = line - 1;
    expect(urgentNeeds(player, sim.config.needs)).toEqual([]);
    player.needs.thirst = line + 1;
    expect(urgentNeeds(player, sim.config.needs)).toEqual(['thirst']);
  });

  it('moves with the difficulty setting it is a margin under', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    player.needs.hunger = 60;
    expect(urgentNeeds(player, sim.config.needs)).toEqual([]);
    // A harder world starts taking damage sooner, so "dangerous" starts sooner.
    sim.config.needs.criticalThreshold = 70;
    expect(urgentNeeds(player, sim.config.needs)).toEqual(['hunger']);
  });

  it('reports every dangerous need, worst first', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    player.needs.hunger = 76;
    player.needs.cold = 82;
    expect(urgentNeeds(player, sim.config.needs)).toEqual(['cold', 'hunger']);
  });

  it('ignores fatigue, which has never killed anybody here', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    player.needs.fatigue = 99;
    expect(urgentNeeds(player, sim.config.needs)).toEqual([]);
  });
});

describe('survivalActions', () => {
  it('offers only the verbs that answer the needs that fired', () => {
    expect(survivalActions(['thirst'])).toEqual(new Set(['drink']));
    expect(survivalActions(['cold'])).toEqual(new Set(['shelter']));
    // The flat-allowlist version of this was written first and let a freezing
    // character pick berries on `forage`'s standing stockpiling term.
    expect(survivalActions(['cold']).has('forage')).toBe(false);
    expect(survivalActions(['cold', 'hunger'])).toEqual(
      new Set(['shelter', ...NEED_ACTIONS.hunger]));
  });

  it('never offers a fight or a nap', () => {
    const everything = survivalActions(['hunger', 'thirst', 'cold']);
    for (const verb of ['hunt', 'attack', 'sleep', 'rest', 'flee', 'wander']) {
      expect(everything.has(verb)).toBe(false);
    }
  });
});

describe('manual', () => {
  it('leaves a dying character exactly where it was put', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    expect(sim.autonomy).toBe('manual');
    player.needs.thirst = 84;

    steps(sim, player);

    // The behaviour every build before M9 phase 6 had, and the reason the
    // owner's note was written. It is a state of the new control, not a bug.
    expect(player.action).toBe('idle');
    expect(sim.autonomyStall).toBeNull();
  });
});

describe('urgent', () => {
  it('goes for water when thirst turns dangerous', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'urgent';
    player.needs.thirst = 84;

    steps(sim, player);

    expect(player.action).toBe('drink');
    expect(sim.autonomyStall).toBeNull();
  });

  it('does nothing at all until a need is dangerous', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'urgent';
    // Comfortable, but lonely and standing among their own band: `talk` scores
    // well and is on no allowlist.
    player.needs.company = 95;
    player.needs.thirst = 40;

    steps(sim, player);

    expect(player.action).toBe('idle');
  });

  it('says why when nothing can answer the need', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'urgent';
    // Freezing, and this world has no shelter standing anywhere, so the one
    // verb that answers it cannot score.
    expect(sim.buildings.filter(b => b.def.shelter > 0 && b.complete)).toHaveLength(0);
    player.needs.cold = 84;

    steps(sim, player);

    expect(player.action).toBe('idle');
    expect(sim.autonomyStall).toBe(stallReason('cold'));
  });

  it('stops saying why once the need passes', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'urgent';
    player.needs.cold = 84;
    steps(sim, player);
    expect(sim.autonomyStall).not.toBeNull();

    settle(player);
    steps(sim, player);
    expect(sim.autonomyStall).toBeNull();
  });

  it('yields to an order, however thirsty', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'urgent';
    player.needs.thirst = 84;

    const bush = sim.nodes.find(n => n.kind === 'berries' && !n.depleted)!;
    expect(sim.order(player, 'forage', { nodeId: bush.id })).toBe(true);

    steps(sim, player, 10);

    // An order is what the player actually said, and it outranks what the
    // character would rather be doing until the action system ends it.
    expect(player.order).toBe('forage');
    expect(player.action).toBe('forage');
  });
});

describe('auto', () => {
  it('lives its own life with nothing pressing at all', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'auto';

    steps(sim, player);

    expect(player.action).not.toBe('idle');
    expect(sim.autonomyStall).toBeNull();
  });

  it('yields to an order', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'auto';
    const bush = sim.nodes.find(n => n.kind === 'berries' && !n.depleted)!;
    expect(sim.order(player, 'forage', { nodeId: bush.id })).toBe(true);

    steps(sim, player, 10);

    expect(player.order).toBe('forage');
  });
});

describe('the control itself', () => {
  it('cycles through all three states and back', () => {
    expect(nextAutonomy('manual')).toBe('urgent');
    expect(nextAutonomy('urgent')).toBe('auto');
    expect(nextAutonomy('auto')).toBe('manual');
  });

  it('leaves everybody else alone whatever it is set to', () => {
    const sim = new Simulation(SMALL);
    const player = playerWithNothingPressing(sim);
    sim.autonomy = 'urgent';
    const others = sim.people.filter(p => p.alive && !p.isPlayer);

    steps(sim, player, 20);

    // The NPCs still think for themselves, which is the thing that would break
    // most quietly if the branch were written the wrong way round.
    expect(others.some(o => o.action !== 'idle')).toBe(true);
  });
});
