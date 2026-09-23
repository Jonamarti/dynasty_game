/**
 * The Spanish translation cannot quietly fall behind the English.
 *
 * `t` falls back to the English key when a Spanish entry is missing, which is
 * the right thing for a player and the wrong thing for a project: a sentence
 * added next month would ship in English inside a Spanish game and nothing
 * would say so. These tests are the something.
 *
 * - **Every literal key in the source** — every `t('…')` and `tc('…', '…')`
 *   whose key is written out — must have a Spanish entry. Found by reading the
 *   files, so a new call site is covered the moment it is written.
 * - **Every data table** the UI shows through `t(def.label)` — techs, items,
 *   buildings, the settings rows — is walked, because those keys are never
 *   literals at the call site.
 * - **Placeholders survive.** A Spanish template that drops `{name}` prints a
 *   sentence with a hole in it; one that invents `{nmae}` prints the braces.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ES_TABLES } from '../../i18n/es/index.ts';
import { hasSpanish, setLanguage, t, tc, aNoun } from '../../i18n/i18n.ts';
import { dataTableKeys } from '../../i18n/tables.ts';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'i18n') continue;
      sourceFiles(path, out);
    } else if (name.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

/** Undoes the escapes a single-quoted TS literal can contain. */
function unescape(literal: string): string {
  return literal
    .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g,
      (_, braced: string | undefined, plain: string | undefined) =>
        String.fromCodePoint(parseInt(braced ?? plain!, 16)))
    .replace(/\\(.)/g, (_, ch: string) => (ch === 'n' ? '\n' : ch));
}

function literalKeys(): { key: string; context: string | null; where: string }[] {
  const found: { key: string; context: string | null; where: string }[] = [];
  const plain = /(?<![\w.])t\(\s*'((?:[^'\\]|\\.)*)'/g;
  const withContext = /(?<![\w.])tc\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const where = file.slice(SRC.length + 1);
    for (const match of text.matchAll(plain)) {
      found.push({ key: unescape(match[1]!), context: null, where });
    }
    for (const match of text.matchAll(withContext)) {
      found.push({ key: unescape(match[2]!), context: unescape(match[1]!), where });
    }
  }
  return found;
}

/** `{name}` placeholders, not `{g:o|a}` choices. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map(m => m[1]!).sort();
}

describe('i18n', () => {
  it('has Spanish for every literal key in the source', () => {
    const missing = literalKeys()
      .filter(({ key, context }) =>
        !(context !== null && hasSpanish(context + '|' + key)) && !hasSpanish(key))
      .map(({ key, context, where }) => where + ': ' + (context ? context + '|' : '') + key);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('has Spanish for every data table the UI shows', () => {
    const missing = dataTableKeys().filter(key => !hasSpanish(key));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('keeps every placeholder, and invents none', () => {
    const broken: string[] = [];
    for (const table of Object.values(ES_TABLES)) {
      for (const [key, value] of Object.entries(table)) {
        const bare = key.includes('|') ? key.slice(key.indexOf('|') + 1) : key;
        if (placeholders(bare).join(',') !== placeholders(value).join(',')) {
          broken.push(key + ' => ' + value);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('defines no key in two tables', () => {
    const seen = new Map<string, string>();
    const doubled: string[] = [];
    for (const [name, table] of Object.entries(ES_TABLES)) {
      for (const key of Object.keys(table)) {
        const other = seen.get(key);
        if (other) doubled.push(key + ' (' + other + ', ' + name + ')');
        else seen.set(key, name);
      }
    }
    expect(doubled).toEqual([]);
  });

  it('is English, byte for byte, until asked otherwise', () => {
    expect(t('{n} people', { n: 3 })).toBe('3 people');
    expect(aNoun('mud hut')).toBe('a mud hut');
    setLanguage('es');
    try {
      expect(t('Settings')).toBe('Ajustes');
      // A capitalised miss finds the lower-case entry and re-cases it.
      expect(t('settings')).toBe('ajustes');
      expect(tc('nowhere', 'Settings')).toBe('Ajustes');
      expect(t('an English sentence nobody translated')).toBe('an English sentence nobody translated');
    } finally {
      setLanguage('en');
    }
  });

  it('chooses a gendered form from a parameter', () => {
    setLanguage('es');
    try {
      expect(t('{name} is tired{g:o|a}', { name: 'Ana', g: 'f' })).toBe('Ana is tireda');
      expect(t('{name} is tired{g:o|a}', { name: 'Juan', g: 'm' })).toBe('Juan is tiredo');
    } finally {
      setLanguage('en');
    }
  });
});
