/** A small lashed reed raft can be carried to another freshwater bank.
 * Possession alone is not enough: the same cordage technique that makes it
 * is needed to handle it. Ocean travel is outside this craft's capability. */
import type { Person } from '../entities/Person.ts';
import { techPower } from '../knowledge/Tech.ts';
export function canUseRaft(person: Person): boolean {
  return person.inventory.has('raft') && techPower(person, 'cordage') > 0;
}
