/**
 * Somebody set upon runs or hits back — M12 phase 2c, the owner's note 4:
 * "some NPCs neither defend themselves nor run when attacked".
 *
 * Three defects produced it, and each has a test here: "under attack" meant
 * forty ticks since any blow, so an action begun after the assailant had
 * walked away was cut off on its next tick and chosen again; eight timed
 * verbs had no way for a blow to reach somebody committed to them; and
 * `flee` could be chosen with nowhere to run to.
 */
import { describe, it, expect, vi } from 'vitest';
import { Brain } from '../ai/Brain.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { assailantOf, FRESH_BLOW, UNDER_ATTACK_TICKS } from '../social/Defence.ts';

const SMALL = {
  seed: 'respond-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 2, peoplePerBand: 4 },
};

function adult(name: string, band: number): Person {
  const person = new Person(name, 10, 10, band, new RNG('r-' + name));
  person.age = 30 * person.daysPerYear;
  return person;
}

function settled(person: Person): void {
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.needs.company = 0;
}

describe('who is attacking somebody', () => {
  const victim = adult('Ana', 0);
  const striker = adult('Bru', 1);
  const byId = (id: number) => (id === striker.id ? striker : undefined);

  it('is whoever landed a blow a moment ago, whatever they do next', () => {
    victim.lastHarmedBy = striker.id;
    victim.lastHarmedTick = 1000;
    striker.action = 'idle';
    expect(assailantOf(victim, byId, 1000 + FRESH_BLOW)).toBe(striker);
  });

  it('is nobody once they have walked off, however recent the blow', () => {
    striker.action = 'spar';
    expect(assailantOf(victim, byId, 1000 + FRESH_BLOW + 1)).toBeNull();
  });

  it('is still them while they keep coming, up to the ceiling', () => {
    striker.action = 'attack';
    striker.targetPersonId = victim.id;
    expect(assailantOf(victim, byId, 1000 + UNDER_ATTACK_TICKS)).toBe(striker);
    expect(assailantOf(victim, byId, 1000 + UNDER_ATTACK_TICKS + 1)).toBeNull();
  });
});

describe('a blow reaches somebody committed to something', () => {
  function aLesson(): { sim: Simulation; teacher: Person; pupil: Person; striker: Person } {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [teacher, pupil] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    const striker = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    for (const p of [teacher!, pupil!, striker]) settled(p);
    // This fixture exercises interruption during a real lesson; explicit
    // teaching now refuses before starting when there is nothing they can pass on.
    teacher!.knownTech.add('firemaking');
    pupil!.x = teacher!.x + 1;
    pupil!.y = teacher!.y;
    striker.x = teacher!.x - 1;
    striker.y = teacher!.y;
    // `teach` is one of the eight timed verbs that never asked `interruption`.
    teacher!.action = 'teach';
    teacher!.targetPersonId = pupil!.id;
    teacher!.actionTimer = 50;
    return { sim, teacher: teacher!, pupil: pupil!, striker };
  }

  it('breaks off a lesson when the teacher is struck', () => {
    const { sim, teacher, striker } = aLesson();
    teacher.lastHarmedBy = striker.id;
    teacher.lastHarmedTick = sim.time.tick;
    striker.action = 'attack';
    striker.targetPersonId = teacher.id;
    sim.step();
    expect(teacher.action).not.toBe('teach');
  });

  it('lets the lesson run once whoever struck has gone about their business', () => {
    const { sim, teacher, striker } = aLesson();
    teacher.lastHarmedBy = striker.id;
    teacher.lastHarmedTick = sim.time.tick - FRESH_BLOW - 5;
    striker.action = 'idle';
    striker.targetPersonId = null;
    sim.step();
    expect(teacher.action).toBe('teach');
  });

  it('lets thirst interrupt a committed lesson and reports the reason', () => {
    const { sim, teacher } = aLesson();
    teacher.needs.thirst = 60;
    teacher.order = 'teach';
    sim.interruptions.length = 0;

    sim.step();

    expect(teacher.action).not.toBe('teach');
    expect(sim.interruptions.some(stop =>
      stop.personId === teacher.id && stop.action === 'teach' && stop.reason === 'thirsty'
    )).toBe(true);
  });

  it('can isolate need interruptions without disabling attack or family checks', () => {
    const { sim, teacher } = aLesson();
    sim.config.motivation.interruptSocialNeeds = false;
    teacher.needs.thirst = 60;
    teacher.order = 'teach';

    sim.step();

    expect(teacher.action).toBe('teach');
    expect(teacher.actionTimer).toBe(49);
  });
});

describe('somebody set upon', () => {
  function expectRepeatHistogramInvariants(snapshot: Record<string, number>): void {
    const sum = (prefix: string) => Object.entries(snapshot)
      .filter(([key]) => key.startsWith(prefix))
      .reduce((total, [, count]) => total + count, 0);
    expect(sum('blow_repeat_action_')).toBe(snapshot.blow_repeat);
    expect(sum('blow_repeat_unanswered_action_')).toBe(snapshot.blow_repeat_unanswered ?? 0);
    expect(snapshot.blow_repeat_unanswered_action_flee ?? 0).toBe(0);
  }

  function secondBlowTelemetry(
    action: 'flee' | 'give', repeat = true, knockedOut = false, explicitOrder = false,
  ): Record<string, number> {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    // The attacker is in the first band and therefore acts before the victim.
    // That lets this fixture sample the victim's chosen action at impact,
    // before the victim's own turn can respond to or interrupt it.
    const striker = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild)!;
    const victim = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    for (const person of [striker, victim]) {
      settled(person);
      person.health = 1000;
    }
    striker.x = 31;
    striker.y = 32;
    victim.x = 32;
    victim.y = 32;
    sim.peopleHash.rebuild(sim.livingPeople());

    striker.lastHarmedBy = null;
    striker.action = 'attack';
    striker.order = explicitOrder ? 'attack' : null;
    striker.targetPersonId = victim.id;
    striker.actionTimer = 1;
    striker.pursuitFrom = null;
    victim.lastHarmedBy = repeat ? striker.id : null;
    victim.lastHarmedTick = repeat ? sim.time.tick : -100;
    if (knockedOut) victim.knockedOutUntil = sim.time.tick + 100;
    victim.action = action;
    victim.actionTimer = 20;
    victim.order = null;
    if (action === 'flee') {
      victim.fleeFromId = striker.id;
      victim.targetX = 40;
      victim.targetY = 32;
    }

    telemetry.reset();
    telemetry.enable();
    sim.step();
    const snapshot = telemetry.snapshot();
    telemetry.disable();
    telemetry.reset();
    return snapshot;
  }

  it('counts fleeing as an answer and a committed gift as unanswered at impact', () => {
    const fleeing = secondBlowTelemetry('flee');
    expectRepeatHistogramInvariants(fleeing);
    expect(fleeing.blow_repeat).toBe(1);
    expect(fleeing.blow_repeat_action_flee).toBe(1);
    expect(fleeing.answered_repeat_action_flee).toBe(1);
    expect(fleeing.answered_repeat_order_none).toBe(1);
    expect(fleeing.answered_repeat_commitment_action_none).toBe(1);
    expect(fleeing.answered_repeat_timer_20).toBe(1);
    expect(fleeing.answered_repeat_under_attack_yes).toBe(1);
    expect(fleeing.blow_repeat_unanswered ?? 0).toBe(0);
    expect(fleeing.blow_repeat_unanswered_action_flee ?? 0).toBe(0);

    const gifting = secondBlowTelemetry('give');
    expectRepeatHistogramInvariants(gifting);
    expect(gifting.blow_repeat).toBe(1);
    expect(gifting.blow_repeat_action_give).toBe(1);
    expect(gifting.answered_repeat_action_give).toBe(1);
    expect(gifting.answered_repeat_order_none).toBe(1);
    expect(gifting.answered_repeat_commitment_action_none).toBe(1);
    expect(gifting.answered_repeat_timer_20).toBe(1);
    expect(gifting.answered_repeat_under_attack_yes).toBe(1);
    expect(gifting.answered_under_attack_detected_tick).toBeGreaterThan(0);
    expect(gifting.answered_interrupted_under_attack_action_give).toBe(1);
    expect(gifting.blow_repeat_unanswered).toBe(1);
    expect(gifting.blow_repeat_unanswered_action_give).toBe(1);
  });

  it('records the first adult blow separately from a repeat', () => {
    const first = secondBlowTelemetry('give', false);
    expect(first.answered_initial_action_give).toBe(1);
    expect(first.answered_initial_order_none).toBe(1);
    expect(first.answered_initial_commitment_action_none).toBe(1);
    expect(first.answered_initial_timer_20).toBe(1);
    expect(first.answered_initial_under_attack_no).toBe(1);
    expect(first.answered_under_attack_detected_tick).toBeGreaterThan(0);
    expect(first.answered_interrupted_under_attack_action_give).toBe(1);
    expect(first.blow_repeat ?? 0).toBe(0);
  });

  it('does not count an autonomous follow-up blow against somebody unconscious', () => {
    const snapshot = secondBlowTelemetry('give', true, true);
    expect(snapshot.blow_repeat ?? 0).toBe(0);
    expect(snapshot.blow_landed ?? 0).toBe(0);
    expect(snapshot.abandoned_target_unconscious).toBe(1);
  });

  it('keeps an explicit attack order against an unconscious target', () => {
    const snapshot = secondBlowTelemetry('give', true, true, true);
    expect(snapshot.blow_repeat).toBe(1);
    expect(snapshot.blow_landed).toBe(1);
    expect(snapshot.abandoned_target_unconscious ?? 0).toBe(0);
  });

  it('does not reselect an unconscious assailant after ending an autonomous attack', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const attacker = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild)!;
    const target = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    for (const person of [attacker, target]) settled(person);
    attacker.x = 31;
    attacker.y = 32;
    target.x = 32;
    target.y = 32;
    sim.peopleHash.rebuild(sim.livingPeople());
    attacker.action = 'attack';
    attacker.actionTimer = 1;
    attacker.order = null;
    attacker.targetPersonId = target.id;
    attacker.lastHarmedBy = target.id;
    attacker.lastHarmedTick = sim.time.tick;
    attacker.body.left_leg.damage = 0.5;
    attacker.body.right_leg.damage = 0.5;
    target.action = 'idle';
    target.knockedOutUntil = sim.time.tick + 100;

    sim.step();
    expect(attacker.action).toBe('idle');
    sim.step();

    expect(attacker.action === 'attack' && attacker.targetPersonId === target.id).toBe(false);
  });

  it('does not score an unconscious hated neighbour as a repeated autonomous attack target', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const actor = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild)!;
    const victim = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    const distantAdult = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild && p.id !== victim.id)!;
    for (const person of [actor, victim, distantAdult]) settled(person);
    actor.x = 20; actor.y = 20;
    victim.x = 21; victim.y = 20;
    distantAdult.x = 55; distantAdult.y = 55;
    actor.traits.aggression = 1;
    sim.relationships.addDeed(actor.id, victim.id, -100, sim.time.tick);
    sim.peopleHash.rebuild(sim.livingPeople());
    victim.knockedOutUntil = sim.time.tick + 100;

    const originalScore = Brain.prototype.score;
    let captured = false;
    const scoreSpy = vi.spyOn(Brain.prototype, 'score').mockImplementation(function(
      this: Brain, person, ctx,
    ) {
      if (person !== actor || captured) return originalScore.call(this, person, ctx);
      captured = true;
      const whileUnconscious = originalScore.call(this, person, ctx);
      expect(whileUnconscious.scores.some(row => row.id === 'attack')).toBe(false);
      expect(whileUnconscious.found.foe).toBeNull();

      // Keep the same score context and grievance, changing only the target's
      // consciousness, to prove this guard—not the fixture—removes the row.
      victim.knockedOutUntil = ctx.time.tick - 1;
      const afterRecovery = originalScore.call(this, person, ctx);
      expect(afterRecovery.scores.some(row => row.id === 'attack')).toBe(true);
      expect(afterRecovery.found.foe).toBe(victim);
      return whileUnconscious;
    });
    try {
      for (let i = 0; i < 30 && !captured; i++) sim.step();
      expect(captured).toBe(true);
    } finally {
      scoreSpy.mockRestore();
    }
  });

  it('runs or hits back, rather than going on with the day', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const victim = sim.livingPeople().find(p => p.bandId === 0 && !p.isChild)!;
    const striker = sim.livingPeople().find(p => p.bandId === 1 && !p.isChild)!;
    let answered = false;
    for (let i = 0; i < 10 && !answered; i++) {
      settled(victim);
      striker.x = victim.x + 1;
      striker.y = victim.y;
      striker.action = 'attack';
      striker.targetPersonId = victim.id;
      striker.actionTimer = 5;
      victim.lastHarmedBy = striker.id;
      victim.lastHarmedTick = sim.time.tick;
      sim.step();
      answered = victim.action === 'flee' ||
        (victim.action === 'attack' && victim.targetPersonId === striker.id);
    }
    expect(answered).toBe(true);
  });
});
