/**
 * What a wrong leaves owing, and paying it — M12 phase 2a.
 *
 * The plan: between a grudge and a blow, real societies put **compensation**
 * — the Germanic *wergild*, cattle for a killing among herders, a pig for an
 * insult in the highlands. Whoever wronged somebody pays, the wronged accepts
 * or does not, and if they accept, the matter is closed. It gives wealth a use
 * that is social rather than material, and it is the first thing in this
 * game that can *end* a grievance instead of only letting it fade.
 *
 * The owner's choice (2026-09-24), after phase 1 had ended theft and blows
 * inside a band: **a debt is a debt, whoever it is owed to**. Most of what is
 * owed now is owed across a band line — a stranger's pack emptied, a
 * stranger menaced or beaten — and that is where compensation historically
 * lived, as the price of not starting a feud. So nothing here asks whose
 * people anybody belongs to except to decide how much they mind.
 *
 * **A debt is known to exactly two people**: whoever did it, and whoever it
 * was done to, who was standing there (every site that incurs one is a deed
 * done to the victim's face). Nobody else learns of it except by being told —
 * which is phase 2b's complaint to the chief.
 *
 * Pure functions and one small record per debt. Draws nothing.
 */
import type { Person } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';

/** A wrong not yet paid for, kept on whoever did it. */
export interface Debt {
  /** Who is owed. */
  toId: number;
  /** Their people when it was done: a debt across a band line is one between peoples. */
  toBandId: number;
  /** The worst wrong behind it, for the story and for how much it is minded. */
  kind: 'theft' | 'threaten' | 'assault';
  /** What would square it, in `ItemDef.baseValue` units. */
  worth: number;
  /** Goods taken, returned first when it is paid — the thing itself before its value. */
  goods: { itemId: string; count: number }[];
  /** When it was last added to. A debt fades with the grudge behind it. */
  tick: number;
  /** When the one owed last refused what was offered; not asked again for a while. */
  refusedTick: number;
}

/**
 * What a threat and a blow are worth in goods, per unit of the deed's
 * magnitude. A beating is worth a couple of tools; a menace that took
 * nothing, a handful of food. Theft is its own measure — what was taken.
 */
export const THREAT_WORTH = 2;
export const ASSAULT_WORTH = 6;

/** How many debts one person keeps; past this the oldest is forgotten. */
const MAX_DEBTS = 6;

/**
 * How long a debt is remembered, in days — a year of the current calendar.
 * `Memory`'s decay forgets most grievances well inside that; a debt nobody
 * has come for in a year is a debt nobody is coming for.
 */
export const DEBT_DAYS = 40;

/** How long after a refusal before the same offer is made again, in ticks: two days. */
export const REFUSAL_COOLDOWN = 480;

/**
 * Records that `actor` now owes `target` for `kind`, adding to what they
 * already owe them. Children incur nothing: a child who does wrong is
 * corrected by their own people (`Restraint.ts`), and what a child owes a
 * stranger is their parents' question — phase 2b's.
 */
export function incur(
  actor: Person, target: Person, kind: Debt['kind'], worth: number, tick: number,
  goods?: { itemId: string; count: number }
): void {
  if (actor.isChild || actor.id === target.id || worth <= 0) return;
  let debt = actor.debts.find(d => d.toId === target.id);
  if (!debt) {
    debt = { toId: target.id, toBandId: target.bandId, kind, worth: 0, goods: [], tick, refusedTick: -99999 };
    actor.debts.push(debt);
    if (actor.debts.length > MAX_DEBTS) actor.debts.shift();
  }
  debt.worth += worth;
  debt.tick = tick;
  if (SEVERITY[kind] > SEVERITY[debt.kind]) debt.kind = kind;
  if (goods && goods.count > 0) {
    const held = debt.goods.find(g => g.itemId === goods.itemId);
    if (held) held.count += goods.count;
    else debt.goods.push({ ...goods });
  }
}

const SEVERITY: Record<Debt['kind'], number> = { theft: 1, threaten: 2, assault: 3 };

/** What `actor` owes `toId`, if anything. Stale debts are gone already: `pruneDebts`, daily. */
export function debtTo(actor: Person, toId: number): Debt | null {
  return actor.debts.find(d => d.toId === toId) ?? null;
}

/** Forgets one debt, paid. */
export function settleDebt(actor: Person, toId: number): void {
  actor.debts = actor.debts.filter(d => d.toId !== toId);
}

/** Forgets debts to the dead and debts too old to matter. Called daily. */
export function pruneDebts(person: Person, tick: number, ticksPerDay: number,
  alive: (id: number) => boolean): void {
  if (person.debts.length === 0) return;
  person.debts = person.debts.filter(d => alive(d.toId) && tick - d.tick <= DEBT_DAYS * ticksPerDay);
}

/**
 * What `payer` could hand over for `debt`, and what it is worth: the goods
 * that were taken first, as many as are still in hand, then the most valuable
 * of everything else carried until the debt is met. Never more than is owed —
 * nobody pays a stranger twice over for an armful of berries.
 */
export function offerFor(payer: Person, debt: Debt): { items: [string, number][]; value: number } {
  const items: [string, number][] = [];
  let value = 0;
  const held = new Map(payer.inventory.entries());
  const take = (itemId: string, most: number): void => {
    const have = held.get(itemId) ?? 0;
    const unit = ITEMS[itemId]?.baseValue ?? 1;
    const want = Math.min(have, most, Math.ceil((debt.worth - value) / unit));
    if (want <= 0) return;
    items.push([itemId, want]);
    held.set(itemId, have - want);
    value += want * unit;
  };
  for (const good of debt.goods) {
    if (value >= debt.worth) break;
    take(good.itemId, good.count);
  }
  const rest = [...held.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => (ITEMS[b[0]]?.baseValue ?? 1) - (ITEMS[a[0]]?.baseValue ?? 1) || (a[0] < b[0] ? -1 : 1));
  for (const [itemId, count] of rest) {
    if (value >= debt.worth) break;
    take(itemId, count);
  }
  return { items, value };
}

/**
 * How much of a debt has to be offered before anybody will think of paying
 * it: half. Coming with a quarter of what was taken is not making amends, it
 * is an insult with gifts.
 */
export const OFFER_AT_LEAST = 0.5;

/**
 * Whether `owed` takes what `payer` offers, as a chance 0-1.
 *
 * The offer's adequacy first — half of what is owed is worth half a yes — and
 * then the temperament of whoever was wronged: malice and a quick temper
 * would rather keep the grievance, and somebody the payer frightens takes
 * what is offered sooner. One of their own people is met a little way; that
 * is what belonging to the same people means.
 */
export function acceptance(owed: Person, payer: Person, value: number, worth: number, dread: number): number {
  const adequacy = Math.min(1, value / Math.max(1, worth));
  const temper = 1.1 - owed.traits.malice * 0.6 - owed.traits.aggression * 0.3;
  const kin = owed.bandId === payer.bandId ? 0.2 : 0;
  return Math.max(0, Math.min(1, adequacy * temper + kin + dread * 0.3));
}

/**
 * `make_amends`'s score before proximity: below a gift at its warmest, above
 * idleness. A debt is paid when somebody has the goods, the grievance is felt,
 * and nothing more pressing is on — not the moment it is incurred.
 */
export const AMENDS = 0.9;

/** Ticks to make an offer once there: the goods set down, a few words. */
export const AMENDS_TICKS = 12;
