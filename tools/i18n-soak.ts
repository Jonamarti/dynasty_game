/**
 * Runs a world in Spanish and lists every sentence it wrote that still looks
 * English.
 *
 * `i18n.test.ts` catches a literal key with no Spanish entry, but not a
 * sentence the simulation builds without going through `t` at all — a new
 * `a.name + ' and ' + b.name` is invisible to it. This is the other half: it
 * lets the world write its own lines for 30,000 steps, collects every insight,
 * every stopped order, every line of every life and every memory, and flags
 * the ones containing common English words.
 *
 *   npm run i18n:soak               # seed "soak-es"
 *   npm run i18n:soak -- other-seed
 *
 * "a" is Spanish too, so the word list leaves it out; a flagged line is a
 * lead, not a verdict.
 */
import { setLanguage } from '../src/i18n/i18n.ts';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { knowledgeOfPerson, rememberedAbout } from '../src/sim/social/Knowledge.ts';
import { actionLabel, stopReasonLabel } from '../src/render/Floaters.ts';

setLanguage('es');
const seed = process.argv[2] ?? 'soak-es';
const sim = new Simulation({ seed, population: { bands: 3, peoplePerBand: 10 } });
const texts = new Set<string>();
for (let i = 0; i < 30000; i++) {
  sim.step();
  for (const notice of sim.insights.splice(0)) texts.add('INSIGHT ' + notice.text);
  for (const notice of sim.interruptions.splice(0)) {
    texts.add('STOP ' + actionLabel(notice.action, notice.recipe) + ' — ' +
      stopReasonLabel(notice.reason));
  }
}
for (const person of sim.people) {
  for (const entry of person.chronicle) texts.add('LIFE ' + entry.text);
}
const observer = sim.people[0]!;
for (const person of sim.people.slice(0, 40)) {
  const known = knowledgeOfPerson(observer, person, sim.relationships);
  texts.add('KNOW ' + known.displayName + ' / ' + known.because);
  for (const entry of rememberedAbout(observer, person, id => sim.peopleById.get(id)?.name ?? '?')) {
    texts.add('MEMORY ' + entry.text);
  }
}
texts.add('TIME ' + sim.time.label());

// Letter-aware boundaries: `\b` treats "é" as a gap, so "habéis" would match
// "is". "has" is left out because it is Spanish as well ("has oído").
const english = /(?<!\p{L})(the|and|was|were|with|from|their|they|of|to|an|is|into|by|over|had|it)(?!\p{L})/u;
const flagged = [...texts].filter(line => english.test(line.replace(/^[A-Z]+ /, '')));
console.log(texts.size + ' distinct lines written in Spanish, ' + flagged.length + ' that look English');
for (const line of flagged) console.log('  ' + line);
process.exitCode = flagged.length > 0 ? 1 : 0;
