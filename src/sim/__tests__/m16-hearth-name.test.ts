import { afterEach, describe, expect, it } from 'vitest';
import { language, setLanguage, t } from '../../i18n/i18n.ts';

describe('m16-hearth-name', () => {
  afterEach(() => setLanguage('en'));

  it('calls the outdoor hearth Hoguera and the indoor fireplace Hogar in Spanish', () => {
    setLanguage('es');
    expect(t('Hearth')).toBe('Hoguera');
    expect(t('Fireplace')).toBe('Hogar');
    expect(language()).toBe('es');
  });
});
