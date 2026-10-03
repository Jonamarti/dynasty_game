/**
 * The feast — M15 phase 38a, the half of `brewing` M14 left pending.
 *
 * The plan: "the chief spends surplus (beer, bread, meat) on a feast that
 * gathers the band: it raises their renown and the opinion of whoever comes.
 * It is redistribution before the temple, and archaeology puts it at the
 * origin of chiefdoms. It finally finds the surplus `gift` was missing" —
 * `docs/bugs.md`, "Nobody carries a spare". A spare *in the pack* is rare,
 * because crafting stops at `RecipeDef.keep`; a spare *in the store* is the
 * ordinary state of any household that has been storing food all autumn, and
 * a feast is the first thing in the game that turns it into standing.
 *
 * **Nobody is told to feast.** A host is somebody who knows `brewing`, has a
 * cup to pour and a store to pour from, sees people of their own around it,
 * and has a reason: their household standing below the band's (the "big
 * man" of `statusPressure`), or lonely people about them. A greedy host
 * feasts less, because a feast is the store going down. Guests are
 * whoever sees a feast under way and is hungry, lonely, or fond of the host
 * (`attend`). Who gains what is the deed machinery's: a `feast` is a deed
 * that every guest and bystander sees, so the host's household gains renown
 * through `SocialSystem.onDeed` and every witness thinks better of them,
 * weighted by their own people's norms. Nothing here writes standing directly.
 *
 * Pure functions and constants. Draws nothing.
 */
import type { Building } from '../entities/Building.ts';
import { isHeap, isHerd, isTrap } from '../entities/Building.ts';
import type { Household } from '../entities/Household.ts';
import { ITEMS, type Inventory } from '../entities/Item.ts';
import { isRisky } from '../entities/Body.ts';
import type { Person } from '../entities/Person.ts';
import { techPower } from '../knowledge/Tech.ts';

/**
 * Ticks a feast runs once the host is at the store: an evening's eating. Under
 * the ~140 ticks above which `AGENTS.md` asks long work to bank its progress —
 * a feast broken off is a feast over, not one to come back to.
 */
export const FEAST_TICKS = 96;

/** Ticks between two portions handed out: one guest at a time, as a host does. */
export const SERVE_EVERY = 6;

/**
 * How many portions a store must hold beyond what the household eats before a
 * feast is worth calling. Sixteen is what `FEAST_TICKS / SERVE_EVERY` could
 * hand out: a host does not call the band to a table they cannot fill.
 */
export const FEAST_MIN_FOOD = FEAST_TICKS / SERVE_EVERY;

/**
 * How many of the host's people must be in sight of the store before calling
 * them is worth it. Three is a gathering; one is a meal shared.
 */
export const FEAST_MIN_GUESTS = 3;

/** How far from the store a guest has to be for the host to see them coming. */
export const FEAST_RADIUS = 24;

/** How close a guest sits to the host to be served. */
export const FEAST_SEAT = 4;

/**
 * Days a household waits between feasts. A feast every evening is a larder
 * emptied in a week; one every few days is what a household that keeps a
 * surplus can stand.
 */
export const FEAST_INTERVAL_DAYS = 4;

/** `feast`'s score before proximity: a little above a gift, a little under eating when hungry. */
export const FEAST = 0.9;

/** `attend`'s score before proximity. */
export const ATTEND = 0.7;

/**
 * Company a cup of beer at a feast takes away — the same relief `doToast`
 * gives, since it is the same cup.
 */
export const FEAST_CUP_RELIEF = 12;

/** Company the gathering itself takes away from each guest served. */
export const FEAST_COMPANY = 8;

/** True if a design is somewhere food can be kept and fetched back out of. */
export function isLarder(building: Building): boolean {
  return building.complete && !building.ruined && building.def.storage > 0 &&
    !isTrap(building.def) && !isHerd(building.def) && !isHeap(building.def);
}

/** Whether a food is safe to set before a guest: nobody serves raw meat. */
export function servable(itemId: string): boolean {
  const def = ITEMS[itemId];
  return def !== undefined && def.nutrition > 0 && def.class === 'food' && !isRisky(itemId);
}

/** How many servable portions an inventory holds, beer included. */
export function portions(store: Inventory): number {
  let total = 0;
  for (const [itemId, count] of store.entries()) if (servable(itemId)) total += count;
  return total;
}

/**
 * The servable food a store holds most of, ties by id — what a household
 * pays its due in (`BandSystem.levyTaxes`): the thing it has plenty of.
 */
export function mostOf(store: Inventory): string | null {
  let best: string | null = null;
  let most = 0;
  for (const [itemId, count] of store.entries()) {
    if (!servable(itemId)) continue;
    if (count > most || (count === most && best !== null && itemId < best)) {
      best = itemId;
      most = count;
    }
  }
  return best;
}

/**
 * What to put in front of a guest next: beer to somebody lonelier than they
 * are hungry (it is a cup to share, not a meal), otherwise the most filling
 * thing the store holds. Ties broken by id so the same store always serves
 * the same dish.
 */
export function dishFor(guest: Person, store: Inventory): string | null {
  if (store.has('beer') && guest.needs.company > guest.needs.hunger) return 'beer';
  let best: string | null = null;
  let bestNutrition = 0;
  for (const [itemId, count] of store.entries()) {
    if (count <= 0 || itemId === 'beer' || !servable(itemId)) continue;
    const nutrition = ITEMS[itemId]!.nutrition;
    if (nutrition > bestNutrition || (nutrition === bestNutrition && best !== null && itemId < best)) {
      best = itemId;
      bestNutrition = nutrition;
    }
  }
  return best ?? (store.has('beer') ? 'beer' : null);
}

/**
 * Where `host` could hold a feast, or null.
 *
 * Their own household's home, whose store is theirs to spend; and, for the
 * chief, any larder of the band's — a chief feasting the band out of its
 * own granary is the redistribution the plan says the feast is the origin
 * of. Either way the store needs a full table's worth of food. A cup is
 * poured if there is one, in the store or in the host's own hands, but it is
 * not required: **measured**, the first version asked for one, and on `feasts`
 * — the scenario whose founders all know `brewing` — seven beers were brewed
 * in 24,000 ticks and not one feast was held. Knowing how to brew is the
 * gate (`brewing`'s other half); the beer is what makes it a better evening.
 * The household's cooldown is read here so that the scorer, the menu and the
 * executor give the same answer.
 */
export function feastVenue(
  host: Person,
  household: Household | null,
  isChief: boolean,
  buildings: readonly Building[],
  buildingsById: ReadonlyMap<number, Building>,
  day: number,
  temple: Building | null = null,
): Building | null {
  if (host.isChild || !mayHostFeast(host, isChief, temple)) return null;
  if (household && day - household.lastFeastDay < FEAST_INTERVAL_DAYS) return null;
  const fit = (b: Building | undefined | null): b is Building =>
    !!b && isLarder(b) && b.ownerBandId === host.bandId && portions(b.store) >= FEAST_MIN_FOOD;

  // M15 phase 38b: the chief who has worked redistribution out feasts the
  // band from the temple first — that is what the temple is for.
  if (isChief && fit(temple) && techPower(host, 'redistribution') > 0) return temple;
  if (techPower(host, 'brewing') <= 0) return null;
  const home = household?.homeBuildingId != null ? buildingsById.get(household.homeBuildingId) : null;
  if (fit(home)) return home;
  if (!isChief) return null;
  let best: Building | null = null;
  let most = 0;
  for (const building of buildings) {
    if (!fit(building)) continue;
    const held = portions(building.store);
    if (held > most || (held === most && best !== null && building.id < best.id)) {
      best = building;
      most = held;
    }
  }
  return best;
}

/**
 * Whether somebody knows how to give a feast at all: `brewing`'s second
 * half, or — M15 phase 38b — a chief with a temple who understands
 * redistribution, for whom handing the band's stores back out to the band is
 * the office itself, beer or no beer.
 */
export function mayHostFeast(host: Person, isChief: boolean, temple: Building | null): boolean {
  return techPower(host, 'brewing') > 0 ||
    (isChief && temple !== null && techPower(host, 'redistribution') > 0);
}
