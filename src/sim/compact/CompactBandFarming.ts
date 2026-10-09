/** Named bands farm actual Crop/Soil records, paying the same seed, work, growth and drawdown as detailed fields. */
import { Crop, SOW_SEED, SOW_TICKS, REAP_TICKS, harvestYield } from '../entities/Field.ts';
import { Soil } from '../core/Soil.ts';
import type { Person } from '../entities/Person.ts';
import { techPower, reapFactor, calendarFactor } from '../knowledge/Tech.ts';
import { toObjectGraph, fromObjectGraph, registerGraphPrototype, type ObjectGraph } from '../persistence/GraphRecords.ts';
registerGraphPrototype('Crop', Crop);
registerGraphPrototype('Soil', Soil);

export interface CompactFarmPlot {
  readonly id: number;
  readonly crop: Crop;
  readonly soil: Soil;
  readonly tiles: readonly number[];
  sowWork: number;
  reapWork: number;
}
export interface CompactBandFarmRecord {
  readonly recordType: 'CompactBandFarmRecord'; readonly version: 1;
  readonly bandId: number; readonly lastDay: number; readonly seedGrain: number;
  readonly graph: ObjectGraph;
}
export interface CompactFarmDayReport {
  readonly day: number; readonly harvestedGrain: number; readonly seedSpent: number;
  readonly workUsed: number; readonly fieldsSown: number; readonly fieldsReaped: number;
}
function number(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('invalid farm ' + label);
}

export class CompactBandFarming {
  private lastDay: number;
  private grain: number;
  private readonly plots: CompactFarmPlot[];
  constructor(readonly bandId: number, lastDay: number, seedGrain: number, plots: readonly CompactFarmPlot[]) {
    if (!Number.isSafeInteger(bandId) || bandId < 0 || !Number.isSafeInteger(lastDay) || lastDay < 0) throw new RangeError('invalid farm date or band');
    if (!Number.isSafeInteger(seedGrain) || seedGrain < 0) throw new RangeError('invalid seed grain');
    if (!Array.isArray(plots)) throw new TypeError('farm plots must be an array');
    this.lastDay = lastDay; this.grain = seedGrain;
    this.plots = (fromObjectGraph(toObjectGraph({ plots }), 'Object') as { plots: CompactFarmPlot[] }).plots;
    const ids = new Set<number>(), occupied = new Map<Soil, Set<number>>();
    for (const plot of this.plots) {
      if (!Number.isSafeInteger(plot.id) || plot.id < 1 || ids.has(plot.id) || !(plot.crop instanceof Crop) || !(plot.soil instanceof Soil) || !Array.isArray(plot.tiles) || !plot.tiles.length) throw new TypeError('invalid farm plot');
      if (!['fallow', 'growing', 'ripe'].includes(plot.crop.stage) || !Number.isFinite(plot.crop.growth) || plot.crop.growth < 0 || plot.crop.growth > 1 || !Number.isSafeInteger(plot.crop.sownDay) || !Number.isSafeInteger(plot.crop.ripeDay) || !Number.isSafeInteger(plot.crop.harvests) || plot.crop.harvests < 0 || !Number.isSafeInteger(plot.crop.lost) || plot.crop.lost < 0 || !Number.isFinite(plot.crop.ploughYieldFactor) || plot.crop.ploughYieldFactor <= 0) throw new TypeError('invalid crop state');
      if (plot.soil.texture.length !== plot.soil.organic.length || plot.soil.nutrient.length !== plot.soil.organic.length || plot.soil.organic.length === 0) throw new TypeError('invalid farm soil arrays');
      ids.add(plot.id);
      number(plot.sowWork, 'sow work'); number(plot.reapWork, 'reap work');
      if (plot.sowWork >= SOW_TICKS || plot.reapWork > REAP_TICKS) throw new RangeError('farm work exceeds a field threshold');
      const seen = occupied.get(plot.soil) ?? new Set<number>(); occupied.set(plot.soil, seen);
      for (const tile of plot.tiles) {
        if (!Number.isSafeInteger(tile) || tile < 0 || tile >= plot.soil.organic.length || seen.has(tile)) throw new TypeError('invalid or overlapping farm tile');
        seen.add(tile);
      }
    }
    this.plots.sort((a, b) => a.id - b.id);
  }
  get seedGrain(): number { return this.grain; }
  get plotCount(): number { return this.plots.length; }
  /** Read a field's owned records without exposing the internal roster array. */
  plot(id: number): Readonly<CompactFarmPlot> | null { return this.plots.find(plot => plot.id === id) ?? null; }

  /** Keep one paid seed charge per plot; only genuinely harvested surplus can become food. */
  takeEdibleGrain(): number {
    const surplus = Math.max(0, this.grain - this.plots.length * SOW_SEED);
    this.grain -= surplus;
    return surplus;
  }

  advanceDay(day: number, growth: number, people: readonly Person[], workTicks: number, cultivable: boolean): CompactFarmDayReport {
    if (day !== this.lastDay + 1) throw new RangeError('farm must advance exactly one day');
    number(growth, 'growth'); number(workTicks, 'work');
    if (growth > 1) throw new RangeError('farm growth must be between 0 and 1');
    if (typeof cultivable !== 'boolean') throw new TypeError('invalid cultivable flag');
    if (!Array.isArray(people)) throw new TypeError('farm workers must be an array');
    const workers = people.filter(p => p.alive && !p.isChild && p.bandId === this.bandId).sort((a, b) => a.id - b.id);
    let remaining = workTicks, seedSpent = 0, harvestedGrain = 0, fieldsSown = 0, fieldsReaped = 0;
    // Recover each retained soil once, even if two fields share it. Growth reads the game's clock, not a date table.
    for (const soil of new Set(this.plots.map(p => p.soil))) soil.recover(1);
    for (const plot of this.plots) {
      if (plot.crop.advance(day, growth)) { plot.reapWork = 0; plot.sowWork = 0; }
      if (plot.crop.stage === 'ripe') {
        const farmer = workers[0];
        if (!farmer || remaining === 0) continue;
        const cost = REAP_TICKS * reapFactor(farmer);
        const used = Math.min(remaining, Math.max(0, cost - plot.reapWork));
        plot.reapWork += used; remaining -= used;
        if (plot.reapWork < cost) continue;
        const fertility = plot.tiles.reduce((sum, tile) => sum + plot.soil.effectiveFertility(tile), 0) / plot.tiles.length;
        const grasp = Math.max(0.5, techPower(farmer, 'farming')) * calendarFactor(farmer);
        const yielded = Math.round(harvestYield(fertility, farmer.skillFactor('farm'), grasp) * plot.crop.ploughYieldFactor);
        plot.crop.reaped(yielded); plot.reapWork = 0;
        for (const tile of plot.tiles) plot.soil.reap(tile);
        this.grain += yielded; harvestedGrain += yielded; fieldsReaped++;
      } else if (plot.crop.isFallow && cultivable && growth > 0 && this.grain >= SOW_SEED && !plot.soil.isPlotSpent(plot.tiles)) {
        const farmer = workers.find(p => techPower(p, 'farming') > 0);
        if (!farmer || remaining === 0) continue;
        const used = Math.min(remaining, Math.max(0, SOW_TICKS - plot.sowWork));
        plot.sowWork += used; remaining -= used;
        if (plot.sowWork < SOW_TICKS) continue;
        this.grain -= SOW_SEED; seedSpent += SOW_SEED;
        plot.crop.sow(day); plot.sowWork = 0;
        for (const tile of plot.tiles) plot.soil.till(tile);
        fieldsSown++;
      }
    }
    this.lastDay = day;
    return { day, harvestedGrain, seedSpent, workUsed: workTicks - remaining, fieldsSown, fieldsReaped };
  }

  toRecord(): CompactBandFarmRecord {
    return { recordType: 'CompactBandFarmRecord', version: 1, bandId: this.bandId,
      lastDay: this.lastDay, seedGrain: this.grain, graph: toObjectGraph({ plots: this.plots }) };
  }
  static fromRecord(input: unknown): CompactBandFarming {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid farm record');
    const raw = input as CompactBandFarmRecord;
    if (Object.keys(raw).length !== 6 || !['recordType', 'version', 'bandId', 'lastDay', 'seedGrain', 'graph'].every(k => Object.hasOwn(raw, k)) || raw.recordType !== 'CompactBandFarmRecord' || raw.version !== 1) throw new TypeError('invalid farm record');
    const root = fromObjectGraph(raw.graph, 'Object') as { plots: CompactFarmPlot[] };
    if (!Array.isArray(root.plots)) throw new TypeError('missing farm plots');
    return new CompactBandFarming(raw.bandId, raw.lastDay, raw.seedGrain, root.plots);
  }
}
