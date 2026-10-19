import { describe, expect, it } from 'vitest';
import { lastScores } from '../ai/Brain.ts';
import { makeConfig } from '../core/Config.ts';
import { Simulation } from '../core/Simulation.ts';
import { manualGarmentReasonText, manualGarmentRefusal } from '../core/ToolEquipment.ts';

describe('m16-infants-cannot-dress', () => {
  it('refuses and never scores a two-day-old baby, while adults can dress', () => {
    const sim = new Simulation(makeConfig({
      seed: 'm16-infants-cannot-dress',
      world: { width: 48, height: 48, berryBushes: 0, flintOutcrops: 0, deadwood: 0, gameHerds: 0 },
      population: { bands: 1, peoplePerBand: 2 },
    }));
    const [baby, adult] = sim.livingPeople();
    expect(baby).toBeDefined();
    expect(adult).toBeDefined();
    baby!.age = 2;
    baby!.inventory.add('fur_coat', 1);
    baby!.needs.cold = 95;
    baby!.order = null;
    baby!.action = 'idle';
    sim.possess(baby!);

    expect(manualGarmentRefusal(baby!, 'fur_coat', 'wear_garment')).toBe('too_young_to_wear');
    expect(manualGarmentReasonText('too_young_to_wear'))
      .toBe('That person is too young to dress themselves');

    for (let i = 0; i < 80; i++) sim.step();
    expect(lastScores.get(baby!.id)?.some(row => row.id === 'wear_garment') ?? false).toBe(false);
    expect(baby!.equipment.torso?.item).not.toBe('fur_coat');

    adult!.age = 30 * adult!.daysPerYear;
    adult!.inventory.add('fur_coat', 1);
    adult!.needs.cold = 95;
    adult!.beliefs.learn('warm:fur_coat', 0.4, 1, 'own', 1);
    adult!.action = 'idle';
    adult!.order = null;
    for (let i = 0; i < 80 && adult!.equipment.torso?.item !== 'fur_coat'; i++) sim.step();
    expect(adult!.equipment.torso?.item).toBe('fur_coat');
  });
});
