/**
 * Follows every child born during a run, tick by tick, and says why the ones
 * who died died.
 *
 * M15 phase 11c left `lean` at 64.7% mortality before the first year and 100%
 * before the fifth, and a seed-level count ("182 infants starved") cannot say
 * which link broke: whether the mother was dead, far away, busy with something
 * the scorer preferred, or standing beside the baby with nothing to give. This
 * watches the child's needs and the caretakers' actions together and
 * attributes every drop in the child's hunger to what caused it.
 *
 * Read-only: it draws from no stream and writes nothing into the world, so a
 * run with it is the same run as without it.
 *
 *   npm run infants                          (lean, seed 'lean')
 *   npm run infants -- --scenario lean --seeds 5
 *   npm run infants -- --seed lean-3 --verbose
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import type { Person } from '../src/sim/entities/Person.ts';
import { SCENARIOS } from './simcheck.ts';
import { ITEMS } from '../src/sim/entities/Item.ts';
import { lastScores } from '../src/sim/ai/Brain.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';

interface Child {
  id: number;
  bornTick: number;
  motherId: number | null;
  fatherId: number | null;
  /** Ticks with hunger or thirst above the danger line (70). */
  dangerTicks: number;
  /** How the danger ticks split by what the mother was doing, or why she could not. */
  motherDuringDanger: Map<string, number>;
  fatherDuringDanger: Map<string, number>;
  /** For a weaned child in danger with a living mother: which feeding gate held. */
  gateDuringDanger: Map<string, number>;
  /** What the child itself was doing while in danger. */
  selfDuringDanger: Map<string, number>;
  /** Hunger relief by source. */
  relief: Map<string, number>;
  /** Last tick the mother was within 3 tiles. */
  lastMotherNear: number;
  diedTick: number | null;
  cause: string | null;
  ageDaysAtDeath: number | null;
  motherAliveAtDeath: boolean | null;
  motherActionAtDeath: string | null;
  motherHungerAtDeath: number | null;
  motherDistAtDeath: number | null;
  motherFoodAtDeath: number | null;
  prevHunger: number;
  prevThirst: number;
  /** When the mother died, if she died while this child lived; her cause and years. */
  motherDiedTick: number | null;
  motherCause: string | null;
  motherYears: number | null;
}

const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

function args(): { scenario: string; seeds: string[]; steps: number | null; verbose: boolean } {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  const scenario = get('--scenario') ?? 'lean';
  const one = get('--seed');
  const n = Number(get('--seeds') ?? 1);
  const seeds = one ? [one] : Array.from({ length: n }, (_, i) => i === 0 ? scenario : `${scenario}-${i + 1}`);
  const steps = get('--steps') ? Number(get('--steps')) : null;
  return { scenario, seeds, steps, verbose: a.includes('--verbose') };
}

/** The same sum `Brain.carriedNutrition` scores feeding against. */
function carriedFood(p: Person): number {
  let n = 0;
  for (const [id, count] of p.inventory.entries()) n += (ITEMS[id]?.nutrition ?? 0) * count;
  return n;
}

/**
 * Why a living mother is not feeding a weaned child in danger, read off the
 * same gates `Brain`'s `feed` term uses: in sight, hungrier than her by five,
 * and her carried nutrition above her own hunger plus the dependant reserve.
 */
function feedGate(mother: Person, child: Person, sight: number): string {
  if (child.isInfant) return 'infant';
  if (Math.hypot(mother.x - child.x, mother.y - child.y) > sight) return 'out-of-sight';
  if (child.needs.hunger <= mother.needs.hunger + 5) return 'mother-hungrier';
  if (carriedFood(mother) - mother.needs.hunger - 15 <= 0) return 'no-spare-food';
  return mother.action === 'give' ? 'feeding' : 'could-feed:' + mother.action;
}

function caretakerState(p: Person | undefined, child: Person): string {
  if (!p) return 'none';
  if (!p.alive) return 'dead';
  const d = Math.hypot(p.x - child.x, p.y - child.y);
  const where = d <= 3 ? 'near' : d <= 15 ? 'mid' : 'far';
  return `${p.action}@${where}`;
}

function run(scenarioName: string, seed: string, stepsArg: number | null) {
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) throw new Error('unknown scenario ' + scenarioName);
  // Telemetry counters are read at the end; enabling them draws nothing.
  telemetry.reset();
  telemetry.enable();
  const sim = new Simulation({ ...makeConfig(scenario.config), seed });
  const steps = stepsArg ?? scenario.steps;
  const founders = new Set(sim.people.map(p => p.id));
  const children = new Map<number, Child>();
  const tpd = sim.config.time.ticksPerDay;

  const exposure = new Map<string, { days: number; deaths: number; hunger: number; foodDays: number }>();
  const categoryOf = (p: Person): string | null => {
    if (p.isChild) return null;
    if (p.sex === 'male') return 'men';
    const nursing = p.childIds.some(id => { const c = sim.peopleById.get(id); return !!c?.alive && c.isInfant; });
    if (nursing) return 'nursing mothers';
    if (p.pregnant) return 'pregnant';
    return 'other women';
  };
  const lastCategory = new Map<number, string>();
  for (let i = 0; i < steps; i++) {
    sim.step();
    const tick = sim.time.tick;
    // Every stop or abandonment, by action and reason, split by category.
    for (const notice of sim.interruptions) {
      if (seenNotices.has(notice)) continue;
      seenNotices.add(notice);
      const who = sim.peopleById.get(notice.personId);
      const cat = who ? categoryOf(who) : null;
      if (cat) bump(stops, `${cat === 'nursing mothers' ? 'MOTHER' : cat}: ${notice.action}/${notice.reason}`);
    }
    for (const p of sim.peopleById.values()) {
      if (!p.alive) {
        const cat = lastCategory.get(p.id);
        if (cat) {
          const e = exposure.get(cat)!;
          e.deaths++;
          lastCategory.delete(p.id);
          bump(deathCauseByCat, cat + ':' + (p.causeOfDeath ?? '?'));
        }
        continue;
      }
      const cat = categoryOf(p);
      if (!cat) continue;
      lastCategory.set(p.id, cat);
      bump(budget.get(cat) ?? budget.set(cat, new Map()).get(cat)!, p.action);
      // What the cry cut short: the action a nursing mother held the tick
      // before she was switched to `nurse` by the override in `Simulation`.
      const prev = prevAction.get(p.id);
      if (cat === 'nursing mothers' && prev !== undefined && prev !== 'nurse' && prev !== 'carry_baby_home' &&
          (p.action === 'nurse' || p.action === 'carry_baby_home')) {
        bump(cutShort, prev);
      }
      prevAction.set(p.id, p.action);
      // Decision audit: a hungry adult doing something that is not food. Read
      // the last think's top six to tell "no food option was scored at all"
      // from "a food option was scored and something outranked it".
      if (tick % 10 === 0 && p.needs.hunger >= 50 && !FOOD_ACTIONS.has(p.action) && !p.isPlayer) {
        const rows = lastScores.get(p.id) ?? [];
        const food = rows.find(r => FOOD_ACTIONS.has(r.id));
        const band = (cat === 'nursing mothers' ? 'MOTHER ' : '') + (p.needs.hunger >= 75 ? 'h75+' : 'h50-74')
          + (p.carrying >= p.carryCapacity ? ' full-hands' : p.carrying > 0 ? ' holding' : ' empty-handed');
        if (!food) {
          bump(hungryAudit, `${band} no food option · doing ${p.action}`);
          if (verbose && cat === 'nursing mothers' && p.action === 'idle' && examples++ < 6) {
            console.log(`  example: mother ${p.id} tick ${tick} at ${p.x.toFixed(0)},${p.y.toFixed(0)} hunger ${p.needs.hunger.toFixed(0)} top ${rows.map(r => r.id + ':' + r.score.toFixed(2)).join(' ')}`);
          }
          // World truth next to what the person could have used: is there any
          // edible node in sight, within twice sight, or remembered anywhere?
          const edible = (n: { depleted: boolean; def: { itemId: string } }) =>
            !n.depleted && (ITEMS[n.def.itemId]?.nutrition ?? 0) > 0;
          const inSight = !!sim.nodeHash.findNearest(p.x, p.y, sim.config.sightRadius,
            n => edible(n) && sim.world.sameRegion(p.x, p.y, n.x, n.y));
          const inDouble = !!sim.nodeHash.findNearest(p.x, p.y, sim.config.sightRadius * 3,
            n => edible(n) && sim.world.sameRegion(p.x, p.y, n.x, n.y));
          const remembered = ['berries', 'fish'].some(kind =>
            !!p.placeMemory.nearest(`resource:${kind}`, p.x, p.y, m => m.amount > 0));
          const parent = p.childIds.some(id => sim.peopleById.get(id)?.alive);
          const full = p.carrying >= p.carryCapacity;
          const explore = rows.findIndex(r => r.id === 'explore');
          bump(noFoodWhy, [
            parent ? 'parent' : 'childless',
            explore < 0 ? 'no-explore' : explore === 0 ? 'explore-top' : `explore-#${explore + 1}-under-${rows[0]!.id}`,
            inSight ? 'food-in-sight' : inDouble ? 'food-within-3x-sight' : 'no-food-within-3x',
            remembered ? 'remembers-food' : 'remembers-none',
            full ? 'hands-full' : '',
          ].filter(Boolean).join(' · '));
        }
        else bump(hungryAudit, `${band} ${food.id} outranked by ${rows[0]!.id} · doing ${p.action}`);
        bump(hungryTotals, band);
        if (p.order !== null) bump(hungryAudit, `${band} [under order ${p.order}]`);
      }
      if (tick % tpd === 0) {
        const e = exposure.get(cat) ?? { days: 0, deaths: 0, hunger: 0, foodDays: 0 };
        e.days++;
        e.hunger += p.needs.hunger;
        exposure.set(cat, e);
      }
    }
    for (const p of sim.peopleById.values()) {
      if (founders.has(p.id)) continue;
      let c = children.get(p.id);
      if (!c) {
        c = {
          id: p.id, bornTick: tick, motherId: p.motherId, fatherId: p.fatherId,
          dangerTicks: 0, motherDuringDanger: new Map(), fatherDuringDanger: new Map(),
          selfDuringDanger: new Map(), gateDuringDanger: new Map(), relief: new Map(), lastMotherNear: tick,
          diedTick: null, cause: null, ageDaysAtDeath: null, motherAliveAtDeath: null,
          motherActionAtDeath: null, motherHungerAtDeath: null, motherDistAtDeath: null,
          motherFoodAtDeath: null, prevHunger: p.needs.hunger, prevThirst: p.needs.thirst,
          motherDiedTick: null, motherCause: null, motherYears: null,
        };
        children.set(p.id, c);
      }
      if (c.diedTick !== null) continue;
      const mother = c.motherId === null ? undefined : sim.peopleById.get(c.motherId);
      const father = c.fatherId === null ? undefined : sim.peopleById.get(c.fatherId);
      if (c.motherDiedTick === null && mother && !mother.alive) {
        c.motherDiedTick = tick;
        c.motherCause = mother.causeOfDeath;
        c.motherYears = mother.years;
      }
      if (!p.alive) {
        c.diedTick = tick;
        c.cause = p.causeOfDeath;
        c.ageDaysAtDeath = (tick - c.bornTick) / tpd;
        c.motherAliveAtDeath = !!mother?.alive;
        c.motherActionAtDeath = mother?.alive ? mother.action : null;
        c.motherHungerAtDeath = mother?.alive ? mother.needs.hunger : null;
        c.motherDistAtDeath = mother?.alive ? Math.hypot(mother.x - p.x, mother.y - p.y) : null;
        c.motherFoodAtDeath = mother?.alive ? carriedFood(mother) : null;
        continue;
      }
      if (mother?.alive && Math.hypot(mother.x - p.x, mother.y - p.y) <= 3) c.lastMotherNear = tick;
      // Attribute a drop in hunger to whatever could have caused it this tick.
      const drop = c.prevHunger - p.needs.hunger;
      if (drop > 0.5) {
        // A nursing session lands as one 45-point drop at its last tick, after
        // which the mother's action is already cleared; the size of the drop
        // and her being at hand is the reliable signature.
        const src = drop >= 40 ? 'nursed'
          : p.action === 'eat' ? 'ate-own'
          : p.action === 'forage' || p.action === 'pick' ? 'ate-at-source'
          : 'fed-by-hand';
        bump(c.relief, (p.isInfant ? 'infant:' : 'weaned:') + src, drop);
      }
      const inDanger = p.needs.hunger >= 70 || p.needs.thirst >= 70;
      if (inDanger) {
        c.dangerTicks++;
        bump(c.motherDuringDanger, caretakerState(mother, p));
        bump(c.fatherDuringDanger, caretakerState(father, p));
        bump(c.selfDuringDanger, p.action + (p.isInfant ? '(inf)' : ''));
        if (mother?.alive) bump(c.gateDuringDanger, feedGate(mother, p, sim.config.sightRadius));
      }
      c.prevHunger = p.needs.hunger;
      c.prevThirst = p.needs.thirst;
    }
  }
  for (const [k, v] of exposure) {
    const a = aggExposure.get(k) ?? { days: 0, deaths: 0, hunger: 0, foodDays: 0 };
    a.days += v.days; a.deaths += v.deaths; a.hunger += v.hunger;
    aggExposure.set(k, a);
  }
  for (const [k, v] of Object.entries(telemetry.snapshot())) {
    if (/^interrupted_.*_(hungry|thirsty|cold)$/.test(k)) bump(interrupts, k.replace(/^interrupted_/, ''), v as number);
    if (k === 'nursing_sessions' || k === 'wet_nursing_sessions') bump(nursingCounts, k, v as number);
  }
  telemetry.disable();
  return { sim, children, tpd, steps };
}

function top(m: Map<string, number>, n = 8, total?: number): string {
  const sum = total ?? [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${k} ${(100 * v / Math.max(1, sum)).toFixed(0)}%`).join(' · ');
}

const FOOD_ACTIONS = new Set(['eat', 'forage', 'pick', 'take', 'pickup', 'hunt', 'fish', 'butcher', 'harvest', 'reap', 'grind', 'cook', 'roast']);
const hungryAudit = new Map<string, number>();
const hungryTotals = new Map<string, number>();
const noFoodWhy = new Map<string, number>();
const interrupts = new Map<string, number>();
const stops = new Map<string, number>();
let examples = 0;
const seenNotices = new WeakSet<object>();
const nursingCounts = new Map<string, number>();
const budget = new Map<string, Map<string, number>>();
const cutShort = new Map<string, number>();
const prevAction = new Map<number, string>();
const aggExposure = new Map<string, { days: number; deaths: number; hunger: number; foodDays: number }>();
const deathCauseByCat = new Map<string, number>();
const { scenario, seeds, steps, verbose } = args();
const agg = {
  born: 0, died: 0, diedInfant: 0, diedChild: 0,
  causes: new Map<string, number>(),
  motherDeadAtDeath: 0,
  deathAgeBuckets: new Map<string, number>(),
  motherDuringDanger: new Map<string, number>(),
  fatherDuringDanger: new Map<string, number>(),
  selfDuringDanger: new Map<string, number>(),
  gateDuringDanger: new Map<string, number>(),
  relief: new Map<string, number>(),
  motherActionAtDeath: new Map<string, number>(),
  motherFedAtDeath: 0, motherNearAtDeath: 0, motherAliveCount: 0,
  motherCauses: new Map<string, number>(),
  motherDeathChildAge: new Map<string, number>(),
  orphanedSurvived: 0, orphanedDied: 0,
  motherLostWhile: new Map<string, number>(),
};
for (const seed of seeds) {
  const { sim, children, tpd } = run(scenario, seed, steps);
  const dpy = sim.time.daysPerYear;
  for (const c of children.values()) {
    agg.born++;
    for (const [k, v] of c.relief) bump(agg.relief, k, v);
    for (const [k, v] of c.motherDuringDanger) bump(agg.motherDuringDanger, k, v);
    for (const [k, v] of c.fatherDuringDanger) bump(agg.fatherDuringDanger, k, v);
    for (const [k, v] of c.selfDuringDanger) bump(agg.selfDuringDanger, k, v);
    for (const [k, v] of c.gateDuringDanger) bump(agg.gateDuringDanger, k, v);
    if (c.motherDiedTick !== null) {
      bump(agg.motherCauses, c.motherCause ?? '?');
      const a = (c.motherDiedTick - c.bornTick) / tpd;
      bump(agg.motherDeathChildAge, a < 1 ? 'birth-day' : a < dpy ? 'child<1y' : a < 2 * dpy ? 'child1-2y' : 'child2y+');
      bump(agg.motherLostWhile, (c.motherYears ?? 0) < 25 ? 'mother<25y' : (c.motherYears ?? 0) < 40 ? 'mother25-39y' : 'mother40y+');
      if (c.diedTick === null) agg.orphanedSurvived++; else agg.orphanedDied++;
    }
    if (c.diedTick === null) continue;
    agg.died++;
    const age = c.ageDaysAtDeath!;
    const bucket = age < 5 ? '<5d' : age < 20 ? '5-20d' : age < dpy ? `20d-1y` : age < 2 * dpy ? '1-2y' : '2y+';
    bump(agg.deathAgeBuckets, bucket);
    bump(agg.causes, c.cause ?? '?');
    if (!c.motherAliveAtDeath) agg.motherDeadAtDeath++;
    else {
      agg.motherAliveCount++;
      bump(agg.motherActionAtDeath, c.motherActionAtDeath ?? '?');
      if ((c.motherDistAtDeath ?? 99) <= 3) agg.motherNearAtDeath++;
      if ((c.motherFoodAtDeath ?? 0) > 0) agg.motherFedAtDeath++;
    }
    if (verbose) {
      console.log(`  child ${c.id} died ${c.cause} at ${age.toFixed(1)}d; mother ${c.motherAliveAtDeath ? `alive, ${c.motherActionAtDeath}, hunger ${c.motherHungerAtDeath?.toFixed(0)}, ${c.motherDistAtDeath?.toFixed(1)} tiles, food ${c.motherFoodAtDeath}` : 'dead'}; last near ${((c.diedTick - c.lastMotherNear) / tpd).toFixed(1)}d before; danger ${c.dangerTicks}t; mother: ${top(c.motherDuringDanger, 4)}`);
    }
  }
  console.log(`seed ${seed}: ${children.size} born, ${[...children.values()].filter(c => c.diedTick !== null).length} died; days/year ${dpy}, ticks/day ${tpd}`);
}
console.log('==============================================================================');
console.log(`BORN ${agg.born} · DIED ${agg.died}`);
console.log(`AGE AT DEATH  ${top(agg.deathAgeBuckets, 8)}`);
console.log(`CAUSE         ${top(agg.causes, 6)}`);
console.log(`MOTHER AT DEATH  dead ${agg.motherDeadAtDeath} · alive ${agg.motherAliveCount} (within 3 tiles ${agg.motherNearAtDeath}, carrying food ${agg.motherFedAtDeath})`);
console.log(`  her action     ${top(agg.motherActionAtDeath, 10)}`);
console.log(`MOTHERS LOST    ${agg.orphanedDied + agg.orphanedSurvived} children lost their mother (${agg.orphanedDied} of them then died)`);
console.log(`  her cause      ${top(agg.motherCauses, 6)}`);
console.log(`  child's age    ${top(agg.motherDeathChildAge, 6)}`);
console.log(`  her age        ${top(agg.motherLostWhile, 6)}`);
console.log(`ADULT HAZARD (deaths per 100 person-days; mean daily hunger)`);
for (const [k, v] of [...aggExposure.entries()].sort()) {
  console.log(`  ${k.padEnd(16)} ${v.days} days · ${v.deaths} deaths · ${(100 * v.deaths / Math.max(1, v.days)).toFixed(2)} · hunger ${(v.hunger / Math.max(1, v.days)).toFixed(0)}`);
}
console.log(`  causes         ${top(deathCauseByCat, 12)}`);
console.log(`TIME BUDGET (share of ticks)`);
for (const [k, v] of [...budget.entries()].sort()) console.log(`  ${k.padEnd(16)} ${top(v, 12)}`);
console.log(`HUNGRY ADULTS NOT GETTING FOOD (samples: ${top(hungryTotals, 3)})`);
for (const [k, v] of [...hungryAudit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`NO FOOD OPTION, WHY`);
for (const [k, v] of [...noFoodWhy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`NURSING  ${[...nursingCounts.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`CUT OFF BY A NEED (action_need: count)`);
console.log('  ' + [...interrupts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(`STOPS AND ABANDONMENTS (category: action/reason)`);
for (const [k, v] of [...stops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`BABY CARE CUT SHORT ${[...cutShort.values()].reduce((a, b) => a + b, 0)} times: ${top(cutShort, 12)}`);
console.log(`HUNGER RELIEF    ${top(agg.relief)}`);
console.log(`DANGER TICKS (hunger or thirst >= 70), by`);
console.log(`  mother         ${top(agg.motherDuringDanger, 14)}`);
console.log(`  father         ${top(agg.fatherDuringDanger, 10)}`);
console.log(`  child itself   ${top(agg.selfDuringDanger, 10)}`);
console.log(`  feed gate      ${top(agg.gateDuringDanger, 10)}`);
