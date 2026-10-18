/** A supplied, ordered bloom: measures the forging mechanism, not iron economics. */
import type { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { placeHarnessAnvil } from './ironFixtures.ts';

export function setupIronForging(sim: Simulation): void {
  const smith = sim.livingPeople().find(person => !person.isChild && person.sex === 'male');
  if (!smith) throw new Error('forgers needs an adult');
  const station = placeHarnessAnvil(sim, smith);
  smith.x = station.centerX;
  smith.y = station.centerY;
  smith.needs.hunger = smith.needs.thirst = smith.needs.cold = smith.needs.fatigue = 0;
  smith.workedTicks = 0;
  smith.skills.smith = 70;
  for (const [item, count] of smith.inventory.entries()) smith.inventory.remove(item, count);
  smith.inventory.add('iron_bloom', 1);
  telemetry.count('iron_forging_fixture_charges');
  // A missing recipe fails the health gate instead of hiding behind n/a.
  sim.order(smith, 'craft', { recipeId: 'forge_iron', buildingId: station.id });
}
