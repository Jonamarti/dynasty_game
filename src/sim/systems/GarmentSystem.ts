/** Daily condition changes for the exact garment units a person wears. */
import { GARMENT_SLOTS } from '../entities/Equipment.ts';
import { ITEMS } from '../entities/Item.ts';
import type { Person } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';
import { t } from '../../i18n/i18n.ts';

/** Wear each canonical worn unit once; carried spare garments do not age. */
export function wearWornGarments(person: Person, tick: number): number {
  if (!person.alive) return 0;
  // Reject malformed ownership before applying any condition change. A broken
  // checkpoint must not turn one bad row into silent loss of several garments.
  person.inventory.transferSnapshot();
  let broken = 0;
  const seenUnits = new Set<string>();
  for (const slot of GARMENT_SLOTS) {
    const equipped = person.equipment[slot];
    const garment = equipped ? ITEMS[equipped.item]?.garment : undefined;
    if (!equipped || !garment || garment.slot !== slot) continue;
    const units = person.inventory.garmentUnitsOf(equipped.item);
    const unit = equipped.unitId === undefined
      ? units[0]
      : units.find(candidate => candidate.unitId === equipped.unitId);
    if (!unit) {
      delete person.equipment[slot];
      continue;
    }
    // A malformed duplicate reference must not make one physical garment wear
    // twice in the same day. Valid clothing has one canonical worn slot.
    if (seenUnits.has(unit.unitId)) continue;
    seenUnits.add(unit.unitId);
    const result = person.inventory.applyGarmentWear(unit.unitId,
      garment.wearPerDay * (unit.hideDressed ? 0.5 : 1));
    if (result === 'missing') {
      delete person.equipment[slot];
      continue;
    }
    if (result !== 'broken') continue;
    for (const wornSlot of GARMENT_SLOTS) {
      if (person.equipment[wornSlot]?.unitId === unit.unitId) delete person.equipment[wornSlot];
    }
    broken++;
    telemetry.count('garment_worn_out');
    person.chronicle.push({
      tick,
      ageDays: person.age,
      text: t('The {item} they wore wore out', { item: t(ITEMS[equipped.item]!.label) }),
      kind: 'did',
    });
  }
  return broken;
}
