import type { Person } from '../entities/Person.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import { sensitivity } from './Temperament.ts';

const BAND_BOND = 0.25;
const CHIEF_BOND = 0.7;

/** One shared reading of how strongly a person is pulled toward a bandmate. */
export function bondBetween(
  person: Person,
  other: Person,
  relationships: RelationshipGraph,
  chiefId: number | undefined
): number {
  if (other.bandId !== person.bandId || other.id === person.id) return 0;
  const base = chiefId === other.id ? CHIEF_BOND : BAND_BOND;
  const grievance = Math.max(0, -relationships.opinion(person.id, other.id)) / 100;
  const defiance = grievance * (1 - person.traits.loyalty);
  const belonging = Math.max(0, Math.min(1, -person.mood.belonging / 60))
    * sensitivity(person, 'belonging');
  return base * (0.8 + belonging * 0.3) * (1 - defiance);
}
