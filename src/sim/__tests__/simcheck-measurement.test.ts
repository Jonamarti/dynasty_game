import { describe, expect, it } from 'vitest';
import { moodChoiceObservation } from '../../../tools/simcheck.ts';

describe('moods-move-choices measurement', () => {
  it('groups the observed action by belonging from before that action executes', () => {
    const belongingBeforeStep = new Map([[7, -12]]);
    const person = { id: 7, action: 'talk' as const };

    expect(moodChoiceObservation(belongingBeforeStep, person)).toEqual({ mood: -12, talk: true });
  });

  it('does not invent a pre-step mood for a person who arrived during the step', () => {
    expect(moodChoiceObservation(new Map(), { id: 9, action: 'talk' })).toBeNull();
  });
});
