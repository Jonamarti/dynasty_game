import { describe, expect, it } from 'vitest';
import { IdSpace } from '../core/IdSpace.ts';
import { Soil } from '../core/Soil.ts';
import { Crop, harvestYield, REAP_TICKS, SOW_SEED, SOW_TICKS } from '../entities/Field.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { CompactBandFarming, type CompactFarmPlot } from '../compact/CompactBandFarming.ts';

function ground(fertility = 0.8): Soil {
  return new Soil(2, new Float32Array([fertility, fertility, fertility, fertility]), () => 0.5);
}
function plot(soil = ground()): CompactFarmPlot {
  return { id: 1, crop: new Crop(), soil, tiles: [0, 1], sowWork: 0, reapWork: 0 };
}
function farmer(): Person {
  const person = new Person('Aru', 1, 1, 0, new RNG('compact-farmer'), 40, new IdSpace());
  person.age = 20 * person.daysPerYear;
  person.knownTech.add('farming');
  return person;
}
function wire<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

describe('compact band farming', () => {
  it('grows and harvests a real Crop, spends finite seed, and draws down the real Soil', () => {
    const farm = new CompactBandFarming(0, 0, SOW_SEED, [plot()]);
    const field = farm.plot(1)!;
    const worker = farmer();
    const sow = farm.advanceDay(1, 1, [worker], SOW_TICKS, true);
    expect(sow).toMatchObject({ fieldsSown: 1, seedSpent: SOW_SEED, workUsed: SOW_TICKS });
    expect(field.crop.stage).toBe('growing');
    expect(farm.seedGrain).toBe(0);
    expect(field.soil.organic[0]).toBeLessThan(field.soil.restingFertility(0));

    for (let day = 2; day <= 6; day++) farm.advanceDay(day, 1, [worker], 0, true);
    expect(field.crop.stage).toBe('ripe');
    const fertility = (field.soil.effectiveFertility(0) + field.soil.effectiveFertility(1)) / 2;
    const expected = harvestYield(fertility, worker.skillFactor('farm'), 1);
    const nutrientBefore = field.soil.nutrient[0]!;
    const reap = farm.advanceDay(7, 1, [worker], REAP_TICKS, true);
    expect(reap).toMatchObject({ fieldsReaped: 1, harvestedGrain: expected, workUsed: REAP_TICKS });
    expect(field.crop.stage).toBe('fallow');
    expect(field.crop.lastYield).toBe(expected);
    expect(field.soil.nutrient[0]).toBeLessThan(nutrientBefore);
    expect(farm.seedGrain).toBe(expected);
    expect(farm.takeEdibleGrain()).toBe(Math.max(0, expected - SOW_SEED));
    expect(farm.seedGrain).toBe(Math.min(expected, SOW_SEED));
  });

  it('does not mint seed or spend work when seed is short or the comarca is not cultivable', () => {
    const worker = farmer();
    const short = new CompactBandFarming(0, 0, SOW_SEED - 1, [plot()]);
    expect(short.advanceDay(1, 1, [worker], SOW_TICKS, true)).toMatchObject({
      fieldsSown: 0, seedSpent: 0, workUsed: 0,
    });
    expect(short.seedGrain).toBe(SOW_SEED - 1);
    const blocked = new CompactBandFarming(0, 0, SOW_SEED, [plot()]);
    expect(blocked.advanceDay(1, 1, [worker], SOW_TICKS, false)).toMatchObject({
      fieldsSown: 0, seedSpent: 0, workUsed: 0,
    });
    expect(blocked.seedGrain).toBe(SOW_SEED);
    expect(blocked.advanceDay(2, 1, [worker], SOW_TICKS, true).fieldsSown).toBe(1);
    expect(blocked.seedGrain).toBe(0);
  });

  it('banks incomplete sow work through a JSON Soil/Crop graph and resumes the same result', () => {
    const worker = farmer();
    const original = new CompactBandFarming(0, 0, SOW_SEED, [plot()]);
    original.advanceDay(1, 1, [worker], SOW_TICKS - 1, true);
    const restored = CompactBandFarming.fromRecord(wire(original.toRecord()));
    expect(restored.advanceDay(2, 1, [worker], 1, true).fieldsSown).toBe(1);
    expect(original.advanceDay(2, 1, [worker], 1, true).fieldsSown).toBe(1);
    expect(wire(restored.toRecord())).toEqual(wire(original.toRecord()));
    expect(() => restored.advanceDay(2, 1, [worker], 1, true)).toThrow(/exactly one day/);
  });

  it('rejects malformed crop state, invalid plot tiles and impossible growth inputs', () => {
    const badCrop = plot();
    badCrop.crop.stage = 'buried' as never;
    expect(() => new CompactBandFarming(0, 0, SOW_SEED, [badCrop])).toThrow(/crop state/);
    const badTiles = plot();
    expect(() => new CompactBandFarming(0, 0, SOW_SEED, [{ ...badTiles, tiles: [0, 4] }])).toThrow(/tile/);
    expect(() => ground().isPlotSpent([-1])).toThrow(/soil tile/);
    const farm = new CompactBandFarming(0, 0, SOW_SEED, [plot()]);
    expect(() => farm.advanceDay(1, 2, [farmer()], 0, true)).toThrow(/between 0 and 1/);
  });
  it('uses average plot fertility like detailed sowing, so one exhausted tile does not veto healthy ground', () => {
    const soil = ground();
    soil.organic[0] = 0;
    soil.nutrient[0] = 0;
    expect(soil.isSpent(0)).toBe(true);
    expect(soil.isPlotSpent([0, 1])).toBe(false);
    const farm = new CompactBandFarming(0, 0, SOW_SEED, [plot(soil)]);
    const field = farm.plot(1)!;
    expect(farm.advanceDay(1, 1, [farmer()], SOW_TICKS, true).fieldsSown).toBe(1);
    expect(field.soil.organic[1]).toBeLessThan(0.656);
  });
});
