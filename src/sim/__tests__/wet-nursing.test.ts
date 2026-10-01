import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { infantNeedingNursing, NURSE_TICKS, NURSING_HUNGER } from '../ai/Nursing.ts';
import { isLactating, isNursling, weanAgeYears } from '../entities/LifeStage.ts';
import type { Person } from '../entities/Person.ts';

/**
 * The owner's rules of 2026-09-30: each baby is weaned at its own age between
 * one and two, any woman of the band with milk nurses a crying baby whose
 * mother is not there, and milk makes the one who has it half as hungry again.
 */
function camp(seed: string) {
  const sim = new Simulation({ seed, world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 6 } });
  const [nurse, ownBaby, orphan, mother, man] = sim.people as [Person, Person, Person, Person, Person];
  for (const p of sim.people) { p.x = nurse.x; p.y = nurse.y; p.bandId = nurse.bandId; p.captiveOf = null; }
  nurse.sex = 'female';
  nurse.age = 25 * nurse.daysPerYear;
  nurse.childIds = [ownBaby.id];
  ownBaby.age = 10;
  ownBaby.motherId = nurse.id;
  ownBaby.needs.hunger = 0;
  ownBaby.needs.thirst = 0;
  mother.sex = 'female';
  mother.age = 25 * mother.daysPerYear;
  mother.childIds = [orphan.id];
  orphan.age = 10;
  orphan.motherId = mother.id;
  orphan.needs.hunger = 80;
  man.sex = 'male';
  man.age = 25 * man.daysPerYear;
  // Fed just now, so only a hungry cry (not a feed coming round) calls a nurse.
  ownBaby.lastNursedTick = orphan.lastNursedTick = sim.time.tick;
  sim.peopleHash.rebuild(sim.people);
  return { sim, nurse, ownBaby, orphan, mother, man };
}

describe('wet nursing', () => {
  it('reads a baby as a nursling until its own weaning age, and its mother as lactating', () => {
    const { sim, nurse, ownBaby, man } = camp('wet-stages');
    const wean = weanAgeYears(ownBaby, sim.config.childhood);
    expect(wean).toBeGreaterThanOrEqual(1);
    expect(wean).toBeLessThan(2);
    expect(isNursling(ownBaby, sim.config.childhood)).toBe(true);
    ownBaby.age = (wean - 0.05) * ownBaby.daysPerYear;
    expect(isNursling(ownBaby, sim.config.childhood)).toBe(true);
    expect(isLactating(nurse, sim.peopleById, sim.config.childhood)).toBe(true);
    ownBaby.age = wean * ownBaby.daysPerYear;
    expect(isNursling(ownBaby, sim.config.childhood)).toBe(false);
    expect(isLactating(nurse, sim.peopleById, sim.config.childhood)).toBe(false);
    expect(isLactating(man, sim.peopleById, sim.config.childhood)).toBe(false);
  });

  it('spreads weaning ages across the whole year between one and two', () => {
    const { sim, ownBaby } = camp('wet-spread');
    const ages: number[] = [];
    for (let i = 0; i < 200; i++) {
      ages.push(weanAgeYears({ ...ownBaby, id: i } as Person, sim.config.childhood));
    }
    expect(Math.min(...ages)).toBeLessThan(1.1);
    expect(Math.max(...ages)).toBeGreaterThan(1.9);
  });

  it("answers a crying baby whose mother is not there, but not one whose mother is", () => {
    const { sim, nurse, orphan, mother } = camp('wet-cry');
    const ask = () => infantNeedingNursing(nurse, sim.peopleById, sim.world, sim.config.childhood,
      sim.peopleHash, sim.config.sightRadius);
    // The mother is standing beside her baby: it is hers to answer.
    expect(ask()).toBeNull();
    // The mother has died: the nurse hears the cry and sees nobody with it.
    mother.alive = false;
    expect(ask()?.id).toBe(orphan.id);
  });

  it('does not reach a woman without milk, however loud the cry', () => {
    const { sim, nurse, ownBaby, mother } = camp('wet-dry');
    mother.alive = false;
    ownBaby.alive = false;
    expect(infantNeedingNursing(nurse, sim.peopleById, sim.world, sim.config.childhood,
      sim.peopleHash, sim.config.sightRadius)).toBeNull();
  });

  it('can be switched off', () => {
    const { sim, nurse, mother } = camp('wet-off');
    mother.alive = false;
    const off = { ...sim.config.childhood, wetNursing: false };
    expect(infantNeedingNursing(nurse, sim.peopleById, sim.world, off,
      sim.peopleHash, sim.config.sightRadius)).toBeNull();
  });

  it('feeds the orphan without charging the nurse per feed', () => {
    const { sim, nurse, orphan, mother } = camp('wet-feed');
    mother.alive = false;
    nurse.needs.hunger = 10;
    nurse.needs.thirst = 0;
    let before = 0;
    for (let i = 0; i < 60 && orphan.needs.hunger >= NURSING_HUNGER; i++) {
      orphan.needs.hunger = Math.max(orphan.needs.hunger, 80);
      nurse.needs.hunger = 10;
      sim.step();
      if (nurse.action === 'nurse' && nurse.actionTimer === 1) {
        before = nurse.needs.hunger;
        sim.step();
        break;
      }
    }
    expect(orphan.needs.hunger).toBeLessThan(NURSING_HUNGER + 10);
    // One tick of hunger at the lactating rate, and nothing for the feed.
    expect(nurse.needs.hunger - before).toBeLessThan(1);
  });

  it('makes a woman with milk half as hungry again, and nobody else', () => {
    const { sim, nurse, man } = camp('wet-rate');
    for (const p of sim.people) { p.needs.hunger = 0; p.needs.thirst = 0; }
    const rate = sim.config.needs.hungerRate;
    sim.step();
    expect(nurse.needs.hunger).toBeCloseTo(rate * 1.5, 5);
    expect(man.needs.hunger).toBeCloseTo(rate, 5);
  });

  it('cries for the breast only past the cry line, not on a clock', () => {
    const { sim, nurse, ownBaby } = camp('wet-feeds');
    const ask = () => infantNeedingNursing(nurse, sim.peopleById, sim.world, sim.config.childhood,
      sim.peopleHash, sim.config.sightRadius);
    // Fed long ago but not hungry: the owner's "five of a hundred" is no cry.
    ownBaby.lastNursedTick = -100000;
    ownBaby.needs.hunger = 5;
    expect(ask()).toBeNull();
    ownBaby.needs.hunger = NURSING_HUNGER;
    expect(ask()?.id).toBe(ownBaby.id);
  });

  it('gets a nursling fed full back to the cry line four times a day', () => {
    const { sim, ownBaby, man } = camp('wet-rate-baby');
    for (const p of sim.people) { p.needs.hunger = 0; p.needs.thirst = 0; }
    sim.step();
    // Ticks from fed-full to the cry line, plus the feed itself, is a quarter day.
    const cycle = NURSING_HUNGER / ownBaby.needs.hunger + NURSE_TICKS;
    expect(sim.config.time.ticksPerDay / cycle).toBeCloseTo(sim.config.childhood.feedsPerDay, 5);
    expect(man.needs.hunger).toBeCloseTo(sim.config.needs.hungerRate, 5);
  });
});
