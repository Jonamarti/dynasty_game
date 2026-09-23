/**
 * The language buttons, shared by every screen that offers them.
 *
 * Owner's note of 2026-09-23 asked for the switch "in the main menu". The game
 * has two screens that answer to that name — the pause menu Escape opens, and
 * the start screen a new world opens on — and a player who cannot read English
 * needs it on the first of them to be any use at all, so it is on both. One
 * helper, because two copies of a control drift: one of them would learn a
 * third language and the other would not.
 *
 * Each language is named in itself ("Español", not "Spanish"), which is the
 * convention for exactly this reason: the person looking for it may not read
 * the language the button is currently in.
 */
import { LANGUAGES, language, setLanguage, type Language } from '../i18n/i18n.ts';
import { saveLanguage } from './SettingsStore.ts';

export function languageSwitchHtml(): string {
  return '<div class="langswitch" role="group" aria-label="Language">' +
    LANGUAGES.map(({ id, name }) =>
      '<button type="button" class="langswitch-option' + (id === language() ? ' is-on' : '') +
      '" data-lang="' + id + '" lang="' + id + '">' + name + '</button>').join('') +
    '</div>';
}

/**
 * Handles a click if it landed on a language button. Returns whether it did,
 * so a screen's own click handler can stop there.
 */
export function handleLanguageClick(target: HTMLElement): boolean {
  const button = target.closest<HTMLElement>('[data-lang]');
  if (!button) return false;
  const next = button.dataset.lang as Language;
  saveLanguage(next);
  setLanguage(next);
  return true;
}
