import { describe, expect, it } from 'vitest';
import { DecisionObserver, snapshotDecision } from '../../../tools/profile-decisions.ts';

const person = (overrides: Record<string, unknown> = {}) => ({
  id: 7, alive: true, action: 'forage', isPlayer: false, order: null,
  targetNodeId: 12, targetX: 10, targetY: 20, ...overrides,
}) as any;

describe('profile decision observer', () => {
  it('ignores unchanged choices and movement of the same entity target', () => {
    const observer = new DecisionObserver(24);
    const before = snapshotDecision(person());
    observer.observe(before, snapshotDecision(person({ targetX: 11, targetY: 21 })), 0);
    observer.observe(before, snapshotDecision(person()), 0);
    expect(observer.report()).toMatchObject({
      actionChanges: 0, retargets: 0, starts: 0, reorientations: 0,
    });
  });

  it('counts action changes, same-action retargets and idle starts separately', () => {
    const observer = new DecisionObserver(10);
    const before = snapshotDecision(person());
    observer.observe(before, snapshotDecision(person({ action: 'drink', targetNodeId: 22 })), 0);
    observer.observe(before, snapshotDecision(person({ targetNodeId: 13 })), 0);
    observer.observe(snapshotDecision(person({ action: 'idle', targetNodeId: null })),
      snapshotDecision(person({ action: 'sleep', targetNodeId: null })), 0);
    expect(observer.report()).toMatchObject({ actionChanges: 1, retargets: 1, starts: 1, reorientations: 2 });
  });

  it('does not count player or ordered changes as autonomous reorientation', () => {
    const observer = new DecisionObserver(10);
    const npc = snapshotDecision(person());
    observer.observe(snapshotDecision(person({ isPlayer: true })), snapshotDecision(person({ isPlayer: true, action: 'drink' })), 0);
    observer.observe(snapshotDecision(person({ order: 'forage' })), snapshotDecision(person({ order: 'forage', action: 'drink' })), 0);
    observer.observe(npc, snapshotDecision(person({ action: 'drink' })), 0);
    expect(observer.report()).toMatchObject({ actionChanges: 1, retargets: 0, starts: 0 });
  });

  it('uses exact fractional person-day exposure as the rate denominator', () => {
    const observer = new DecisionObserver(4);
    observer.observeExposure([person({ id: 1 }), person({ id: 2 })]);
    observer.observeExposure([person({ id: 1 }), person({ id: 2 })]);
    observer.observeExposure([person({ id: 1 })]);
    observer.observeExposure([person({ id: 1 })]);
    const before = snapshotDecision(person({ id: 1 }));
    observer.observe(before, snapshotDecision(person({ id: 1, action: 'drink' })), 3);
    const report = observer.report();
    expect(report.personDays).toBe(1.5);
    expect(report.actionChanges).toBe(1);
    expect(report.actionChangesPerAutonomousPersonDay).toBeCloseTo(2 / 3);
    expect(report.perDay).toMatchObject([{ day: 3, actionChanges: 1, perPerson: [{ id: 1, actionChanges: 1 }] }]);
    expect(report.perPerson.find(row => row.id === 1)?.personDays).toBe(1);
    expect(report.perPerson.find(row => row.id === 1)?.autonomousPersonDays).toBe(1);
    expect(report.perPerson.find(row => row.id === 2)?.personDays).toBe(0.5);
    expect(report.autonomousPersonDays).toBe(1.5);
  });

  it('reports a null choice without inventing a transition', () => {
    const observer = new DecisionObserver(10);
    const same = snapshotDecision(person());
    observer.observe(same, same, 0, null);
    expect(observer.report()).toMatchObject({ thinkCalls: 1, nullChoices: 1, actionChanges: 0, retargets: 0 });
  });
  it('uses coordinates only when there is no named target', () => {
    const observer = new DecisionObserver(10);
    observer.observe(snapshotDecision(person({ targetNodeId: null, targetX: 1, targetY: 1 })),
      snapshotDecision(person({ targetNodeId: null, targetX: 2, targetY: 1 })), 0);
    expect(observer.report().retargets).toBe(1);
  });
});