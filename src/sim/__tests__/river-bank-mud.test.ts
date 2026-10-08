import { describe, expect, it } from 'vitest';
import { createWaterLakeSimulation } from '../../../tools/waterFishFixture.ts';
import { canDigBankMud, EARTH_UNIT } from '../core/Earth.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
function fixture() {
  const sim = createWaterLakeSimulation('mud-banks', { world: { clayBanks: 0 } });
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  const bank = sim.world.freshShore.find(p => canDigBankMud(sim.world, p.x, p.y) && !sim.buildingAt(p.x, p.y))!;
  expect(bank).toBeDefined();
  person.x = bank.x + 0.5; person.y = bank.y + 0.5;
  person.inventory.add('sticks', 1);
  person.needs.hunger = person.needs.thirst = person.needs.fatigue = 0;
  return { sim, person, bank };
}
describe('digging riverbank mud without a clay deposit', () => {
  it('offers a bank order and produces mud in the first lift, banking the finite dig in terrain', () => {
    const { sim, person, bank } = fixture();
    expect(sim.nodes.some(n => n.kind === 'clay')).toBe(false);
    expect(availableActions(person, { kind: 'ground', ...bank }, { world: sim.world, nearWater: true }).find(a => a.id === 'dig_mud')?.enabled).toBe(true);
    expect(sim.order(person, 'dig_mud', bank)).toBe(true);
    for (let i = 0; i < 150 && person.inventory.count('mud') === 0; i++) sim.step();
    expect(person.inventory.count('mud')).toBeGreaterThan(0);
    expect(person.inventory.count('earth')).toBe(0);
    expect(sim.world.depthDug(bank.x, bank.y)).toBeCloseTo(person.inventory.count('mud') * EARTH_UNIT);
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    expect(restored.world.depthDug(bank.x, bank.y)).toBe(sim.world.depthDug(bank.x, bank.y));
  });
  it('refuses inland ground and missing tools with a visible reason', () => {
    const { sim, person, bank } = fixture();
    expect(sim.order(person, 'dig_mud', { x: 1, y: 1 })).toBe(false);
    expect(sim.lastRefusal).toContain('freshwater bank');
    person.inventory.remove('sticks', 1);
    expect(sim.order(person, 'dig_mud', bank)).toBe(false);
    expect(sim.lastRefusal).toContain('nothing to dig with');
  });
  it('interrupts an unfinished lift for thirst without erasing the hole already dug', () => {
    const { sim, person, bank } = fixture();
    expect(sim.order(person, 'dig_mud', bank)).toBe(true);
    sim.step();
    const depth = sim.world.depthDug(bank.x, bank.y);
    person.needs.thirst = 95;
    sim.step();
    expect(person.order).toBeNull();
    expect(sim.world.depthDug(bank.x, bank.y)).toBe(depth);
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason.includes('thirst'))).toBe(true);
  });
});
