import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Simulation } from '../core/Simulation.ts';
import { stopReasonLabel } from '../../render/Floaters.ts';
import { debtTo, THREAT_WORTH } from '../social/Amends.ts';

const SMALL = {
  seed: 'm16-torch-transfer',
  world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
  population: { bands: 1, peoplePerBand: 2 },
};

describe('M16 lit torch transfers', () => {
  it.each([1, 2])('m16-lit-torch-demand-transfers-%i-units-with-their-owned-flame', count => {
    const sim = new Simulation(SMALL);
    const [demander, target] = sim.livingPeople();
    demander!.age = target!.age = 30 * demander!.daysPerYear;
    demander!.x = target!.x; demander!.y = target!.y;
    demander!.skills.fight = 100; target!.skills.fight = 0; target!.traits.aggression = 0;
    for (const [itemId, count] of target!.inventory.entries()) target!.inventory.remove(itemId, count);
    target!.inventory.add('torch', 2);
    target!.equipment.right = { item: 'torch', count: 1, lit: 24 };
    (sim as unknown as { actionRng: RNG }).actionRng.chance = () => true;
    expect(sim.order(demander!, 'threaten', { personId: target!.id, itemId: 'torch', count })).toBe(true);
    demander!.actionTimer = 1;

    sim.step();

    expect(target!.inventory.count('torch')).toBe(2 - count);
    // This fixture can carry one torch: the existing carry reconciliation
    // drops the spare, while the newly owned burning unit stays in its hand.
    expect(demander!.inventory.count('torch')).toBe(1);
    expect(sim.piles.reduce((sum, pile) => sum + pile.contents.count('torch'), 0)).toBe(count - 1);
    if (count === 1) {
      expect(target!.equipment.right).toMatchObject({ item: 'torch', lit: 23 });
      expect(demander!.equipment.right).toBeUndefined();
    } else {
      expect(target!.equipment.right).toBeUndefined();
      expect(Object.values(demander!.equipment).find(item => item?.item === 'torch')).toMatchObject({ lit: 23 });
    }
  });

  it('m16-lit-torch-demand-does-not-drop-the-flame-when-an-elderly-receiver-cannot-carry-it', () => {
    const sim = new Simulation(SMALL);
    const [demander, target] = sim.livingPeople();
    demander!.age = 80 * demander!.daysPerYear;
    target!.age = 30 * target!.daysPerYear;
    demander!.x = target!.x; demander!.y = target!.y;
    demander!.skills.fight = 100; target!.skills.fight = 0; target!.traits.aggression = 0;
    for (const [itemId, count] of demander!.inventory.entries()) demander!.inventory.remove(itemId, count);
    for (const [itemId, count] of target!.inventory.entries()) target!.inventory.remove(itemId, count);
    target!.inventory.add('torch', 1);
    target!.equipment.left = { item: 'torch', count: 1, lit: 24 };
    expect(demander!.vigour).toBeLessThan(1);
    (sim as unknown as { actionRng: RNG }).actionRng.chance = () => true;
    expect(sim.order(demander!, 'threaten', { personId: target!.id, itemId: 'torch', count: 1 })).toBe(true);
    demander!.actionTimer = 1;

    sim.step();

    expect(target!.inventory.count('torch')).toBe(1);
    expect(target!.equipment.left).toMatchObject({ item: 'torch', lit: 23 });
    expect(demander!.inventory.count('torch')).toBe(0);
    expect(sim.interruptions.at(-1)?.reason).toBe('recipient_torch_capacity');
    expect(stopReasonLabel('recipient_torch_capacity')).toContain('that torch');
    expect(debtTo(demander!, target!.id)?.worth).toBe(THREAT_WORTH);
  });

  it('m16-lit-torch-demand-does-not-take-or-extinguish-a-flame-without-a-recipient-hand', () => {
    const sim = new Simulation(SMALL);
    const [demander, target] = sim.livingPeople();
    demander!.age = target!.age = 30 * demander!.daysPerYear;
    demander!.x = target!.x; demander!.y = target!.y;
    demander!.skills.fight = 100; target!.skills.fight = 0; target!.traits.aggression = 0;
    for (const [itemId, count] of target!.inventory.entries()) target!.inventory.remove(itemId, count);
    target!.inventory.add('torch', 1);
    target!.equipment.left = { item: 'torch', count: 1, lit: 24 };
    demander!.inventory.add('handaxe', 1);
    demander!.inventory.add('spear', 1);
    demander!.equipment.left = { item: 'handaxe', count: 1 };
    demander!.equipment.right = { item: 'spear', count: 1 };
    (sim as unknown as { actionRng: RNG }).actionRng.chance = () => true;
    expect(sim.order(demander!, 'threaten', { personId: target!.id, itemId: 'torch', count: 1 })).toBe(true);
    demander!.actionTimer = 1;

    sim.step();

    expect(target!.inventory.count('torch')).toBe(1);
    expect(target!.equipment.left).toMatchObject({ item: 'torch', lit: 23 });
    expect(demander!.inventory.count('torch')).toBe(0);
    expect(sim.interruptions.at(-1)?.reason).toBe('recipient_no_free_hand');
    expect(stopReasonLabel('recipient_no_free_hand')).toContain('receiver');
    expect(debtTo(demander!, target!.id)?.worth).toBe(THREAT_WORTH);
  });
});
