/**
 * The game in more than one language.
 *
 * Owner's note of 2026-09-23: *"translate the game to Spanish and add a button
 * to change languages in the main menu."*
 *
 * ## The shape, and why
 *
 * **The English sentence is the key.** `t('{name} refuses', { name })` returns
 * the English template filled in when the language is English, and the Spanish
 * template from `es/` filled in when it is Spanish. The alternative — opaque
 * keys such as `refusal.generic` with an `en.ts` beside the `es.ts` — would
 * have meant rewriting every sentence in the game into a table before a single
 * one was translated, and would have left the code unreadable: this project's
 * comments point at the words a player sees, and a key hides them.
 *
 * **English output is byte-identical.** With the language left at English —
 * which is what the headless harness, every test and every tool runs in — `t`
 * returns exactly the string the code built before this pass existed. That is
 * the tripwire: `sim:check:all --verbose` diffs to zero, and a test that
 * asserts an English sentence keeps passing.
 *
 * **The simulation may call it.** It is pure — no DOM, no storage, no RNG —
 * so `src/sim/` importing it breaks none of the rules in `AGENTS.md`. A
 * sentence the simulation composes (a line in somebody's life, a refusal) is
 * translated when it is composed, in whatever language is set at that moment,
 * because by the time the UI sees it the names and nouns have been glued in
 * and the grammar can no longer be redone. A line written before the player
 * changed language stays in the language it was written in.
 *
 * **Data tables stay English and are translated where they are shown.** A
 * technology's `label`, an item's name, a building's: `t(def.label)` at the
 * point of display. The tables are read by the simulation as identifiers and
 * in tests, and translating them at the source would make the language a
 * property of the world.
 *
 * ## The three pieces of Spanish grammar English does not need
 *
 * - **Gender agreement**, written inline as `{g:o|a}`: *"codicios{g:o|a}"*
 *   reads the `g` parameter (`'m'` or `'f'`, see `genderOf`) and takes the
 *   first or second form. Any other parameter name works the same way, so a
 *   sentence can agree with two people at once.
 * - **The article of a noun.** `aNoun('mud hut')` is *"a mud hut"* in English
 *   and *"una choza de barro"* in Spanish; the gender comes from `es/nouns.ts`,
 *   where every feminine noun is listed.
 * - **Lower- and upper-case forms of one entry.** A label is shown as *"Mud
 *   hut"* in a panel and glued into a sentence as *"mud hut"*. Both find the
 *   same entry: a miss on one case retries in the other and re-cases the
 *   answer.
 *
 * ## Contexts
 *
 * The same English word is sometimes two Spanish ones — *"forage"* the skill
 * (*"recolección"*) and *"forage"* the verb on a button (*"recolectar"*).
 * `tc('skill', 'forage')` looks up `skill|forage` first and falls back to the
 * bare key, then to English.
 */
import { ES } from './es/index.ts';
import { ES_FEMININE } from './es/nouns.ts';

export type Language = 'en' | 'es';

export const LANGUAGES: readonly { id: Language; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
];

let current: Language = 'en';
const listeners = new Set<(language: Language) => void>();

export function language(): Language {
  return current;
}

/**
 * Switches language and tells every listener, so a panel that built its
 * markup once (the pause menu, the settings screen) can rebuild it.
 */
export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener(next);
}

/** Returns an unsubscribe function. */
export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type Params = Record<string, string | number | undefined | null>;

/**
 * The Spanish for a key, trying the other case of its first letter if the key
 * itself is missing. Null when there is no entry at all.
 */
function lookup(key: string): string | null {
  const direct = ES[key];
  if (direct !== undefined) return direct;
  const first = key.charAt(0);
  const lower = first.toLowerCase();
  const upper = first.toUpperCase();
  if (first !== lower) {
    const other = ES[lower + key.slice(1)];
    if (other !== undefined) return capitalise(other);
  } else if (first !== upper) {
    const other = ES[upper + key.slice(1)];
    if (other !== undefined) return other.charAt(0).toLowerCase() + other.slice(1);
  }
  return null;
}

/** Whether a Spanish entry exists for this key, in either case. For tests. */
export function hasSpanish(key: string): boolean {
  return lookup(key) !== null;
}

/**
 * Fills `{name}` and `{name:first|second}` in a template.
 *
 * `{g:o|a}` picks by the value of `g`: `'f'` takes the second form and
 * anything else the first, so an absent gender reads as the grammatical
 * default rather than as a hole in the sentence.
 */
function fill(template: string, params?: Params): string {
  if (!params && template.indexOf('{') < 0) return template;
  return template.replace(/\{(\w+)(?::([^{}|]*)\|([^{}]*))?\}/g, (whole, name: string, a?: string, b?: string) => {
    const value = params?.[name];
    if (a !== undefined) return value === 'f' ? b! : a;
    if (value === undefined || value === null) return whole;
    return String(value);
  });
}

/** Translates a template and fills it. See the header. */
export function t(key: string, params?: Params): string {
  if (current === 'en') return fill(key, params);
  return fill(lookup(key) ?? key, params);
}

/** `t` with a context: tries `context|key` before `key`. See the header. */
export function tc(context: string, key: string, params?: Params): string {
  if (current === 'en') return fill(key, params);
  return fill(lookup(context + '|' + key) ?? lookup(key) ?? key, params);
}

/** The grammatical gender of a noun in the current language, or of a person. */
export function genderOfNoun(english: string): 'm' | 'f' {
  return ES_FEMININE.has(english.toLowerCase()) ? 'f' : 'm';
}

export function genderOf(person: { sex: string }): 'm' | 'f' {
  return person.sex === 'female' ? 'f' : 'm';
}

/**
 * A noun with its indefinite article: "a mud hut", "una choza de barro".
 *
 * English is left exactly as the code always wrote it — `'a ' + noun`, even
 * where that gives "a apple" — because changing English output is a separate
 * decision from translating it, and would move every English sentence at once.
 */
export function aNoun(english: string): string {
  if (current === 'en') return 'a ' + english;
  const [word, gender] = withoutArticle(english);
  return (gender === 'f' ? 'una ' : 'un ') + word;
}

/** The same with a definite article: "the mud hut", "la choza de barro". */
export function theNoun(english: string): string {
  if (current === 'en') return 'the ' + english;
  const [word, gender] = withoutArticle(english);
  return (gender === 'f' ? 'la ' : 'el ') + word;
}

/**
 * The Spanish for a noun, bare, and its gender. A few labels carry their own
 * article ("The spear" is "La lanza"), and that article is both stripped — so
 * nothing reads "un la lanza" — and taken as the word's gender, which is more
 * reliable than any list.
 */
function withoutArticle(english: string): [string, 'm' | 'f'] {
  const word = t(english);
  const found = /^(el|la|los|las) (.*)$/i.exec(word);
  if (found) {
    const article = found[1]!.toLowerCase();
    return [found[2]!, article === 'la' || article === 'las' ? 'f' : 'm'];
  }
  return [word, genderOfNoun(english)];
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Joins a list the way a sentence does: "a, b and c" / "a, b y c".
 */
export function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  const and = current === 'en' ? ' and ' : ' y ';
  return parts.slice(0, -1).join(', ') + and + parts[parts.length - 1];
}
