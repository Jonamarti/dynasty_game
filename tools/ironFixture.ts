/** A short ordered smelt: measures the new node, not a year's food economy. */
import type { Simulation } from '../src/sim/core/Simulation.ts';
import { Building, BUILDINGS } from '../src/sim/entities/Building.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';

export function setupIronBloom(sim: Simulation): void {
  const smith = sim.livingPeople().find(person => !person.isChild && person.sex === 'male');
  if (!smith) throw new Error('ironsmiths needs an adult');
  const furnace = BUILDINGS.furnace!;
  let station: Building | null = null;
  for (let radius = 3; radius < 20 && !station; radius++) {
    for (let angle = 0; angle < 24 && !station; angle++) {
      const x = Math.round(smith.x + Math.cos(angle * Math.PI / 12) * radius);
      const y = Math.round(smith.y + Math.sin(angle * Math.PI / 12) * radius);
      if (!sim.canPlace(furnace, x, y)) continue;
      station = new Building(furnace, x, y, smith.bandId, sim.ids);
      station.complete = true;
      sim.buildings.push(station);
      sim.buildingsById.set(station.id, station);
      sim.buildingHash.insert(station);
    }
  }
  if (!station) throw new Error('ironsmiths needs room for a furnace');
  // Fixture gifts isolate smelting from route cost; the real executor owns
  // every gate. This does not establish autonomous production or supply.
  smith.x = station.centerX;
  smith.y = station.centerY;
  smith.needs.hunger = smith.needs.thirst = smith.needs.cold = smith.needs.fatigue = 0;
  smith.workedTicks = 0;
  smith.skills.smith = 70; // An experienced fixture smith finishes within this short window.
  for (const [item, count] of smith.inventory.entries()) smith.inventory.remove(item, count);
  smith.inventory.add('iron_ore', 2);
  smith.inventory.add('charcoal', 1);
  telemetry.count('iron_bloom_fixture_charges');
  // A missing recipe fails the check rather than hiding behind n/a.
  sim.order(smith, 'craft', { recipeId: 'smelt_iron', buildingId: station.id });
}
