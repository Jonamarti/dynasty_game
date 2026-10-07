/**
 * War and peace between peoples. M15 phase 32c, mechanism 5.
 *
 * The plan asks for "the same causes phase 8 gives the bands": hostility, ambition and advantage push towards war, tiredness
 * towards peace. In this model they are, each as a quantity that already exists on the people:
 *
 * - **Hostility** is `PeopleRelation.standing`. It is eroded by *rivalry over food*: in a season in which either people of a
 *   pair that touches (contact) has less than a ration a person, the pair's standing falls in proportion to contact and to
 *   the shortage (`RIVALRY`); trade, in `PeopleEconomy`, is what raises it. Nothing else lowers it here.
 * - **Ambition** is the rung of organisation (`organisationOf`): a chiefdom or state is likelier to start a war than a band
 *   (`1 + AMBITION_PER_RUNG` per rung). Status, the other cause, has no aggregate quantity of its own yet and is not modelled.
 * - **Advantage** is fighting strength: men of fighting age (15-44) times `1 + STRENGTH_PER_WEAPON` per weapon technique held
 *   (`traitsOf(tech).weapon`, read from `TECHS`, never by name). A people does not start a war it expects to lose badly: it needs
 *   `ADVANTAGE_MIN` of the other's strength.
 * - **Tiredness**: each season of war the chance of peace grows with the length of the war (`1 - exp(-PEACE_RATE x seasons)`),
 *   and a people with no fighters left has peace at once.
 *
 * A declaration needs `standing <= WAR_STANDING` and some contact, then a draw (`WAR_RATE` x ambition). **A season of war** is
 * settled once per relation (`PeopleEconomy.transactionId`, kind 2: whichever end is updated first does it, the other is
 * refused): each side loses fighters in proportion to the *other's* share of the combined strength (`LOSS_RATE`), taken out of the
 * male cohorts of fighting age themselves, so a war costs the people the men it fights with and nobody else; standing falls.
 * A people that *suffers* a weapon it does not hold posts that exposure to the `KnowledgeLedger`, which is how a war teaches
 * (`sufferedWeapon`, x3, 32c-6): the first path that really writes it. If one side is `CONQUEST_RATIO` times the other's strength
 * the war may end (`CONQUEST_RATE`) with the weaker a **tributary** of the stronger (`stance: 'tributary'`, `overlord`), which
 * `trading` then collects from and `uniting` may in time absorb.
 *
 * **Every number is a design assumption, not a measurement**: the detailed game has no aggregate war to measure (what exists
 * is raids between named bands), and the correspondence that would calibrate it is not claimed. They are exported by name. No
 * technique, name, region, date or id decides anything.
 */
import { organisationOf, type Organisation, type People, type PeopleRelation, type PeopleSeason, type SeasonMechanism } from './PeopleSim.ts';
import { TECHS } from '../knowledge/Tech.ts';
import { binomial } from './PeopleDemography.ts';
import { supplyRatioOf, type PeopleRegion } from './PeopleCapacity.ts';
import { transactionId } from './PeopleEconomy.ts';
import { traitsOf, type KnowledgeLedger } from './PeopleKnowledge.ts';

/** Standing lost per season at full contact and a ration of shortage. */
export const RIVALRY = 3;
export const WAR_STANDING = -40;
export const WAR_RATE = 0.2;
/** Extra likelihood of starting a war per rung of organisation above a band. */
export const AMBITION_PER_RUNG = 0.5;
export const ADVANTAGE_MIN = 0.6;
export const STRENGTH_PER_WEAPON = 0.15;
/** Share of its fighters a side loses per season at even strength (scaled by the other's share of strength x 2). */
export const LOSS_RATE = 0.03;
export const STANDING_WAR_COST = 5;
export const PEACE_RATE = 0.06;
export const PEACE_STANDING = -10;
export const CONQUEST_RATIO = 3;
export const CONQUEST_RATE = 0.3;
/** Intensity of the exposure a people takes in from a weapon used on it, per season of war. */
export const SUFFERED_INTENSITY = 0.5;

/** Male age bands 15-19 to 40-44: the men a war is fought with. */
const FIGHTING_BANDS = [3, 4, 5, 6, 7, 8] as const;
const RUNG: Readonly<Record<Organisation, number>> = { band: 0, tribe: 1, chiefdom: 2, state: 3 };
const WEAPONS = TECHS.filter(t => traitsOf(t).weapon);

export const fightersOf = (people: Pick<People, 'cohorts'>): number => FIGHTING_BANDS.reduce((n, b) => n + people.cohorts.male[b]!, 0);
export const strengthOf = (people: Pick<People, 'cohorts' | 'techs'>): number =>
  fightersOf(people) * (1 + STRENGTH_PER_WEAPON * WEAPONS.filter(t => people.techs.has(t)).length);
const clamp = (v: number) => Math.max(-100, Math.min(100, v));

export interface WarEnv {
  readonly regionOf: (people: People) => PeopleRegion;
  /** Where weapons suffered are posted. Omit it and a war teaches nothing. */
  readonly ledger?: KnowledgeLedger;
}

export interface WarEvent {
  readonly kind: 'declared' | 'fought' | 'peace' | 'tribute';
  readonly relationId: number; readonly season: number; readonly seasonOfYear: PeopleSeason;
  /** `declared`: the declarer; `tribute`: the overlord; else the updating people. */
  readonly peopleId: number;
  /** `fought`: fighters lost by each end, in (low id, high id) order. */
  readonly lost?: readonly [number, number];
}

export function warring(env: WarEnv, report?: (e: WarEvent) => void): SeasonMechanism {
  return ({ people, sim, season, seasonOfYear, step }) => {
    const emit = (kind: WarEvent['kind'], rel: PeopleRelation, lost?: readonly [number, number]): void =>
      report?.({ kind, relationId: rel.id, season, seasonOfYear, peopleId: people.id, lost });
    for (const rel of sim.relationsOf(people.id)) {
      const other = sim.peoples.get(rel.a === people.id ? rel.b : rel.a)!;
      const lo = rel.a === people.id ? people : other, hi = lo === people ? other : people;

      // Rivalry over food: once per pair and season.
      if (rel.contact > 0 && sim.commit(transactionId(rel, season, 3), season)) {
        const worst = Math.min(supplyRatioOf(people, env.regionOf(people), seasonOfYear), supplyRatioOf(other, env.regionOf(other), seasonOfYear));
        if (worst < 1) rel.standing = clamp(rel.standing - RIVALRY * rel.contact * (1 - Math.max(0, worst)));
      }

      if (rel.stance === 'war') {
        if (!sim.commit(transactionId(rel, season, 2), season)) continue;
        const sLo = strengthOf(lo), sHi = strengthOf(hi);
        const lost: [number, number] = [0, 0];
        if (sLo + sHi > 0) {
          [[lo, sHi, 0], [hi, sLo, 1]].forEach(([side, enemy, i]) => {
            const p = Math.min(1, LOSS_RATE * 2 * (enemy as number) / (sLo + sHi));
            for (const b of FIGHTING_BANDS) {
              const dead = binomial((side as People).cohorts.male[b]!, p, people.rng);
              (side as People).cohorts.male[b]! -= dead; lost[i as number]! += dead;
            }
          });
        }
        rel.standing = clamp(rel.standing - STANDING_WAR_COST);
        if (env.ledger) {
          for (const [victim, enemy] of [[lo, hi], [hi, lo]] as const) {
            for (const tech of WEAPONS) {
              if (enemy.techs.has(tech) && !victim.techs.has(tech)) env.ledger.post({ id: `war:${rel.id}:${season}:${tech}:${victim.id}`, peopleId: victim.id, tech, how: 'suffered', intensity: SUFFERED_INTENSITY });
            }
          }
        }
        emit('fought', rel, lost);
        const nLo = fightersOf(lo), nHi = fightersOf(hi);
        const strong = strengthOf(lo) >= strengthOf(hi) ? lo : hi, weak = strong === lo ? hi : lo;
        const ratio = strengthOf(weak) > 0 ? strengthOf(strong) / strengthOf(weak) : Infinity;
        if (nLo === 0 || nHi === 0) {
          rel.stance = 'peace'; rel.since = step; rel.standing = Math.max(rel.standing, PEACE_STANDING); emit('peace', rel);
        } else if (ratio >= CONQUEST_RATIO && people.rng.next() < CONQUEST_RATE) {
          rel.stance = 'tributary'; rel.overlord = strong.id; rel.since = step; rel.standing = Math.max(rel.standing, PEACE_STANDING); emit('tribute', rel);
        } else {
          const seasons = (step - (rel.since ?? step)) / sim.stepsPerSeason;
          if (people.rng.next() < 1 - Math.exp(-PEACE_RATE * seasons)) {
            rel.stance = 'peace'; rel.since = step; rel.standing = Math.max(rel.standing, PEACE_STANDING); emit('peace', rel);
          }
        }
        continue;
      }

      if (rel.stance !== null || rel.contact <= 0 || rel.standing > WAR_STANDING) continue;
      if (strengthOf(people) < ADVANTAGE_MIN * strengthOf(other)) continue;
      const ambition = 1 + AMBITION_PER_RUNG * RUNG[organisationOf(people.techs)];
      if (people.rng.next() < WAR_RATE * ambition) { rel.stance = 'war'; rel.since = step; rel.overlord = null; emit('declared', rel); }
    }
  };
}
