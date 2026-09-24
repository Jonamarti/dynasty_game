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
import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { Simulation } from '../core/Simulation.ts';
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
});

describe('somebody set upon', () => {
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
