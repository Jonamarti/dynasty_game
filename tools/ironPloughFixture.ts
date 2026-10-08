/** A supplied charged plough order and an explicit draft-team sowing. */
import type { Simulation } from '../src/sim/core/Simulation.ts';
import { Building, BUILDINGS } from '../src/sim/entities/Building.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { equipContainer } from '../src/sim/core/Carry.ts';
import { SOW_SEED } from '../src/sim/entities/Field.ts';

function addBuilding(sim: Simulation, kind: 'anvil' | 'field' | 'pen', x: number, y: number, bandId: number): Building {
  const building = new Building(BUILDINGS[kind]!, Math.round(x), Math.round(y), bandId, sim.ids);
  building.complete = true;
  sim.buildings.push(building);
  sim.buildingsById.set(building.id, building);
  sim.buildingHash.insert(building);
  return building;
}

export function setupIronPlough(sim: Simulation): void {
  const adults = sim.livingPeople().filter(person => !person.isChild);
  if (adults.length < 2) throw new Error('ploughmen needs two adults');
  const farmer = adults[0]!;
  const smith = adults[1]!;
  const band = sim.bands.find(candidate => candidate.id === farmer.bandId)!;
  const field = addBuilding(sim, 'field', band.homeX + 1, band.homeY + 1, farmer.bandId);
  const pen = addBuilding(sim, 'pen', band.homeX + 10, band.homeY + 1, farmer.bandId);
  const anvil = addBuilding(sim, 'anvil', band.homeX + 10, band.homeY + 12, smith.bandId);
  pen.store.add(pen.def.herd!.item, 3);

  // The scenario supplies the newly researched idea so it can isolate the
  // physical recipe and sowing gate even when run against the old build.
  farmer.knownTech.add('ploughshare' as never);
  smith.knownTech.add('ploughshare' as never);
  farmer.x = field.centerX;
  farmer.y = field.centerY;
  farmer.needs.hunger = farmer.needs.thirst = farmer.needs.cold = farmer.needs.fatigue = 0;
  farmer.workedTicks = 0;
  for (const [item, count] of farmer.inventory.entries()) farmer.inventory.remove(item, count);
  farmer.inventory.add('basket', 1);
  equipContainer(farmer, 'basket');
  farmer.inventory.add('grain', SOW_SEED);
  farmer.inventory.add('iron_plough', 1);
  telemetry.count('iron_plough_fixture_sow_orders');
  sim.order(farmer, 'sow', { buildingId: field.id, itemId: 'iron_plough' });

  smith.x = anvil.centerX;
  smith.y = anvil.centerY;
  smith.needs.hunger = smith.needs.thirst = smith.needs.cold = smith.needs.fatigue = 0;
  smith.workedTicks = 0;
  smith.skills.smith = 70;
  for (const [item, count] of smith.inventory.entries()) smith.inventory.remove(item, count);
  smith.inventory.add('wrought_iron', 1);
  smith.inventory.add('sticks', 2);
  telemetry.count('iron_plough_fixture_recipe_charges');
  sim.order(smith, 'craft', { recipeId: 'iron_plough', buildingId: anvil.id });
}
