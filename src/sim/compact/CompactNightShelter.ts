import type { ChildhoodConfig } from '../core/Config.ts';
import type { Building } from '../entities/Building.ts';
import type { Household } from '../entities/Household.ts';
import { canWalk } from '../entities/LifeStage.ts';
import type { Person } from '../entities/Person.ts';

/**
 * The off-map body does not walk and its detailed action stays frozen. The
 * last established local household home is therefore an explicit, conservative
 * approximation of its nightly destination, not evidence of physical sleep.
 * Never grant shelter to a new visitor with no local home, a captive, or a
 * resident whose home no longer exists. No positions, actions, property or RNG
 * streams are changed here.
 *
 * One allocation for the whole comarca, not one per household or band.
 * Stable person IDs decide scarce places independently of roster order,
 * sex or fertility. A carried child who cannot walk shares only an admitted
 * local carrier's place; an older child needs its own, even if the old
 * detailed carriedBy field has not yet been cleared by the compact model.
 */
export function compactNightShelter(
  roster: readonly Person[],
  households: ReadonlyMap<number, Household>,
  buildings: readonly Building[],
  childhood: ChildhoodConfig,
): Map<number, number> {
  const localHomes = new Map(buildings.filter(b => b.complete && !b.ruined &&
    b.def.shelter > 0 && (b.def.places ?? 0) > 0).map(b => [b.id, b]));
  const living = roster.filter(p => p.alive && p.captiveOf === null)
    .sort((a, b) => a.id - b.id);
  const claims = new Map<number, { person: Person; roof: Building }>();
  for (const person of living) {
    if (person.householdId === null) continue;
    const household = households.get(person.householdId);
    if (!household || household.bandId !== person.bandId ||
        !household.memberIds.includes(person.id) || household.homeBuildingId === null) continue;
    const roof = localHomes.get(household.homeBuildingId);
    // Without a detailed permission/occupancy check, do not assume that a
    // different band grants access to its buildings.
    if (!roof || roof.ownerBandId !== person.bandId) continue;
    claims.set(person.id, { person, roof });
  }

  const roofTonight = new Map<number, number>();
  const remaining = new Map([...localHomes].map(([id, roof]) => [id, roof.def.places ?? 0]));
  const carried: { person: Person; roof: Building }[] = [];
  for (const claim of claims.values()) {
    const { person, roof } = claim;
    if (person.carriedBy !== null && !canWalk(person, childhood)) {
      carried.push(claim);
      continue;
    }
    const places = remaining.get(roof.id) ?? 0;
    if (places < 1) continue;
    roofTonight.set(person.id, roof.id);
    remaining.set(roof.id, places - 1);
  }
  for (const { person, roof } of carried) {
    const carrier = claims.get(person.carriedBy!);
    if (carrier && carrier.person.id !== person.id && !carrier.person.isChild &&
        roofTonight.get(carrier.person.id) === roof.id) roofTonight.set(person.id, roof.id);
  }
  return roofTonight;
}
