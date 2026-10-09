import { describe, it, expect } from 'vitest';
import { CompactBandProcessing } from '../compact/CompactBandProcessing.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { ITEMS } from '../entities/Item.ts';
function fixture() {
  const ids = new IdSpace();
  const p = new Person('Miller', 0, 0, 0, new RNG('miller'), 360, ids);
  p.age = 30 * 360; p.knownTech.add('grinding');
  const quern = new Building(BUILDINGS.quern!, 0, 0, 0, ids); quern.complete = true;
  return { p, quern };
}
const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x));
describe('compact grain processing', () => {
  it('uses real ingredients, skill cost and output nutrition rather than feeding raw grain', () => {
    const { p, quern } = fixture();
    const mill = new CompactBandProcessing(0, 6);
    const cost = Math.ceil(RECIPES.groats!.workTicks / p.skillFactor('cook'));
    const first = mill.advanceDay(1, cost - 1, [p], [quern]);
    expect(first.nutritionProduced).toBe(0); expect(mill.grainStock).toBe(6);
    const next = mill.advanceDay(2, 1, [p], [quern]);
    expect(next.grainConsumed).toBe(3); expect(next.nutritionProduced).toBe(ITEMS.meal!.nutrition);
    expect(mill.grainStock).toBe(3);
  });
  it('preserves interrupted work in JSON and never processes twice on a date', () => {
    const { p, quern } = fixture(); const m = new CompactBandProcessing(0, 3);
    m.advanceDay(1, 60, [p], [quern]);
    const r = CompactBandProcessing.fromRecord(wire(m.toRecord()));
    expect(r.advanceDay(2, 60, [p], [quern])).toEqual(m.advanceDay(2, 60, [p], [quern]));
    expect(r.toRecord()).toEqual(m.toRecord());
    expect(() => r.advanceDay(2, 999, [p], [quern])).toThrow(/exactly/);
  });
  it('refuses missing practitioners, grain and stations with explicit reasons', () => {
    const { p, quern } = fixture();
    expect(new CompactBandProcessing(0, 0).advanceDay(1, 999, [p], [quern]).reason).toBe('no_grain');
    expect(new CompactBandProcessing(0, 3).advanceDay(1, 999, [p], []).reason).toBe('no_station');
    p.die('starvation');
    expect(new CompactBandProcessing(0, 3).advanceDay(1, 999, [p], [quern]).nutritionProduced).toBe(0);
  });
  it('rejects corrupt records, negative work and duplicate practitioners', () => {
    const m = new CompactBandProcessing(0, 3); const r = m.toRecord();
    expect(() => CompactBandProcessing.fromRecord({ ...r, extra: 0 })).toThrow();
    expect(() => CompactBandProcessing.fromRecord({ ...r, progress: [{ personId: 1, ticks: 2 }, { personId: 1, ticks: 3 }] })).toThrow();
    expect(() => m.advanceDay(1, -1, [], [])).toThrow();
    expect(m.toRecord()).toEqual(r);
  });
});
