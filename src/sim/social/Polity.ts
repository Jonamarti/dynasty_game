/**
 * The State, as the band builds it — M15 phase 38b (M14 phase 20b).
 *
 * The plan's nodes in historical order, each with its effect: the temple
 * store (`redistribution`), the written ledger (`accounting`), the levy
 * (`taxation`), the written law (`law_code`), the paid soldier
 * (`standing_army`) and the crown that passes to a son (`kingship`). And,
 * after them, the one thing the plan says a civilisation is: a derived
 * field, never stored, which the game never makes anybody reach.
 *
 * **Everything here hangs off the chief's own head.** A State is the chief
 * knowing how to run one: `templeOf` asks whether *this* chief understands
 * redistribution, exactly as `chiefTermDays` asks whether they understand
 * chiefdom. A band whose chief dies and is replaced by somebody who never
 * learned it loses its temple the same day, with no bookkeeping anywhere to
 * take it away — the conceit `Tech.ts` opens with, one level up.
 *
 * Pure functions and constants. Draws nothing.
 */
import type { Building } from '../entities/Building.ts';
import type { Household } from '../entities/Household.ts';
import type { Person } from '../entities/Person.ts';
import { techPower } from '../knowledge/Tech.ts';
import { isLarder } from './Feast.ts';

/**
 * How many tiles nearer a temple store counts as being, when somebody with
 * surplus food chooses where to put it — `Brain`'s `store` ranking is
 * distance, and this is a pull against it, the same currency as
 * `HOARD_PULL`'s pull toward one's own home.
 *
 * Larger than `HOARD_PULL` (8) at full loyalty and full knowledge, so that a
 * loyal household of a chief who has worked redistribution out walks its
 * surplus past its own door to the temple; smaller at low loyalty, so the
 * greedy and the disaffected still hoard at home. That split is what makes
 * the temple an institution people choose rather than a rule.
 */
export const TEMPLE_PULL = 16;

/**
 * The band's temple store, or null: the chief's largest granary, once the
 * chief understands redistribution.
 *
 * A granary rather than any larder because the plan names one ("the
 * temple-store … `granary` built"), and because it is the one store whose
 * keeping (`preserves`) makes gathering a band's surplus into it worth more
 * than leaving it in the huts. Largest by capacity, ties by id, so the same
 * band always names the same building.
 */
export function templeOf(chief: Person | null | undefined, bandId: number, buildings: readonly Building[]): Building | null {
  if (!chief || chief.bandId !== bandId || techPower(chief, 'redistribution') <= 0) return null;
  let temple: Building | null = null;
  for (const building of buildings) {
    if (building.ownerBandId !== bandId || building.def.id !== 'granary' || !isLarder(building)) continue;
    if (!temple || building.def.storage > temple.def.storage ||
      (building.def.storage === temple.def.storage && building.id < temple.id)) {
      temple = building;
    }
  }
  return temple;
}

/**
 * How strongly `person` is drawn to put their surplus in the temple rather
 * than wherever is nearest, in `TEMPLE_PULL` tiles. Read off the person's own
 * loyalty and the chief's grasp of the idea: the temple is the chief's office,
 * and a half-worked-out office draws half as many.
 */
export function templePull(person: Person, chief: Person): number {
  return TEMPLE_PULL * techPower(chief, 'redistribution') * (0.25 + person.traits.loyalty);
}

/**
 * Renown a household gains for each unit of food it is recorded as having
 * given the temple — M15 phase 38b, `accounting`.
 *
 * Small per unit, because a household storing its harvest gives hundreds of
 * units a year, and renown is read only against the band's own average
 * (`averageRenown`): what this buys is the giving household standing above
 * the hoarding one, not a large number. Half a point a unit, so a basket of
 * a dozen is worth about what a gift is (`DEED_WEIGHT.gift`, 8, at most).
 */
export const CONTRIBUTION_RENOWN = 0.5;

/**
 * Writes a contribution to the temple into the ledger, if the chief keeps
 * one: the household is credited with it (`Household.contributed`) and gains
 * renown for it. Without `accounting` a gift to the temple is just food in a
 * granary — nobody remembers whose it was. Returns whether it was written.
 */
export function recordContribution(household: Household | null, food: number, chief: Person | null | undefined): boolean {
  if (!household || !chief || food <= 0) return false;
  const power = techPower(chief, 'accounting');
  if (power <= 0) return false;
  household.contributed += food;
  household.renown += food * CONTRIBUTION_RENOWN * power;
  return true;
}

/** Whether `chief` writes down what they hear: debts and dockets kept until settled. */
export function keepsAccounts(chief: Person | null | undefined): boolean {
  return !!chief && techPower(chief, 'accounting') > 0;
}

/**
 * The shares a government can set — M15 phase 38b, `taxation`. Zero
 * included, by the plan's wording: a chief who knows how to tax is not made
 * to. Steps rather than a slider because a levy is a custom people can name.
 */
export const TAX_RATES = [0, 0.05, 0.1, 0.2, 0.3] as const;

/** Days a household is left between two levies. */
export const LEVY_EVERY_DAYS = 5;

/**
 * Opinion a taxed adult loses of the chief per levy, at a share of 1 and an
 * ordinary temper: `rate × TAX_RESENTMENT × (0.5 + greed)`. At the heaviest
 * share (0.3) a greedy household loses about ten points a levy, which is what
 * lets a heavy tax feed `considerRebellion` (M6b phase 6) — and at 5% about
 * one and a half, which the ordinary warmth of a band absorbs.
 */
export const TAX_RESENTMENT = 30;

/**
 * The share an NPC chief who knows taxation sets: their greed, read onto the
 * steps. A generous chief taxes lightly or not at all; a greedy one at the
 * heaviest share. The player's chief is never chosen for — `Simulation.setTaxRate`.
 */
export function npcTaxRate(chief: Person): number {
  const index = Math.max(0, Math.min(TAX_RATES.length - 1, Math.round(chief.traits.greed * (TAX_RATES.length - 1))));
  return TAX_RATES[index]!;
}

/**
 * What a household owes at one levy: its share of the food at home, less —
 * when the chief keeps accounts — what it is written down as having given
 * the temple freely since the last levy. The ledger is what makes paying in
 * before you are asked worth anything.
 */
export function dueFrom(foodAtHome: number, rate: number, givenSince: number, written: boolean): number {
  return Math.max(0, Math.floor(foodAtHome * rate) - (written ? givenSince : 0));
}

/** Opinion one taxed adult loses of the chief at one levy. */
export function taxResentment(rate: number, taxed: Person): number {
  return rate * TAX_RESENTMENT * (0.5 + taxed.traits.greed);
}

/**
 * How many soldiers a band keeps for every so many members, at most — M15
 * phase 38b, `standing_army`. One in six: a soldier who does not forage is a
 * mouth the rest must fill, and Akkad's 5,400 were a sliver of the kingdom.
 */
export const MEMBERS_PER_SOLDIER = 6;

/**
 * Portions the temple must hold for each soldier it keeps, the new one
 * included, before the chief will take another into its pay. A soldier is
 * fed from the temple; a temple that cannot feed one does not raise one.
 */
export const SOLDIER_UPKEEP = 12;

/** Whether `chief` can keep another soldier on the temple `temple` holds. */
export function mayKeepSoldier(chief: Person, templeFood: number, soldiers: number, members: number): boolean {
  return techPower(chief, 'standing_army') > 0 &&
    soldiers < Math.floor(members / MEMBERS_PER_SOLDIER) &&
    templeFood >= SOLDIER_UPKEEP * (soldiers + 1);
}

/**
 * How much more a soldier wants to drill than anybody else, as a multiple of
 * `spar`'s ordinary score. Drill is the soldier's work, the way patrolling is
 * a guard's.
 */
export const SOLDIER_DRILL = 2.5;

/** How many tiles nearer the temple counts as for a soldier looking for food. */
export const SOLDIER_RATION_PULL = 20;

/**
 * How much a soldier the temple can feed still wants to forage, pick or hunt
 * for themselves, as a multiple of the ordinary score. Not zero: a soldier
 * far from the temple with a bush in reach still eats from it.
 */
export const SOLDIER_FORAGE = 0.25;
