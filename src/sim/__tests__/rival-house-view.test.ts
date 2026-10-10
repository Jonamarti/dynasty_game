import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { fromHouseholdRecord, toHouseholdRecord } from '../persistence/EntityRecords.ts';
import { knownRivalHouses, type RivalHouseContext } from '../../ui/RivalHouseView.ts';

function fixture() {
  const sim = new Simulation({
    seed: 'phase36-rival-house-view',
    world: { width: 64, height: 64, berryBushes: 20, flintOutcrops: 6, deadwood: 8, gameHerds: 2 },
    population: { bands: 2, peoplePerBand: 5 },
  });
  const observer = sim.livingPeople().find(person => person.householdId !== null)!;
  const own = sim.householdsById.get(observer.householdId!)!;
  // A different same-band household is already named by Knowledge. These
  // privacy cases need an actual stranger, rather than silently testing kin.
  const rivalPerson = sim.livingPeople().find(person => person.bandId !== observer.bandId)!;
  const rival = sim.householdsById.get(rivalPerson.householdId!)!;
  own.feud.set(rival.id, 45);
  own.feudSuspects.set(rival.id, rivalPerson.id);
  return { sim, observer, own, rival, rivalPerson };
}

function context({ sim, observer, own, rival }: ReturnType<typeof fixture>): RivalHouseContext {
  return {
    observer,
    householdsById: new Map([[own.id, own], [rival.id, rival]]),
    peopleById: sim.peopleById,
    relationships: sim.relationships,
  };
}

describe('rival household view projection', () => {
  it('does not expose a rival name or roster when the observer knows nobody there', () => {
    const f = fixture();
    const rows = knownRivalHouses(context(f));
    expect(rows).toEqual([{ id: f.rival.id, people: [] }]);
    expect(JSON.stringify(rows)).not.toContain(f.rival.name);
    expect(JSON.stringify(rows)).not.toContain(f.rivalPerson.name);
  });

  it('shows only members whose names Knowledge lets the observer use', () => {
    const f = fixture();
    f.sim.relationships.edge(f.observer.id, f.rivalPerson.id).familiarity = 12;
    const rows = knownRivalHouses(context(f));
    expect(rows[0]?.people).toEqual([f.rivalPerson.name]);
  });

  it('retains an unnamed feud by household ID when the rival archive is temporarily absent', () => {
    const f = fixture();
    const input = context(f);
    const rows = knownRivalHouses({ ...input, householdsById: new Map([[f.own.id, f.own]]) });
    expect(rows).toEqual([{ id: f.rival.id, people: [] }]);
  });

  it('continues showing the same rival after the existing HouseholdRecord round trip', () => {
    const f = fixture();
    const archivedOwn = fromHouseholdRecord(JSON.parse(JSON.stringify(toHouseholdRecord(f.own, f.sim.time.tick))));
    const rows = knownRivalHouses({
      observer: f.observer,
      householdsById: new Map([[archivedOwn.id, archivedOwn], [f.rival.id, f.rival]]),
      peopleById: f.sim.peopleById,
      relationships: f.sim.relationships,
    });
    expect(rows[0]?.id).toBe(f.rival.id);
    expect(archivedOwn.feud.get(f.rival.id)).toBe(45);
    expect(archivedOwn.feudSuspects.get(f.rival.id)).toBe(f.rivalPerson.id);
  });

  it('does not enumerate a rival recorded only in the rival household ledger', () => {
    const f = fixture();
    const third = f.sim.households.find(household => household.id !== f.own.id && household.id !== f.rival.id)!;
    f.rival.feud.set(third.id, 80);
    expect(knownRivalHouses(context(f)).map(row => row.id)).toEqual([f.rival.id]);
  });
});
