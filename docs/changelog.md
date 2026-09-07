# Changelog

Every change, with the date it was made and the reason it was made. Newest
first. Reasons matter more than descriptions here: a later reader can see *what*
changed from the diff, but not *why*.

---

## 2026-09-07 — M6b phase 4: how knowledge travels

Four channels now, deliberately different in cost, reach and reliability. Two of
them did not exist yesterday: a parent could not teach their own child anything,
and nothing at all survived the death of the person who knew it.

### 4a. Children can be taught, and can watch

`KnowledgeSystem.daily` skipped children wholesale and `Brain`'s pupil filter
dropped them, so **every technology in the world had to be re-derived from
nothing by each generation**. A comment above `daily` already claimed children
were skipped "for conception only"; they were not, and now they are.

- Children run `tryObserve` at `CHILD_OBSERVATION_CHANCE`, nearly three times an
  adult's. *Reason:* a child spends its whole day underfoot while the people
  around it work, and picking things up by watching is most of what childhood
  is; an adult watching somebody else work is an adult not doing their own.
- `KnowledgeSystem.teach` refuses a child *teacher*. What a child holds is real
  and personal, held at level 0, and goes no further until they are grown.
- A new **`teach_child`** scorer term, rewritten to `teach` in `Brain.setup` —
  the idiom `feed` and `gather_for_site` already use. *Reason it is its own term
  and not a wider filter on the existing one:* an adult pupil is chosen for how
  much they lack and how well you get on, a child is chosen because it is
  *yours*. Sharing a scorer would have had every elder in the band teaching the
  same brightest child and nobody teaching their own.

**`refreshEra` counts adults only.** Two reasons beyond the story. The era
fraction divides holders by adults, so counting children in the numerator alone
could put it over one and advance an age on a cohort of six-year-olds; and
`knownTech` gates the build menu, so a band would have been able to raise a
granary because somebody's daughter once watched a pot being fired. The
consequence is deliberate and is one of the better stories the model tells: a
technology whose last adult holder dies leaves the world and comes back years
later when the child who was watching grows up.

**Fixed on the way past:** neither `Brain` nor `ActionCatalog` checked whether a
pupil had the *prerequisites* for anything the teacher knew, though
`KnowledgeSystem.teach` has always dropped those. The scorer therefore sent
people to give lessons that could not land, and the menu offered a Teach that
silently did nothing. Rare while every pupil was an adult; the common case the
moment children became pupils.

### 4b. Writing

New `src/sim/entities/Inscription.ts`, `Simulation.inscriptions` with its own
spatial hash, and a `recordRng` **appended after `wildlifeRng`** — never
inserted, because the fork order is the seed contract.

Four nodes, each with the code that makes it real:

| node | requires | what it does |
|---|---|---|
| `marking` | cordage | tallies; `tallyFactor` multiplies an argument's chance of getting somewhere |
| `writing` | marking + stoneworking | the `inscribe` and `read` actions exist at all |
| `clay_tablet` | writing + pottery | a second form: cheaper, holds two, and perishes |
| `library` | writing + carpentry | a building; `LIBRARY_INSIGHT` makes thinking go better under its roof |

**Reading requires `writing`, and that is the point of the whole feature.** A
record grants nothing to somebody who cannot read, so a band can sit on a
library holding the answer to its own dark age and starve beside it. It is what
makes writing an exception bought on purpose rather than a free second copy of
`knownTech` — and it is why the death of the last *reader* is a different and
worse event than the death of the last potter. The rule is enforced in the
action, in the radial menu's greyed-out reason, in the inspector (which counts
the marks rather than naming them), and in the entity picker.

`Simulation.recordedTech` sits beside `knownTech`: the first is what a society
could get back, the second what it can presently do. They come apart exactly
when a band loses its last holder of something and still has the stone.

### Three defects found while building it, all of the same family

- **A long job that loses its progress can never be finished.** Written as one
  uninterrupted pull, a stone took a novice twelve hundred ticks — and a novice
  picks up thirty-five points of thirst in four hundred, so the interruption
  check stopped them every time and the action restarted from nothing. A run
  spent **forty-five thousand ticks carving and produced not one record**: from
  outside, people standing in a field. Lowering the number only moves the line,
  so work banks on the record the way it banks on a building site. The escape
  hatch for anything genuinely long is to bank the progress somewhere, not to
  shrink the job until it fits; `tech.test.ts` now says so in both directions.
- **A carver abandoned their own half-cut stone on the tick after starting it.**
  A technology is claimed the moment the first mark is made, so by the second
  tick "what is worth writing down" no longer included the thing they were in
  the middle of writing down. The stone under their feet is checked *before*
  that question is asked.
- **Records stack, and "the nearest" is not good enough.** A carving is a place
  rather than a structure — a library is a heap of them on one floor — so a
  carver standing over a finished stone and a half-cut one got whichever the
  index returned first, which stranded every second carving for ever.
  `inscriptionAt` takes a filter now.

And one waste rather than a defect: seven separate stones all saying "writing"
while half of what anybody knew went unrecorded, because the daily recount could
not see a carving still under way. `recordsInHand` is claimed eagerly and is
kept distinct from `recordedTech`, which stays strictly what is *legible*.

### A scenario in which anything is written

`scribes`: two bands whose founders already know cordage, hafting, stoneworking,
marking and writing. Writing sits behind marking and stoneworking, which nothing
in the suite reaches from nothing, so without it every check about records would
report n/a for ever — the same reasoning that produced `craft` in the last pass.

**Reading is deliberately not asserted in `simcheck`, and that is a finding
rather than an omission.** A living teacher is quicker to reach than a stone
across the valley, so reading fires when the chain breaks: when the last holder
of something is dead, or when a record carries something newly worked out. A
fifty-eight-day run has neither. A twenty-four-thousand-step run does — it
produced `read_firemaking` and `recovered_firemaking` — but a run that long
makes `people-survive` ask a different question, and an *illiterate* control at
the same length survived worse (6/24 against 10/24), so that is the run length
and not the feature. The claim that a record outlives its author, and grants
nothing to somebody who cannot read, is asserted deterministically in
`transmission.test.ts` instead.

### `prototypes-can-fail` was deleted, not disabled

It asserted that both trial outcomes occur in a run. A two-year run produces
about eight trials at roughly a one-in-three failure rate, so zero failures is
ordinary chance — and the century scenario duly reported "8 built, 1 failed" and
then "8 built, 0 failed" across a change that never went near the roll. Raising
the minimum sample does not save it: the number of trials a run yields is
smaller than a statistical claim of this kind needs, so every threshold is
either flaky or permanently n/a. Both outcomes are asserted deterministically in
`research.test.ts` now, over twelve hopeless prototypers and twelve able ones.
The comment where it used to live says all this, because the obvious thing for a
later reader to do is put it back.

Two more gates were corrected rather than tuned, both exposed by the new
scenarios sitting between twelve days and two years where nothing had sat
before: `knowledge-is-found` and `ideas-become-tech` shared a thirty-day gate
with *conception*, which happens in an afternoon, while proving a design is
measured in seasons. Both want a year now. `knowledge-is-passed-on` keeps the
short gate, because handing over something you already know takes ninety ticks.

### Verification

`children-are-taught` reports **17 of 35 lessons went to a child, 16 of those
from a parent** on the century run, and fails on the build without phase 4a with
*"0 of 18 lessons went to a child"*. `records-are-cut` reports seven distinct
technologies on seven stones in `scribes`. New: `transmission.test.ts` (ten
assertions covering all four channels), an e2e spec that fails if the panel's
literacy gate is removed, and the tech web's node count is now read from `TECHS`
rather than written as a literal that any new node would break.

**Food economy: measurably better, and the cause is named but not confirmed.**
Twenty seeds, 65.6% mean survival before against **72.7%** after. The plausible
mechanism is that children now arrive at adulthood already holding `plant_lore`
and `cooking` — which are `forageYieldFactor` and `nutritionFactor`, the two
technologies that feed people — where before every generation started from
nothing. That is a real directional story rather than a coefficient, but it has
not been isolated, and this project has been wrong about a cause it did not
measure before.

---

## 2026-09-06 — Pass A: content that can be reached, and movement you can watch

Four defects and two of the owner's eight requests, lifted out of the phases
they were scheduled into because they are cheap, visible in the first minute of
a game, and two of them break rules `AGENTS.md` calls inviolable. `m6b_plan.md`
phases 5 and 6 lose their "fix on the way past" notes to this entry; what
remains of those phases is unchanged.

### `doCraft` was the one long action nothing could interrupt

A novice's `skillFactor` is 0.35, so a hand axe is `ceil(90 / 0.35)` = **258
ticks** — more than a whole in-game day at `ticksPerDay` 240. For every one of
them the knapper was `committed`, which stops the brain re-planning, and the
action had no `interruption()` call inside it. Nothing could reach them: not
thirst, not hunger, not cold, not being attacked. At `thirstRate` 0.085 that is
twenty-two points of thirst in one sitting, against a threshold of thirty-five.

*Reason:* it is exactly the omission `AGENTS.md` blames for the two worst bugs
in this project's history, sitting in the one action nobody had looked at. A
second consequence was invisible until it was fixed: with no `stop()` the craft
never reached the player's floater and never set the order aside for `resume`,
so the whole of M6c was bypassed here.

**`Brain` now also refuses to *start* one while a need is already over the
line.** The interruption check alone produced 786 abandoned attempts against 10
finished items: somebody one point past the thirst threshold armed a
two-hundred-tick timer, was stopped on the next tick, re-scored, and chose the
same thing again. The thresholds moved into `WORK_LIMITS` and `pressedByNeed` in
`ActionSystem` and are asked for rather than copied — *reason:* two copies of
those numbers would drift, and the drift would resurface as that same thrash
months later with nothing to point at. 786 became 14.

### The granary: a chain broken in four places, not a bad number

`BUILDINGS.granary` asks for six `pottery`, and `pottery` was the only id in
`ITEMS` with no source anywhere — no resource node, no tree, no kill, no recipe.
That was only the first link:

- **Nothing produced it.** New `src/sim/entities/Recipe.ts`: a `RECIPES` table
  shaped like `BuildingDef.materials`, holding the hand axe (moved across
  without changing a number) and the pot. Two entries and no more — *reason:* a
  recipe whose output nothing consumes is the same defect with the arrow
  reversed, and the new `recipes` tests assert every output is either worth
  carrying for its own sake or named by a building.
- **`doCraft` was monolithic.** The axe's predicate was written out three times
  — action, catalogue, scorer — plus a fourth copy of its name in the floater
  labels. All four read the table now, and `Person.targetRecipe` carries which
  one through `order`, `resume` and the stop notice.
- **The scorer could not fetch it.** `Brain`'s `kindFor` maps a material to the
  node it is dug out of and had no entry for `pottery`, so `wantedKind` came out
  undefined and `gather_for_site` was never scored: the site sat six pots short
  for ever. It now looks for a recipe, fetches the *ingredients* instead, and
  the craft scorer turns them into the thing once they are in the pack.
- **No band ever planned one.** `BandSystem.planBuildings` chose between three
  ids written out by hand — `windbreak`, `mud_hut`, `storage_pit` — and never
  consulted the designs available to it. **The granary and the longhouse were
  therefore structures no band would build in the entire history of the game**:
  correctly gated behind a real technology, listed in the player's build menu,
  and unreachable by the world that was supposed to grow into them. The planner
  now picks the best design its own members can actually raise.

*Reason for asking the band's own members rather than `Simulation.knownTech`:*
knowledge is held by people. A granary is something *this* band can build when
*this* band has somebody who can fire clay, and it stops being one when that
person dies. Building on the strength of a potter three valleys away would make
the knowledge pillar a lie.

Two deliberate conservatisms in the new planner: the first store is always the
cheap one, and nothing grander than a mud hut is planned until the band has
finished one. *Reason:* a granary is 900 ticks and 64 units of material against
the storage pit's 180 and 10, and a band whose first structure is an
eighteen-hundred-tick longhouse spends its first winter under a frame.

### A refusal by authority threw away the reason it had just worked out

`Simulation.command` computes `standing` on one line and fails the roll on the
next, and never touched `lastRefusal` — while `main.ts` was already waiting to
concatenate it, and the Ties tab was already printing that very sentence right
up until the moment it mattered. The player read a bare "Aldric refuses".

Also in `Authority.ts`: `ORDER_COST` gained `craft`, `hunt`, `sleep`, `teach`,
`ponder`, `discuss`, `prototype` and `flee`, every one of which had been falling
through to the 0.3 default; and `willObey` was deleted, having been exported and
never once called.

### O6 — movement is continuous

The simulation runs at five steps a second and the renderer at sixty, and every
drawable read its position straight off the simulation: each position was
painted for **twelve identical frames** and then jumped about ten pixels. The
`accumulator` in `main.ts` was already carrying the missing fraction of a step
and discarding it.

New `src/render/Interpolator.ts`, purely presentational and never constructed by
the headless harness. What is not standard about it is the **window**.
`WildlifeSystem` moves an animal one tick in five at five times the speed, so at
`tickRate` 5 an animal moves once per real second; interpolating that against
the preceding step would slide it across in a fifth of a second and hold it
still for four fifths — a 1 Hz twitch, and visibly worse than not interpolating
at all. Each entity therefore carries the span its current move was made over,
measured by watching when its position actually changes. A person gets 1 and the
textbook formula; an animal gets 5 and glides; one rule keeps covering both if
either stagger is ever retuned.

Three edge cases are blinded on purpose: `alpha` is forced to 1 while paused and
when a backlog is dropped — a zeroed accumulator would rewind the world by a
whole step at the exact moment it is already struggling — and clamped when the
speed slider changes `stepDuration` underneath an accumulator filled at the old
rate. Anything the interpolator has never seen is drawn where it says it is,
which is the right answer for the frame somebody is born on, and tracks are
swept so a long run does not remember everyone who ever lived.

**The camera follows the drawn player, not the stepped one** — otherwise the
world slides smoothly beneath a character who is still jumping, which is worse
than either half alone. `Camera.follow` also stopped being framerate-dependent
while it was open: it applied a flat 0.12 *per frame*, so the same code chased
at half the speed on a 30fps machine and at twice on a 120Hz display.

Measured beforehand at about 60 FPS in headless Chromium, which is what said the
renderer was never the constraint. `optimizations.md` has said so in as many
words since 2026-09-02; the frames were never the problem, the missing fraction
of a step was.

`Config.maxTicksPerFrame` was declared, never read, and written out as an 8 in
`main.ts` — the same duplication the comment above `tickRate` claims to have
fixed. Closed while the loop was open.

**A defect found by its own gate.** `Person` and `Animal` number themselves from
separate counters, so person 5 and animal 5 both exist and are different
creatures. The first interpolator kept one map keyed on the bare id, so the two
overwrote each other and a person was drawn sliding to wherever an unrelated
deer stood — sixty-five tiles in the run that caught it. Tracks are keyed by
kind as well now, and the e2e spec that found it asserts the width of the move
being drawn is more than nothing and less than anybody covers in one step. It
fails with *"the player was drawn at one fixed point all second"* on a build
without interpolation, which is what makes it a gate rather than a decoration.

### O7 — clicking one thing still offers the ground

The chooser needed **two** stacked candidates, and the ground was only ever
added as an entry once a stack had already opened it. Clicking somebody standing
on the tile you meant to walk to gave you the person and no way at all to say
otherwise — and standing on the thing you are working on is the ordinary state
of affairs in this game, not an edge case. It opens for any real candidate now,
with one exception: your own character alone under the cursor, because a
two-entry menu in front of the commonest click in the game is worse than the
problem it solves.

Two e2e specs were updated rather than the game: both right-clicked a lone
person and expected the radial menu, which is precisely the premise this
changes.

### A scenario in which anything is made

`craft`: two bands whose founders already know firemaking, hafting and pottery,
through a new `population.startingTech` that is empty in every world a player
will ever start.

*Reason:* knowledge takes years to work out from nothing, so **no run in the
suite had ever crafted anything or reached a gated design**, and any check about
either would have reported n/a for ever. A check that detects nothing is worse
than no check, and this is a large part of how the granary stayed unbuildable
without anything noticing. It is the affordance `harsh-winter` already uses when
it shortens a season to six days: move the starting conditions until a run can
reach the thing under test, rather than weakening the test until it passes.

### Verification

Both new checks were measured against the build without the fix, as required:

| check | on the broken build |
|---|---|
| `crafting-is-interruptible` | *"17 things made, 0 attempts broken off for a need"* |
| `pots-reach-a-granary` | *"3 granaries marked out, 0 pots made, 0 finished"* — the pre-fix world exactly |

New unit tests: `buildings-ask-for-things-that-exist`, which reports *"granary
asks for pottery, which nothing in the world produces"* against the old table;
the recipe-table invariants; `interpolator.test.ts`; an interrupted craft that
reports its reason and is picked back up; and a failed authority roll that
carries `standing.because`. Two new e2e specs for O7, one of which fails if the
self-click exception is removed.

**Two checks were corrected rather than tuned**, both exposed by the new
scenario and both cases of a check asking a question its run could not answer.
`techs-are-refined` shared a thirty-day gate with the rest of the research
lifecycle, which covers proving a design and comes nowhere near improving one,
and wants a year now. `prototypes-can-fail` demanded both outcomes from as few
as one trial, which is a coin toss rather than a measurement, and wants four —
the same reasoning `hunts-succeed-and-fail` already applies to strikes.

**Food economy: no resolvable effect.** Twenty seeds, 67.1% mean survival before
against 65.6% after. That sits well inside the band this project has already
measured as noise: twenty seeds separated phase 1 by 65.7 against 64.6, and ten
seeds once put a strictly better change nine points worse. Recorded as *not
resolvable*, which is not the same as unchanged.

---

## 2026-09-06 — M6b phase 3: the tech web

The visualiser for phase 2, and equally the instrument for telling whether
phase 2 works. The project already values that pairing — `npm run why` and the
HUD render the *same* `lastScores` table two ways — and this is the same idea
applied to knowledge: the web draws the same `TECH` table and the same `Notice`
that `KnowledgeSystem.tryConceive` decides on, so a picture that looks wrong is
a simulation that is wrong.

### The panel

- **`src/ui/TechWeb.ts`**, a full-screen overlay on **`G`**, following the
  `Succession`/`NewGame` boilerplate: own root on `document.body` rather than
  `#hud` — which rebuilds its subtree every frame — one delegated listener
  dispatching on `data-*`, and Escape to dismiss.
- **Five node states**, which are the whole legend: *proven* (lit, domain
  coloured, refinement pips), *in hand* (a ring drawn to the idea's insight),
  *within reach* (dashed outline — a spark fires right now), *understood but
  unsuggested* (faint), and *out of sight* (a small dark circle with **no
  label**). *Reason:* the shape of what is unknown should be visible without its
  content being handed over. Naming everything turns the web into a walkthrough.
- **Hovering answers "why not"**: each route in, with every ingredient marked
  present or missing — "✓ knowing firemaking, ✗ holding raw meat".
  *Reason:* this is the standing "the UI must say why" rule applied to
  discovery, and it is the half that makes the panel teach the player how the
  world works rather than decorate it. It is also the reason the panel is worth
  building at all: a tree that shows a locked node and nothing else is a list of
  things you cannot have.
- **`Simulation.noticeOf`** and **`describeIngredient`** in `Synthesis.ts`.
  *Reason:* the panel must answer out of the *same* situation the simulation
  decides on, and out of the same vocabulary. A UI holding its own copy of
  either would drift the first time an ingredient was added, and would then go
  on confidently describing a spark that no longer exists. A unit test asserts
  every ingredient the table names has words.
- **Gated through `knowledgeOfPerson`.** Opened on a stranger it shows the veil
  and not one node. *Reason:* `AGENTS.md` names "any new panel" explicitly, and
  a map of somebody's mind is the easiest possible way to hand the player the
  god's-eye view the whole design is built to withhold.

### The layout

- **`src/ui/TechWebLayout.ts`**, kept apart because it is pure arithmetic and
  touches no DOM, which is what lets `techweb.test.ts` test it. Domains own
  angular sectors, `requires` depth sets the radius, and a fixed number of
  relaxation passes — repulsion between all pairs, springs along the edges —
  pulls the seeded arrangement into an organic shape. Computed once per size and
  cached.
- **No randomness of any kind.** Not `Math.random`, which the project forbids
  outright, and not a fork of a simulation stream either: `RNG.fork()` consumes
  a draw from its parent, so opening a panel would shift every subsequent draw
  in the world and two players who pressed `G` at different moments would get
  different games.
- **Two kinds of edge.** `requires` is scaffolding and is drawn as a solid line;
  a faint dashed line joins two technologies sparked by two or more of the same
  things, which is a real relation in the table and the thing that makes the
  picture read as a web rather than a family tree. Cross-domain prerequisites
  get longer springs, so the areas that feed each other drift together and the
  arcs between clusters are the shape of the image rather than lines drawn over
  it.

### Two defects found while building it

- **The panel rebuilt its DOM every frame**, which detached whatever node the
  cursor was over before a hover could land on it. Playwright said so in as many
  words — "element was detached from the DOM, retrying", a hundred times over —
  and in play the detail pane would simply never have filled in. It now keeps a
  digest of everything on screen and redraws only when that changes. The digest
  includes the *notice*, not just the known technologies, because that is what
  moves a node between "could occur to them now" and "nothing has suggested it".
- **`KnowledgeSystem.advance` would refine an already-retired idea** past its
  ceiling. Found by `research.test.ts` in phase 2 and fixed there; noted here
  because the guard is what the ceiling now rests on rather than on where the
  callers happen to look.

### Two facts about the game recorded rather than changed

- **A conversation is four and a half in-game hours**, not the "half an hour"
  the comment beside `TALK_TICKS` claimed — 45 ticks at 240 ticks to the day.
  The comment was wrong by a factor of nine and is corrected; the number is
  deliberately left alone, because `next-steps.md` §O1 replaces the single
  conversation with several modes at several costs and changing it first would
  only move the problem.
- **The owner's list is written down** as `next-steps.md` §O1–O8: conversation
  modes, talking while working, learning by working alongside somebody,
  tribe-owned buildings that rivals may be refused, sabotage, continuous
  movement instead of five discrete jumps a second, and offering the ground as a
  choice when a single entity is clicked. Each is checked against the code, so
  whoever picks one up starts from what is there rather than from a guess.

### Verification

`techweb.test.ts`: the layout is byte-identical between two runs, no node
overlaps another at two different panel sizes, every edge has both endpoints on
the web, no pair is joined twice, and the cross-domain arcs exist. Two e2e specs
cover the panel opening on `G` with its five states and its "why not" pane, and
the veil on a stranger. The tour gained `12-techweb.png`.

The mandatory `.techweb[hidden] { display: none; }` is in place and the e2e spec
asserts it, because an author `display` beats the browser's rule for `hidden`
and this project has now made that exact mistake four times. The z-index ladder
is radial 20, picker 21, **techweb 30**, newgame/succession 40.

---

## 2026-09-06 — M6b phase 2: the mind, and where ideas come from

The largest phase of M6b and the heart of it
([m6b_plan.md](m6b_plan.md) §Phase 2). Discovery stops being a uniform random
pick from whatever is reachable and becomes a lifecycle: a named person in a
particular situation has an idea, works on it alone and with people who know
something, builds one, finds out whether it works — it can fail — and afterwards
improves it. It had to land whole, because an idea that can be conceived and
never proven is inert content by another name.

### The tree is not a tree

- **`knowledge/Synthesis.ts`**, and `TechDef.sparks`. A technology is now
  reached by a *situation*: what you know together with what is in your hands,
  underfoot, on your mind, in front of you and what season it is. Each node has
  two to four such routes.
  *Reason:* the design decision taken with the project owner after phase 1. The
  register is the owner's own: holding a vegetable while knowing fire suggests
  putting the two together; holding fur while cold suggests wrapping it round
  yourself. Several routes per node is what makes this a web rather than a tree,
  and it is why the same technology arrives for different reasons in different
  bands — on a two-year run, eleven distinct spark routes fired.
- **`requires` stays and means something different.** It is what you must
  already understand, and it gates teaching, observation and conception alike;
  `sparks` is what makes a thing occur to you, and gates conception only.
  *Reason:* they are honestly different questions, and collapsing them would
  lose both. A person can be perfectly equipped to understand clothing and never
  think of it, which is the interesting case.
- **`TechDef.pressure` is gone.** Need used to be a multiplier on the discovery
  roll; it is now an ingredient. *Reason:* cold *is* the reason clothing
  occurred to you, and multiplying by it as well would count it twice.
- **`clothing` no longer requires `plant_lore`**, only `cordage`.
  *Reason:* it follows the worked example in the plan, and the plant-lore
  prerequisite was scaffolding that nothing about clothing actually rests on.

### Two senses that did not exist

- **`Person.lately`** — a decayed tally of what somebody has actually been
  doing, written from `ActionSystem.finish`, the single funnel every ended
  action passes through. *Reason:* there was no such record anywhere.
  `workedTicks` is zeroed on every finish and never knew which action it
  counted, `skills` are cumulative and saturating with ten of them covering two
  dozen verbs, `telemetry` is global and disabled in the browser build, and
  `actionCounts()` is a census of the living rather than a history. Synthesis is
  impossible without one.
- **`Person.noticed`** — the same, for the reasons somebody's own work kept
  stopping, written from `abandon` and `stop`. *Reason:* being brought up short
  is one of the things that puts an idea in a head. Somebody whose hands keep
  being full is somebody who might think of a carrying strap, and `cordage` has
  exactly that spark.
- **The ground underfoot.** `World.biomeAt` has existed since M0 and nothing in
  `Brain` or `ActionSystem` had ever called it — the only biome the player could
  read was the one under a *selected* node, never under the person doing the
  noticing. `KnowledgeSystem.notice` calls it once a day.

### An idea has five stages, and can fail at four of them

`Person.ideas` (capped at two, so nobody dabbles at everything) and
`Person.techLevel`.

- **Conceived** by a spark; **researched** by two new actions; **prototyped** at
  0.6 insight for real materials; **tested** in use, which can fail and costs
  insight when it does; **refined** afterwards to a per-technology ceiling, at
  which point the idea retires and frees its slot.
- **`ponder` and `discuss`**, both with interruption checks. Both roll for a
  *breakthrough* rather than accruing smoothly. *Reason:* insight that creeps up
  a hundredth at a time is a progress bar; insight that lurches when somebody
  finally sees it is an event that can carry a floater and a chronicle line.
  Discussion is worth more than thinking alone and a second conversation with
  the same partner is worth a third of the first, or two people would sit in a
  field discussing hafting until one of them starved.
- **The test is a daily roll, not an action**, and `techPower` hands a prototype
  half its effect meanwhile. *Reason:* the world has to actually use a thing to
  find out whether it works, and `techPower` is called from the renderer and the
  HUD as well as the simulation — a draw from an `RNG` in there would make what
  the world does depend on how often it was looked at.
- **`KnowledgeSystem.advance` refuses an idea that has already retired.** Found
  by `research.test.ts`. Nothing in the game can reach one, but the ceiling was
  being enforced by where the callers happened to look rather than by the rule.

### Every stall says so

Five new `STOP_REASONS` — nothing on their mind, nothing came of it, not ready
to build, a partner who knows nothing about it, a partner who would not discuss
it — and a second queue, `Simulation.insights`, carrying the other half: an idea
had, a breakthrough made, a prototype that did not work, a design improved.
Gated on line of sight from the player's own character, the way witnessed deeds
are. *Reason:* the standing instruction from the project owner, applied to a
whole new subsystem rather than retrofitted to it later. An idea that silently
evaporates is indistinguishable from one nobody ever had.

- **An idea thought all the way through and never built is given up on after
  ninety days**, with a chronicle line and a floater. *Reason:* without it, an
  idea whose materials never turn up occupies one of two slots for the rest of a
  life and the person never thinks of anything again.

### Two things the sparks needed, which did not exist

- **`hide` is a real item**, taken off every kill alongside the meat.
  *Reason:* clothing's heaviest route is cold hands holding fur, and nothing in
  the world produced a hide. The ingredient did not exist, so the route could
  never have fired.
- **Clothing's *prototype* costs reeds, not hides.** *Reason:* measured. Hunting
  is rare enough that costing the first garment two hides left clothing
  permanently conceivable and permanently unbuildable — the inert-content rule
  wearing a different hat. The hide spark stays; hide garments arrive with
  leatherwork in phase 5.

### Two coefficients that were measured rather than guessed

- **`FELT_AT` is 30, not 40.** *Reason:* the interruption thresholds are where a
  need *parks*, so a population's hunger settles at 40 and cold is answered by
  shelter at 25. At 40 the whole fire branch of the web was unreachable: across
  a two-year run nobody made fire where the previous build had eight people
  doing it. Firemaking also gained a route that needs nobody to be cold, since
  every other route into it wanted the one need the band answers well.
- **`ponder` is weighted close to `gather`.** *Reason:* half again higher on a
  first pass and thinking became the sixth most common activity in the world,
  ahead of building and sleeping, which is not a stone age.

**Survival is unchanged.** Twenty seeds before and after: **64.6% both times.**
That was the risk this phase carried — two long actions and a think-tick
competitor to foraging — and it did not materialise.

### The health report

Seven new checks, and one fix to an old one:

`ideas-are-conceived` (bounded at both ends, because a flood means the web is
decoration), `discovery-is-situated`, `sparks-are-various`, `ideas-become-tech`,
`research-is-social`, `prototypes-can-fail` (a test that always passes is a
delay with a dice roll drawn over it) and `techs-are-refined`. New unit files
`synthesis.test.ts` and `research.test.ts`; the ingredient and prerequisite
checks were both verified against a deliberately broken table before being kept.

- **`kin-outrank-strangers` was measuring three categories that were not
  disjoint.** `kin` and `band` both exclude household-mates and `outsider` did
  not, so somebody who marries across a band line — `bandId` is not reassigned
  on marriage — counted as a stranger to their own in-laws for life. On the
  century seed one such marriage plus a band worn down to three survivors put
  mean stranger regard above mean band regard. *This is a fix to the
  measurement, not a tuning:* a plausible theory that the new `discuss` action
  was mixing bands was tested by biasing partner choice toward one's own band,
  which made the figure **worse**, and was reverted rather than kept with a
  false explanation attached. Twenty seeds, before and after: the outsider mean
  sits within a few points of zero in nineteen of them.

### UI

A "Working on" section in the Self tab — the idea, its stage in the player's
words, the story that started it, an insight bar and a count of attempts that
did not work — refinement pips beside each known technology, `Think`, `Build the
first…` and `Discuss … with` in the radial menu, and floaters for every beat.
Two e2e specs cover the panel and the greyed-out `Think` with its reason.

---

## 2026-09-05 — M6b phase 1: the tech tree becomes a registry

First phase of M6b ([next-steps.md](next-steps.md) §1). The goal of this phase
was not new content for its own sake — it was to put a seam in place that the
research lifecycle, weapons and jobs can all be built behind, and to stop the
tree accumulating nodes that do nothing.

### Every technology now does something, and a test says so

- **`TECH_EFFECTS` and `techs-have-effects`.** A technology may not enter
  `TECHS` without an entry saying what it does and where the simulation reads
  it, and `src/sim/__tests__/tech.test.ts` fails the build otherwise.
  *Reason:* the opposite kept happening and nothing caught it. `farming` gated
  an entire era and changed nothing on the ground; `clothing` and `cordage`
  unlocked nothing at all; `ItemDef.spoilTicks` carries six distinct values and
  is never read. The guard was verified against a broken build before being
  kept — reintroducing `farming` with no effect fails with `farming has no
  declared effect` — because a check that detects nothing is worse than none.
- **`farming` is removed from `TECHS`** until fields, sowing and reaping arrive
  with it, and the Age of Sowing with it. The top era is now the Age of
  Building, off `stoneworking` and `carpentry`.
  *Reason:* shipping it inert is the exact thing the rule above forbids, and
  leaving it in would have made the new test a lie on its first day.

### The longhouse has never been buildable

- **`carpentry` is a real technology now**, which fixes it.
  *Reason:* `BUILDINGS.longhouse` was gated behind `requiresTech: 'carpentry'`
  and `'carpentry'` was not a member of `TECHS`. Nothing could ever satisfy the
  gate, so the best shelter in the game has been permanently unbuildable and
  permanently listed in `lockedDesigns()` for its whole existence. A test now
  asserts every `requiresTech` names a real tech.

### One seam instead of six call sites

- **`techPower(person, tech)`**, with `carryFactor`, `forageYieldFactor`,
  `nutritionFactor`, `buildFactor`, `quarryReachFactor`, `stealthFactor` and
  `warmthFrom` on top of it. The six inline `knownTech.has(<literal>)` tests are
  gone.
  *Reason:* refinement — a design its holder has improved — is coming in phase
  2, and six call sites would each have had to learn about it separately. One
  function learns instead. Refinement will live on the *knower*, not the object:
  a fine axe in a novice's hand is just an axe. That is a deliberate trade for
  keeping per-unit quality out of `Inventory`'s stacks, which are relied on as a
  plain id-to-count map nearly everywhere.
- **`ERA_ORDER` is derived from `ERAS`** rather than hand-written in
  `Simulation`. *Reason:* it was a second list of era ids that nothing kept in
  step, and an era missing from it would have been silently reported as a loss.

### Four new technologies, and two old ones that finally pay

`plant_lore` (forage and fruit yield ×1.3), `tracking` (quarry search ×1.6 and
notice radius ×0.75), `stoneworking` (flint yield ×1.5) and `carpentry` (the
longhouse, and build speed ×1.3). `cordage` now gives carry capacity ×1.25 and
`clothing` gives real warmth, where both previously unlocked nothing.

`warmthFrom` combines fire and clothing with diminishing returns rather than by
adding them. *Reason:* summed, a clothed firemaker exceeds 1, which inverts the
chill term into warming and makes February the most comfortable month of the
year.

### Two new trait axes

- **`intelligence` and `industriousness`**, taking `TRAITS` to seven.
  `intelligence` speeds skill practice, discovery and being taught;
  `industriousness` biases the scorer toward work and away from rest and
  wandering. Rebelliousness is deliberately *not* here — it stays derived from
  `loyalty` in `Authority.ts`, because two knobs for one behaviour is how a
  scorer becomes untunable.
- **`industriousness` never touches how fast work actually goes**, only how
  much a person wants to do it. *Reason:* work rates set the whole food economy,
  which is measured across many seeds rather than in one run, so a trait quietly
  moving them would not surface until a population collapsed.
- **`intelligence` is a bonus to `practice`, never a penalty.** *Reason:* skill
  gain is damped by the level already reached, so it is concave — a multiplier
  centred on 1 takes more from slow learners than it gives quick ones and drags
  the band's average skill down, and skill is what forage yields scale by.
- Two extra `rng.gaussian` draws per person shift every later draw on
  `spawnRng` and `lifeRng`, so **pinned worlds have changed**. This is a
  draw-count change, not a fork reorder: the fork order in `Simulation`'s
  constructor is untouched and the seed contract holds. The determinism test
  compares two runs of one seed and still passes.

### What this did to the world: nothing measurable, and that is the finding

Across **twenty** seeds of `century`, mean survival went **65.7% → 64.6%** —
neutral within the noise.

The more useful result is about the measurement itself. Four variants of this
change, none of which touched the food economy on purpose, produced ten-seed
means of 73.1%, 65.2%, 64.4%, 63.6% and 59.3%; at one point a *strictly better*
learning rate measured nine points worse than the version it replaced, which is
not a mechanism, it is chaos. **Ten seeds cannot resolve a difference of under
about ten points.** The larder fix that moved 40% → 59% was far outside that
band, which is why it read clearly. Use twenty seeds for anything smaller, and
do not tune against a single ten-seed figure.

`century`'s `population-persists` failed on one intermediate variant and passed
again on the next with no food mechanism changed in between — more divergence,
and consistent with what [bugs.md](bugs.md) already says about that check
sitting near its threshold.

### Interface

- The Self tab lists what each technology **does**, not just its name.
  *Reason:* a list of bare nouns told the player nothing about why the band's
  only potter dying mattered.

### Two test-harness fixes, both measurement rather than world

- **`e2e` picks its target in two round trips, with the world paused.**
  *Reason:* the spec snapped the camera and computed a screen coordinate in the
  same `evaluate`, but the frame loop calls `clampTo` immediately afterwards and
  pulls the view back inside the map, so for a camp near the edge the coordinate
  was stale before it was used. The click landed on whatever had not moved —
  the mud hut the person was standing in — and two specs failed with a message
  about huts. They passed before only because the person the spec happened to
  pick was standing still. The world is not wrong: a person may stand in a hut,
  and the picker correctly offers both.
- **The Playwright port is overridable via `DYNASTY_PORT`.** *Reason:* Windows
  reserves blocks of TCP ports for Hyper-V, and on this machine the reserved
  range 5111-5210 swallows Vite's default 5173 outright — the dev server dies
  with `EACCES` before a single test runs. `netsh interface ipv4 show
  excludedportrange protocol=tcp` lists the ranges. Default behaviour is
  unchanged.

---

## 2026-09-02 — The winter economy

Item 0 of [next-steps.md](next-steps.md): the island was only marginally
sustainable over two in-game years, and the failure was concentrated in winter.

Measured across ten seeds before this pass: **mean survival 40%**, with two
seeds collapsing outright — one to two people out of a peak of thirty-one. After
it: **59%, and nothing collapses**.

### People were starving beside full larders

- **`take` is no longer gated behind "carrying no food at all".** The condition
  was `!carriedFood`, so a single berry in the pack ruled out a trip to the
  store. In winter people forage more or less constantly and therefore almost
  always hold *something*. The gate is now what they carry measured against
  their hunger.
  *Reason:* over a two-year run `take` accounted for about a thousand ticks out
  of a million while the band's pits held fourteen hundred items and twenty
  people starved. This one change is nearly the whole of the improvement above:
  withdrawal trips went up ten- to thirtyfold, and the two collapsing seeds
  stopped collapsing.
- **`TAKE_APPETITE` 2.4 → 4.2, scaled by how well stocked the larder is.**
  *Reason:* a stocked pit is a certainty and a bush in February is a walk and a
  gamble — and the bushes are not regrowing at all in the cold. Proximity was
  otherwise settling every comparison in favour of whatever bare bush was
  nearest.

### Parents feed their own small children

- **A `feed` action**: an adult with food near a hungry child of their own
  household gives it to them, on a reserve of 15 nutrition rather than the 90
  that governs ordinary generosity. Routed through `doGive`, the same way
  `gather_for_site` is routed through `gather` — the action system does not need
  to know the difference, only the scorer does.
  *Reason:* of seventeen starvation deaths in one sampled run, eight were
  children and most of those were infants — ages 0, 0, 0, 1, 3, 3, 5. An infant
  cannot forage, cannot walk to a bush and cannot ask. With one reserve for
  everybody, parents walked around holding food they were not desperate enough
  to part with.
  *Measured honestly:* across ten seeds this cuts infant starvation from 51 to
  40 and older-child starvation from 10 to 7, but raises adult starvation from
  85 to 99, and **mean survival is unchanged within noise** (58.2% → 58.9%). It
  is kept because it does the thing it was built to do and because a band that
  will not feed its own young is wrong on its face — not because it raises the
  headline number. Redistributing food does not create any.

### Tried, measured, reverted

- **Reserving most of each storage pit for food.** One bad seed had 678 items in
  store with only 143 of them edible; the rest was sticks, thatch and flint, and
  the decision to store is scored on a *food* surplus while `doStore` put away
  the entire pack. Capping materials at 35% of a pit made things **much worse** —
  mean survival 58.9% → 40.1%, with starvation up across every cohort.
  *Why:* carrying capacity is shared between food and materials, so a store that
  will not take a hauler's sticks leaves them carrying sticks, and a pack full of
  kindling is a pack that cannot hold berries. Materials in the pit are doing
  useful work. Reverted.

### A new instrument: `npm run sim:seeds`

- **`tools/seeds.ts`** runs a scenario across many seeds and reports mean
  survival, collapses, births and starvation split by cohort.
  *Reason:* none of this was visible to `sim:check`. Every named check passed
  while a band starved beside a full pit, and a single `century` run is chaotic
  enough that its end state flips on changes unrelated to food.
  *And a check would not have helped:* two were written and then deleted after
  being measured against the broken build. Withdrawals as a share of deposits is
  *higher* in the broken world (48–53%) than the fixed one (38%), because the
  problem was the number of trips, not the size of them; and the starvation
  counts of the two builds overlap. The signal genuinely lives in the mean across
  seeds, so the honest answer was to build the instrument that measures it rather
  than a check that looks reassuring and detects nothing.

### Where it stands

Mean survival 59% over two in-game years, no collapses in ten seeds. The
remaining deaths have shifted: **99 adults to 40 infants**, where before the
larder fix the split was more even. Food distribution is no longer the binding
constraint; total food and carrying capacity are. See
[next-steps.md](next-steps.md).

---

## 2026-09-02 — M6c: the reported bugs

Five defects reported from play after M6a, written up as section M6c of
[m6_plan_households_sleep.md](m6_plan_households_sleep.md) and fixed here. Four
of them turned out to be one root cause wearing four hats.

### 11. Every reason now reaches the player

- **`ActionContext.onStopped`, `Simulation.interruptions` and
  `stopReasonLabel`.** Every path that ends an action — `abandon` for "the world
  changed" and a new `stop` for "they had had enough" — reports the reason
  before `finish` clears the action. The simulation queues them for anyone under
  an order; `main.ts` decides whose are worth showing (the player's own
  character and whoever they are commanding) and puts them on a floater and in
  the panel's action line for six seconds.
  *Reason:* `interruption()` returned eight reasons and `abandon()` a dozen
  more, and **every one was a telemetry counter for the health report and
  nothing else**. From inside the game an order stopped and the character went
  back to "thinking". A simulation that knows exactly why it refused you and
  does not say so is worse than one that does not know.

### 12. Sleep

- **`doSleep` no longer borrows `interruption()`.** It has its own
  `wakeReason`: thirst > 45, hunger > 50, being attacked, dawn, or fully rested.
  Never `hands_full`, never `long_enough`, and the `workedTicks++` is gone.
  *Reason:* the work list's *first* clause is `isLaden`. A player who had been
  out foraging came home with a full pack, lay down, and was woken on the same
  tick — measured: 0 ticks, fatigue 60 → 59.1. "Your hands are full" is a reason
  to stop picking berries and has nothing whatever to do with lying down.
  Waking thresholds sit above the working ones on purpose: you work through mild
  thirst and stop at 35, you sleep through it and wake at 45.
- **Cold is deliberately not a waking reason.** The roof overhead is the thing
  that fixes cold; throwing somebody out of the hut for being cold in it is a
  circle.
- **A daytime nap holds if the player ordered it**, exactly as `rest` already
  did. Left to their own judgement, nobody sleeps through the day.

### 13. "Go to" on the Ties tab

- **A focus button per row**, `data-focus` → `onFocus` → `camera.snapTo` with
  the follow released.
  *Reason:* a name in the Ties tab that you cannot find on the map is a dead
  end. `snapTo` rather than `recentre` because `recentre` re-attaches the camera
  to the player, so the view would slide straight back off whoever the player
  just asked to look at; `F` re-attaches it when they are done.
  *On the knowledge pillar:* this reveals nothing gated. The camera already pans
  freely over the whole island. What is withheld is a stranger's name, skills,
  condition and history, and a camera position touches none of them.

### 14. Interrupted work is now picked back up

- **`Person.resume`**, stashed by `Simulation.noteStop` for need-driven stops
  only (`thirsty`, `hungry`, `cold`), restored by `resumeOrders` once the person
  is genuinely comfortable again — thirst under 20 against the 35 that
  interrupted them, so the two cannot ping-pong. Expires after 2,000 ticks, and
  any new order supersedes it.
  *Reason:* the reported symptom was "berries never get interrupted, clay and
  flint always do". The code path is identical for all three; the difference is
  **job length against absolute need thresholds** — measured, from zero thirst:
  berries 148 ticks reaching thirst 13 and never interrupting, flint 416 ticks
  reaching 35 and always interrupting. Nothing short of making the rule relative
  would equalise that, and a relative rule has the same problem. What actually
  fixes the complaint is that the outcome stops differing: the job gets done
  either way, because he goes for a drink and comes back.
- **`clearOrder` no longer wipes `resume`; `forgetPlans` does.**
  *Reason:* `finish` calls `clearOrder` at the end of *every* action, including
  the interruption that had just stashed the resume a few lines earlier — so
  resumption was impossible and measured as never firing. Refusals, exile and
  the player taking the controls by hand use `forgetPlans` and mean it.
- **`interruption` gained `lookaheadTicks`**, so harvesting asks whether
  finishing the *next* pull would put them over the line rather than only
  checking where they are now.
  *Reason honestly stated:* this is a small improvement in predictability and it
  did **not** fix the reported asymmetry — a pull is 8–14 ticks and the
  projection moves flint from 416 ticks to 388. It is kept because "he will not
  start a pull he cannot afford" is a legible rule; the actual fix is resumption
  above.

### 15. Felling

- **`interruption` gained `ignoreLaden`, and `doChop` passes it.**
  *Reason:* measured, a laden feller chopped for **0 ticks** and reported
  `work_ended_hands_full`. A tree needs pack room only at the instant the trunk
  drops.
- **Timber that will not fit falls as an `ItemPile`** via a new
  `Simulation.dropAt`.
  *Reason:* `doChop` clamped the yield to what the feller could carry and the
  remainder simply ceased to exist. This world's standing rule is that goods
  move rather than appearing and vanishing.
- **`workProgressOf` extracted to `sim/core/Progress.ts`** and shared by the
  renderer and the panel.
  *Reason:* M6a's panel work bar read `person.cycleProgress`, which is `null`
  for the whole of felling and building, so the bar over the woodcutter's head
  filled while the panel beside it showed nothing for the ninety seconds it
  takes to fell a tree by hand. The renderer already had all three cases; the
  panel had reimplemented one of them. Same "two implementations drift" lesson
  as `moveToward`, `linkFamily` and `hitRadiusOf`. The shared version also fixes
  a bug the renderer had on its own: it ignored the hand-axe multiplier, so the
  bar lied to anyone holding one.
- **The forest no longer retires a tree somebody is felling.**
  `ForestSystem.daily` grants a stay of execution to any tree with
  `chopProgress > 0` and counts `tree_death_deferred`.
  *Reason:* measured — at a day boundary a standing, actively-chopped tree was
  removed from `treesById`, taking several hundred ticks of accumulated axe work
  with it and ending the order with a bare "the tree was gone". It is still past
  its span and is offered up again the next day.

### Verification

- **A new `src/sim/__tests__/orders.test.ts`**, ten cases covering all of the
  above.
  *Reason for putting them here rather than in `simcheck`, which is what the
  plan proposed:* every one of these is a specific interaction — a laden
  sleeper, a tree dying under the axe — and the scenario runs are chaotic enough
  that they would report these as flaky long before they reported them as
  broken. A scenario check answers "is the world healthy?"; these answer "does
  this exact thing still work?".
- **A new e2e spec** for the Ties "go to" button.
- Side effect worth recording: `century` improved from 16 alive out of a peak of
  31 to **22 out of 33**, without anything in this pass aiming at the food
  economy. Sleep working, and ordered work surviving a trip to the river, were
  apparently worth six people over two in-game years.

---

## 2026-09-02 — M6a: hands, households and hooves

One pass, implementing [m6_plan_households_sleep.md](m6_plan_households_sleep.md)
in full. Grouped by the section of the plan each change came from.

### 1. The inventory panel that keeps up

- **`Inventory` gained a `version` counter**, bumped in `add` and `remove`, and
  `Hud.selectionKey` folds it into the panel's cache key.
  *Reason:* the panel cached on selection + tab and, on a cache hit, patched
  only the action line, the need bars and the score table. The Kit tab has none
  of those, so it was built once and never touched again — berries landed in the
  pack and the panel went on saying what it said a minute ago. A rebuild every
  harvest cycle (8–35 ticks) costs nothing, and is also correct for the per-item
  verbs, since what can be done with a stack depends on what is in it.
- **A work bar in the Now tab**, from `person.cycleProgress`, patched every frame
  rather than rebuilt.
  *Reason:* the renderer floats a progress bar over the actor's head while the
  panel beside it says nothing. A player watching one of them move and the other
  sit still reasonably concludes one is lying.

### 2. Clicking the thing you meant

- **`Renderer.hitRadiusOf` and `GRAB_MARGIN`**, replacing the picker's fixed
  radii, and living beside the drawing code that produces the sizes.
  *Reason:* the picker used person 1.2 / node 1.4 / tree 1.6 tiles regardless of
  how large the renderer actually painted the thing, so a seedling drawn as a
  two-pixel sprig captured clicks a tile and a half away and the bush you were
  pointing at lost every one of them. Putting the radii next to the painter is
  what stops the two drifting apart again.

### 3. Bubbles for a stack

- **New `ui/EntityPicker.ts`**, replacing the blind `lastPick` cycling on both
  left- and right-click. Zero or one candidate behaves exactly as before; two or
  more put up a bubble each, with a hover ring drawn on the map
  (`Renderer.hoverRing`).
  *Reason:* repeated clicks used to step through a stack with no indication of
  what was in it or how deep it went. A person standing on a berry bush inside a
  hut is three guesses.
- **Bubbles are named through the knowledge layer**, so a stranger reads as
  "a man".
  *Reason:* a picker that prints a stranger's name hands the player the
  god's-eye view the rest of the interface is built to withhold.

### 4. Speed, and a panel you can fold away

- **Default speed 20/s → 5/s**, and the number now lives only in
  `Config.time.tickRate`; the loop and the HUD slider both read it.
  *Reason:* at twenty steps a second a harvest cycle passes in under half a
  second and there is no following what anyone is doing. The value had been
  hardcoded in three places, which is how the slider and the loop came to
  disagree about what speed the game opens at.
- **A collapsible panel** with a header strip, mirrored to `localStorage`, plus
  `P` to fold and `H` to hide all HUD chrome.
  *Reason:* the panel is 286px of opaque overlay pinned over the map, and the map
  is the game.

### 5. Bands that stop over-building

- **`BandSystem.planBuildings` rewritten.** Stores are wanted only above 60%
  full; shelter is measured as floor area rather than a count of roofs; a hard
  ceiling of `ceil(members / 4) + 2` completed structures; and sites with no work
  and no delivery for six days are abandoned (`dropStaleSites`), with anything
  already delivered dropped on the ground rather than vanishing.
  *Reason:* the planner counted *buildings*, not capacity or use, so a band with
  three empty storage pits planned a fourth, and a 3×3 hut and a 2×2 windbreak
  counted as the same amount of roof. The stale-site rule exists because
  `underway >= MAX_SITES` otherwise deadlocks the planner behind a hut nobody
  will ever haul timber to.

### 6. Kin, band, stranger

- **A three-rung first-impression ladder** (`SocialSystem.firstImpression`):
  own household +18, own band +6, anyone else −6. Blood kinship stays separate
  and additive.
  *Reason:* the old flat ±(10 / −14) could not express that family outranks
  band, which is the point of having households at all — and it is the household
  rung, not kinship, that covers in-laws, step-kin and fostered members. At −14 a
  stranger started most of the way to the exile threshold before doing anything.

### 7. Sleep, as distinct from sheltering

- **A `sleep` action**: `ActionSystem.doSleep`, offered on any completed shelter,
  restoring 0.9 fatigue a tick, ending at dawn, at zero fatigue, or on an
  interruption. Scored above `rest` at night when a roof is in reach.
  *Reason:* `shelter` was standing indoors waiting out the cold and `rest` was
  sitting down anywhere at 0.35 a tick. Neither was sleeping, and nobody in this
  world had ever gone to bed.

### 8. Three tribes, made of families

- **New `systems/Founding.ts`**, replacing the "everyone is head of a household
  of one" loop. `Config.population.bands` 2 → 3.
  *Reason:* a dynasty game whose opening position contains no dynasties starts
  the player a generation late.
- **`linkFamily` extracted to `SocialSystem`** and **`inheritTraits` extracted
  to `LifeSystem`**, shared by founding and by birth.
  *Reason:* two copies would drift, and a founding sibling and a born sibling
  would end up with different kinship edges — a family who are strangers to each
  other for no reason anyone could find.
- **`peoplePerBand` 15 → 10.**
  *Reason:* three bands of families is far more mouths than two bands of
  unrelated adults, because every family brings children who eat a full share and
  forage at a fraction of an adult's rate. At fifteen the island carried 48 people
  on forage tuned for 30, and the difference came out as mass starvation.
- **The last family in a band is *shaped* to the room left** rather than added
  whole.
  *Reason:* three bands asked for ten each were delivering thirty-eight, and a
  world tuned for thirty spent its first fortnight burying the difference.
- **Founding couples' ages skew young** (`min + spread * rng() * rng()`) instead
  of uniform across 20–45.
  *Reason:* the same principle `Person`'s constructor already records — a
  population that starts at the average age of its span has no breeding cohort.
  Drawn flat, the founding wives averaged thirty-three, most passed forty-five
  within two years, and two in-game years produced three births island-wide.
  Skewing brought that to ten.

### 9. Character creation

- **New `ui/NewGame.ts`**: pick a tribe (described by comparing its `norms`
  against `DEFAULT_NORMS`, so it can never describe a culture the simulation does
  not have), then a person from a shortlist, then keep their skills or spend 60
  points with a cap of 40 in any one.
  *Reason:* the world and its families generate first and the player chooses
  somebody already standing in it — nothing here creates anyone, which keeps the
  pillar that the world was not arranged around the player.
- **`possessFirst` generalised into `possess(person)`**; `?skipIntro=1` bypasses
  the screen.
  *Reason:* one path into a character; and every existing Playwright spec was
  written against a game that starts immediately.

### 10. Animals that move

- **The `game` resource node is gone**, removed from `RESOURCE_KINDS`,
  `RESOURCE_DEFS`, `suitsBiome`, `RESOURCE_COLORS`, `NODE_LABELS`, the Brain's
  food filter and the `people-harvest` check. `Config.world.gameAnimals` became
  `gameHerds`.
  *Reason:* hunting a stationary node was foraging with a different skill
  attached. Two food systems where one would do is one too many.
- **New `entities/Animal.ts` and `systems/WildlifeSystem.ts`**: deer, boar and
  hares in herds that drift, graze, and bolt as a group. `Animal.temperament` and
  `Animal.fedBy` are declared and unused *on purpose* — adding them later is a
  migration and adding them now is two fields.
- **`moveToward` extracted from `MovementSystem`** and shared with wildlife.
  *Reason:* a second steerer would drift from the first, and the first symptom
  would be deer standing in lakes.
- **A `hunt` action** that closes on a fleeing target and rolls `hunt` skill
  against the animal's evasion. `track` shrinks the radius at which an animal
  notices you — the first thing `track` has ever done.
- **A new `wildlifeRng`, appended after `knowledgeRng`.**
  *Reason:* the fork order is part of the seed contract. Inserting a stream
  invalidates every saved seed.

### Fixes found while building the above

- **Cornered animals stayed "alarmed" and motionless for ninety ticks.**
  `setFlight` only tried straight away from the threat; a herd driven against a
  shoreline had nothing walkable behind it, found no flight point, and stopped
  fleeing while standing next to the hunter. It now tries seven bearings at four
  distances and settles honestly if genuinely cornered.
- **`Animal.stamina` added.** A fresh deer outruns any person and re-alarms
  every time one closes, so the chase was arithmetically endless and no hunt ever
  finished. Stamina drains while bolting, shortens each successive bolt, slows
  the animal, and makes a blown animal easier to bring down. This is persistence
  hunting, which is also how it actually worked.
- **`HUNT_APPETITE` raised to 9**, tuned against the score table rather than by
  feel. Below about 6 nothing in the world ever hunted at all: berry bushes
  outnumber animals six to one, so they are always nearer, and proximity settled
  every comparison before hunger did.
- **`gameHerds` 14 → 22.** The `game` node this replaced was spread over forty
  sites; the same animals gathered into fourteen herds are far harder to *find*,
  and wild meat is the one food that does not stop existing in winter.
- **`.newgame` and `.picker` needed explicit `[hidden] { display: none }`.** An
  author `display` beats the browser's rule for the `hidden` attribute, so a
  hidden full-screen overlay stays laid out and swallows every click on the game
  underneath — which broke sixteen e2e tests at once. The project had already
  learned this for `.succession`; this pass reintroduced it twice.
- **`simcheck`'s bounds check now asks `World.inBounds`** instead of
  recomputing `x > width - 1`. The hand-written bound was a tile stricter than
  the world's own, so someone at x=127.6 on a 128-wide map — on a walkable tile
  the movement system had just approved — was reported as having escaped.
- **`animals-flee` was measuring the wrong thing, twice.** First against a flat
  probe radius, which counted a boar calmly grazing six tiles from a camp as
  having failed to run; then against whichever person was nearest *now*, which
  on an island with three camps reports running away from one band as a failure
  because it ran you toward another. It now measures distance to the specific
  person that spooked it.

### Tests and checks

- **Eight new health checks**: `animals-move`, `animals-flee`,
  `hunts-succeed-and-fail`, `people-eat-meat`, `bands-dont-overbuild`,
  `families-exist`, `sleep-restores`, `kin-outrank-strangers`. The harness now
  watches wildlife and sleep *during* the run, because displacement and flight
  are differences between two moments and a report assembled from the final
  state cannot see either.
- **Three e2e specs updated** because M6a changed their premises, not because
  they broke: the two that picked "the next person in the list" as a stranger
  were picking the player's own wife, and the family panel spec asserted
  "unmarried, no children", which is exactly what founding families abolished.
- **A `clickAndChoose` helper** teaches the specs the picker flow, since a click
  on a crowded tile now asks which thing was meant.
- **A new spec for character creation.**

### Deliberately not done

- **The courtship gate was left at `opinion > 5`.** Lowering it to `> 0` was
  tried on the theory that the softer in-group bias had left it sitting exactly
  on the threshold; it changed the measured behaviour not at all, so it was
  reverted rather than shipped with a comment asserting a cause the data
  contradicted. See [bugs.md](bugs.md).

---

## Earlier — M0 to M5

Not reconstructed here; the top-level [README](../README.md) carries the
milestone table and the war stories, and the git history has the rest. This
changelog starts at M6a because that is when it started being kept.
