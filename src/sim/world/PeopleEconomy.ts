/**
 * Putting food by, and exchanging it: the surplus of a people. M15 phase 32c, mechanisms 4 and 6a.
 *
 * `People.surplus` existed from 32c-1 and nothing wrote to it, which is what a declared-but-inert field looks like.
 * This gives it a writer and a reader, in two mechanisms that run in this order, **before** `demography`:
 *
 * 1. `storing`: a season in which the land gave more than the people ate, a share of the difference is put by
 *    (`PUT_BY_SHARE`); a share of what is held spoils each season (`SPOILAGE`); a season in which the land gave
 *    less, the store makes up the shortfall as far as it goes. The draw is written to `people.drawn` (rations a day),
 *    which `suppliedRations` adds to the land's yield, so what starves or feeds a people already reads it.
 * 2. `trading`: with each neighbour it is not at war with, in proportion to their contact, a people shares surplus
 *    towards an equal amount per head. This is **reciprocal sharing, not a market**: the model keeps surplus as a
 *    single quantity of rations, so there are no goods of different value to price (`baseValue`, phase 36, has
 *    nothing here to act on) and no price. What it does model is the real, well-documented use of exchange among
 *    people who live by a variable harvest, which is to spread the risk: whoever is rich per head this season gives
 *    to whoever is poor, and is owed the same when the harvests turn. Each transaction has the identifier
 *    `(relation, season)` and `PeopleSim.commit` refuses the second end of it, so the pair is settled once whichever
 *    of the two is updated first. Standing between the two rises with the exchange.
 *    A `tributary` relation also hands `TRIBUTE_SHARE` of the weaker people's surplus to its overlord, once a season.
 *
 * **Every number here is a design assumption, not a measurement** (the detailed game's stores are items and pits;
 * nothing measured an aggregate rate), exported by name so a measurement can replace it. Rations are conserved
 * exactly by trade and tribute; only spoilage destroys them. No technique, name, date or region decides anything.
 */
import { populationOf, type People, type PeopleRelation, type PeopleSeason, type SeasonMechanism } from './PeopleSim.ts';
import { suppliedRations, type PeopleRegion } from './PeopleCapacity.ts';

/** Share of a season's surplus of food over need that is stored. Design assumption. */
export const PUT_BY_SHARE = 0.25;
/** Share of the store lost to spoilage each season. Design assumption. */
export const SPOILAGE = 0.2;
/** The store never holds more than this many seasons of the people's own need (a granary has a size). */
export const STORE_CAP_SEASONS = 2;
/** Share of the gap to an equal amount per head that is closed in a season at full contact. Design assumption. */
export const TRADE_SHARE = 0.1;
/** Standing gained per season of exchange at full contact. Design assumption. */
export const TRADE_STANDING = 2;
/** Share of the tributary's surplus paid to its overlord each season. Design assumption. */
export const TRIBUTE_SHARE = 0.15;

export interface EconomyEnv { readonly regionOf: (people: People) => PeopleRegion }

export interface StoreReport {
  readonly peopleId: number; readonly season: number; readonly seasonOfYear: PeopleSeason;
  readonly put: number; readonly spoiled: number; readonly drawn: number; readonly surplus: number;
}

/** Rations eaten in a season by a people of this size: one a person-day. */
const needOf = (people: People, days: number) => populationOf(people) * days;

export function storing(env: EconomyEnv, report?: (r: StoreReport) => void): SeasonMechanism {
  return ({ people, season, seasonOfYear, sim }) => {
    const days = sim.clock.daysPerSeason;
    const need = needOf(people, days);
    const spoiled = people.surplus * SPOILAGE;
    people.surplus -= spoiled;
    people.drawn = 0;
    // What the land alone gives: `suppliedRations` with nothing drawn.
    const land = suppliedRations({ comarcas: people.comarcas, techs: people.techs, drawn: 0 }, env.regionOf(people), seasonOfYear) * days;
    let put = 0, drawn = 0;
    if (land > need) {
      put = (land - need) * PUT_BY_SHARE;
      people.surplus = Math.min(people.surplus + put, need * STORE_CAP_SEASONS);
    } else if (need > 0) {
      drawn = Math.min(people.surplus, need - land);
      people.surplus -= drawn;
      people.drawn = drawn / days;
    }
    report?.({ peopleId: people.id, season, seasonOfYear, put, spoiled, drawn, surplus: people.surplus });
  };
}

/**
 * One identifier per (relation, season, kind): the second end of the same transaction is refused by `commit`.
 * Kinds are shared by every relation mechanism so no two collide: 0 exchange, 1 tribute, 2 a season of war,
 * 3 rivalry over scarce food, 4 a union.
 */
export type TransactionKind = 0 | 1 | 2 | 3 | 4;
export const transactionId = (rel: Pick<PeopleRelation, 'id'>, season: number, kind: TransactionKind): number =>
  (rel.id * 100_000 + season) * 8 + kind;

export interface TradeReport {
  readonly relationId: number; readonly season: number; readonly from: number; readonly to: number; readonly amount: number; readonly kind: 'exchange' | 'tribute';
}

export function trading(report?: (r: TradeReport) => void): SeasonMechanism {
  return ({ people, sim, season }) => {
    for (const rel of sim.relationsOf(people.id)) {
      if (rel.stance === 'war') continue;
      const other = sim.peoples.get(rel.a === people.id ? rel.b : rel.a)!;
      if (rel.stance === 'tributary' && rel.overlord !== null) {
        if (sim.commit(transactionId(rel, season, 1), season)) {
          const payer = rel.overlord === people.id ? other : people, host = payer === people ? other : people;
          const amount = payer.surplus * TRIBUTE_SHARE;
          payer.surplus -= amount; host.surplus += amount;
          report?.({ relationId: rel.id, season, from: payer.id, to: host.id, amount, kind: 'tribute' });
        }
        continue;
      }
      if (rel.contact <= 0) continue;
      if (!sim.commit(transactionId(rel, season, 0), season)) continue;
      const pa = populationOf(people), pb = populationOf(other);
      if (pa + pb === 0) continue;
      const total = people.surplus + other.surplus;
      const fairShare = total * pa / (pa + pb);
      const move = TRADE_SHARE * rel.contact * (people.surplus - fairShare);   // > 0: this people gives
      people.surplus -= move; other.surplus += move;
      rel.standing = Math.max(-100, Math.min(100, rel.standing + TRADE_STANDING * rel.contact));
      if (move !== 0) {
        const [from, to] = move > 0 ? [people, other] : [other, people];
        report?.({ relationId: rel.id, season, from: from.id, to: to.id, amount: Math.abs(move), kind: 'exchange' });
      }
    }
  };
}
