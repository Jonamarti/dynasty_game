/**
 * Deeds, and what a culture thinks of them.
 *
 * Everything socially meaningful a person does emits a `SocialEvent`. Events are
 * the only channel through which reputation exists — there is no global "karma"
 * number anywhere in this game. What people think of you is computed from the
 * events they personally saw, plus the ones they were told about, weighted by
 * their own culture's norms. Two bands can watch the same theft and reach
 * opposite conclusions, and an outlaw can find somewhere their deeds are
 * tolerated.
 */

/**
 * `talk` and `trade` used to be here, and neither had a reader worth the
 * name. `settle` already pays every ordinary conversation in `familiarity`,
 * which enters `opinion` at ×0.35, so a `talk` deed on top of that would have
 * counted the same conversation twice; its salience of 0.08 also sat below
 * `bestGossipFor`'s floor of 0.15 — memory that could never become gossip,
 * only take up a slot in a memory capped at 48 — and `emit` runs a spatial
 * query, so paying that cost at every greeting bought nothing at all. `trade`
 * had no verb behind it at all. M11 phase 5b removed both, on the rule this
 * project already holds SKILLS and TECH_EFFECTS to: a table entry earns its
 * place by having something read it, not by naming something planned.
 *
 * `trade` is back, declared alongside the verb that finally reads it —
 * `ActionSystem.doTrade`, M11 phase 7b's third `BandRelations` engine. A
 * positive `DEED_WEIGHT` here is what turns a completed trade into
 * `SocialSystem.emit`'s existing cross-band nudge, with no second mechanism
 * needed: two people from different bands trading is already a deed with a
 * cross-band target the moment it exists to emit. `gift` stays declared
 * without a verb of its own for a narrower reason — the `give` verb it
 * names already exists and works, it is only the deed side that is still
 * missing.
 *
 * `sabotage`, M11 phase 11b: `ActionSystem.doSabotage` wrecking a foreign
 * building. It has no `targetId` — the same reason `theft` from a store has
 * none, there being no person to name — so it never notifies a victim
 * directly, and reaches an owning band only through a witness or the
 * cross-band nudge below, exactly like every other property offence.
 */
export const EVENT_TYPES = [
  'gift', 'share_food', 'help', 'teach', 'slander', 'praise', 'trade',
  'theft', 'trespass', 'sabotage', 'assault', 'murder', 'threaten',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface SocialEvent {
  id: number;
  type: EventType;
  /** Who did it. */
  actorId: number;
  /** Who it was done to, if anyone. */
  targetId: number | null;
  x: number;
  y: number;
  tick: number;
  /** 0-1 scale of the deed: how much was taken, how hard the blow landed. */
  magnitude: number;
  /**
   * How many bystanders saw it, at the moment it happened.
   *
   * M11 phase 3b: `unwitnessed` used to be a telemetry counter and nothing
   * else. This is the same count, kept on the event so the UI can tell the
   * player that a deed of their own character's was unseen — which is the whole
   * secret. Nobody else knowing is decided here, at emit time, before any
   * hearsay can spread it; who knows *later* is a question for the gossips.
   */
  witnesses: number;
}

/**
 * Opinion points a witness moves, per unit of magnitude, before their culture's
 * norm weight is applied. Positive deeds are worth much less than negative ones
 * are worth: this is deliberate and matches how reputation actually works —
 * one murder outweighs a great many gifts.
 */
export const DEED_WEIGHT: Record<EventType, number> = {
  gift: 8,
  share_food: 6,
  help: 5,
  teach: 7,
  praise: 4,
  // Between `share_food` and `gift`: both sides walked away with something,
  // which is worth a little more than a one-way kindness, and it is worth
  // knowing about across a band line — that is the whole point of it.
  trade: 7,
  // A lie told to your face and a lie told behind your back are the same
  // words at different volumes; between trespass and theft because it costs
  // you nothing material, only what people think.
  slander: -10,
  theft: -14,
  // Using another band's structure is an offence, but a lesser one than
  // taking what is inside it. The distinction lets a culture remember the
  // intruder without pretending that sleeping under a roof emptied a store.
  trespass: -8,
  // Between theft and assault, deliberately: nobody was touched, but a
  // wrecked granary is a harder loss than anything one thief can carry off
  // in a single visit, and it costs the owning band on every visit after
  // this one too. Heavier than trespass by the same logic that makes theft
  // heavier than trespass — this takes something rather than merely using it.
  sabotage: -17,
  assault: -20,
  murder: -45,
  // Between theft and assault: no blow is struck, but the menace is not
  // hidden the way a theft is — a threat is made in the open, to the
  // victim's face, and everyone who sees it knows exactly what it was.
  threaten: -18,
};

/**
 * How strongly a deed lodges in memory, 0-1. Salience governs both how long a
 * memory survives decay and how eagerly it gets gossiped: people repeat the
 * murder and forget the conversation.
 */
export const DEED_SALIENCE: Record<EventType, number> = {
  gift: 0.4,
  share_food: 0.35,
  help: 0.35,
  teach: 0.45,
  praise: 0.3,
  // Slightly above an ordinary gift: a trade with a stranger from another
  // band is a little more worth mentioning than sharing food with your own.
  trade: 0.4,
  slander: 0.5,
  theft: 0.7,
  trespass: 0.55,
  // Standing wreckage is a better story than a stolen armful of grain, which
  // is why it sits above theft here despite sitting below it in `DEED_WEIGHT`
  // — how much it colours an opinion and how memorable it is are different
  // questions, and the game already keeps them as different tables.
  sabotage: 0.75,
  assault: 0.85,
  murder: 1,
  threaten: 0.8,
};

/** Being on the receiving end matters far more than watching from the treeline. */
export const VICTIM_MULTIPLIER = 3;

/**
 * A culture's tolerance for each kind of deed: a multiplier on `DEED_WEIGHT`.
 * 1 is the baseline, 0 is complete indifference, above 1 is a taboo held more
 * strictly than usual.
 */
export type Norms = Record<EventType, number>;

export const DEFAULT_NORMS: Norms = {
  gift: 1, share_food: 1, help: 1, teach: 1, slander: 1, praise: 1, trade: 1,
  theft: 1, trespass: 1, sabotage: 1, assault: 1, murder: 1, threaten: 1,
};

/**
 * The types a band's culture may differ on. Nobody is indifferent to being
 * murdered, but how seriously a community *polices* murder varies a great deal,
 * so even that is allowed to move — just not as far as theft.
 */
export const VARIABLE_NORMS: { type: EventType; min: number; max: number }[] = [
  { type: 'theft', min: 0.3, max: 1.6 },
  { type: 'assault', min: 0.5, max: 1.5 },
  { type: 'murder', min: 0.7, max: 1.3 },
  { type: 'gift', min: 0.7, max: 1.5 },
  { type: 'share_food', min: 0.7, max: 1.6 },
  // Coercion needs no technology, but a culture still has an opinion of it —
  // a tolerant band shrugs at a threat and a peaceable one remembers it.
  { type: 'threaten', min: 0.4, max: 1.6 },
  // Same reasoning, for gossip: a band that shrugs off a lie and one that
  // treats a good name as sacred are both real cultures.
  { type: 'slander', min: 0.4, max: 1.6 },
];

/** A short phrase for the UI: "saw you steal from Korak". */
export function describeEvent(
  type: EventType,
  actorName: string,
  targetName: string | null
): string {
  const target = targetName ?? 'someone';
  switch (type) {
    case 'gift': return actorName + ' gave ' + target + ' a gift';
    case 'share_food': return actorName + ' shared food with ' + target;
    case 'trade': return actorName + ' traded with ' + target;
    case 'help': return actorName + ' helped ' + target;
    case 'teach': return actorName + ' taught ' + target;
    case 'praise': return actorName + ' spoke well of ' + target;
    case 'slander': return actorName + ' spoke against ' + target;
    case 'theft': return targetName
      ? actorName + ' stole from ' + target
      : actorName + ' stole from a store';
    case 'trespass': return actorName + ' used what was not theirs';
    case 'sabotage': return actorName + ' wrecked what was not theirs';
    case 'assault': return actorName + ' attacked ' + target;
    case 'murder': return actorName + ' killed ' + target;
    case 'threaten': return actorName + ' threatened ' + target;
  }
}
