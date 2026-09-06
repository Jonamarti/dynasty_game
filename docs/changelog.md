# Changelog

Every change, with the date it was made and the reason it was made. Newest
first. Reasons matter more than descriptions here: a later reader can see *what*
changed from the diff, but not *why*.

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
