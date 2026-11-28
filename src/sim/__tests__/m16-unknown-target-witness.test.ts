import { describe, expect, it, vi } from 'vitest';
import { Brain } from '../ai/Brain.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { telemetry } from '../core/Telemetry.ts';

describe('matrix first-unknown-target evidence', () => {
  it('prints exactly one reproducible witness per action without changing the verdict', () => {
    const person = new Person('Witness', 10.5, 10.5, 1, new RNG('unknown-hunt-witness'));
    person.placeMemory = new PlaceMemory(64, 64);
    const brain = new Brain() as unknown as {
      noteKnownTarget: (p: Person, action: string, x: number, y: number,
        kinds: readonly string[], sightRadius: number, tick: number) => void;
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    telemetry.reset();
    telemetry.enable();
    try {
      brain.noteKnownTarget(person, 'hunt', 35.5, 35.5, ['herd:deer'], 5, 321);
      brain.noteKnownTarget(person, 'hunt', 36.5, 36.5, ['herd:deer'], 5, 325);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain('tick=321');
      expect(warn.mock.calls[0]![0]).toContain('action=hunt');
      expect(warn.mock.calls[0]![0]).toContain('expected-memory=herd:deer');
      expect(telemetry.get('action_target_knowledge_unknown_hunt')).toBe(2);
      expect(telemetry.get('action_target_knowledge_checked')).toBe(2);

      // Once genuinely visible, the same target no longer counts as unknown.
      person.x = 34.5; person.y = 35.5;
      brain.noteKnownTarget(person, 'hunt', 35.5, 35.5, ['herd:deer'], 5, 330);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(telemetry.get('action_target_knowledge_known')).toBe(1);
      expect(telemetry.get('action_target_knowledge_unknown_hunt')).toBe(2);
    } finally {
      telemetry.disable();
      telemetry.reset();
      warn.mockRestore();
    }
  });

  it('does not print anything when telemetry is disabled in normal play', () => {
    const person = new Person('Quiet', 10.5, 10.5, 1, new RNG('quiet-hunt'));
    person.placeMemory = new PlaceMemory(64, 64);
    const brain = new Brain() as unknown as {
      noteKnownTarget: (p: Person, action: string, x: number, y: number,
        kinds: readonly string[], sightRadius: number, tick: number) => void;
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    telemetry.reset();
    telemetry.disable();
    try {
      brain.noteKnownTarget(person, 'hunt', 30.5, 30.5, ['herd:deer'], 5, 1);
      expect(warn).not.toHaveBeenCalled();
      expect(telemetry.get('action_target_knowledge_unknown_hunt')).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });
});
