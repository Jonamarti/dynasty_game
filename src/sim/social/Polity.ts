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
