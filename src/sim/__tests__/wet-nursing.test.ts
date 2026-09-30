import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { infantNeedingNursing, NURSING_HUNGER } from '../ai/Nursing.ts';
import { isLactating, isNursling } from '../entities/LifeStage.ts';
import type { Person } from '../entities/Person.ts';

/**
 * The owner's rules of 2026-09-30: babies are nursed until two, any woman of
 * the band with milk nurses a crying baby whose mother is not there, and milk
 * costs the one who gives it some food.
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
  sim.peopleHash.rebuild(sim.people);
  return { sim, nurse, ownBaby, orphan, mother, man };
}

describe('wet nursing', () => {
  it('reads a baby as a nursling until the weaning age, and its mother as lactating', () => {
    const { sim, nurse, ownBaby, man } = camp('wet-stages');
    expect(isNursling(ownBaby, sim.config.childhood)).toBe(true);
    ownBaby.age = 1.9 * ownBaby.daysPerYear;
    expect(isNursling(ownBaby, sim.config.childhood)).toBe(true);
    expect(isLactating(nurse, sim.peopleById, sim.config.childhood)).toBe(true);
    ownBaby.age = 2 * ownBaby.daysPerYear;
    expect(isNursling(ownBaby, sim.config.childhood)).toBe(false);
    expect(isLactating(nurse, sim.peopleById, sim.config.childhood)).toBe(false);
    expect(isLactating(man, sim.peopleById, sim.config.childhood)).toBe(false);
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

  it("feeds the orphan, and the milk costs the nurse some of her own food", () => {
    const { sim, nurse, orphan, mother } = camp('wet-feed');
    mother.alive = false;
    nurse.needs.hunger = 10;
    nurse.needs.thirst = 0;
    for (let i = 0; i < 60 && orphan.needs.hunger >= NURSING_HUNGER; i++) {
      orphan.needs.hunger = Math.max(orphan.needs.hunger, 80);
      nurse.needs.hunger = 10;
      sim.step();
      if (nurse.action === 'nurse' && nurse.actionTimer === 1) {
        sim.step();
        break;
      }
    }
    expect(orphan.needs.hunger).toBeLessThan(NURSING_HUNGER + 10);
    expect(nurse.needs.hunger).toBeGreaterThan(10 + 45 * sim.config.childhood.nursingCost * 0.9);
  });
});
