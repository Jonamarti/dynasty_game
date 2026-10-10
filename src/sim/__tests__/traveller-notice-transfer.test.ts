import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toLedgerRecord, fromLedgerRecord } from '../persistence/LedgerRecords.ts';

describe('traveller notice queues', () => {
  it('keeps bounded, loadable queues when a traveller brings notices to a full destination', () => {
    const source = new Simulation({ seed: 'notice-source', world: { width: 32, height: 32 },
      population: { bands: 1, peoplePerBand: 4 } });
    const destination = new Simulation({ seed: 'notice-destination', world: { width: 32, height: 32 },
      population: { bands: 1, peoplePerBand: 4 } }, source.ids);
    const traveller = source.livingPeople()[0]!;
    const resident = destination.livingPeople()[0]!;
    destination.world.setWalkable(1, 1, true);
    for (let i = 0; i < 32; i++) {
      destination.interruptions.push({ personId: resident.id, action: 'build', reason: `resident-${i}`, recipe: null });
      destination.insights.push({ personId: resident.id, text: `resident-${i}`, kind: 'idea' });
      destination.helpCalls.push({ callerId: resident.id, x: resident.x, y: resident.y });
    }
    const stop = { personId: traveller.id, action: 'chop', reason: 'thirsty', recipe: null };
    source.interruptions.push(stop);
    source.insights.push({ personId: traveller.id, text: 'traveller-insight', kind: 'gain' });
    source.helpCalls.push({ callerId: traveller.id, x: traveller.x, y: traveller.y });
    source.transferTravellersTo(destination, [traveller.id], 'w');
    expect(destination.interruptions).toHaveLength(32);
    expect(destination.interruptions[0]!.reason).toBe('resident-1');
    expect(destination.interruptions.at(-1)).toEqual(stop);
    expect(destination.insights).toHaveLength(32);
    expect(destination.helpCalls).toHaveLength(32);
    expect(source.interruptions).toHaveLength(0);
    const saved = JSON.parse(JSON.stringify(toLedgerRecord(destination)));
    expect(() => fromLedgerRecord(saved, destination.peopleById, destination.buildingsById)).not.toThrow();
  });
});
