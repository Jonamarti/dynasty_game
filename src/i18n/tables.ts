/**
 * Every string in a data table that reaches the screen through `t(def.label)`.
 *
 * Kept out of `i18n.ts` on purpose: that module is imported by the simulation,
 * and this one imports the simulation's tables, so folding them together would
 * make a cycle. Only the coverage test reads this. When a table grows a field
 * the UI shows, add it here, or the test cannot see it.
 *
 * Contexted keys (`skill|forage`) are listed with their context, which is how
 * `tc` looks them up first.
 */
import { TECH, TECH_EFFECTS, AGE_LABELS, ERAS, DOMAINS } from '../sim/knowledge/Tech.ts';
import { NEEDS, TRAITS } from '../sim/entities/Person.ts';
import { MOOD_CHANNELS } from '../sim/core/Mood.ts';
import { MACROS } from '../sim/core/Macros.ts';
import { RESOURCE_KINDS } from '../sim/entities/ResourceNode.ts';
import { AUTONOMY_LABELS, AUTONOMY_NOTES } from '../sim/ai/Autonomy.ts';
import { NODE_LABELS, MACRO_FOOD_WORDS } from '../ui/Hud.ts';
import { KEYS } from '../ui/PauseMenu.ts';
import { ITEMS } from '../sim/entities/Item.ts';
import { BUILDINGS } from '../sim/entities/Building.ts';
import { INSCRIPTIONS } from '../sim/entities/Inscription.ts';
import { RECIPES } from '../sim/entities/Recipe.ts';
import { TREES } from '../sim/entities/Tree.ts';
import { SPECIES_DEFS } from '../sim/entities/Animal.ts';
import { JOBS } from '../sim/entities/Job.ts';
import { SKILLS } from '../sim/entities/Person.ts';
import { BIOMES } from '../sim/core/World.ts';
import { STAGE_LABELS, PRACTICE_STAGE_LABELS } from '../sim/knowledge/Synthesis.ts';
import { CONVERSATION_MODES } from '../sim/social/Conversation.ts';
import { RANK_LABEL } from '../sim/social/Rank.ts';
import {
  DIFFICULTY_LABELS, DIFFICULTY_NOTES, GROUP_LABELS, TUNABLES,
} from '../sim/core/Difficulty.ts';
import { ACTION_LABELS, STOP_REASONS } from '../render/Floaters.ts';
import { STATE_NOTE } from '../ui/TechWeb.ts';
import { NODE_VERB_LABELS } from '../sim/ai/ActionCatalog.ts';
import { DOING_WORDS, FEELING_WORDS, PLACE_WORDS, SAW_WORDS } from '../sim/knowledge/Synthesis.ts';
import { ORDER_WORDS } from '../sim/core/Simulation.ts';

export function dataTableKeys(): string[] {
  const keys: string[] = [];
  for (const def of Object.values(TECH)) {
    keys.push(def.label, def.firstKnown, def.description);
    for (const spark of def.sparks) keys.push(spark.story);
  }
  keys.push(...Object.values(AGE_LABELS));
  for (const era of ERAS) keys.push(era.description);
  for (const domain of DOMAINS) keys.push('domain|' + domain);
  for (const def of Object.values(ITEMS)) keys.push(def.label);
  for (const def of Object.values(BUILDINGS)) keys.push(def.label, def.description);
  for (const def of Object.values(INSCRIPTIONS)) keys.push(def.label, def.description);
  for (const def of Object.values(RECIPES)) keys.push(def.label);
  for (const def of Object.values(TREES)) keys.push(def.label);
  for (const def of Object.values(SPECIES_DEFS)) keys.push(def.label);
  for (const def of Object.values(JOBS)) keys.push(def.label);
  for (const skill of SKILLS) keys.push('skill|' + skill);
  for (const biome of BIOMES) keys.push('biome|' + biome);
  keys.push(...Object.values(STAGE_LABELS), ...Object.values(PRACTICE_STAGE_LABELS));
  for (const mode of Object.values(CONVERSATION_MODES)) keys.push(mode.verb, mode.doing);
  keys.push(...Object.values(RANK_LABEL));
  keys.push(...Object.values(DIFFICULTY_LABELS), ...Object.values(DIFFICULTY_NOTES));
  keys.push(...Object.values(GROUP_LABELS));
  for (const tunable of TUNABLES) keys.push(tunable.label, tunable.hint);
  for (const def of Object.values(TECH_EFFECTS)) keys.push(def.summary);
  for (const need of NEEDS) keys.push('bar|' + need);
  for (const macro of MACROS) keys.push('bar|' + macro);
  for (const trait of TRAITS) keys.push('trait|' + trait);
  for (const channel of MOOD_CHANNELS) keys.push('mood|' + channel);
  for (const season of ['spring', 'summer', 'autumn', 'winter']) keys.push('season|' + season);
  for (const kind of RESOURCE_KINDS) keys.push('node|' + kind);
  keys.push(...Object.values(NODE_LABELS), ...MACRO_FOOD_WORDS);
  keys.push(...Object.values(AUTONOMY_LABELS), ...Object.values(AUTONOMY_NOTES));
  for (const [, what] of KEYS) keys.push(what);
  keys.push(...Object.values(ACTION_LABELS), ...Object.values(STOP_REASONS));
  keys.push(...Object.values(STATE_NOTE));
  keys.push(...NODE_VERB_LABELS);
  for (const words of [DOING_WORDS, FEELING_WORDS, PLACE_WORDS, SAW_WORDS]) keys.push(...Object.values(words));
  keys.push('starvation', 'dehydration', 'exposure', 'old age');
  keys.push(...Object.values(ORDER_WORDS));
  return keys;
}
