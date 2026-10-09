import type { Simulation, Band } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import { t } from '../../i18n/i18n.ts';

/** Starting relationship between a parent people and the daughter it sends away. */
export const MIGRANT_DAUGHTER_STANDING = 60;

export interface MigrantFission {
  readonly parentBandId: number;
  readonly daughterBandId: number;
  readonly memberIds: readonly number[];
}

interface BandLedgers {
  normsByBand: Map<number, Band['norms']>;
  strangerRegardByBand: Map<number, number>;
}

/**
 * Turn only a partial, approved migration into a daughter band. Both Sims are
 * staging owners during a WorldState crossing, so all preconditions are checked
 * before either roster is changed; an ordinary traveler never calls this.
 *
 * A whole band moving keeps its identity. A genuine fission needs people of the
 * original band to remain in the source and the departing party to form a new
 * social identity in the destination.
 */
export function fissionMigratingParty(
  source: Simulation,
  destination: Simulation,
  travellerIds: readonly number[],
): readonly MigrantFission[] {
  if (source === destination || source.ids !== destination.ids) {
    throw new RangeError('Band fission requires distinct simulations with shared world identities');
  }
  if (travellerIds.length === 0 || new Set(travellerIds).size !== travellerIds.length) {
    throw new RangeError('A migrating party needs unique people');
  }

  const travellers = travellerIds.map(id => {
    const person = destination.peopleById.get(id);
    if (!person?.alive || !destination.people.includes(person)) {
      throw new RangeError(`Migrating person ${id} is not canonical in the destination`);
    }
    return person;
  }).sort((a, b) => a.id - b.id);
  const byBand = new Map<number, Person[]>();
  for (const person of travellers) {
    const members = byBand.get(person.bandId) ?? [];
    members.push(person);
    byBand.set(person.bandId, members);
  }

  const splits = [...byBand].sort(([a], [b]) => a - b).flatMap(([parentBandId, members]) => {
    const parent = source.bands.find(band => band.id === parentBandId);
    const destinationCopy = destination.bands.find(band => band.id === parentBandId);
    const remaining = source.people.some(person => person.alive && person.bandId === parentBandId);
    if (!parent || !destinationCopy) throw new RangeError(`Migrating band ${parentBandId} is not registered on both sides`);
    return remaining ? [{ parent, destinationCopy, members }] : [];
  });
  if (splits.length === 0) return [];

  // All canonical roster and metadata checks happen before claiming new IDs.
  const destinationBands = new Set(destination.bands.map(band => band.id));
  const sourceBands = new Set(source.bands.map(band => band.id));
  if (splits.some(({ parent }) => !sourceBands.has(parent.id) || !destinationBands.has(parent.id))) {
    throw new RangeError('Both parent band records must be present before fission');
  }

  const results: MigrantFission[] = [];
  const privateLedgers = destination as unknown as BandLedgers;
  for (const { parent, destinationCopy, members } of splits) {
    const daughterBandId = source.ids.claimGroupAtOrAfter('band', 0);
    const chief = members.find(person => person.id === parent.chiefId) ?? null;
    const daughter: Band = {
      id: daughterBandId,
      name: t('{name} migrants', { name: parent.name }),
      homeX: members.reduce((sum, person) => sum + person.x, 0) / members.length,
      homeY: members.reduce((sum, person) => sum + person.y, 0) / members.length,
      norms: structuredClone(parent.norms),
      strangerRegard: parent.strangerRegard,
      chiefId: chief?.id ?? null,
      chiefSince: chief ? destination.time.day : null,
      claimedCells: new Set(),
      outcast: false,
      ...(parent.taxRate === undefined ? {} : { taxRate: parent.taxRate }),
    };

    const memberIds = new Set(members.map(person => person.id));
    for (const person of members) person.bandId = daughterBandId;
    for (const household of destination.households) {
      if (household.memberIds.some(id => memberIds.has(id))) household.bandId = daughterBandId;
    }
    destination.bands.push(daughter);
    privateLedgers.normsByBand.set(daughterBandId, daughter.norms);
    privateLedgers.strangerRegardByBand.set(daughterBandId, daughter.strangerRegard);
    if (chief) destination.bandSystem.chiefByBand.set(daughterBandId, chief.id);
    // The copied parent record is only a transfer scaffold when no one in the
    // destination remains under that identity; retain it when a prior party does.
    if (!destination.people.some(person => person.alive && person.bandId === parent.id)) {
      destination.bands = destination.bands.filter(band => band.id !== destinationCopy.id);
      privateLedgers.normsByBand.delete(parent.id);
      privateLedgers.strangerRegardByBand.delete(parent.id);
      destination.bandSystem.chiefByBand.delete(parent.id);
      destination.templeByBand.delete(parent.id);
    }
    destination.bandRelations.add(parent.id, daughterBandId, MIGRANT_DAUGHTER_STANDING);
    results.push({ parentBandId: parent.id, daughterBandId, memberIds: members.map(person => person.id) });
  }
  return results;
}
