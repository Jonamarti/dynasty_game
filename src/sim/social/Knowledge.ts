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
import type { Person } from '../entities/Person.ts';
import type { ResourceNode } from '../entities/ResourceNode.ts';
import type { Building } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import type { RelationshipGraph } from './Relationships.ts';
import type { LifeEvent } from './SocialSystem.ts';
import { describeEvent } from './Events.ts';

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
    opinion >= 40 ? 'They seem fond of you.' :
    opinion >= 10 ? 'They seem to like you.' :
    opinion > -10 ? 'They seem to have no strong feeling about you.' :
    opinion > -40 ? 'They seem to dislike you.' :
    'They seem to hate you.';
  return { words, opinion: level === 'close' ? opinion : null };
}

/** Familiarity at which someone stops being a face and becomes an acquaintance. */
const KNOWN_AT = 12;
/** Familiarity at which you can fairly claim to know what they are like. */
const CLOSE_AT = 35;

function ageBracket(person: Person): string {
  const years = person.years;
  if (years < 14) return 'child';
  if (years < 25) return 'young ' + (person.sex === 'female' ? 'woman' : 'man');
  if (years < 45) return person.sex === 'female' ? 'woman' : 'man';
  return 'older ' + (person.sex === 'female' ? 'woman' : 'man');
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
      because: 'yourself',
    };
  }

  const rel = relationships.peek(observer.id, subject.id);
  const remembered = observer.memory.about(subject.id).length;

  // No edge and no memory means your character has genuinely never registered
  // this person. All you get is what anyone would get from looking at them.
  if (!rel && remembered === 0) {
    return {
      level: 'stranger',
      displayName: 'a ' + ageBracket(subject),
      knowsName: false,
      knowsCondition: false,
      knowsCharacter: false,
      knowsTies: false,
      because: 'you have never met',
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
      because: kin !== 0 ? 'family' : 'you know them well',
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
      because: 'you have spoken more than once',
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
      ? 'you know of them'
      : 'you have crossed paths',
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
  if (observer.id === subject.id) return observer.chronicle;

  return observer.memory
    .about(subject.id)
    .map(entry => ({
      tick: entry.tick,
      ageDays: 0,
      text: describeEvent(
        entry.type,
        nameOf(entry.actorId),
        entry.targetId === null ? null : nameOf(entry.targetId)
      ) + (entry.firsthand ? '' : ' (you heard)'),
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
    fullness <= 0 ? 'stripped bare' :
    fullness < 0.25 ? 'picked over' :
    fullness < 0.6 ? 'worth stopping for' :
    'laden';

  const close = observer.distanceTo(node) <= ARMS_LENGTH;
  const expert = observer.skills[node.def.skill] >= EXPERT_AT;

  if (close || expert) {
    return {
      amount: Math.floor(node.amount),
      estimate,
      because: close ? 'close enough to count' : 'you know your trade',
    };
  }
  return {
    amount: null,
    estimate,
    because: 'too far to judge exactly',
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
    tree.isSeedling ? 'a seedling' :
    !tree.isMature ? 'still growing' :
    tree.years > tree.def.maxAgeYears * 0.8 ? 'old, and past its best' :
    'full grown';

  const close = observer.distanceTo(tree) <= ARMS_LENGTH;
  const woodsman = observer.skills.build >= 30;

  if (close || woodsman) {
    return {
      years: tree.years,
      woodYield: tree.woodYield,
      fruit: Math.floor(tree.fruit),
      estimate,
      because: woodsman ? 'you can read a tree' : 'close enough to judge',
    };
  }
  return {
    years: null,
    woodYield: null,
    fruit: Math.floor(tree.fruit),
    estimate,
    because: 'you would have to look closer',
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
    because: ours ? 'your band built it' : 'you have not looked inside',
  };
}
