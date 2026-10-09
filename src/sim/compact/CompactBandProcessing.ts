/** Finite grain processing with the detailed groats recipe; raw grain never feeds a body. */
import { RECIPES } from '../entities/Recipe.ts';
import { ITEMS } from '../entities/Item.ts';
import { ADULT_YEARS, type Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import { awlFactor, techPower } from '../knowledge/Tech.ts';

export interface CompactBandProcessingRecord {
  readonly recordType: 'CompactBandProcessingRecord'; readonly version: 1;
  readonly lastDay: number; readonly grain: number;
  readonly progress: readonly { personId: number; ticks: number }[];
}
export interface CompactBandProcessingReport {
  readonly day: number; readonly grainConsumed: number; readonly mealsProduced: number;
  readonly nutritionProduced: number; readonly workUsed: number;
  readonly reason: 'ready' | 'no_grain' | 'no_station' | 'no_practitioner' | 'working';
}
function integer(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`invalid ${name}`);
}
export class CompactBandProcessing {
  private progress = new Map<number, number>();
  constructor(private lastDay: number, private grain: number) {
    integer(lastDay, 'processing date'); integer(grain, 'grain');
  }
  get grainStock(): number { return this.grain; }

  /** Work is supplied by the daily labour planner, after reserving time for water, food and care. */
  advanceDay(day: number, workTicks: number, people: readonly Person[], buildings: readonly Building[], grainAdded = 0): CompactBandProcessingReport {
    integer(day, 'processing date'); integer(workTicks, 'processing work'); integer(grainAdded, 'added grain');
    if (day !== this.lastDay + 1) throw new RangeError('processing must advance exactly one day');
    integer(this.grain + grainAdded, 'grain total');
    this.grain += grainAdded; this.lastDay = day;
    const recipe = RECIPES.groats!;
    let grainConsumed = 0, mealsProduced = 0, workUsed = 0;
    const report = (reason: CompactBandProcessingReport['reason']): CompactBandProcessingReport => ({
      day, grainConsumed, mealsProduced, nutritionProduced: mealsProduced * ITEMS.meal!.nutrition, workUsed, reason,
    });
    if (this.grain < recipe.ingredients.grain!) return report('no_grain');
    const worker = [...people].filter(p => p.alive && p.years >= ADULT_YEARS && techPower(p, recipe.tech) > 0).sort((a, b) => a.id - b.id)[0];
    if (!worker) return report('no_practitioner');
    if (!buildings.some(b => b.complete && !b.ruined && b.def.id === recipe.station && b.ownerBandId === worker.bandId)) return report('no_station');
    // Bank on the named practitioner: changing workers cannot turn a novice's hours into a master's batch.
    let banked = this.progress.get(worker.id) ?? 0;
    let remaining = workTicks;
    while (this.grain >= recipe.ingredients.grain!) {
      const cost = Math.max(1, Math.ceil(recipe.workTicks * awlFactor(worker, recipe.id) / worker.skillFactor(recipe.skill)));
      const used = Math.min(remaining, Math.max(0, cost - banked));
      banked += used; remaining -= used; workUsed += used;
      if (banked < cost) break;
      this.grain -= recipe.ingredients.grain!; grainConsumed += recipe.ingredients.grain!;
      mealsProduced += recipe.output.meal!; banked = 0;
      worker.practice(recipe.skill, 3);
      if (remaining === 0) break;
    }
    this.progress.set(worker.id, banked);
    return report(mealsProduced > 0 ? 'ready' : 'working');
  }
  toRecord(): CompactBandProcessingRecord {
    return { recordType: 'CompactBandProcessingRecord', version: 1, lastDay: this.lastDay, grain: this.grain,
      progress: [...this.progress].sort(([a], [b]) => a - b).map(([personId, ticks]) => ({ personId, ticks })) };
  }
  static fromRecord(input: unknown): CompactBandProcessing {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid processing record');
    const r = input as CompactBandProcessingRecord;
    const keys = ['recordType', 'version', 'lastDay', 'grain', 'progress'];
    if (Object.keys(r).length !== keys.length || !keys.every(k => Object.hasOwn(r, k)) || r.recordType !== 'CompactBandProcessingRecord' || r.version !== 1 || !Array.isArray(r.progress)) throw new TypeError('invalid processing record');
    const model = new CompactBandProcessing(r.lastDay, r.grain);
    for (const p of r.progress) {
      if (!p || Object.keys(p).length !== 2 || !Object.hasOwn(p, 'personId') || !Object.hasOwn(p, 'ticks')) throw new TypeError('invalid processing progress');
      integer(p.personId, 'practitioner id'); integer(p.ticks, 'processing ticks');
      if (model.progress.has(p.personId)) throw new TypeError('duplicate processing practitioner');
      model.progress.set(p.personId, p.ticks);
    }
    return model;
  }
}
