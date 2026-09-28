import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import type { RelationshipGraph } from './Relationships.ts';
import { bondBetween } from '../ai/Bond.ts';

export interface PersuasionContext {
  relationships: RelationshipGraph;
  chiefByBand: ReadonlyMap<number, number>;
  /** Existing order authority, reused as one part of a request to help. */
  authority: (sponsor: Person, listener: Person) => number;
}

/**
 * How much this listener has reason to join this one construction project.
 *
 * The components stay visible here so a refused request is explainable in the
 * same terms the AI chose it: regard, belonging, standing, a need the design
 * eases, loyalty and the amount of work being asked for.
 */
export function support(
  listener: Person,
  sponsor: Person,
  site: Building,
  ctx: PersuasionContext
): number {
  if (listener.bandId !== sponsor.bandId || listener.id === sponsor.id) return -Infinity;
  const regard = ctx.relationships.opinion(listener.id, sponsor.id) / 100 * 0.5;
  const bond = bondBetween(listener, sponsor, ctx.relationships, ctx.chiefByBand.get(listener.bandId));
  const need = site.def.id === 'hearth'
    ? listener.needs.cold / 100 * listener.beliefs.expect('warm:hearth').value
    : site.def.shelter > 0
      ? listener.needs.cold / 100
      : site.def.storage > 0
        ? listener.needs.hunger / 100
        : (listener.needs.hunger + listener.needs.cold) / 200;
  return regard + bond + ctx.authority(sponsor, listener) + need
    + listener.traits.loyalty * 0.2 - site.def.workTicks / 1000;
}
