/**
 * Deterministic physical harvest policy shared by parked compact bands.
 *
 * This reducer consumes the same ResourceNode stock and uses the detailed
 * harvest action's work and yield formulas. The 25% adult work share is an
 * explicit v1 design budget, not a calibration claim. It deliberately leaves
 * game herds to the wildlife model rather than turning fauna into free rations.
 */
import type { CompactPerson } from '../compact/CompactPerson.ts';
import type { CompactBandRuntimeQuotaPlan } from '../compact/CompactBandRuntime.ts';
import { forageYieldFactor } from '../knowledge/Tech.ts';
import { ITEMS } from '../entities/Item.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { RATION_NUTRITION } from './ResourceProfile.ts';

export const COMARCA_OFFMAP_HARVEST_WORK_FRACTION = 0.25;

export interface ComarcaOffmapHarvestResult {
  readonly workTicks: number;
  readonly workTicksBySource: Readonly<Record<'gather' | 'fish' | 'game', number>>;
  readonly producedBySource: Readonly<Record<'gather' | 'fish' | 'game', number>>;
  readonly producedRations: number;
  readonly items: Readonly<Record<string, number>>;
}

const SOURCE_FOR_KIND: Readonly<Record<string, 'gather' | 'fish' | undefined>> = {
  berries: 'gather', wild_grain: 'gather', fish: 'fish',
};

/**
 * Spend a fixed share of adult work ticks on named edible ResourceNodes.
 * Person and node order are stable, each pull debits the real node, and every
 * reported ration is computed from the actual item yield. Repeated calls are
 * safe only for disjoint dated intervals, exactly like the resource clock.
 */
export function advanceComarcaOffmapHarvest(
  nodes: readonly ResourceNode[], roster: readonly CompactPerson[], durationTicks: number,
  workFraction = COMARCA_OFFMAP_HARVEST_WORK_FRACTION,
): ComarcaOffmapHarvestResult {
  if (!Number.isSafeInteger(durationTicks) || durationTicks < 0) throw new RangeError('harvest duration must be safe and non-negative');
  if (!Number.isFinite(workFraction) || workFraction < 0 || workFraction > 1) throw new RangeError('harvest work fraction must be in [0,1]');
  const workers = roster.filter(member => member.person.alive && !member.person.isChild)
    .sort((a, b) => a.person.id - b.person.id);
  const edibleNodes = [...nodes].filter(node => SOURCE_FOR_KIND[node.kind] !== undefined &&
      (ITEMS[node.itemId]?.nutrition ?? 0) > 0 && (node.kind === 'berries' ? node.itemId === 'berries' : node.kind === 'wild_grain' ? node.itemId === 'grain' : node.itemId === 'fish'))
    .sort((a, b) => a.id - b.id);
  const perWorkerBudget = Math.floor(durationTicks * workFraction);
  const workTicksBySource = { gather: 0, fish: 0, game: 0 };
  const producedBySource = { gather: 0, fish: 0, game: 0 };
  const items: Record<string, number> = {};
  let workTicks = 0;
  for (const worker of workers) {
    let remaining = perWorkerBudget;
    // One pull per node per pass. A depleted or inaccessible node is skipped;
    // a later pass can use remaining ticks after another node yields.
    while (remaining > 0) {
      let didWork = false;
      for (const node of edibleNodes) {
        if (node.depleted) continue;
        const skill = worker.person.skillFactor(node.def.skill);
        if (!Number.isFinite(skill) || skill <= 0) throw new RangeError(`invalid ${node.def.skill} work factor for person ${worker.person.id}`);
        const cost = Math.ceil(node.def.harvestTicks / skill);
        if (cost > remaining) continue;
        const harpoon = node.kind === 'fish' && worker.person.inventory.has('spear') &&
          (worker.person.equipment.left?.item === 'spear' || worker.person.equipment.right?.item === 'spear');
        const requested = Math.max(1, Math.round((1 + skill) * forageYieldFactor(worker.person, node.kind) * (harpoon ? 1.5 : 1)));
        const count = node.take(requested);
        if (count <= 0) continue;
        const itemId = node.itemId;
        const nutrition = ITEMS[itemId]?.nutrition ?? 0;
        if (!Number.isFinite(nutrition) || nutrition <= 0) continue;
        const source = SOURCE_FOR_KIND[node.kind]!;
        remaining -= cost;
        workTicks += cost;
        workTicksBySource[source] += cost;
        producedBySource[source] += count * nutrition / RATION_NUTRITION;
        items[itemId] = (items[itemId] ?? 0) + count;
        didWork = true;
        break;
      }
      if (!didWork) break;
    }
  }
  const producedRations = producedBySource.gather + producedBySource.fish + producedBySource.game;
  if (!Number.isFinite(producedRations)) throw new RangeError('off-map harvest rations overflow');
  return { workTicks, workTicksBySource, producedBySource, producedRations, items };
}

/** Give finite nutrition equally in stable person-ID order; shortage is shared evenly. */
export function allocateComarcaOffmapNutrition(
  roster: readonly CompactPerson[], finiteNutrition: number, finiteWater: number | 'unbounded' = 0,
): CompactBandRuntimeQuotaPlan {
  if (!Number.isFinite(finiteNutrition) || finiteNutrition < 0) throw new RangeError('finite nutrition must be non-negative');
  if (finiteWater !== 'unbounded' && (!Number.isFinite(finiteWater) || finiteWater < 0)) throw new RangeError('finite water must be non-negative');
  const living = roster.filter(member => member.person.alive).sort((a, b) => a.person.id - b.person.id);
  const foodShare = living.length ? finiteNutrition / living.length : 0;
  const waterShare = finiteWater === 'unbounded' ? 'unbounded' : living.length ? finiteWater / living.length : 0;
  return { allocations: living.map(member => ({ personId: member.person.id, foodQuota: foodShare, waterQuota: waterShare })) };
}

/**
 * Withdraw finite physical food without returning more nutrition than requested.
 * Item quantities are fractional after spoilage, so `(requested / nutrition) * nutrition`
 * can exceed `requested` by one floating-point ulp; CompactBody correctly rejects a real
 * over-credit, but that representation noise must not crash a parked comarca.
 */
export function consumeComarcaOffmapNutrition(inventories: readonly Inventory[], requested: number): number {
  if (!Number.isFinite(requested) || requested < 0) throw new RangeError('requested nutrition must be finite and non-negative');
  let consumed = 0;
  for (const inventory of inventories) for (const [item, amount] of inventory.entries()) {
    const nutrition = ITEMS[item]?.nutrition ?? 0;
    if (nutrition <= 0 || consumed >= requested) continue;
    const remaining = requested - consumed;
    const count = Math.min(amount, remaining / nutrition);
    if (count <= 0 || amount - count === amount) continue;
    const actual = inventory.remove(item, count) * nutrition;
    // Cap the reported relief at the original request; physical stock still reflects
    // the exact fractional quantity removed from Inventory.
    consumed = Math.min(requested, consumed + actual);
  }
  return consumed;
}

import { ComarcaEcology, type ComarcaEcologyRecord } from './ComarcaEcology.ts';
import type { TileLedgerEntry } from '../persistence/TileLedger.ts';
import type { WorldGeography } from './WorldGeography.ts';
import { fromCheckpointRecord, type CheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toPersonRecord, toHouseholdRecord, toBandRecord } from '../persistence/EntityRecords.ts';
import { toRelationshipGraphRecord } from '../persistence/SocialRecords.ts';
import { fromWorldObjectRecord } from '../persistence/WorldObjectRecords.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { compactBandNeedsHooks } from '../compact/CompactBandNeeds.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { MEASURED_RATES } from '../compact/MeasuredRates.ts';
import { fromCompactRecord, toCompactRecord, deriveCompactStream, goalOf, type CompactPersonRecord } from '../compact/CompactPerson.ts';
import { advanceCompactBandLife, type CompactBandLifeLedger } from '../compact/CompactBandLife.ts';
import { advanceCompactBandKnowledge, createCompactBandKnowledgeState, fromCompactBandKnowledgeRecord, toCompactBandKnowledgeRecord, type CompactBandKnowledgeState } from '../compact/CompactBandKnowledge.ts';
import { regionMaterials, LEARN_MU_START, PARTIAL_START } from './PeopleKnowledge.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { Inventory } from '../entities/Item.ts';
import { isWell } from '../entities/Building.ts';

/** A single dated authority: the checkpoint is data, never a second running Simulation. */
export interface ComarcaOffmapRuntimeRecord {
  readonly recordType: 'ComarcaOffmapRuntime'; readonly version: 1;
  readonly checkpoint: CheckpointRecord; readonly ecology: ComarcaEcologyRecord;
  readonly compact: readonly CompactPersonRecord[];
  readonly work: readonly (readonly [number, number])[];
  readonly life: readonly (readonly [number, CompactBandLifeLedger])[];
  readonly knowledge: readonly CompactBandKnowledgeState[];
}
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export class ComarcaOffmapRuntime {
  private constructor(private record: ComarcaOffmapRuntimeRecord) {}
  static start(checkpoint: CheckpointRecord, entry: TileLedgerEntry, continuity?: ReadonlyMap<number,Omit<CompactPersonRecord,'person'>>, ecologyStreams?: Pick<ComarcaEcologyRecord,'forestRng'|'wildlifeRng'|'ecologyRng'|'wildlifeOwed'>): ComarcaOffmapRuntime {
    const state = fromCheckpointRecord(checkpoint);
    if (checkpoint.lastAdvancedTick !== entry.lastAdvancedTick) throw new RangeError('Off-map terrain and roster dates differ');
    const compact = state.roster.activePeople.filter(p => p.alive).map(person => ({ person,
      lastAdvancedTick: checkpoint.lastAdvancedTick, epoch: 1, rng: deriveCompactStream(state.config.seed, person.id),
      goal: goalOf(person, checkpoint.lastAdvancedTick), intake: null }));
    const bandIds = [...new Set(compact.map(c => c.person.bandId))].sort((a,b) => a-b);
    const ecology = ComarcaEcology.start(entry, { time: state.config.time, spoilRate: state.config.needs.spoilRate,
      snowDepth: checkpoint.ledgers.snowDepth, ids: checkpoint.ids });
    return new ComarcaOffmapRuntime({ recordType: 'ComarcaOffmapRuntime', version: 1, checkpoint: copy(checkpoint),
      ecology: {...ecology.toRecord(),...ecologyStreams}, compact: compact.map(c=>{ const record=toCompactRecord(c), prior=continuity?.get(c.person.id); return prior ? {...record,rng:prior.rng,intake:prior.intake,epoch:prior.epoch+1} : record; }), work: [],
      life: bandIds.map(id => [id, { version: 1, lastAdvancedDay: state.execution.time.day }]),
      knowledge: bandIds.map(id => createCompactBandKnowledgeState(state.config.seed, id,
        Math.floor(state.execution.time.day / state.config.time.daysPerSeason))) });
  }
  static fromRecord(input: ComarcaOffmapRuntimeRecord): ComarcaOffmapRuntime {
    if (!input || input.recordType !== 'ComarcaOffmapRuntime' || input.version !== 1 ||
        Object.keys(input).sort().join() !== 'checkpoint,compact,ecology,knowledge,life,recordType,version,work') throw new TypeError('Invalid off-map record');
    const state = fromCheckpointRecord(input.checkpoint);
    const ecology = ComarcaEcology.fromRecord(input.ecology).toRecord();
    if (ecology.entry.lastAdvancedTick !== input.checkpoint.lastAdvancedTick) throw new RangeError('Off-map clocks differ');
    const seen = new Set<number>();
    for (const raw of input.compact) {
      const c = fromCompactRecord(raw);
      if (raw.lastAdvancedTick !== input.checkpoint.lastAdvancedTick || seen.has(c.person.id) || !state.roster.peopleById.has(c.person.id) ||
          JSON.stringify(toPersonRecord(state.roster.peopleById.get(c.person.id)!, raw.lastAdvancedTick)) !== JSON.stringify(raw.person)) throw new TypeError('Off-map identity differs');
      seen.add(c.person.id);
    }
    if (state.roster.activePeople.some(p=>p.alive && !seen.has(p.id))) throw new TypeError('Off-map roster is incomplete');
    const workIds = new Set<number>();
    for (const [id, credit] of input.work) if (workIds.has(id) || !seen.has(id) || !Number.isFinite(credit) || credit < 0 || credit > 140) throw new TypeError('Invalid work credit'); else workIds.add(id);
    const lifeIds=new Set<number>();
    for(const [id,ledger] of input.life) {
      if(lifeIds.has(id)||!state.roster.bandsById.has(id)||ledger.version!==1||ledger.lastAdvancedDay!==state.execution.time.day) throw new TypeError('Invalid off-map life date');
      lifeIds.add(id);
    }
    const knowledgeIds=new Set<number>();
    for(const k of input.knowledge) {
      fromCompactBandKnowledgeRecord(toCompactBandKnowledgeRecord(k));
      if(knowledgeIds.has(k.bandId)||!state.roster.bandsById.has(k.bandId)) throw new TypeError('Invalid off-map knowledge'); knowledgeIds.add(k.bandId);
    }
    return new ComarcaOffmapRuntime(copy(input));
  }
  /** Keep event streams and pending work when a scout leaves an already compact roster. */
  static rebase(checkpoint: CheckpointRecord, entry: TileLedgerEntry, prior?: ComarcaOffmapRuntimeRecord | null, continuity?: ReadonlyMap<number,Omit<CompactPersonRecord,'person'>>): ComarcaOffmapRuntime {
    const fresh = this.start(checkpoint,entry,continuity).toRecord();
    if (!prior) return this.fromRecord(fresh);
    const old = new Map(prior.compact.map(c=>[c.personId,c]));
    const retained = fresh.compact.map(c=>{ const p = old.get(c.personId); return p ? {...p, person:c.person, lastAdvancedTick:c.lastAdvancedTick} : c; });
    const bands = new Set(retained.map(c=>fromCompactRecord(c).person.bandId));
    const seen = new Set(retained.map(c=>c.personId));
    return this.fromRecord({...fresh,compact:retained,work:prior.work.filter(([id])=>seen.has(id)),
      life:fresh.life.map(([id,ledger])=>[id,prior.life.find(([band])=>band===id)?.[1] ?? ledger]),
      knowledge:[...prior.knowledge.filter(k=>bands.has(k.bandId)),...fresh.knowledge.filter(k=>!prior.knowledge.some(old=>old.bandId===k.bandId))],
      ecology:{...prior.ecology,entry:fresh.ecology.entry,ids:fresh.checkpoint.ids}});
  }
  toRecord(): ComarcaOffmapRuntimeRecord { return copy(this.record); }
  materialize(): CheckpointRecord { return copy(this.record.checkpoint); }

  /** Advance body, real harvesting and ecology together, with no detailed AI or step(). */
  advanceTo(targetTick: number, geography: WorldGeography, worldIds?: IdSpace, parentArchive?: (id:number)=>import('../entities/Person.ts').Person|null): ComarcaOffmapRuntimeRecord {
    const base = this.record;
    if (!Number.isSafeInteger(targetTick) || targetTick < base.checkpoint.lastAdvancedTick) throw new RangeError('Off-map clock moved backwards');
    if (targetTick === base.checkpoint.lastAdvancedTick) return this.toRecord();
    const state = fromCheckpointRecord(base.checkpoint);
    const ids = IdSpace.fromSnapshot(worldIds?.snapshot() ?? base.checkpoint.ids);
    const compact = base.compact.map(raw => { const c = fromCompactRecord(raw); return { ...c, person: state.roster.peopleById.get(raw.personId)! }; });
    const work = new Map(base.work), life = new Map(base.life), knowledge = new Map(base.knowledge.map(k => [k.bandId,k]));
    const config = state.config;
    const ecology = ComarcaEcology.fromRecord(base.ecology);
    const inhabitedBands = new Set(compact.filter(c => c.person.alive).map(c => c.person.bandId));
    const result = ecology.advanceTo(targetTick, geography, { ids, peopleById: state.roster.peopleById,
      inhabitedBands,
      onTick: (tick, clock, world, objects) => {
        inhabitedBands.clear(); for (const c of compact) if (c.person.alive) inhabitedBands.add(c.person.bandId);
        const living = compact.filter(c => c.person.alive).sort((a,b) => a.person.id-b.person.id);
        const inventories = (bandId: number): Inventory[] => [
          ...living.filter(c => c.person.bandId === bandId).map(c => c.person.inventory),
          ...objects.buildings.filter(b => b.ownerBandId === bandId && b.complete && !b.ruined).sort((a,b)=>a.id-b.id).map(b=>b.store),
          ...objects.piles.sort((a,b)=>a.id-b.id).map(p=>p.contents),
        ];
        const nutritionOf = (stocks: Inventory[]) => stocks.reduce((total, inventory) => total + inventory.entries().reduce((n,[id,count]) => n + (ITEMS[id]?.nutrition ?? 0)*count,0),0);
        for (const member of living) {
          const person = member.person;
          if (person.isChild || person.needs.cold > config.needs.workLimits.cold || person.needs.fatigue > 80) continue;
          // Two days of food is an explicit buffer, never a second potential harvest.
          if (nutritionOf(inventories(person.bandId)) >= living.filter(c=>c.person.bandId===person.bandId).length * RATION_NUTRITION * 2) continue;
          // Banking is bounded: a sheltered year cannot purchase an instant year of harvest.
          work.set(person.id, Math.min(140, (work.get(person.id) ?? 0) + COMARCA_OFFMAP_HARVEST_WORK_FRACTION));
          for (const node of objects.nodes) {
            if (node.depleted || !SOURCE_FOR_KIND[node.kind] || (ITEMS[node.itemId]?.nutrition ?? 0) <= 0) continue;
            const cost = Math.ceil(node.def.harvestTicks / person.skillFactor(node.def.skill));
            if ((work.get(person.id) ?? 0) < cost) continue;
            const harvest = advanceComarcaOffmapHarvest([node], [member], cost*4);
            if (harvest.workTicks === 0) continue;
            work.set(person.id, (work.get(person.id) ?? 0)-harvest.workTicks);
            for (const [item,count] of Object.entries(harvest.items)) person.inventory.add(item,count);
            break;
          }
        }
        const foodQuota = new Map<number,number>();
        for (const band of state.roster.bands) {
          const members = living.filter(c=>c.person.bandId===band.id);
          const share = members.length ? nutritionOf(inventories(band.id))/members.length : 0;
          for (const c of members) foodQuota.set(c.person.id,share);
        }
        const body = new CompactBody({ needs: config.needs, time: config.time, world, buildings: objects.buildings,
          hooks: compactBandNeedsHooks(state.roster.peopleById, config.childhood, config.time, config.needs),
          intake: { model: new IntakeModel(MEASURED_RATES), capacity: () => undefined, childhood: config.childhood },
          nextEventId: () => ids.allocate('socialEvent'),
          ration: (member,_at,hunger,thirst) => {
            const requested = Math.min(hunger, foodQuota.get(member.person.id) ?? 0);
            const consumed = consumeComarcaOffmapNutrition(inventories(member.person.bandId), requested);
            return { hunger: consumed, thirst: world.freshShore.length || objects.buildings.some(b=>b.complete&&!b.ruined&&isWell(b.def)) ? thirst : 0 };
          },
        });
        for (const member of compact) { body.advance(member,tick); member.lastAdvancedTick = tick; }
        if (tick % config.time.ticksPerDay === 0) {
          for (const band of state.roster.bands) {
            const members = compact.filter(c=>c.person.bandId===band.id);
            const advanced = advanceCompactBandLife(members, { ledger: life.get(band.id) ?? { version: 1, lastAdvancedDay: null }, tick, day: clock.day,
              time: config.time, population: config.population, childhood: config.childhood, learning: config.learning, worldSeed: config.seed,
              ids, peopleById: state.roster.peopleById, parentArchive, householdsById: state.roster.householdsById, relationships: state.roster.relationships,
              roofTonight: new Map() });
            life.set(band.id,advanced.ledger); compact.push(...advanced.newborns);
            const season = Math.floor(clock.day/config.time.daysPerSeason);
            const old = knowledge.get(band.id) ?? createCompactBandKnowledgeState(config.seed,band.id,season-1);
            if (season > old.lastSeason) {
              const learnt = advanceCompactBandKnowledge(old, { season, seasonOfYear: clock.season,
                members: compact.filter(c=>c.person.bandId===band.id).map(c=>c.person),
                region: { materials: regionMaterials(), climate: { temperature: Math.max(0,Math.min(1,(clock.temperature+1)/2)), wetness: .5 } },
                mu: LEARN_MU_START, partial: PARTIAL_START });
              knowledge.set(band.id,learnt.state);
            }
            if (band.chiefId !== null && !state.roster.peopleById.get(band.chiefId)?.alive) { band.chiefId = null; band.chiefSince = null; }
          }
          if (config.needs.spoilRate > 0) for (const member of compact) member.person.inventory.spoil(config.time.ticksPerDay*config.needs.spoilRate,()=>1,true);
        }
      },
    });
    const tick = targetTick, day = config.time.startDay + Math.floor(tick/config.time.ticksPerDay);
    const allPeople = [...state.roster.peopleById.values()];
    const checkpoint: CheckpointRecord = { ...copy(base.checkpoint), lastAdvancedTick: tick, ids: ids.snapshot(),
      execution: { ...base.checkpoint.execution, lastAdvancedTick: tick, time: { ...base.checkpoint.execution.time, tick } },
      terrain: result.entry.terrain, objects: result.entry.objects,
      roster: { ...base.checkpoint.roster, lastAdvancedTick: tick, people: allPeople.map(p=>toPersonRecord(p,tick)),
        activePersonIds: [...new Set([...base.checkpoint.roster.activePersonIds,...compact.map(c=>c.person.id)])],
        households: [...state.roster.householdsById.values()].map(h=>toHouseholdRecord(h,tick)),
        bands: state.roster.bands.map(b=>toBandRecord(b,tick)), relationships: toRelationshipGraphRecord(state.roster.relationships) },
      ledgers: { ...base.checkpoint.ledgers, lastAdvancedTick: tick, lastAdvancedDay: day, snowDepth: result.record.snowDepth,
        wildlifeOwed: result.record.wildlifeOwed.map(([id,value])=>[id,value]),
        bandSystem: { ...base.checkpoint.ledgers.bandSystem, chiefByBand: state.roster.bands.filter(b=>b.chiefId!==null).map(b=>[b.id,b.chiefId!]) } },
    };
    // Rebind corpse references through the canonical roster before publishing.
    fromWorldObjectRecord(checkpoint.objects,state.roster.peopleById);
    fromCheckpointRecord(checkpoint);
    this.record = { ...base, checkpoint, ecology: result.record, compact: compact.map(toCompactRecord),
      work: [...work].sort((a,b)=>a[0]-b[0]), life: [...life].sort((a,b)=>a[0]-b[0]), knowledge: [...knowledge.values()].sort((a,b)=>a.bandId-b.bandId) };
    worldIds?.restore(ids.snapshot());
    return this.toRecord();
  }
}
