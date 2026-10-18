import type { Simulation } from '../src/sim/core/Simulation.ts';
import { Building, BUILDINGS } from '../src/sim/entities/Building.ts';
import type { Person } from '../src/sim/entities/Person.ts';

/** Keep the harness anvil close to its worker without allowing it off-map. */
export function placeHarnessAnvil(sim: Simulation, worker: Person): Building {
  const def = BUILDINGS.anvil!;
  const wantedX = Math.round(worker.x) + 8;
  const wantedY = Math.round(worker.y) + 8;
  const furthest = Math.max(sim.world.width, sim.world.height);
  for (let radius = 0; radius < furthest; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = wantedX + dx;
      const y = wantedY + dy;
      if (!sim.canPlace(def, x, y)) continue;
      const station = new Building(def, x, y, worker.bandId, sim.ids);
      station.complete = true;
      sim.buildings.push(station);
      sim.buildingsById.set(station.id, station);
      sim.buildingHash.insert(station);
      return station;
    }
  }
  throw new Error('iron fixture could not place its starting anvil on the map');
}
