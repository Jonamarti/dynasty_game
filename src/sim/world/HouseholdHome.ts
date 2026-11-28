import type { Building } from '../entities/Building.ts';
import type { Household } from '../entities/Household.ts';
import type { Person } from '../entities/Person.ts';

function usableHome(roof: Building | undefined): boolean {
  return !!roof && roof.complete && !roof.ruined &&
    roof.def.shelter > 0 && (roof.def.places ?? 0) > 0;
}

/**
 * Infer a single home from the completed admitted sleep sample. Keep the
 * actual roof of each person separate. Preserve a sound home with a sleeper;
 * moving requires a strict majority of all eligible local members elsewhere.
 * For a first or replacement home, require a majority of observed sleepers.
 * Ties and no evidence retain the old reference, including archived homes.
 * No inventory moves, RNG, new persistent state or roster-order dependence.
 */
export function householdHomeAfterNight(
  household: Household,
  peopleById: ReadonlyMap<number, Person>,
  sleepingRoof: ReadonlyMap<number, number>,
  buildingsById: ReadonlyMap<number, Building>,
): number | null {
  const previous = household.homeBuildingId;
  const previousUsable = previous !== null && usableHome(buildingsById.get(previous));
  const counts = new Map<number, number>();
  let eligible = 0;
  let observed = 0;
  for (const id of household.memberIds) {
    const member = peopleById.get(id);
    if (!member?.alive || member.householdId !== household.id ||
        member.carriedBy !== null || member.captiveOf !== null) continue;
    eligible++;
    const roofId = sleepingRoof.get(id);
    if (roofId === undefined || !usableHome(buildingsById.get(roofId))) continue;
    observed++;
    counts.set(roofId, (counts.get(roofId) ?? 0) + 1);
  }
  if (previousUsable && counts.has(previous!)) return previous;
  const majorityOf = previousUsable ? eligible : observed;
  for (const [roofId, votes] of counts) {
    if (votes * 2 > majorityOf) return roofId; // at most one strict majority
  }
  return previous;
}
