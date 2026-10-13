import { telemetry } from '../core/Telemetry.ts';
import type { Person } from '../entities/Person.ts';

export type BlowStage = 'initial' | 'repeat';

function label(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Snapshot the victim at the instant a landed adult blow is measured.
 *
 * The cohort observer only needs marginal histograms, not person IDs or a
 * second event log. These counters are opt-in with Telemetry and never feed
 * back into action selection or random streams.
 */
export function recordBlowVictimState(
  stage: BlowStage,
  victim: Pick<Person, 'action' | 'order' | 'commitment' | 'actionTimer'>,
  underAttack: boolean,
): void {
  if (!telemetry.isEnabled()) return;
  const prefix = 'answered_' + stage + '_';
  telemetry.count(prefix + 'action_' + label(victim.action));
  telemetry.count(prefix + 'order_' + label(victim.order ?? 'none'));
  telemetry.count(prefix + 'commitment_action_' + label(victim.commitment?.action ?? 'none'));
  telemetry.count(prefix + 'commitment_drive_' + label(victim.commitment?.drive ?? 'none'));
  telemetry.count(prefix + 'timer_' + Math.max(0, Math.floor(victim.actionTimer)));
  telemetry.count(prefix + 'under_attack_' + (underAttack ? 'yes' : 'no'));
}

/** Record the action Brain chose while its shared assailant query was live. */
export function recordUnderAttackDecision(action: string | null): void {
  if (!telemetry.isEnabled()) return;
  telemetry.count('answered_brain_decision_' + label(action ?? 'none'));
}
