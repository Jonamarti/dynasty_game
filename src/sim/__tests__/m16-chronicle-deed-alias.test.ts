import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { fromPersonRecord, toPersonRecord } from '../persistence/EntityRecords.ts';
import { restoreSharedChronicleDeeds } from '../persistence/RosterRecords.ts';

function pair() {
  const actor = new Person('Actor', 10, 10, 1, new RNG('deed-actor'));
  const victim = new Person('Victim', 11, 10, 1, new RNG('deed-victim'));
  const emit = (text: string, tick = 42) => {
    const deed = { type: 'assault' as const, actorId: actor.id, targetId: victim.id };
    actor.chronicle.push({ tick, ageDays: actor.age, text, kind: 'did', deed });
    victim.chronicle.push({ tick, ageDays: victim.age, text, kind: 'suffered', deed });
    return deed;
  };
  const decodeSeparately = () => [
    fromPersonRecord(toPersonRecord(actor, 42)),
    fromPersonRecord(toPersonRecord(victim, 42)),
  ] as const;
  return { actor, victim, emit, decodeSeparately };
}

describe('M16 current-version save restores shared deed identities', () => {
  it('rejoins the actor and victim chronicles after independent PersonRecord decoding', () => {
    const { emit, decodeSeparately } = pair();
    emit('Actor struck Victim');
    const [actor, victim] = decodeSeparately();
    expect(actor.chronicle[0]!.deed).not.toBe(victim.chronicle[0]!.deed);
    restoreSharedChronicleDeeds([actor, victim]);
    expect(actor.chronicle[0]!.deed).toBe(victim.chronicle[0]!.deed);
    expect(actor.chronicle[0]!.deed).toEqual({
      type: 'assault', actorId: actor.id, targetId: victim.id,
    });
  });

  it('does not collapse two distinct but identical deeds in the same tick', () => {
    const { emit, decodeSeparately } = pair();
    emit('Actor struck Victim');
    emit('Actor struck Victim'); // two events with the same fields and tick
    const [actor, victim] = decodeSeparately();
    restoreSharedChronicleDeeds([actor, victim]);
    expect(actor.chronicle[0]!.deed).toBe(victim.chronicle[0]!.deed);
    expect(actor.chronicle[1]!.deed).toBe(victim.chronicle[1]!.deed);
    expect(actor.chronicle[0]!.deed).not.toBe(actor.chronicle[1]!.deed);
    restoreSharedChronicleDeeds([actor, victim]); // safe to run twice
    expect(actor.chronicle[1]!.deed).toBe(victim.chronicle[1]!.deed);
  });

  it('leaves an unmatched suffered event independent', () => {
    const { actor, victim, decodeSeparately } = pair();
    victim.chronicle.push({
      tick: 42, ageDays: victim.age, text: 'Outside witness', kind: 'suffered',
      deed: { type: 'assault', actorId: actor.id, targetId: victim.id },
    });
    const [restoredActor, restoredVictim] = decodeSeparately();
    const original = restoredVictim.chronicle[0]!.deed;
    restoreSharedChronicleDeeds([restoredActor, restoredVictim]);
    expect(restoredVictim.chronicle[0]!.deed).toBe(original);
  });
});
