import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { DEFAULT_CONFIG, makeConfig } from '../core/Config.ts';
import { lastScores } from '../ai/Brain.ts';
import { ITEMS } from '../entities/Item.ts';

function warmTick(sim: Simulation): number {
  const perDay = sim.config.time.ticksPerDay;
  const year = sim.config.time.daysPerSeason * 4;
  for (let tick = 0; tick < perDay * year; tick++) {
    sim.time.tick = tick;
    if (sim.time.temperature >= sim.config.ai.garmentHeatTemperature) return tick;
  }
  throw new Error('The configured calendar has no warm tick');
}

function makeWarmWearer(seed: string, item = 'fur_coat'): { sim: Simulation; wearer: NonNullable<ReturnType<Simulation['livingPeople']>[number]> } {
  const sim = new Simulation(makeConfig({
    seed,
    world: { width: 48, height: 48, berryBushes: 0, flintOutcrops: 0, deadwood: 0, gameHerds: 0 },
    population: { bands: 1, peoplePerBand: 2 },
    thinkInterval: 1,
  }));
  warmTick(sim);
  const wearer = sim.livingPeople().find(candidate => !candidate.isPlayer)!;
  wearer.age = 30 * wearer.daysPerYear;
  wearer.inventory.add(item, 1);
  wearer.equipment[ITEMS[item]!.garment!.slot] = { item, count: 1 };
  wearer.needs = { hunger: 0, thirst: 0, fatigue: 0, cold: 2, company: 0 };
  wearer.beliefs.learn('warm:' + item, ITEMS[item]!.garment!.warmth, 1, 'own', sim.time.tick);
  wearer.action = 'idle';
  wearer.order = null;
  return { sim, wearer };
}

describe('M15 phase 14c: autonomous garment removal in heat', () => {
  it('uses the Kit timer and keeps a proven coat in inventory', () => {
    const { sim, wearer } = makeWarmWearer('heat-removal');
    wearer.needs.cold = 0;
    sim.step();
    expect(lastScores.get(wearer.id)?.some(row => row.id === 'take_off_garment')).toBe(true);
    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks - 2; i++) {
      sim.step();
      expect(wearer.equipment.torso?.item).toBe('fur_coat');
    }
    sim.step();
    expect(wearer.equipment.torso).toBeUndefined();
    expect(wearer.inventory.count('fur_coat')).toBe(1);
    for (let i = 0; i < 12; i++) sim.step();
    expect(wearer.equipment.torso).toBeUndefined();
  });

  it.each([
    ['cold still needs the layer', { cold: 20 }, 0.8, 'own'],
    ['the weather is not warm', { cold: 2 }, 0.1, 'own'],
    ['the wearer has only public evidence', { cold: 2 }, 0.8, 'seen'],
    ['the layer only has a learned zero', { cold: 2 }, 0.8, 'own-zero'],
  ])('does not remove when %s', (_reason, needs, temperature, evidence) => {
    const { sim, wearer } = makeWarmWearer('heat-removal-negative-' + _reason);
    wearer.needs.cold = needs.cold;
    if (evidence === 'own-zero') wearer.beliefs.learn('warm:fur_coat', 0, 1, 'own', sim.time.tick);
    else if (evidence === 'seen') wearer.beliefs.learn('warm:fur_coat', 0.4, 1, 'seen', sim.time.tick);
    // Use a nearby calendar tick with the requested real temperature; this is
    // a scorer probe, and does not advance the live simulation or its RNG.
    let tick = sim.time.tick;
    if (temperature < sim.config.ai.garmentHeatTemperature) {
      for (let candidate = 0; candidate < sim.config.time.ticksPerDay * sim.config.time.daysPerSeason * 4; candidate++) {
        sim.time.tick = candidate;
        if (sim.time.temperature < sim.config.ai.garmentHeatTemperature) { tick = candidate; break; }
      }
    }
    sim.time.tick = tick;
    sim.step();
    expect(lastScores.get(wearer.id)?.some(row => row.id === 'take_off_garment')).not.toBe(true);
    expect(wearer.equipment.torso?.item).toBe('fur_coat');
  });

  it('keeps protective garments on in heat', () => {
    const { sim, wearer } = makeWarmWearer('heat-removal-armour', 'hide_armour');
    sim.step();
    expect(lastScores.get(wearer.id)?.some(row => row.id === 'take_off_garment')).not.toBe(true);
    expect(wearer.equipment.torso?.item).toBe('hide_armour');
  });

  it('does not autonomously change the player outfit', () => {
    const { sim, wearer } = makeWarmWearer('heat-removal-player');
    wearer.isPlayer = true;
    sim.step();
    expect(lastScores.get(wearer.id)?.some(row => row.id === 'take_off_garment')).not.toBe(true);
    expect(wearer.equipment.torso?.item).toBe('fur_coat');
    expect(sim.order(wearer, 'take_off_garment', { itemId: 'fur_coat' })).toBe(true);
    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks; i++) sim.step();
    expect(wearer.equipment.torso).toBeUndefined();
    expect(wearer.inventory.count('fur_coat')).toBe(1);
  });
});
