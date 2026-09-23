/**
 * Which nouns are feminine in Spanish, by their English name in lower case.
 *
 * `aNoun` and `theNoun` read this to choose *un/una* and *el/la*, and a
 * template's `{g:o|a}` reads it through `genderOfNoun` when an adjective has
 * to agree with a thing rather than a person. Everything not listed is
 * masculine. The Spanish words themselves live in the ordinary tables; this is
 * only the article.
 */
export const ES_FEMININE: ReadonlySet<string> = new Set([
  'mud hut',
  'wattle hut',
  'stone house',
  'snare line',
  'fish trap',
  'library',
  'longhouse',
  'spear',
  'hide armour',
  'bone needle',
  'bone point',
  'basket',
  'net',
  'pot',
  'adze',
  'cloth',
  'beer',
  'fired pot',
  'timber',
  'hare',
  'carved stone',
  'clay tablet',
  'ochre painting',
  'hide',
]);
