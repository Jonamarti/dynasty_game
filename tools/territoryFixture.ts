import type { Simulation } from '../src/sim/core/Simulation.ts';
import type { Building } from '../src/sim/entities/Building.ts';

/** Place a fixture station on its band's claimed cell without changing later AI. */
export function placeFixtureStation(
  sim: Simulation, defId: string, x: number, y: number, bandId: number, sponsorId?: number | null,
): Building | null {
  const band = sim.bands.find(candidate => candidate.id === bandId);
  if (!band) throw new Error(`fixture band ${bandId} does not exist`);
  const previous = band.claimedCells ?? new Set<string>();
  const key = `${Math.floor(x / 8)},${Math.floor(y / 8)}`;
  const claimedTemporarily = sim.territoryOwnerAt(x, y) === null;
  band.claimedCells ??= new Set();
  if (claimedTemporarily) band.claimedCells.add(key);
  try {
    return sim.place(defId, x, y, bandId, sponsorId);
  } finally {
    if (claimedTemporarily) band.claimedCells.delete(key);
    if (previous.size === 0 && band.claimedCells.size === 0) band.claimedCells = previous;
  }
}
