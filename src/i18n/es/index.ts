/**
 * Every Spanish table, merged into one lookup.
 *
 * Split by where the words appear so each file stays readable. A key that
 * appears in two files is an error `i18n.test.ts` reports, because which of
 * the two wins would depend on the order of the imports below.
 */
import { ES_ACTIONS } from './actions.ts';
import { ES_DATA } from './data.ts';
import { ES_HUD } from './hud.ts';
import { ES_SIM } from './sim.ts';
import { ES_TECH } from './tech.ts';
import { ES_UI } from './ui.ts';

export const ES_TABLES: Record<string, Record<string, string>> = {
  actions: ES_ACTIONS,
  data: ES_DATA,
  hud: ES_HUD,
  sim: ES_SIM,
  tech: ES_TECH,
  ui: ES_UI,
};

export const ES: Record<string, string> = Object.assign({}, ...Object.values(ES_TABLES));
