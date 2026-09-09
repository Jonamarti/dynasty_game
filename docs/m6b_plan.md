# M6b — Depth: a tech web, research, transmission, weapons, jobs

## Context

`docs/next-steps.md` §1 is M6b. **Phase 1 shipped 2026-09-05** (changelog): the
tech tree became a registry with an enforced "every node does something" rule,
`techPower` became the single seam every effect reads, `intelligence` and
`industriousness` landed as trait axes, and the longhouse became buildable for
the first time in its existence.

What follows is the rest, reshaped by a design decision taken with the project
owner after phase 1: **the tree is not a tree.** Rather than a left-to-right
prerequisite path, technologies sit in a web where things from different areas
combine — a tech and a material, a tech and a feeling, a tech and something you
watched happen — and the combination is what gives rise to a new idea. The
owner's own examples set the register:

- holding a vegetable while knowing fire suggests putting the two together, and
  cooking is *conceived* — not understood, not mastered, still to be prototyped
  and experimented with;
- holding an animal's fur while cold suggests wrapping it round yourself, and
  that is clothing;
- watching a wild animal raid the band's food store suggests a store that shuts.

Four decisions frame the rest of the milestone:

1. **Research is a lifecycle, not a dice roll.** A person conceives of a thing,
   researches it by thinking and by talking to people whose skills bear on it,
   makes breakthroughs, builds a prototype, tests it — a test can fail — and
   afterwards refines the design to a per-technology ceiling.
2. **Discovery is combinatorial and situated.** An idea is sparked by what is in
   your head *together with* what is in your hands, underfoot, on your mind and
   in front of you. Nodes are still hand-authored with hand-written effects —
   emergent procedural techs were considered and rejected, because an emergent
   node's effect cannot be authored and that breaks rule 3 — but each tech has
   **several sparks**, several different routes in. That is where the web comes
   from: converging routes and cross-area ingredients, not runtime generation.
3. **No node ships inert**, enforced by `techs-have-effects` since phase 1.
4. **The tree grows across phases, never ahead of its effects.**

The intended outcome: knowledge stops being flags that appear at random. A named
person got cold in a hut in February holding a deer hide, had an idea, argued
about it with the band's best forager for a season, made something that did not
work, fixed it, taught it to their daughter and cut it into a stone that
outlived them both — and the player can watch that happen on a map of their mind.

## The pillar, and the one deliberate exception

`docs/architecture.md` — **knowledge is held by people, not by a civilisation.**
`Simulation.knownTech` is derived daily from who is alive, so a technology leaves
the world when its last holder dies. Ideas, insight and refinement are all
per-`Person` state, lost on death the way `knownTech` is.

**Writing (phase 5) is the exception, and that is the point of it.** An
inscription is knowledge that outlives its holder — the first thing here that can
survive a winter which kills everyone who understood it. It is not free: it costs
materials and a long job, stone cannot be carried, later forms perish, and **a
record is inert to anyone who cannot read**. A band can sit on a library holding
the answer to its own dark age. Write this into `architecture.md` as an exception
bought on purpose, not a violation.

### Refinement lives on the knower, not the object

A person refined to hafting 2 fells faster because the axe they made and use is a
better axe. The alternative — per-unit quality in `Inventory`'s stacks — is a
large, risky change to a `Map<string, number>` that is relied on as one nearly
everywhere, and `Item.ts` explicitly defers quality tiers. The trade-off, that a
fine axe handed to a novice is just an axe, goes in a comment at `techPower`.

---

## Phase 2 — The mind: what a person notices, and what it sparks

The largest phase, and the heart of the milestone. It has to land whole: an idea
that can be conceived but never proven would be inert content.

### 2a. Two senses that do not exist yet

Both were confirmed absent, and synthesis is impossible without them.

- **A per-person record of what somebody has been doing.** There is none.
  `Person.workedTicks` is zeroed on every `finish()` and does not know which
  action it counted; `skills` are cumulative but lossy and saturating, with ten
  skills covering twenty-four verbs; `telemetry` is global, takes no person and
  is disabled in the browser build; `Simulation.actionCounts()` is an
  instantaneous census of the living, not a history.
  Add `Person.lately: Map<string, number>` with a daily decay, incremented by a
  new `Person.noteDid(action)` called from **`ActionSystem.finish()`**
  ([ActionSystem.ts:167](src/sim/systems/ActionSystem.ts#L167)) — the single
  funnel every ended action passes through, since `stop()` and `abandon()` both
  delegate to it. Note in a comment that the two scorer aliases (`feed`,
  `gather_for_site`) have been rewritten by `Brain.setup` long before this point
  and are therefore invisible here; capture them at the scorer if they ever
  become ingredients.
- **A sense of the ground underfoot.** `World.biomeAt` exists and is a cheap
  typed-array read, but nothing in `Brain` or `ActionSystem` has ever called it —
  the only player-visible biome readout is for a *selected node*, not the
  observer. One call, in the daily gather below.

### 2b. Sparks

New file **`src/sim/knowledge/Synthesis.ts`**:

```ts
/** Something that can be true of a person at a moment. */
export type Ingredient =
  | { kind: 'knows';   tech: Tech }
  | { kind: 'holding'; item: string }      // in the pack right now
  | { kind: 'doing';   action: string }    // done often lately
  | { kind: 'feeling'; need: Need }        // above a threshold
  | { kind: 'place';   biome: Biome }      // standing on it
  | { kind: 'saw';     what: string }      // a deed type, or a stop reason
  | { kind: 'season';  season: Season };

/**
 * One route to an idea. A tech has several; that is what makes this a web
 * rather than a tree, and it is why the same technology arrives for different
 * reasons in different bands.
 */
export interface Spark {
  needs: Ingredient[];
  /** Relative likelihood against the other sparks competing for one head. */
  weight: number;
  /** The chronicle line when this is the route that fired. */
  story: string;
}

/** Everything about a person that could set an idea off. Gathered once a day. */
export interface Notice { /* knows, holding, lately, feeling, place, saw, season */ }
```

`TechDef` gains `sparks: Spark[]` and `domain: Domain` (fire, plants, stone,
cloth, timber, beasts — the latter drives both layout and colour in phase 3).

**`requires` stays, and means something different from `sparks`.** They answer
two honestly different questions and collapsing them would lose both:

- `requires` — the scaffolding you must already have to **understand** it. Gates
  teaching, observation *and* conception. Keeps the graph acyclic and every node
  reachable, which phase 1's tests already assert.
- `sparks` — the situation that makes it **occur to you**. Gates conception only.

Worked example, and the shape every entry should follow:

```ts
clothing: {
  requires: ['cordage'],
  sparks: [
    { needs: [{kind:'feeling',need:'cold'}, {kind:'holding',item:'hide'}],
      weight: 1.0, story: 'was cold, and had a hide in their hands' },
    { needs: [{kind:'knows',tech:'cordage'}, {kind:'feeling',need:'cold'},
              {kind:'season',season:'winter'}],
      weight: 0.5, story: 'spent one winter too many bound in nothing but cord' },
  ],
},
```

### 2c. Conception replaces the random reachable pick

`KnowledgeSystem.tryDiscover` currently picks a uniformly random *reachable*
tech and rolls. It becomes: gather the `Notice`, find every tech whose `requires`
are met and one of whose sparks is fully satisfied, weight them, pick one, roll
`(BASE / difficulty) × weight × curiosity × wit`, and on success push an **Idea**
carrying the spark's `story`.

The need-pressure multiplier disappears from the formula because it is now an
ingredient — cold *is* the reason clothing occurred to you, and saying it twice
would double-count.

### 2d. The lifecycle

`Person.ideas: Idea[]` (cap two, so nobody dabbles at everything) and
`Person.techLevel: Map<string, number>`.

```ts
export interface Idea {
  tech: Tech; stage: 'conceived' | 'researching' | 'prototyped' | 'proven';
  insight: number;          // 0..1, moved in jumps by breakthroughs
  story: string;            // the spark that started it
  conceivedTick: number; effort: number;
  discussedWith: number[];  // a second conversation is worth much less
  failedTests: number;
}
```

1. **Conception** — as above. Chronicle: *"had an idea about clothing"*.
2. **Research** — two new actions, both with `interruption()` calls:
   `ponder` (alone; scales with `intelligence`, `curiosity`, the tech's skill)
   and `discuss` (targets a person, through the existing social cooldown; scales
   with the *partner's* relevant skill and wits and with mutual opinion). Both
   roll for a **breakthrough** rather than accruing smoothly — on success insight
   jumps and a floater plus chronicle entry fire. That is the observable beat.
3. **Prototype** — at `insight >= 0.6`, consuming materials over a work timer.
4. **Testing** — the effect applies at a reduced, unreliable level while
   `prototyped`; a roll on use either proves it (`knownTech.add`, `techLevel` 0,
   milestone) or fails, costing insight and incrementing `failedTests`.
5. **Refinement** — further work refills insight; each fill raises `techLevel` by
   one to `TechDef.maxRefinement`, then the idea retires. `techPower` starts
   returning above 1 — the seam phase 1 built for exactly this.

**Standing rule** (`AGENTS.md`, and a standing instruction from the owner):
every new refusal and abandon path says why. `ponder` with no idea, `discuss`
with an unwilling or ignorant partner, `prototype` without materials, a failed
test — each needs an id in `STOP_REASONS`
([Floaters.ts:168](src/render/Floaters.ts#L168)), which already carries
twenty-six, and order-time refusals need a `lastRefusal` through `cancelOrder`.

**UI:** the Self tab gains a "Working on" section — the idea, its stage, the
story that started it, an insight bar reusing `bar()`, refinement pips.

---

## Phase 3 — The tech web

The visualiser, and equally the instrument for telling whether phase 2 works.
The project already values this: `npm run why` and the HUD render the *same*
`lastScores` table two ways, and this is the same idea for knowledge.

**There is no SVG anywhere in the project and no layout code of any kind.** The
nearest precedent is `RadialMenu`, which fans buttons on a circle with
trigonometry and absolute positioning, and whose header argues DOM over canvas
for UI because "hit-testing, hover states, focus and text layout are free here
and fiddly on a canvas". Follow it: **absolutely-positioned DOM nodes for the
techs, one inline `<svg>` beneath them for the edges.**

New file **`src/ui/TechWeb.ts`**, a full-screen overlay following the
`Succession`/`NewGame` boilerplate exactly — own root `div.techweb` on
`document.body` (never `#hud`, which rebuilds its subtree), `hidden = true`, one
delegated listener dispatching on `data-*`, Escape to dismiss. Bound to **`G`**
(free; `1`-`5`, `b`, `c`, `f`, `h`, `p`, `space`, `escape`, `wasd` and the arrows
are taken), added to the help string at `Hud.ts:209`.

**Layout — domain clusters, force-relaxed, and wholly deterministic.** Each
domain owns an angular sector; a tech is seeded at its sector's angle and at a
radius set by its depth in `requires`; then a fixed number of relaxation
iterations (repulsion between all nodes, springs along edges) pulls the picture
into an organic shape. Cross-domain sparks are long springs, so areas that feed
each other drift together and the arcs between clusters are the visible payoff.
Computed once on open and cached.

**No randomness at all** — not `Math.random`, which `AGENTS.md` forbids outright,
and not a fork of a simulation stream either, since `RNG.fork()` consumes a draw
from its parent and would shift every subsequent simulation draw. Seeded
positions plus a deterministic relaxation need neither. `NewGame` sets the same
precedent, rotating its shortlist by modular arithmetic rather than randomising.

**What it shows is one person's mind, gated like everything else.** Route names
and states through `knowledgeOfPerson` — `AGENTS.md` names "any new panel"
explicitly, and a map of somebody's knowledge is the easiest possible way to hand
the player a god's-eye view. Open it on a stranger and you get nothing.

Node states: **proven** (lit, domain-coloured, refinement pips), **in progress**
(ring showing insight), **conceivable now** (dim outline), **understood but never
sparked** (ghosted), **never conceived** (an unlabelled dark node, so the shape of
what is unknown is visible without its content being given away).

Hovering a node answers *why not*: which of the spark's ingredients are satisfied
and which are missing — "you know fire; you are not holding clay". That is the
standing "the UI must say why" rule applied to discovery, and it is what makes
the web teach the player how the world works rather than merely decorate it.

`.techweb[hidden] { display: none; }` is **mandatory** — the project has made
that mistake three times (`.succession`, `.newgame`, `.picker`), and an author
`display` leaves an invisible overlay swallowing every click on the game. Styles
go in a new banner section at the end of `style.css`; the z-index ladder is
radial 20, picker 21, newgame/succession 40.

---

## Phase 4 — How knowledge travels

Four channels, deliberately different in cost, reach and reliability.

**4a. Teaching children.** Children are excluded from knowledge entirely today:
`KnowledgeSystem.daily` skips them and `Brain`'s pupil filter drops them
([Brain.ts:309](src/sim/ai/Brain.ts#L309)), so a parent cannot teach their own
child anything. Change the `daily` guard to skip only `tryDiscover`; let children
be taught and observe, more readily than adults, but hold at level 0 and unable
to pass anything on until grown. Add a `teach_child` scorer term weighted toward
one's own children, rewritten to `teach` in `Brain.setup` — the established idiom
that already lets `feed` become `give`. Chronicle both sides.

**4b. Writing, in successive forms.** New nodes, each with its effect: `marking`
(tallies; a `discuss` bonus), `writing` (requires `marking` + `stoneworking` —
stone tablets, immovable, permanent), `clay_tablet` (portable, holds two,
breakable), `library` (a building that stores inscriptions and boosts `ponder`
nearby — the "reading at a library" the owner described).

New entity `src/sim/entities/Inscription.ts`. An inscription is a *placed* thing
with a position, so its def mirrors `BuildingDef` rather than `ItemDef`, which
also keeps it out of `Inventory`'s stacks. Held on `Simulation.inscriptions` with
an `inscriptionHash` — every proximity query goes through a spatial hash. Decay
needs a new RNG stream: **append the fork after `wildlifeRng`**, never insert.

Actions `inscribe` and `read`, both long, both with interruption checks.
**Reading requires `writing`** — a record is inert to the illiterate, which is
what makes a library during a dark age a story rather than a formality.
`Simulation` gains `recordedTech` beside `knownTech`; `knownTech` stays
living-holders-only so eras keep describing what a society can actually do.

Phase 3's web gains a second reading here: a ghosted node with a scroll marker
is a technology nobody alive knows and somebody wrote down.

---

## Phase 5 — Recipes, weapons, and the loop the player can see

**Shipped 2026-09-07** — see [changelog.md](changelog.md). It absorbed
`docs/notes.txt`, three things the owner reported from play, at their direction:
work that stopped for the need it was answering, a proven design that went on
asking for its prototype materials, and the fact that there was no crafting menu
at all. Two things below did **not** ship and are the remainder of the phase:
`weaving` as a node, and `hide` becoming an item — the latter turned out to be
already done in phase 2. What follows is the original text.

### Original plan

Crafting is a stub whose single predicate is written out three times. The table
comes first: **`src/sim/entities/Recipe.ts`**, a `RECIPES` record copying the
shape of `BuildingDef.materials`. `doCraft` becomes table-driven and **gains the
`interruption()` call it is missing** — a ninety-tick job nothing can reach,
exactly the omission `AGENTS.md` blames for the two worst bugs here.

**Fix on the way past: the granary has never been buildable either.** It requires
six `pottery` items and *nothing in the codebase ever puts `pottery` in an
inventory* — the same class of defect as the longhouse, still live. A pottery
recipe fixes it; a test should assert every material named in `BUILDINGS` is
something the world can actually produce.

`ItemDef` gains `weapon?: { damage; reach; hunt; tech }` and `armour?: number`;
new items `spear`, `bow`, `hide_armour`, and `handaxe` gains a small weapon
block. `doAttack`'s damage line — which today has no item term at all — gains the
weapon scaled by `techPower`, and armour on the defender. `weapon.reach` widens
the range `approach()` accepts, which is how a spear beats a fist without ranged
combat existing. `doHunt` gains `weapon.hunt`; with `tracking` from phase 1 that
is the answer to "hunting is rare".

Nodes: `spear`, `bow`, `leatherwork`, `weaving`. `hide` becomes a real item, so
clothing's spark in phase 2 has something to fire on.

---

## Phase 6 — Jobs and rebellion

`Person.job` from a small `JOBS` table; a job scales its actions' scores in
`Brain` and damps the rest, with a deliberately small factor because the
coefficients are calibrated against each other and `ai-uses-many-actions` is the
tripwire. Assigning a job to somebody else is an order: a new `ORDER_COST.job`.

**Fix while here:** `Simulation.command` never sets `lastRefusal` when the
authority roll fails, so a social refusal reaches the player as "X refuses" with
no reason — though `standing.because` already holds one and the Ties tab already
prints it. Set it.

Rebellion is derived in `Authority.ts` and stored nowhere, per `next-steps.md`:
rebelliousness stays a function of `loyalty` and accumulated grievance — which
already exists as the −3 deed `command` adds on every refusal — because two knobs
for one behaviour is how a scorer becomes untunable. `BandSystem.daily` gains
`considerRebellion` beside `considerExile`, reusing its quorum shape, with three
rising outcomes: refuse the chief's orders, leave, or challenge for the chiefdom.
Each emits a chronicle entry and a floater.

A seventh HUD tab, `work`, following the five-edit tab pattern in `Hud.ts`.

---

## Phase 7 — Family tree and tribe graph

The other two visualisers, reusing phase 3's layout and SVG-edge machinery rather
than reinventing it. `FamilyTree` from `motherId`/`fatherId`/`spouseId`, which
phase 4a makes doubly worth drawing since who taught whom is a family fact;
`TribeGraph` as an opinion-weighted graph using the existing `is-pos`/`is-neg`
classes. Both gated through `knowledgeOfPerson`, both needing their `[hidden]`
rule.

## Phase 8 — The content nodes

**Superseded on 2026-09-08 by [m8_plan_the_ages.md](m8_plan_the_ages.md).** This
phase said "stop and re-plan here", and that is what happened.

The re-plan grew it rather than replacing it. The owner asked for the tree to run
**all the way to iron** and to follow real human history, so what was seven
content nodes is now forty-eight across four archaeological ages. Every node
named below survives in it — `snares` and `herbalism` in M8.1, `animal_husbandry`
(split into `taming` and `herding`), `masonry` and `farming` in M8.2 — alongside
the ages this phase never reached.

Re-planning also turned up the reason none of it should be built yet: **only
three of the seventeen existing nodes are ever conceived in a two-year run**, and
the gate is transmission rather than discovery. That measurement, and the pass
that answers it, are M8.0 in the new document.

The original text, for the record:

> The remainder, each with the building or action that makes it real: `snares`,
> `herbalism` (a `tend` action, finally using the inert `heal` skill),
> `animal_husbandry` (taming by feeding, reading the `Animal.fedBy` hook inert
> since M6a), `masonry`, `parchment`, `farming` (fields, `sow`, `reap` — the
> answer to "farming is declared but inert", and its return to `TECHS`),
> `irrigation`. Overlaps `next-steps.md` §2 and can absorb it. Stop and re-plan
> here.

---

## Verification

Existing gates stay green at every phase boundary: `npm run typecheck`,
`npm test`, `npm run sim:check:all`, `npm run e2e`.

**Two things phase 1 established that apply throughout.** `npm run e2e` needs
`DYNASTY_PORT` set on this machine — Windows reserves TCP 5111-5210 and swallows
Vite's 5173. And **ten seeds cannot resolve a change under about ten points**:
five variants of phase 1 measured 73.1 / 65.2 / 64.4 / 63.6 / 59.3 percent, and a
strictly better learning rate once measured nine points worse than what it
replaced. Use `npm run sim:seeds -- --seeds 20` for phases 2, 5 and 8, and never
tune against a single ten-seed figure.

**Verify every new check fails on the build without the feature**, as
`techs-have-effects` was in phase 1. A check that detects nothing is worse than
none, because someone will trust it.

New checks in `tools/simcheck.ts`, via the `add`/`skip` helpers in `buildChecks`,
reporting **n/a** rather than passing where a scenario cannot exercise them:

| check | asserts |
|---|---|
| `ideas-are-conceived` | a long run produces ideas, and not absurdly many |
| `discovery-is-situated` | discoveries correlate with context — clothing arrives to the cold, not the warm |
| `sparks-are-various` | more than one spark route fires across a run; the web is not one path |
| `ideas-become-tech` | conceive → research → prototype → prove completes end to end |
| `research-is-social` | some breakthroughs come from `discuss`, not only `ponder` |
| `prototypes-can-fail` | both test outcomes occur — a test that always passes is a delay |
| `techs-are-refined` | some proven tech reaches level ≥ 1 |
| `children-are-taught` | a real share of teaching targets children, mostly by kin |
| `knowledge-outlives-its-holder` | a tech with no living holder is recoverable from a record |
| `records-need-a-reader` | an inscription grants nothing to someone without `writing` |
| `weapons-are-made-and-used` | spears are crafted and armed blows land |
| `hunts-succeed-and-fail` | **existing, n/a today** — should start reporting |
| `jobs-bias-work` | people with a job spend measurably more time on its actions |
| `rebellion-is-rare-but-happens` | fires at least once over a century, and is not endemic |

Unit tests, extending `src/sim/__tests__/tech.test.ts` and adding siblings:

- **`every-tech-has-a-spark`** — the companion to `techs-have-effects`, and the
  guard that keeps a node from entering the web with no way in.
- **`spark-ingredients-are-real`** — every item, action, biome, need, season and
  deed id named in a spark exists. Ingredients are strings; this is the check
  that catches the next `requiresTech: 'carpentry'`.
- **`sparks-respect-requires`** — no spark can fire before prerequisites are met.
- **`buildings-ask-for-things-that-exist`** — every material in `BUILDINGS` is
  producible. This is the check that catches the granary.
- `research.test.ts` — an idea driven through all five stages by hand; a failed
  test costs insight and surfaces a stop reason; refinement stops at the ceiling;
  teaching passes level − 1.
- `transmission.test.ts` — a child can be taught and cannot teach; an inscription
  survives its author's death and restores the tech to a literate reader and not
  to an illiterate one.
- `techweb.test.ts` — the layout is deterministic (same input, byte-identical
  positions), no node overlaps another, and every edge has both endpoints.

**Manual pass:** `npm run shots`, then the tech web open on the player mid-idea
with one node ringed and one ghosted; a breakthrough floater; a parent teaching a
child; a stone tablet beside a hut; a spear-armed hunt; the jobs tab.

**Docs at each phase boundary:** `docs/changelog.md` with the reason for each
change, `docs/bugs.md` for anything found and not fixed, and
`docs/architecture.md` where the knowledge pillar changes.

## Risks

- **Phase 2 is the risky one** and it cannot be split, since a conceivable but
  unprovable idea is inert content. It adds persistent per-person state, two long
  actions and a think-tick competitor to foraging. If survival drops across
  twenty seeds, the cause is almost certainly `ponder`/`discuss` stealing ticks
  from food — fix the scores, not the synthesis maths.
- **Sparks can deadlock the tree.** If no authored spark is satisfiable in a
  given world, a technology becomes unreachable in play while still passing every
  static test. `sparks-are-various` and `ideas-are-conceived` are the tripwires,
  and every tech wants at least one spark with commonly-available ingredients.
- **The web could become a wall of nodes.** Ten techs today, twenty-odd by phase
  8. If the relaxed layout is unreadable at that size, cluster by domain with
  collapsed groups before reaching for a different layout.
- **Writing could trivialise the tree** if records are cheap. Material cost, a
  long job, immovable stone, perishable later forms and literacy-as-a-gate are
  the counterweights; tighten those before touching discovery rates.
 