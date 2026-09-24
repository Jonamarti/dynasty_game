/**
 * What one person actually knows about another — or about a bush.
 *
 * The inspector used to be omniscient: click anyone and read their skills,
 * their temperament, everyone they know and their whole life story, whether or
 * not your character had ever laid eyes on them. That quietly undoes the point
 * of the game. Reputation here is deliberately *local* — it exists only in the
 * heads of people who saw something or were told about it — and an all-seeing
 * UI hands the player the god's-eye view the simulation refuses to keep.
 *
 * So knowledge is derived from exactly the state that already governs NPC
 * behaviour: the relationship edge (which is created the first time you witness
 * or speak to someone) and your episodic memory of them. Nothing new is stored.
 *
 * The same principle covers things: you can see that a bush is a bush, but
 * reading how much is left on it is a foraging skill, and a novice standing
 * far away gets "picked over" rather than "7".
 */
import type { Corpse, CorpseStage } from '../entities/Corpse.ts';
import type { Person } from '../entities/Person.ts';
import type { ResourceNode } from '../entities/ResourceNode.ts';
import type { Building } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import { DECAY_PER_DAY, FAMILIARITY_WEIGHT, type RelationshipGraph } from './Relationships.ts';
import type { MemoryEntry } from './Memory.ts';
import type { PropertyUse } from './Property.ts';
import type { LifeEvent } from './SocialSystem.ts';
import { describeEvent } from './Events.ts';
import { t, genderOf } from '../../i18n/i18n.ts';

/** How well the observer knows the subject. */
export type Acquaintance = 'self' | 'close' | 'known' | 'seen' | 'stranger';

export interface PersonKnowledge {
  level: Acquaintance;
  /** What the observer can call them: a name, or a description. */
  displayName: string;
  knowsName: boolean;
  /** Needs and what they carry — visible once you spend time around someone. */
  knowsCondition: boolean;
  /** Skills and temperament — you have to know someone to judge these. */
  knowsCharacter: boolean;
  /** Who they know: learned by being close, or by gossip. */
  knowsTies: boolean;
  /** A plain-language summary of how you know them. */
  because: string;
}

/**
 * What the observer can tell of how `subject` regards *them* — M11 phase 13b.
 *
 * Someone else's opinion is their private state, and it is read here rather
 * than in the panel for the same reason everything else about them is. A face
 * or a passing acquaintance (`stranger`, `seen`) tells you nothing; somebody
 * you have spoken with more than once (`known`) you can read in broad
 * strokes; somebody close you can put a number on.
 */
export interface RegardKnowledge {
  /** A sentence, or null when nothing can be told at all. */
  words: string | null;
  /** The opinion itself, only for somebody close. */
  opinion: number | null;
}

/**
 * How far either side of zero an opinion still reads as "no strong feeling".
 *
 * One number for the words below and for the colour every panel draws a tie
 * in, so a line the family tree paints yellow is exactly a tie the Ties tab
 * would describe as indifferent — two thresholds would drift apart, and the
 * player would see a green line between two people who "seem to have no
 * strong feeling" about each other.
 */
export const REGARD_NEUTRAL = 10;

/** Warm, lukewarm or hostile: the three colours a drawn tie can be. */
export type OpinionTone = 'pos' | 'mid' | 'neg';

export function opinionTone(opinion: number): OpinionTone {
  return opinion >= REGARD_NEUTRAL ? 'pos' : opinion > -REGARD_NEUTRAL ? 'mid' : 'neg';
}

export function regardFromThem(
  observer: Person,
  subject: Person,
  relationships: RelationshipGraph
): RegardKnowledge {
  const level = knowledgeOfPerson(observer, subject, relationships).level;
  if (level === 'self' || level === 'stranger' || level === 'seen') {
    return { words: null, opinion: null };
  }
  const opinion = relationships.opinion(subject.id, observer.id);
  const words =
    opinion >= 40 ? t('They seem fond of you.') :
    opinion >= REGARD_NEUTRAL ? t('They seem to like you.') :
    opinion > -REGARD_NEUTRAL ? t('They seem to have no strong feeling about you.') :
    opinion > -40 ? t('They seem to dislike you.') :
    t('They seem to hate you.');
  return { words, opinion: level === 'close' ? opinion : null };
}

/** One reason behind an opinion, for the person panel. */
export interface RegardReason {
  text: string;
  tone: OpinionTone;
}

/** What `regardReasons` needs from the world beyond the two people. */
export interface RegardContext {
  relationships: RelationshipGraph;
  /** How `observer` names somebody — `knowledgeOfPerson`'s display name. */
  nameOf: (id: number) => string;
  /**
   * How far a remembered deed moved `holder`'s opinion of its actor when
   * they learned it: `SocialSystem.deedDelta`, so the panel ranks deeds by
   * the very number that moved the opinion.
   */
  weigh: (holder: Person, actor: Person, entry: MemoryEntry) => number;
  tick: number;
  ticksPerDay: number;
}

/** Reasons shown under one opinion: enough to explain it, few enough to read. */
const REASONS_SHOWN = 4;

/** Below this many points of opinion a reason is not worth a line. */
const REASON_FLOOR = 1;

/**
 * Why `holder` feels as they do about `about`, as `observer` can tell it —
 * M12 phase 3c, the owner's note 7 ("show *why* the relationship is good or
 * bad"). `observer` is always one of the two: it is either your own opinion
 * of somebody (`holder` is you, and everything in it is yours to read) or
 * theirs of you.
 *
 * Their opinion of you is their private state, and the owner's rule is that
 * nobody learns anything but by seeing it or being told. So of their
 * reasons this names only what you could know without being told: whether
 * you are kin or of one people, the time you have spent together, and what
 * you did *to them* — you were there. What they saw you do to somebody else,
 * or heard of you, is real and moves their opinion, but you cannot know
 * which of your deeds reached them; it is summed into one line that says
 * there is something, and not what.
 *
 * Deeds are weighed with `ctx.weigh` and aged at the rate `deeds` decays,
 * so the ranking follows what the opinion is actually made of today. The
 * deeds component also carries a few nudges that no memory records (an
 * order refused, a complaint the chief would not hear); those go unnamed
 * rather than being guessed at.
 */
export function regardReasons(
  observer: Person,
  holder: Person,
  about: Person,
  ctx: RegardContext
): RegardReason[] {
  const rel = ctx.relationships.peek(holder.id, about.id);
  if (!rel) return [];
  const ownView = holder.id === observer.id;
  const found: { text: string; weight: number }[] = [];

  if (rel.kinship !== 0) {
    const text =
      holder.spouseId === about.id ? t('married') :
      holder.motherId === about.id || holder.fatherId === about.id ||
        holder.childIds.includes(about.id) ? t('parent and child') :
      t('family');
    found.push({ text, weight: rel.kinship });
  }
  if (rel.bias !== 0) {
    const text =
      holder.householdId !== null && holder.householdId === about.householdId
        ? t('one household') :
      rel.bias > 0 ? t('one people') : t('from another people');
    found.push({ text, weight: rel.bias });
  }
  if (rel.familiarity * FAMILIARITY_WEIGHT >= REASON_FLOOR) {
    found.push({ text: t('time spent together'), weight: rel.familiarity * FAMILIARITY_WEIGHT });
  }
  if (rel.romance >= REASON_FLOOR) found.push({ text: t('drawn to each other'), weight: rel.romance });

  let unplaced = 0;
  for (const entry of holder.memory.about(about.id)) {
    if (entry.actorId !== about.id) continue;
    const days = Math.max(0, (ctx.tick - entry.tick) / ctx.ticksPerDay);
    const weight = ctx.weigh(holder, about, entry) * Math.pow(DECAY_PER_DAY.deeds, days);
    if (!ownView && entry.targetId !== holder.id) {
      unplaced += weight;
      continue;
    }
    const deed = describeEvent(
      entry.type, ctx.nameOf(entry.actorId),
      entry.targetId === null ? null : ctx.nameOf(entry.targetId));
    found.push({
      text: entry.firsthand ? deed : deed + ' ' + t('(you heard)'),
      weight,
    });
  }
  if (Math.abs(unplaced) >= REASON_FLOOR) {
    found.push({
      text: unplaced > 0
        ? t('good things they have seen or heard of you')
        : t('things they have seen or heard of you'),
      weight: unplaced,
    });
  }

  return found
    .filter(reason => Math.abs(reason.weight) >= REASON_FLOOR)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, REASONS_SHOWN)
    .map(reason => ({ text: reason.text, tone: reason.weight > 0 ? 'pos' : 'neg' }));
}

/**
 * Why a structure can or cannot be used, in words, for `observer` to read —
 * M11 phase 13f. The witness is named only as the observer knows them: a
 * stranger watching a rival's store is "A young man", not a name the
 * player's character never learned.
 */
export function explainPropertyUse(
  observer: Person,
  use: PropertyUse,
  relationships: RelationshipGraph
): string {
  switch (use.basis) {
    case 'own': return t('it belongs to their band');
    case 'ally': return t('their band and yours are close allies');
    case 'unseen': return t('nobody from the owning band is watching');
    case 'seen': {
      if (!use.seen) return t('someone from its band is close enough to see them');
      const name = knowledgeOfPerson(observer, use.seen, relationships).displayName;
      return t('{name} is close enough to see them', {
        name: name.charAt(0).toUpperCase() + name.slice(1),
      });
    }
  }
}

/** Familiarity at which someone stops being a face and becomes an acquaintance. */
const KNOWN_AT = 12;
/** Familiarity at which you can fairly claim to know what they are like. */
const CLOSE_AT = 35;

/**
 * What a stranger is called: "a young man". Whole phrases rather than a noun
 * glued to an article, because Spanish needs the article and the noun to agree
 * with the person ("una joven", "un niño") and English wants neither to move.
 */
function strangerName(person: Person): string {
  const years = person.years;
  const female = person.sex === 'female';
  if (years < 14) return t('a child', { g: genderOf(person) });
  if (years < 25) return female ? t('a young woman') : t('a young man');
  if (years < 45) return female ? t('a woman') : t('a man');
  // "a older", as it has always read: the translation pass leaves English
  // output exactly as it was, and fixing the article is a change of its own.
  return female ? t('a older woman') : t('a older man');
}

export function knowledgeOfPerson(
  observer: Person,
  subject: Person,
  relationships: RelationshipGraph
): PersonKnowledge {
  if (observer.id === subject.id) {
    return {
      level: 'self',
      displayName: subject.name,
      knowsName: true,
      knowsCondition: true,
      knowsCharacter: true,
      knowsTies: true,
      because: t('yourself'),
    };
  }

  const rel = relationships.peek(observer.id, subject.id);
  const remembered = observer.memory.about(subject.id).length;

  // No edge and no memory means your character has genuinely never registered
  // this person. All you get is what anyone would get from looking at them.
  if (!rel && remembered === 0) {
    return {
      level: 'stranger',
      displayName: strangerName(subject),
      knowsName: false,
      knowsCondition: false,
      knowsCharacter: false,
      knowsTies: false,
      because: t('you have never met'),
    };
  }

  const familiarity = rel?.familiarity ?? 0;
  const kin = rel?.kinship ?? 0;

  if (familiarity >= CLOSE_AT || kin !== 0) {
    return {
      level: 'close',
      displayName: subject.name,
      knowsName: true,
      knowsCondition: true,
      knowsCharacter: true,
      knowsTies: true,
      because: kin !== 0 ? t('family') : t('you know them well'),
    };
  }

  if (familiarity >= KNOWN_AT) {
    return {
      level: 'known',
      displayName: subject.name,
      knowsName: true,
      knowsCondition: true,
      knowsCharacter: false,
      knowsTies: false,
      because: t('you have spoken more than once'),
    };
  }

  return {
    level: 'seen',
    displayName: subject.name,
    knowsName: true,
    knowsCondition: false,
    knowsCharacter: false,
    knowsTies: false,
    because: remembered > 0
      ? t('you know of them')
      : t('you have crossed paths'),
  };
}

/**
 * The `knowsCondition` half of `knowledgeOfPerson`, on its own.
 *
 * M9.5 phase 1 needs this every frame, for every face on screen, to decide
 * whether the renderer may paint a real expression or has to fall back to a
 * neutral one — too hot a path to build the full `PersonKnowledge` object (and
 * the `ageBracket` string it computes for a case that never gets used) just to
 * read one boolean out of it. Kept beside `knowledgeOfPerson` and matching its
 * thresholds exactly, rather than reinvented, so the two can never disagree
 * about who knows whom.
 */
export function knowsPersonCondition(
  observerId: number,
  subjectId: number,
  relationships: RelationshipGraph
): boolean {
  if (observerId === subjectId) return true;
  const rel = relationships.peek(observerId, subjectId);
  if (!rel) return false;
  return rel.familiarity >= KNOWN_AT || rel.kinship !== 0;
}

/**
 * What the observer remembers happening to or being done by the subject,
 * newest first.
 *
 * This replaces showing the subject's own private chronicle, which was the
 * worst of the leaks: it let the player read a stranger's entire life. Looking
 * at yourself still returns your own chronicle, because you were there.
 */
export function rememberedAbout(
  observer: Person,
  subject: Person,
  nameOf: (id: number) => string
): LifeEvent[] {
  // Your own life, with everybody in it named as you know them. M11 phase
  // 13f: `emit` writes its line with real names — rob a stranger and the
  // stored sentence calls them by a name you were never told — so a line
  // that carries its deed (13e) is written afresh here from the ids, through
  // the same `nameOf` other people's histories already go through. Lines
  // with no deed (a birth, a marriage, a hut) name only people you know.
  if (observer.id === subject.id) {
    return observer.chronicle.map(entry => entry.deed
      ? {
        ...entry,
        text: describeEvent(
          entry.deed.type,
          nameOf(entry.deed.actorId),
          entry.deed.targetId === null ? null : nameOf(entry.deed.targetId)
        ),
      }
      : entry);
  }

  return observer.memory
    .about(subject.id)
    .map(entry => ({
      tick: entry.tick,
      ageDays: 0,
      text: describeEvent(
        entry.type,
        nameOf(entry.actorId),
        entry.targetId === null ? null : nameOf(entry.targetId)
      ) + (entry.firsthand ? '' : ' ' + t('(you heard)')),
      kind: (entry.targetId === subject.id ? 'suffered' : 'did') as LifeEvent['kind'],
    }));
}

// ---------------------------------------------------------------------------
// Things
// ---------------------------------------------------------------------------

export interface NodeKnowledge {
  /** Precise remaining amount, or null when the observer can only estimate. */
  amount: number | null;
  /** A qualitative reading, always available. */
  estimate: string;
  because: string;
}

/** Distance within which anyone can simply look and count. */
const ARMS_LENGTH = 3;
/** Relevant skill at which a glance from a distance is enough. */
const EXPERT_AT = 40;

export function knowledgeOfNode(observer: Person, node: ResourceNode): NodeKnowledge {
  const fullness = node.def.maxAmount === 0 ? 0 : node.amount / node.def.maxAmount;
  const estimate =
    fullness <= 0 ? t('stripped bare') :
    fullness < 0.25 ? t('picked over') :
    fullness < 0.6 ? t('worth stopping for') :
    t('laden');

  const close = observer.distanceTo(node) <= ARMS_LENGTH;
  const expert = observer.skills[node.def.skill] >= EXPERT_AT;

  if (close || expert) {
    return {
      amount: Math.floor(node.amount),
      estimate,
      because: close ? t('close enough to count') : t('you know your trade'),
    };
  }
  return {
    amount: null,
    estimate,
    because: t('too far to judge exactly'),
  };
}

export interface TreeKnowledge {
  /** Age and timber yield, or null when the observer can only guess. */
  years: number | null;
  woodYield: number | null;
  /** Always legible: you can see fruit on a branch from a long way off. */
  fruit: number;
  estimate: string;
  because: string;
}

/**
 * What a person can tell about a tree.
 *
 * Size is obvious to anyone; *age* and how much timber is in a trunk are a
 * woodsman's judgement. That matters because the interesting decision here is
 * whether a stand is worth leaving alone for twenty years, and someone who
 * cannot read a tree has to make it blind.
 */
export function knowledgeOfTree(observer: Person, tree: Tree): TreeKnowledge {
  const estimate =
    tree.isSeedling ? t('a seedling') :
    !tree.isMature ? t('still growing') :
    tree.years > tree.def.maxAgeYears * 0.8 ? t('old, and past its best') :
    t('full grown');

  const close = observer.distanceTo(tree) <= ARMS_LENGTH;
  const woodsman = observer.skills.build >= 30;

  if (close || woodsman) {
    return {
      years: tree.years,
      woodYield: tree.woodYield,
      fruit: Math.floor(tree.fruit),
      estimate,
      because: woodsman ? t('you can read a tree') : t('close enough to judge'),
    };
  }
  return {
    years: null,
    woodYield: null,
    fruit: Math.floor(tree.fruit),
    estimate,
    because: t('you would have to look closer'),
  };
}

export interface BuildingKnowledge {
  /** Contents are only legible to people the store belongs to. */
  knowsContents: boolean;
  because: string;
}

export function knowledgeOfBuilding(observer: Person, building: Building): BuildingKnowledge {
  const ours = building.ownerBandId === observer.bandId;
  return {
    knowsContents: ours,
    because: ours ? t('your band built it') : t('you have not looked inside'),
  };
}

/**
 * Whose body this is, as `observer` can tell — M11 phase 16b. A fresh body is
 * as recognisable as the living person was; one gone over only to kin and
 * to people who knew them well (`CLOSE_AT`); bones and a body cut up past
 * knowing to nobody at all. The name comes back only when it is known.
 */
export function corpseIdentity(
  observer: Person,
  corpse: Corpse,
  relationships: RelationshipGraph,
  stage: CorpseStage
): { identified: boolean; name: string } {
  if (corpse.dismembered || stage === 'bones') return { identified: false, name: '' };
  const known = knowledgeOfPerson(observer, corpse.person, relationships);
  if (stage === 'fresh') return { identified: known.knowsName, name: known.displayName };
  const rel = relationships.peek(observer.id, corpse.person.id);
  const close = relationships.kinship(observer.id, corpse.person.id) > 0 ||
    (rel !== null && rel.familiarity >= CLOSE_AT);
  return close ? { identified: true, name: known.displayName } : { identified: false, name: '' };
}
