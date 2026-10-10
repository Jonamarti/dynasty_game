import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { lightFactor } from '../core/Light.ts';

function fixture() {
  return new Simulation({ seed: 'local-light-readers', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 } });
}

describe('local light readers', () => {
  it('reduces current sight at midnight and restores it beside a hearth', () => {
    const sim = fixture(), person = sim.livingPeople()[0]!;
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    const daytime = sim.sightOf(person);
    sim.time.tick = 0;
    const night = sim.sightOf(person);
    expect(night).toBeLessThan(daytime);
    const fire = new Building(BUILDINGS.hearth!, person.x, person.y, person.bandId, sim.ids);
    fire.complete = true;
    sim.buildingHash.insert(fire);
    expect(sim.sightOf(person)).toBeGreaterThan(night);
    fire.durability = 0;
    expect(sim.sightOf(person)).toBe(night);
  });

  it('an observer misses a distant deed at night and sees it by day; the victim always knows', () => {
    const sim = fixture();
    const [actor, victim, observer] = sim.livingPeople();
    actor!.x = victim!.x = 20; actor!.y = victim!.y = 20;
    observer!.x = 27; observer!.y = 20;
    sim.peopleHash.rebuild([actor!, victim!, observer!]);
    sim.time.tick = 0;
    const night = sim.social.emit('theft', actor!, victim!, 0.5, 0, sim.peopleHash, sim.config.sightRadius);
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    const day = sim.social.emit('theft', actor!, victim!, 0.5, sim.time.tick, sim.peopleHash, sim.config.sightRadius);
    expect(night.witnesses).toBe(0);
    expect(day.witnesses).toBe(1);
    expect(victim!.chronicle.filter(entry => entry.deed?.type === 'theft')).toHaveLength(2);
  });

  it('banks actual craft progress at the slower dark rate and preserves it in JSON', () => {
    const sim = fixture(); sim.possessFirst();
    const person = sim.player!;
    sim.config.carry.legacyPack = true;
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    person.knownTech.add('hafting');
    for (const [item, amount] of Object.entries(RECIPES.handaxe!.ingredients)) person.inventory.add(item, amount);
    expect(sim.order(person, 'craft', { recipeId: 'handaxe' })).toBe(true);
    person.actionTimer = 10;
    sim.step();
    expect(person.actionTimer).toBeCloseTo(9.5, 3);
    expect(person.bankedFor('craft:handaxe')).toBeCloseTo(0.5, 3);
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    expect(loaded.peopleById.get(person.id)!.workBankTicks).toBe(person.workBankTicks);
    expect(lightFactor(0, 0.5)).toBe(0.5);
    expect(lightFactor(1, 0.5)).toBe(1);
  });

  it('migrates the missing light field of older saves without changing their sight rules', () => {
    const sim = fixture();
    const record = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    delete record.config.light;
    const loaded = Simulation.fromCheckpointRecord(record);
    expect(loaded.config.light.enabled).toBe(false);
    const person = loaded.livingPeople()[0]!;
    const sight = loaded.sightOf(person);
    loaded.time.tick = loaded.config.time.ticksPerDay / 2;
    expect(loaded.sightOf(person)).toBe(sight);
  });
});
