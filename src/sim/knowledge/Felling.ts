/**
 * M16 14.4: a tree yields timber only to somebody holding a usable axe.
 *
 * The old axeFactor returns 1 for bare hands, because it was originally a
 * speed multiplier. It must not be used to decide whether felling is legal.
 * Centralised here for the player order, NPC scorer and tick execution.
 */
import type { Person } from '../entities/Person.ts';
import { AXE_TOOLS, techPower } from './Tech.ts';

export function hasFellingAxe(person: Person): boolean {
  return AXE_TOOLS.some(axe =>
    person.inventory.has(axe.item) && techPower(person, axe.tech) > 0);
}
