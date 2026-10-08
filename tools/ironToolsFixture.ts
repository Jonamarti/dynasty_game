/** Four supplied, ordered iron-tool charges; measures craft and readers, not economy. */
import type { Simulation } from '../src/sim/core/Simulation.ts';
import { Building, BUILDINGS } from '../src/sim/entities/Building.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';

const TOOLS = [
  { recipe: 'iron_axe', iron: 1 },
  { recipe: 'iron_adze', iron: 1 },
  { recipe: 'iron_sickle', iron: 1 },
  { recipe: 'iron_spade', iron: 2 },
] as const;

export function setupIronTools(sim: Simulation): void {
  const workers = sim.livingPeople().filter(person => !person.isChild).slice(0, TOOLS.length);
  if (workers.length !== TOOLS.length) throw new Error('ironworkers needs four adults');
  const smith = workers[0]!;
  const station = new Building(BUILDINGS.anvil!, Math.round(smith.x) + 8, Math.round(smith.y) + 8, smith.bandId, sim.ids);
  station.complete = true;
  sim.buildings.push(station);
  sim.buildingsById.set(station.id, station);
  sim.buildingHash.insert(station);

  TOOLS.forEach(({ recipe, iron }, index) => {
    const worker = workers[index]!;
    worker.x = station.centerX;
    worker.y = station.centerY;
    worker.needs.hunger = worker.needs.thirst = worker.needs.cold = worker.needs.fatigue = 0;
    worker.workedTicks = 0;
    worker.skills.smith = 70;
    // This is a supplied-knowledge fixture, analogous to startingTech in a scenario.
    worker.knownTech.add('iron_tools' as never);
    for (const [item, count] of worker.inventory.entries()) worker.inventory.remove(item, count);
    worker.inventory.add('wrought_iron', iron);
    if (recipe === 'iron_spade') worker.inventory.add('sticks', 1);
    telemetry.count('iron_tools_fixture_' + recipe + '_charges');
    // A missing recipe leaves an applicable failed gate instead of n/a.
    sim.order(worker, 'craft', { recipeId: recipe, buildingId: station.id });
  });
}
