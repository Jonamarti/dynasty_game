# Changelog

Every change, with the date it was made and the reason it was made. Newest
first. Reasons matter more than descriptions here: a later reader can see *what*
changed from the diff, but not *why*.

---

## 2026-09-09 — M8.1 continues: the bone tier

Three nodes — **`bone_working`, `tailoring` and `atlatl`** — and the first
two-stage craft in the game. Twenty-six technologies, twelve recipes,
twenty-eight items.

A kill has always given meat and a hide and thrown the rest away. `bone_working`
is noticing that the rest is the best material on the animal: out of it come a
barbed point that throws further than flint and **the eyed needle**, and out of
the needle comes the first garment that actually fits. That is as nearly as one
mechanic can put it the reason our species could live where it was cold, and
`warmthFrom` gains its third and largest term to say so.

**Bone and sinew are taken only by a butcher who knows what they are for**, which
is honest — nobody strips sinew out of a leg without a use for it — and is also
what keeps every world that has not worked it out identical to the one before
this shipped. A pack filling with material nobody can use would move `isLaden`,
and `isLaden` moves everything. The acorn follows the same rule and for the same
reason.

**Two stages rather than one, and the second was measured into existence.** The
coat could have cost "three hides and a bone" in one recipe. It costs a *needle*,
because the needle is the artefact the Upper Palaeolithic turns on and folding it
into an ingredient list would have said none of that. Making that chain actually
run took two corrections, both from measurement:

- **The needle costs bone and nothing else.** It cost a flint as well at first,
  and made *no needles at all* in a whole run while bone points were being
  knapped beside it — bone is the scarce half, and whoever has bone has sinew and
  sticks off the same carcass far more often than they happen to be carrying
  flint too. The flint burin a needle is split with is a tool rather than a
  consumable anyway, so this is also the truer description.
- **`needle` is declared ahead of `bone_point`.** Both are `knap` and both cost
  one bone, so they score identically in `Brain` and its `score > craftScore`
  hands a tie to whichever is reached first. The needle is the gateway to the
  coat and the point is the gateway to nothing.

A carcass now gives three bone and two sinew rather than two and one, because at
the lower figures a good third of every kill was dropped on the ground by a
hunter whose pack was already full.

**The third of the plan's "repairs to make while passing" is done**: `doHunt`
used the bare `REACH` constant, so a bow's `reach: 1.6` did nothing in the one
place it should matter most. The archer walked to arm's length of a deer like
everybody else and the field existed only to win brawls. Fixed here rather than
later because the atlatl is a weapon whose *whole point* is the throw, and
shipping it against a constant would have been a third node with a decorative
stat. Measured across twenty seeds of `craft`, which is the scenario that arms
people: mean survival 94.4% → 93.5%, which is noise, and conceptions past the
root nodes 1.7 → 2.2, which is the three new nodes becoming reachable.

**A new scenario, `hunters`**, with cold seasons: the bone tier is a chain four
links long and a chain is exactly the thing that passes every static test while
being impossible to walk end to end. It reports 11 kills giving 43 of bone and
sinew, worked into 14 tools and 2 coats.

New check `kills-are-butchered-for-bone`, verified failing (with the yields
removed it reports 10 kills and 0 of everything). It demands a *coat* rather than
merely a tool whenever the world can sew one, because bone and a needle getting
made proves two links and says nothing about the third — without that clause
`tailoring` could be wired, declared, offered and never once reached.

**One check was fixed rather than tuned, and it is the check that was wrong.**
`children-are-taught` asserted on a floor of one lesson, and `hunters` was the
first scenario thin enough to fail it at 0 of 3. Below a handful of lessons it
cannot tell "children are excluded from knowledge" — the real defect it was
written for, where `KnowledgeSystem.daily` skipped them outright — from "three
adults happened to teach three adults". The floor is five now, the same reasoning
`crafting-is-interruptible` already uses, and the claim itself stays asserted
deterministically in `transmission.test.ts` regardless.

---

## 2026-09-09 — M8.1 continues: crafting stations, and an oak worth standing under

Mechanism 4 of [m8_plan_the_ages.md](m8_plan_the_ages.md), with the node it
exists for: **`grinding`**, the quern, and the first recipe in the game that is
about a *place*. Twenty-three technologies, eight recipes, ten buildings,
twenty-two items.

**`RecipeDef.station` was as cheap as the plan promised, and for the two reasons
it named.** `ActionSystem.reachBuilding` took an optional predicate and its five
existing callers were untouched; `Simulation.order` already set `targetRecipe`
before the target branches, so ordering a craft with both a recipe and a building
needed no change to `order` at all, and resume works because `noteStop` captures
both. `doCraft` does **not** search for a station — buildings have no spatial
hash and `optimizations.md` owns that decision — so the scorer and the menu
choose it and hand the id over.

**The refusal reaches the player through both channels the plan asked for**, and
they answer different questions. `cancelOrder` refuses up front when the player
orders meal with no quern in the world ("that has to be made at a quern");
`onStopped` reports `no_station_quern` when the quern is demolished while
somebody walks to it. The reason id is **per station** rather than generic, so
`abandoned_no_station_quern` is available to say which station everybody is
walking to and not finding — an aggregate could not.

**The quern grinds acorns, and that was the second design in this pass, not the
first.** The plan's node table says the quern makes a `meal` item, and hazelnuts
were the obvious input. Measured across a full autumn in a two-band world, the
hazelnut recipe fired **twice**: a hazel is picked in pulls of one to three nuts,
a hazelnut at 22 nutrition is the best thing in most packs, and anybody who had
gathered enough to grind had eaten them before reaching the stone. The
competition with simply eating them is the mechanism and is meant to be there;
needing a third nut on top of it was the difference between a seasonal habit and
a curiosity.

So the oak bears now. An acorn is `nutrition: 0` — which is the honest number,
because a raw acorn is bitter with tannin and that is exactly why every people
who lived on them ground and leached them first — and `grinding` turns the
commonest tree in the wood from timber into a harvest. That is a far better
technology than a yield multiplier: before it a band walks past four hundred oaks
all autumn, and after it, it does not. Nothing competes for an acorn.

**Hanging fruit on the oak is a change to the commonest tree on the island, and
it is invisible to every world that cannot grind.** `Brain`'s fruit scorer now
weighs a tree by what its fruit is worth *to the person looking at it*
(`fruitWorth`), which is nutrition for everything that existed before this and,
for something inedible, what it becomes in the hands of somebody who can make it
into food — discounted, because an acorn is not food until it has been carried to
a stone. `band`, `century`, `harsh-winter`, `traps`, `craft`, `scribes`, `coast`
and `crowded` are all **bit-identical** before and after, every column of every
sample, which is what makes the milestone's before-and-after measurements still
comparable.

**Two candidates are scored, not one, and that is a finding.** The first version
simply widened the existing `findNearest` predicate to include acorns. But
`findNearest` returns the *nearest* match, so it quietly replaced the apple two
steps further on with an oak underfoot, everywhere, all autumn: total fruit
picked fell by a fifth and not one acorn was ground, because the oak won the
search and then lost the score. The nearest edible tree and the nearest tree
worth anything are now scored against each other, and where nobody can grind the
two queries return the same tree.

**`LEANEST_FRUIT` is 13 on purpose.** It is the least nourishing fruit that
existed before acorns, so every fruit in the game up to now clamps to 1 in
`worthRatio` and the term is a no-op for them by construction. An acorn comes out
around a half.

**The plan's warning about `proximityBonus` was measured and came out backwards.**
It predicted that without the bonus a station craft "will simply never fire". In
fact removing it produced *more* crafts — 26 against 16 — because the walk stops
being a cost and people cross the map to grind. The bonus is kept anyway: it is
the idiom every other destination scorer in the file uses, and somebody
abandoning what is underfoot to walk to a workshop is the wrong behaviour even
when it makes the counter look better. Recorded here rather than quietly
dropped, because the plan's reasoning was sound and only its prediction was
wrong.

**A new scenario, `millers`, and it needs the calendar as much as the
knowledge.** Acorns fall in autumn, and `craft` starts on day 10 and runs
thirty-three days, so it never sees one — every station check on it would have
reported n/a for ever, and n/a is not a pass. `millers` starts on day 30 and runs
to day 76: ten days to raise a roof and dig a store, the whole of autumn with
mast on the ground, and enough after it for the meal to be carried home.

**The band planner wants a station now**, ahead of traps and behind shelter and a
store. Ahead of traps because a station multiplies food a band already has where
a trap adds more, and one quern serves a band for ever so it costs a site slot
exactly once. Behind shelter and a store for the reason the trap branch already
records: a band that builds a workshop instead of a roof dies in the winter it
ate well in. Stations are exempt from the roof ceiling, like traps and for the
same reason.

**Measured, twenty seeds, `millers` with and without `grinding`:** mean survival
77.7% → **80.3%**, infant starvation 13 → 10, older children 4 → 2, adult
starvation 39 → 43. Twenty seeds cannot resolve two and a half points and this
is not claimed as one; the infant and child numbers are the more honest signal,
and adults rising slightly alongside them is what happens when more of the
vulnerable survive to be adults at risk. It is a seasonal gain of a few weeks a
year, which is the size it ought to be.

New checks: `crafts-happen-at-stations` (verified failing — with the station
handoff removed it reports 0 made against 8,832 walks that found no station).
`stations-are-required` is **not** a `simcheck` row, deliberately: nobody in the
simulation ever orders a craft they cannot do, so it could only ever report n/a.
It is four deterministic tests in `orders.test.ts` instead — refused with no
station, refused at the wrong building, walks there and finishes, and gives up by
name if the quern goes while they are walking. `tech.test.ts` gains both
directions of the table check: every `recipe.station` names a building that
exists *and is flagged* a station, and every station has something that can be
made at it.

**`fruitOnTrees` in the health report counts edible fruit only.** `AGENTS.md`
tells the next reader to watch that column against `cold` and `store` to find the
winter die-offs, and quadrupling it overnight with acorns nobody can eat would
have made a number that no longer means what its reader thinks it means.

---

## 2026-09-09 — M8.1 continues: traps, and work that goes on without you

Mechanism 3 of [m8_plan_the_ages.md](m8_plan_the_ages.md), with the four nodes it
needs: **`basketry`, `netting`, `snares` and `fish_trap`**. A snare line and a
fish trap are the first things in this game that produce food while nobody is
standing over them, which is most of what a Mesolithic band actually had over a
Palaeolithic one — and the basket and the net are the same story told in cordage,
since a woven container is what a trap *is*.

Twenty-two technologies now, seven recipes, nine buildings, twenty items.

**A trap is a `Building` with a `yields` field**, not a new entity. That was the
plan's call and it held: `ownerBandId` gives it an owner, `place`/`canPlace` and
the build menu give it placement, `store` gives it somewhere to put a catch, and
`doTake`/`reachBuilding` give it collection — nine existing systems reused
against a new entity's zero. `Inscription` is what the other road looks like and
it touched about twelve files.

**Accrual is one daily sweep that draws no `RNG` at all**, which is worth stating
rather than discovering: rates are data and the remainder is banked on the
building, so traps needed no new stream and no change to the fork order. The
fractional carry lives in `core/Progress.ts` as `accrueUnits`, beside
`workProgressOf`, because spoilage is the same arithmetic pointed the other way
and two copies of it is the drift the house style rule exists to prevent. A rate
below one a day floored at the point of use would catch nothing for ever, which
is what the remainder is for.

**A trap's rate is scaled by what the owning band still knows.** Knowledge in
this game is held by people, and a trap is the first structure whose *output*
depends on that: a snare line outlives the person who set it but not their
knowledge, so a band with nobody left who understands snares owns a loop of
rotting cord. The character panel says so — "nobody here remembers how to work
it" — because a trap that has quietly stopped is otherwise indistinguishable from
one that is working.

### Three caveats the plan named, and all three were real

- **Nothing is 1x1.** A one-tile footprint spans half a tile either side of its
  centre, `reachBuilding` wants `contains` at margin 0, and movement stops within
  0.6 tiles: a person could arrive and never be inside, walking on the spot in a
  loop with no interruption check in it. Both traps are 2x2, and a unit test
  fails the build if a future one is not.
- **Traps do not count against the band's structure ceiling.** That ceiling is
  about roofs and pits, and counting three snares would have quietly stopped a
  band ever raising another hut — and `bands-dont-overbuild` would have failed
  for a band doing exactly the right thing.
- **`planBuildings` needed a third branch**, because it wanted only shelter or
  storage and a trap is neither. That is the defect that made the granary and the
  longhouse player-only content for their whole existence.

### What the measurements changed, twice

**Traps were first planned whenever nothing else was *wanted*, and that was
wrong.** A band has two site slots, and the first version spent them on snares
while the storage pit it had already decided on was still a hole in the ground:
storing collapsed from 4,549 ticks to 394 in one run and three more people
starved than in the same world without traps. Surplus now waits behind survival,
and "survival" includes the pit that is half dug — a trap is planned only when
there is a finished store and nothing at all under construction.

**Nothing walked to a trap, and hunger was never going to fix that.** Proximity
dominates the scorer, hunger is what puts anybody near a store, and a trap is out
at the treeline: across ten seeds traps stood full for around fifty trap-days a
run while people went hungry beside them. A full trap has also stopped catching,
so the food in it was costing food. `Brain` gained a second route to `take` —
**the round**: emptying a trap that is at least two fifths full, scored on
fullness times nearness, behind the same fair-weather gate as storing, and
weighted between storing a surplus and answering an actual appetite. With it, the
same ten seeds collect nearly everything a trap catches, catches per run roughly
doubled, and days-spent-full went to zero in eight of ten.

**One principled-looking change was reverted after measuring it.** Ranking the
hungry route's larder by expected score — fullness times nearness, the same
expression the round uses — reads better than "the nearest store with food in
it", and cost **eight points of mean survival across ten seeds of the default
scenario, in worlds with no traps in them at all**. It is gone, with the number
in a comment where the next person will find it. Traps are reached by their own
route rather than by bending the one that already worked.

**The tier itself:** across twenty seeds of the new `traps` scenario against the
same scenario without the trap half of the ladder, mean survival is 89.8% either
way — no measurable change over 37 days. What does move: no seed collapses with
traps against one without, infant starvation halves (6 against 12) while adult
starvation rises (53 against 38), which is what food arriving at camp rather than
where the foragers are looks like. Traps caught between 10 and 268 items a run
and were emptied in every seed. The honest summary is that this is supply the
world did not have, and that a 37-day run is too short for it to show up as
survival.

### The nodes, and their effects

| node | requires | what it does, and where |
|---|---|---|
| `basketry` | cordage | a `basket` recipe, read by `carryFactor` |
| `netting` | cordage, fishing | a `net` recipe, read by `forageYieldFactor` on a fishing spot |
| `snares` | cordage, tracking | the `snare` design; `Simulation.workTraps` |
| `fish_trap` | netting, basketry | the `fish_trap` design, shore-only; `workTraps` |

Both items are gated on **carrying one and knowing how it works**, which is
deliberate. Knowledge alone would make the recipe pointless; the item alone is
the `handaxe` bug the M8 plan lists under repairs to make while passing — a tool
that works identically in the hands of somebody who could not have made it, and
that refinement never improves.

### Placement, and saying why

`canPlace` had no per-design predicate, because until the fish trap nothing cared
where it stood. It has one now (`BuildingDef.placement`), and the interesting half
is `placementRefusal`: the build cursor used to say "cannot build there", which is
the least useful thing a game can say, and the fish trap is the first design that
can be refused somewhere a hut would have stood happily. It now says which of the
three reasons it was — the ground, something already there, or the water's edge.

Band placement searches in widening rings from the fire rather than scattering
across a square, and for a trap that is the difference between a mechanism and a
decoration: a fish trap sixteen tiles down the coast fills up and is never
emptied again.

`doStore` refuses a trap out loud (`not_a_store`), and the scorer will not offer
one as somewhere to put a surplus, because filling a trap is a person carefully
stopping their own snare line from catching anything.

### Checks

- **`bands-set-traps`** — the tripwire on the granary failure happening a third
  time: does a band ever plan one, and could it be sited.
- **`traps-catch`** — a standing trap catches something, and the line reports
  what was collected, how many trap-days were spent full, and how many days
  nobody could work one.
- **A new `traps` scenario**, on the same terms as `craft` and `scribes`: a snare
  sits behind two technologies and a fish trap behind four, no run in the suite
  reaches either from nothing, and every check about passive yield would
  otherwise report n/a for ever.
- **`src/sim/__tests__/traps.test.ts`, eleven tests**, and the important one is
  "is worth a walk to somebody who is not hungry at all" — it fails on the build
  without the round. **There is deliberately no `traps-are-emptied` world check**:
  measured against the broken build the collection counts overlap (6 items of 59
  caught broken, 6 of 42 fixed), which is exactly the check that "looks
  reassuring and detects nothing", and two of those were deleted in the winter
  pass. Whether the scorer will walk to a full trap is a property of `Brain` and
  is tested as one.
- **`sparks-are-various` now skips honestly** when a scenario hands out six or
  more technologies. `traps` hands out eight so that both traps exist at all, and
  it read "3 routes into 1 technologies" and failed — the check being asked a
  question the world cannot answer, rather than the web having collapsed to one
  path. `craft` (four) and `scribes` (five) sit below the line and still answer
  it.

The default twelve-day scenario is **bit-identical** before and after this pass —
same drinks, same berries, same fish, same 36 checks — because no world without
trap knowledge in it takes any of the new branches. `tiny` still fails
`food-work-continues` on the one-tick margin already recorded in
[bugs.md](bugs.md), identically on both builds.

## 2026-09-09 — the game opens on its settings

Asked for by the project owner, straight after the settings screen shipped: it
should come up **before** character creation, not only from the pause menu.

The order is the argument. The settings decide how much food is on the island
and how many tribes are on it, so being asked to pick a life out of a world that
is about to be replaced is the wrong way round.

**The world built at boot is now a draft.** `Begin` keeps it if nothing that
shapes an island moved, and builds it again if something did — which choosing
any difficulty other than Normal always does, since the resource counts are on
the slider. `worldWouldDiffer()` asks only the `restart` tunables, because
everything else has already taken effect live by then.

**`rebuildBeforeStart` is deliberately not a general restart.** Before the first
step the only things holding the old world are `Renderer`'s `sim` field and its
pre-rendered terrain, `NewGame`'s `sim` field, and three module variables — so
two new `setSim` methods and a short reset cover it. A few minutes into a game
that is no longer true: `lastActions`, `lastEventId`, `commanding`, `selected`,
the floaters and half the HUD are all holding ids from the world being thrown
away. The in-game "New world with these settings" button therefore still saves
and reloads the page. One mechanism each, for two situations that are genuinely
different, and both say so in a comment.

**`window.__dynasty.sim` is a getter now.** It used to copy the reference into
the handle object, which was harmless while `sim` was a `const` and became a
silent lie the moment the start screen could replace the world — the browser
tests read that handle, and the first version of the new spec failed on exactly
this, reporting the boot island's numbers after the rebuild.

The screen itself is the same form in a `start` mode: "Before you begin", a
`Begin` in place of "back" and "new world with these settings", no restart note
(nothing has been handed over yet), no backdrop-click to leave, and no keys at
all — Escape included, for the same reason `NewGame` and `Succession` ignore it.
The action row became sticky in both modes, because the form is longer than any
screen and `Begin` was below the fold: the way into the game is not something a
player should have to go looking for.

`?skipIntro=1` bypasses both screens as it always has.

**One existing spec changed** — `character creation picks a life inside a world
that already exists` now dismisses the settings screen first. That is the spec
encoding a premise this change deliberately alters, not the game breaking.

## 2026-09-09 — the settings screen, and a difficulty from peaceful to extreme

Asked for by the project owner: tuning the game meant editing `Config.ts` and
reloading, and half the levers that matter were not in that file at all.

**The hard constraint was that the defaults must not move**, and it is enforced
rather than asserted. `src/sim/__tests__/config.test.ts` builds one world plainly
and one through the Normal anchor, steps both 500 times and compares the
determinism fingerprint. It also checks that every tunable path resolves against
`DEFAULT_CONFIG` — the failure that would otherwise be silent, a settings screen
writing `needs.hungerrate` and moving a slider that changes nothing — and that
peaceful and extreme move in opposite directions from normal, which is the
column-pasted-into-the-wrong-difficulty mistake that would otherwise only ever
show up as "extreme feels oddly generous".

`sim:check:all` is unchanged: 33/34, 36/36, 38/38, 53/53, 46/46, 48/48, 39/39,
37/37 with `tiny`'s `food-work-continues` failing exactly as before.

### Five constants became config, each wired in the same pass

Nothing was declared without something reading it.

- **`learning.skillGain`** multiplies `Person.practice`. An **instance field on
  `Person`**, not a module global: six simulations are constructed back to back
  by `sim:check:all`, a global would have the last one silently retune the
  others, and the determinism test could never see it because it compares two
  runs of the *same* build. Stamped at the only two `new Person` sites in `src/`,
  plus `Simulation.applyLearning()` to sweep the living — a multiplier stamped at
  birth is otherwise a promise the settings screen cannot keep to anyone who is
  already alive.
- **`learning.observationChance` / `childObservationChance`** replace the two
  constants in `KnowledgeSystem`. `KnowledgeContext` already carried
  `KnowledgeConfig`, so this was one field on each side.
- **`world.regrowthRate`** multiplies every node's regrowth, threaded through the
  single `node.regrow` call site. It lands on the **final term**, not on
  `growth`: `regrow` clamps with `Math.max(growth, winterFloor)`, so scaling
  growth would be swallowed entirely for fish — the one food that keeps growing
  through winter, and so the one the lever matters most for.
- **`population.conceptionChance`** replaces `LifeSystem`'s constant. It is the
  only member of `PopulationConfig` read after the constructor.

`GESTATION_DAYS` and `BIRTH_SPACING_DAYS` were deliberately left alone: nothing
in the UI would read them, and two config fields added for symmetry are two
fields that can drift.

### Five anchors, snapped, not a hundred interpolated points

`src/sim/core/Difficulty.ts` holds `TUNABLES` and `DIFFICULTIES` in one file so
the labels and the numbers cannot disagree about thirty dotted paths.

The slider snaps to peaceful / easy / normal / hard / extreme rather than
interpolating, for two reasons. Nine of the scaled fields are integers, so a
continuous slider rounds them at nine different places and the panel twitches
incoherently mid-drag. And ten seeds cannot resolve a change under about ten
points of mean survival — five anchors is five things that can be measured, a
hundred interpolated points is ninety-six claims nobody has checked. The anchors
ship as *designed* numbers and the changelog says so; measuring `hard` and
`extreme` is a follow-up, not something this pass pretends it did.

Eleven fields are exposed but **pinned** — editable, not moved by the slider.
`needs.workLimits` and `criticalThreshold` because a need parks *at* whatever
line stops work, so they are also where the band's average hunger and thirst
settle; `population.bands` because more tribes is both more rivalry and more
hands and the direction is genuinely ambiguous; the clock because pacing is
taste. Difficulty gets its winter pressure from `coldRate` and `regrowthRate`.

### Live where it can be, a new world where it cannot

Live edits are written straight into `sim.config`, which works because of object
identity rather than luck: `NeedsSystem` and `TimeManager` were handed the very
objects inside `SimConfig` in the constructor, and the per-tick and per-day
contexts are rebuilt from `this.config` every step.

`time.ticksPerDay` is the field that must never be live, and the reason is worth
recording: `TimeManager.day` is derived from an ever-increasing tick, so halving
it mid-run jumps the calendar by hundreds of days in one frame. Every absolute
day stored anywhere is then wrong at once — `lastBirthDay` locks every mother out
of conceiving, and `STALE_DAYS` abandons every idea in every head.

A new world is a **save and reload**, not an in-process restart. `main.ts` holds
`const sim`, captured by the renderer, by `NewGame` and by two dozen closures,
and there is no save system for a restart to preserve; `?seed=` and a reload is
already how a specific world is replayed. Settings persist as **the diff from an
anchor**, never as an expanded config, so a later retune of `hard` reaches a
player who never touched hunger and leaves alone one who set it by hand.
`?defaults=1` ignores stored settings, so a seed pasted into a bug report still
reproduces the reporter's world.

### Escape became a precedence chain, and three dead lines came to light

`main.ts`'s Escape handler had three lines that could never fire: each graph
overlay registers its own bubble-phase Escape listener at construction, above
the main handler, so they had already closed themselves by the time it ran.
Harmless until something needed to know whether Escape had been *consumed*.
A capture-phase snapshot now records what was open before anything closes
itself — without it, dismissing the tech web would pop the pause menu on top of
it every single time.

**One deliberate behaviour change:** clearing `commanding` now consumes the key,
where Escape used to clear it even while also closing a graph. That is the right
reading of a chain once something is waiting at the end of it.

### The notes.txt triage

- The "still says *Needs 3 thatch to build one*" report **did not reproduce** —
  that pane has been gated on `stage !== 'proven'` since the earlier fix, and
  refinement never puts the stage back. Recorded in `bugs.md` rather than
  dropped. The investigation did find a blank: a proven design being refined
  showed nothing at all, so somebody improving something for days looked idle.
  The pane now shows the refinement level and its progress.
- **"Adjustable trials to get an idea, with failures worth less"** was already
  shipped as `knowledge.trialsToProve` and `failedTrialCredit`. Both are now on
  the settings screen, which is the half that was missing.
- **The craft bar** now has a button beside Build and the menu, and says what it
  is waiting on instead of only that it is empty. See `bugs.md` — the bar was
  working; it was unfindable and usually empty, which is the same thing from
  outside.
- **A proven technology now flags its bar.** The announcement over the person
  already named what it unlocked; what was missing is that the *consequence*
  landed in a menu nobody was looking at. Watching the two list lengths catches a
  technology picked up by being taught as well as one worked out, which watching
  `prove` would not.
- Fishing spots on the coastline, rivers and salt water, and curiosity as a
  fourth transmission channel are written up in `next-steps.md` as N1–N3. The
  first two are movement-system and worldgen work that belongs with M7.

## 2026-09-08 — M8.1 begins: fishing, mechanism 2

The first node and the first mechanism of `m8_plan_the_ages.md`'s M8.1 tier,
shipped as its own vertical slice per the plan's stated order ("fishing, then
traps, then stations, then spoilage"). Thirteen more M8.1 nodes and the trap,
station and spoilage mechanisms are not in this pass; the era-ladder rename
and the `TechDef.age`/`firstKnown` axes are also deferred, since most of the
new era table's `needs` name technologies that do not exist yet.

**Fish is a `ResourceKind`, not a new action.** `doHarvest` is driven entirely
by `node.def` (kind, item, skill, harvest ticks), so a `fish` entry in
`RESOURCE_DEFS` (`entities/ResourceNode.ts`) inherits the food-work hunger
exemption, the interruption check and the stop/resume reporting with no new
code in `ActionSystem` at all — the same reasoning the plan gave for
rejecting a dedicated `doFish` action or a swimming entity. Placed on shore
tiles (`biome === 'beach' && world.isShore(...)`), the same rule `reeds` and
`clay` already use.

**The two hardcoded `n.kind === 'berries'` food predicates are now one
function.** `isFoodKind(node)` in `ResourceNode.ts` reads
`ITEMS[node.def.itemId].nutrition > 0`; `Brain`'s forage filter and
`Simulation.stats().foodInWorld` both call it instead of testing a literal
kind string. `fishing` itself is a yield multiplier on `forageYieldFactor`
(`scaled(person, 'fishing', 1.5)`), the same shape as `plant_lore` on berries
and `stoneworking` on flint — **not** a hard gate on catching fish at all, by
design: every other primary resource in this game is free to gather and only
the yield is technology-scaled, and fish measurably follows that precedent
rather than breaking it (see the measurement below).

**Decided deliberately: fish get a winter floor.** `ResourceNode.regrow`
scales by `time.growth`, which is zero in deep winter — correct for a
stripped bush, wrong for a food source whose entire purpose is not vanishing
when berries do. `ResourceDef.winterFloor` (0.4 for fish, undefined
everywhere else) sets a floor under the seasonal multiplier rather than
hardcoding a fish-specific case into `regrow`.

**The RNG seed trap the plan named twice, avoided as specified.** Fish are
placed on a dedicated `fishRng`, forked genuinely last — after the anonymous
`seedInitialForest` fork the plan flagged as a trap in its own right — and
spawned in their own pass after `spawnPeople`, never added to the `plan`
array `spawnResources`/`spawnHerds`/`spawnPeople` all share. The pre-change
world is bit-identical except for the fish.

**New: a `water` domain**, `fishingSpots` in `WorldConfig` (50, the scale of
`reedBeds`/`clayBanks`), a `fish` item (nutrition 18, spoils in 800 ticks —
faster than meat's 1200, which is real and sets up `preserving` later), a
`coast` scenario, and a `fish-are-caught` check that skips honestly rather
than assuming every region has a fishing spot (in practice it never has,
since `spawnPeople` already sites every band with water in reach).

**One check needed a sample-size floor it never had.** `crafting-is-
interruptible` only skipped at exactly zero attempts, unlike its sibling
`hunts-succeed-and-fail`; `coast`'s thin starting roster (two techs, one band)
produced exactly one craft and failed the check on a sample of one. Given the
same floor `hunts-succeed-and-fail` uses in spirit: skip under 5 attempts.
Not new behaviour from fishing, a gap in the check a thin scenario was first
to expose.

**Measured across the canonical twenty-seed cohort**, before and after, per
`AGENTS.md`: mean survival 76.2% → 79.2%, technologies known 6.2 → 6.5, taught
138.2 (noise against 142.5). Fish were caught in 20 of 20 seeds, 18,879 catches
total — the mechanism works. `fishing` itself was conceived in 0 of 20: its
only prerequisite, `spear`, was itself conceived in 2 of 20 in this same
cohort, so this is `spear`'s existing depth-two rarity inherited by anything
built on it, not a new dead spark — `tracking`'s fix does not generalise
here, because unlike `tracking` this is not a root node with a broken
ingredient, it is a node one level behind a chain that is already rare by
design. Left as a finding rather than a fix: re-tuning `spear`'s reachability
is out of scope for shipping one mechanism and risks the exact kind of
un-isolated, unmeasured change this project's own rules warn against.

`npm run typecheck`, `npm test` (140/140), `npm run sim:check:all` (all eight
scenarios, `tiny`'s one-tick `food-work-continues` flip aside — see
`bugs.md`) and `npm run e2e` (39/39, `DYNASTY_PORT=5290`) all green.

## 2026-09-08 — `tracking`'s spark, the M8.1 blocker

`m8_plan_the_ages.md` named this the one thing that had to happen before
`snares` and `taming` could land behind `tracking` without shipping
unreachable, the `leatherwork` failure again. M8.0 had found `tracking`
conceived in none of twelve instrumented worlds because its weight-1.0 route
needs `saw: quarry_escaped`, which fires about twice in two years, and its
other two routes both wait on a hunt, which is rare for the same reason.
Independently reproduced before touching anything: 1 of 20 seeds ever
conceived it (`vite-node tools/_tracking_probe.ts`, a throwaway instrument,
not kept).

**Added one ordinary route**: `{ doing: forage, place: forest }`, weight 0.7.
Anybody foraging in a forest walks past prints and droppings daily whether or
not they are hunting — the realistic story, and unlike the three routes
already there, common enough to actually fire. The three existing routes are
untouched; they are still true, just rare.

Measured across the canonical twenty-seed cohort before and after, per
`AGENTS.md`'s rule that ten seeds cannot resolve anything smaller than the
larder fix and this is smaller: mean survival 76.9% → 76.2% (noise), mean
technologies known 5.3 → 6.2, mean past-root conceptions 4.5 → 4.3 (noise),
mean taught 122.7 → 142.5. `tracking` itself went from conceiving in 1 of 20
seeds to 20 of 20, averaging 5.65 conceptions a seed — between firemaking's
and cordage's established rates on the instrumented run M8.0 quoted, not a
flood. `npm run typecheck`, `npm test` and `npm run sim:check:all` all stay
green. M8.1 is unblocked.

## 2026-09-08 — M6b phase 7: the visualisers, and a tech web that scales

`docs/m6b_plan.md` phase 7, next after jobs and rebellion. Two new panels, and
a rebuild of the one that already existed, because all three share one piece
of machinery worth building once.

**`src/ui/GraphLayout.ts` is new**, extracted from what used to be
`TechWebLayout.ts`'s own relaxation loop: repulsion between every pair,
springs along edges, a centring pull, and a last hard pass that separates
anything still overlapping. `TechWebLayout.ts` now calls it instead of
carrying its own copy — a second graph was always going to need this
arithmetic, and a second copy is how the two drift apart. Two graphs did
need it: `FamilyTreeLayout.ts` pins every node's `y` to a generation, so a
family reads top to bottom rather than relaxing into a circle; `TribeGraphLayout.ts`
seeds nodes by rank and lets springs whose rest length runs from love to
hatred do the rest.

**The family tree** (`K`) walks `motherId`/`fatherId`/`spouseId`/`childIds`
two generations up and two down from whoever it is opened on, plus siblings
found by scanning for someone else who shares a parent — not stored on
`Person` directly. A child's own spouse is shown but not traced further, or
the tree would pull in a second, unrelated family through every marriage.
Gated on the same acquaintance level `Hud.tabTies` already puts on a family
section, and — because the people gathered are not only the subject — every
individual node's name is routed through `knowledgeOfPerson` again for
*that* person: a stranger on your own family tree reads "a young man," not
by name.

**The tribe graph** (`T`) is not spokes from the subject alone. It is a
sociogram: an edge between *any* two people the subject knows who also have
an opinion of each other, not only between the subject and everyone else —
two people the subject knows who cannot stand one another is exactly the
kind of thing a map of somebody's ties should show. Capped at the
twenty-four strongest relationships (`relationships.knownBy` already sorts by
magnitude), with the head line saying so once the cap bites rather than
quietly dropping the rest. Colours reuse `.hud-tie-value.is-pos`/`.is-neg`'s
exact palette. Gated on `knowsTies`, the stricter of the two thresholds — this
can name people the subject actively dislikes, which is a sharper thing to
hand over than who their parents are.

**The tech web rebuild** is the one `next-steps.md` called mandatory, and the
numbers in that document were confirmed rather than assumed: at seventeen
nodes the old fixed-1080x720, no-pan-no-zoom layout had a fit-to-box scale of
~0.65, putting the relaxation's own 92px hard separation at about 60px on
screen — under a node's own 84px width. `layOutWeb` no longer fits itself into
a box at all; it lays out at natural size (`GraphLayout.shiftToOrigin`) and
`TechWeb.ts` owns a pan-and-zoom viewport instead, the same relationship the
game's own camera has to the world. Dragging pans, the wheel zooms centred on
the cursor, and panning or zooming touches only a `style.transform` — never a
rebuild — which is what keeps a hovered node from being detached sixty times a
second the way an earlier redraw-on-every-frame bug once did to this same
panel. Below `CHIP_ZOOM` a node collapses to an unlabelled dot rather than a
box of illegible text, its border colour still showing the domain and state.

Cross-links got a degree cap rather than a stricter threshold, and that order
was decided by measurement, not by the plan's first guess: raising the
shared-ingredient threshold from two to three was tried first and left only
three edges in the whole table today, a wall of unrelated nodes rather than a
web. `firemaking` alone drew eight of them at the threshold that stayed, most
of the way to the "hundreds of faint lines" `next-steps.md` warned about — so
`MAX_SHARED_DEGREE` caps any one node at four, keeping the strongest relations
and dropping the rest, which is the lever that actually works at this size.

**One thing in the plan not done as written, and why:** "radius becomes the
age rather than the prerequisite depth" assumes M8's seven archaeological
tiers, which have not shipped — today's `ERAS` are cumulative society-wide
milestones, not a per-technology property, and mapping each tech to "the
first era whose needs include it" would put `cordage`, a root node, in the
same band as `hafting`, three steps into the tree, because only the *tools*
era's needs happen to name it. Prerequisite depth already sorts oldest-to-
newest in practice — a root node cannot help being depth 0 — so the radius
basis is unchanged. Revisit this once M8 gives every technology a real age of
its own.

Verified: `npm run typecheck`, `npm test` (140 tests, fourteen new
determinism/overlap tests across the three layouts), `npm run e2e` (39 tests,
five new — opening each graph, the mutual-exclusion between all three, the
veil on a stranger, and a real mouse drag and wheel zoom on the tech web), and
`npm run sim:check:all` (unaffected — nothing in `src/ui/` runs headless, and
the suite stayed green to confirm this pass touched no simulation code).

## 2026-09-08 — M6b phase 6: jobs and rebellion

`docs/m6b_plan.md` phase 6, chosen by the project owner ahead of the tech
ladder. `Person.job` from a small table in the new `src/sim/entities/Job.ts`
(`forager`, `hunter`, `builder`, `crafter`); `Brain.score` leans a job-holder's
own verbs up and the rest of `WORK_ACTIONS` down by a small, calibrated factor,
never touching social or research actions or the needs that can kill someone.
The chief settles unemployed adults into whichever job the band currently has
fewest of, one a day and without spending an RNG draw; assigning someone
*else's* job is a new kind of order, through `Simulation.assignJob`, subject to
the same compliance roll `command` uses and its own `ORDER_COST.job`. A sixth
HUD tab, Work, lets the player assign a job to anyone they can see, and says
what it leans them toward.

`SKILLS` gained `farm` and `smith` ahead of the technologies that will use
them, because it is iterated by founding, inheritance, ageing and the
character-creation point budget and that migration must not hide inside the
M8 content pass that first gives either of them an action.

Rebellion is derived, not stored: `BandSystem.considerRebellion` runs beside
`considerExile`, gated on the *single most aggrieved* band member's opinion of
the chief rather than the band's average. That was a finding, not a starting
choice — instrumenting a two-year run showed the band's average regard for its
own chief never once went negative, because `chooseChief` re-elects daily and
simply replaces a chief who is losing the room before collective resentment
can accumulate. One person hating an otherwise well-liked chief is common by
comparison. Three rising outcomes, gated behind `defiance` so crossing the
threshold does not itself cause anything: public refusal, leaving the band (via
a `removeBandMembership` shared with `exile`), or a public challenge for the
chiefdom decided by the same regard `chooseChief` would use if it ran again
today (a new `standingScore` helper, extracted so the two never drift apart).

Two new `simcheck.ts` checks, and both needed a second pass once real numbers
came back:

- `jobs-bias-work` first compared job-holders' time on their own job against
  everyone-with-no-job's time on *any* job's actions, and failed by
  construction — `forage` alone is most of everyone's day, employed or not,
  since it is also how hunger gets answered, and that comparison punished
  narrow jobs like `crafter` however well the bias worked. It now compares
  each job's holders against everyone who does *not* hold that job, action by
  action, and needed the bias strengthened from a first pass that only passed
  on some scenarios in `sim:check:all` to one (`JOB_BIAS_UP`/`_DOWN` in
  `Brain.ts`) that holds a positive margin on all seven.
- `rebellion-is-rare-but-happens` reports **n/a rather than a failure** when a
  run sees no rebellion at all, for the reason `prototypes-can-fail` was
  deleted rather than kept: across fifteen seeds of `century`, six saw zero
  rebellions in a full two years, and the `century` seed's own count moved
  between 0 and 2 across two tuning passes in this one while
  `considerRebellion` itself did not change. A rare stochastic event has too
  small a sample in any one run for a hard pass/fail to mean anything; what
  the check still catches is the ceiling, and the mechanism itself is asserted
  deterministically in the new `band.test.ts` — a band with one member primed
  to despise its chief past any doubt (loyalty 0, opinion -100, so `defiance`
  is exactly 1 and no RNG draw can fail the roll).

Collateral fix, found by the above: `kin-outrank-strangers`'s three-tier
comparison could already flip on a single relationship — its own comment
documents a marriage across a band line doing exactly that — and the "leave"
rebellion outcome gave the `tiny` scenario a new way to create the outcast
band's first member inside its first week, at five or six pairs in the
outsider and band tiers. `opinionOf` now returns n/a under ten pairs rather
than under zero, chosen by measuring `tiny` (noise) against `century`
(hundreds of pairs, stable) rather than picked to make one run go green.

`npm run sim:check:all` (all seven scenarios), `npm test`, `npm run e2e` and
`npm run sim:seeds` (77.5% mean survival, 0/10 collapsed — no regression from
the 71.3%/2 baseline measured before this pass) all pass.

## 2026-09-08 — M8.0: the climb, measured across seeds instead of on one

The measurement pass `m8_plan_the_ages.md` puts before the ladder. Two checks
changed, the seed cohort learned to report the tech tree, and **the finding the
whole milestone was ordered around turned out to be a property of one unlucky
seed rather than of the game.**

### The plan's premise was drawn from a single chaotic run, and is wrong

The plan opens with a two-year `century` run in which three of seventeen nodes
are ever conceived, two technologies are known to anybody at the end, and 13
lessons are taught — and concludes from it that **the climb is set by
transmission**. Every one of those numbers reproduces exactly. They are also the
worst of twenty.

`npm run sim:seeds -- --seeds 20` now reports the tree, and the same
scenario across the canonical cohort gives **5.4 technologies known at the end,
4.2 conceived past the root nodes, and 124 things taught or picked up by
watching**. The century seed — 2 known, 0 past the roots, 24 passed on — is
**the only one of the twenty that never gets past a root node**. Nodes at depth
two are reached routinely: `stoneworking` and `leatherwork` both turn up.

*Reason this matters more than the correction itself:* `AGENTS.md` says in as
many words that the century scenario is chaotic and that one run of it is not
evidence, and the plan quotes that rule in its own risk section before resting
its ordering on exactly that. The instrumented run was real and reproducible;
generalising from it was the error.

### What actually gates the climb: the population, not the teaching

The two are not independent, and the direction runs the other way from the
plan's. Sorting the cohort by survival sorts it by the climb: the two seeds that
collapse below a quarter are the two worst climbs, and the century seed is last
on both. Transmission tracks adult-days almost exactly — 24 things passed on in
a world with 1,405 adult person-days, 194 in one with twice that — because
teaching needs somebody who knows something and somebody with the years to be
taught, and a halved population has neither.

So of the four hypotheses M8.0 was written to test: **transmission is not the
bottleneck** (refuted), **population is** (supported), and the food supply pass
M8.1 was already going to do is the same work as the tech-rate fix, exactly as
the plan's fourth point guessed.

### The idea cap is not the story either, and was not changed

`MAX_IDEAS` was raised from 2 to 4 and the cohort re-run: known 5.4 → 5.5, past
the roots 4.2 → 4.3, survival 75.7% → 77.0%. That is nothing — far inside the
ten-point floor this project already knows ten seeds cannot resolve. The
instrumented run says why: an adult held a full slate on 539 of 1,405
person-days, but on only **20** of those was there an idea open to them that the
cap was actually blocking. *Reason it was measured before being changed and then
left alone:* it is a plausible-sounding knob, and the honest measurement says it
buys a tenth of a technology.

### `sparks-are-various` now counts technologies, not routes

It read "8 distinct spark routes fired" on a world where fourteen of seventeen
nodes had never entered a head, and passed. It now reports "8 routes into 3
technologies" and asserts both. *Reason:* a check that looks healthy on a world
where four fifths of the tree never occurs to anyone is the failure that got two
checks deleted in the winter pass.

### `the-tree-is-climbed` is new, and fails on the century seed

It asserts that a run of a year or more conceives something past the four nodes
anybody can reach knowing nothing. It fails today on century — 0 of 3 — and is
the gate every content tier of M8 is held to: a tier that adds nodes and does not
move it has added content no player will ever see. Its comment says plainly that
it is a tripwire on the worst case and not the measurement, and points at
`sim:seeds` for the distribution, so that nobody reads one red line as evidence
about the pace of discovery. Both of century's failures now have one cause.

### `sim:seeds` reports the tree beside the population

Three columns — technologies known at the end, distinct nodes conceived past the
roots, and things taught or watched — plus a mean line and a count of worlds
that never got past a root node. *Reason:* the climb is a mean-across-seeds
question for precisely the reason the food economy is, and it had no home. The
tool also had to enable telemetry, which `runScenario` does and this path never
did, or every one of those columns would have read zero.

---

## 2026-09-08 — Planning: the roadmap, and a tech ladder that runs to iron

A planning pass, so no simulation code changed. What changed is the documentation
that tells the next person what to build, and it changed because two of the
owner's requests turned out to depend on a measurement nobody had taken.

### The roadmap had gone stale, and was rewritten rather than amended again

`next-steps.md` was written on 2026-09-02 and amended in place for a week. By the
end it described the tech tree as "ten nodes so far" when there were seventeen,
listed weapons and knowledge transmission as future work when both had shipped on
2026-09-07, and marked two of the owner's eight requests done inside a section
whose preamble said nothing was scheduled. *Reason for a rewrite rather than a
ninth amendment:* a roadmap somebody cannot trust to describe the present is
worse than no roadmap, because they will plan against it.

### The tech tree is to run to iron, and to follow real human history

Asked how far the ladder should reach, the owner chose **iron**; asked what to
build first, **jobs and the visualisers**; asked how eras should be named,
**both** — the real archaeological period as the title, the evocative line kept
as its description. New `docs/m8_plan_the_ages.md` carries forty-eight new nodes
across the Upper Palaeolithic, Mesolithic, Neolithic, Chalcolithic, Bronze and
Iron ages, each with the mechanism that makes it real, plus the era table, the
two new skills and domains, and `TechDef.age` and `firstKnown`.

`m6b_plan.md` phase 8 said "stop and re-plan here". It is marked superseded and
points at the new document; every node it named survives inside it.

### The measurement that reordered the whole plan

The plan was going to open with the ladder. It does not, because instrumenting a
two-year `century` run produced this: the world ends in the Age of Fire with
**two technologies known to anybody**, and across the entire run **exactly three
of the seventeen nodes were ever conceived by any person** — `cordage`,
`plant_lore` and `firemaking`. The other fourteen have never entered a head.

`bugs.md` already carried a softer version of this, guessing at four to seven
technologies and noting that nobody had measured which stage was slowest. The
stage is not in the pipeline at all: 34 ideas became 8 prototypes and 7 proofs
off 139 ponder breakthroughs and 28 from discussion, which is a healthy funnel.
The gate is that every node past the three roots carries a `knows:` ingredient
while `knownTech` reaches two to four people, so almost nobody is *eligible* to
have the next idea.

Confirmed against a control rather than left as a theory: the `craft` scenario
starts its founders with three technologies and, on a run one twentieth as long,
conceives `cooking` and `stoneworking` — both depth-1, both `knows:`-gated,
neither of which the century run reached in two years. **The rate of discovery is
set by transmission, not by discovery**, which makes teaching, watching and
writing things down load-bearing for the whole ladder rather than flavour.

So M8.0 — understand and fix the climb — now comes before any node is added.
Forty-eight more nodes on top of a tree whose upper four-fifths nobody reaches
would be the inert-content rule failing at the scale of a milestone.

*Reason for recording the negative result too:* `conceptionBase` is the obvious
knob and it is the wrong one. Raising it would conceive `cordage` a fourth time.

### A check that looks reassuring and detects nothing

`sparks-are-various` passes on that run, reporting "8 distinct spark routes
fired" — and all eight belong to those same three technologies. This project has
already deleted two checks for exactly this shape. It is scheduled to count
distinct *technologies* instead, with a new `the-tree-is-climbed` beside it, and
both must be verified to fail on today's build before they are kept.

### Two seed traps written into `AGENTS.md`

Both found by reading the constructor, and both would have silently invalidated
every measurement in M8:

- **The fork comment points at the wrong place.** The named block ends at
  `recordRng` with a comment inviting an append after it, and there is an
  anonymous fourteenth fork twenty-five lines below — the one handed to
  `seedInitialForest`. Appending where invited consumes that fork's draw and
  replants every forest in every saved seed.
- **One `spawnRng` is shared by `spawnResources`, `spawnHerds` and
  `spawnPeople`.** Adding a resource kind moves every herd and every person in
  every world. This is *not* a fork-order violation, so `determinism.test.ts`
  does not catch it — it compares two runs of the same build. Any pass that adds
  a resource and then measures itself against a baseline measures the reshuffle.

### Five more defects found and recorded, none fixed

In `bugs.md`, each scheduled in the M8 plan at the point where it does damage:
`household.store` is written by `LifeSystem` and read by nothing anywhere;
`hafting`'s felling bonus and `armourOf` both bypass `techPower`, so refining
either is worthless; `doHunt` uses the bare `REACH` constant, so the bow's reach
does nothing in the one place it should matter most; and `NODE_LABELS` is not
compiler-enforced where `RESOURCE_COLORS` is, so a new resource kind fails the
build for its colour and silently prints a raw id for its name.

### Verification

No code changed, so the gates are unchanged and were run to establish the
baseline the plan quotes: `npm run sim:check` passes **36 of 36 applicable
checks** (13 n/a) at 4,267 steps/s. `century` fails `population-persists` at 10
alive against 11, which `bugs.md` already records as this scenario's divergence
rather than a regression.

---

## 2026-09-07 — M6b phase 5: the loop the player can see, and weapons

Three things reported from play (`docs/notes.txt`), and all three sat on the seam
between the simulation working and the player being able to tell. Folded into
phase 5 rather than made a pass of their own, at the owner's direction, because
the craft bar wants recipes worth opening it for.

### Work stops for a need it is answering

The reported symptom was people downing tools far too readily. The cause was that
`WORK_LIMITS` was one flat triple — thirst 35, hunger 40, cold 45 — asked of every
job alike, so **picking berries was interrupted by hunger**, which is absurd on
its face: gathering food is how you stop being hungry.

The limits could not simply be raised, and the comment that said so was right: a
need *parks* at whatever line stops it, so wherever these sit is where the whole
population's average hunger and thirst settle, and an early build near the lethal
line had a healthy band carrying 82 thirst inside a fortnight. So the base moved
only a little — into `Config.needs.workLimits`, where a scenario can reach it —
and `ActionSystem.workLimit` puts three *per-job exceptions* on top:

- **A job that answers a need is not stopped by it** until 90, near the critical
  line rather than at it, so somebody who genuinely cannot feed themselves where
  they stand still gives up and looks elsewhere. Decided per *node*, not per
  verb: `forage` is berries at one bush and flint at the next.
- **A nearly-finished pull finishes.** This is the far half of a rule `bugs.md`
  recorded as untunable — because the limits are absolute need levels, whether a
  job is ever interrupted depended on how long it ran, so berries looked
  uninterruptible and flint hopeless under identical code.
- **Work the player asked for gets a little more rope.**

### Thirst answers to what you are doing

A person asleep in a hut in February got thirsty at exactly the rate of one
felling a tree in July. New `EXERTION` table in `NeedsSystem`, a heat term off
`time.temperature` — the same reading that drives cold, with the sign the other
way — and the base rate lowered from 0.085 to 0.075, because the owner asked for
the need itself to be lower. Hard work in high summer now reaches about 1.9x the
base and sleeping through a winter night about 0.4x, where before everything was
1.0x. **Hunger is deliberately left flat**: the food economy is this world's most
fragile part and only drinking was reported.

**This nearly destroyed the world, and how it did is worth recording.** The first
version used multipliers up to 1.8 on the fastest-climbing need, and a two-year
run ended with **nobody alive** and *eleven and a half thousand* broken-off
hunts. The thirst model was not really the culprit: `hunt` was never gated by
`pressedByNeed` in the scorer, so a thirsty hunter armed a chase, was stopped on
the next tick, re-scored, and chose the same quarry again — the exact thrash
crafting was fixed for in pass A, latent all along and set off by thirst crossing
the line mid-chase. Gating it took 11,503 thirst interruptions to 66. **A
coefficient that exposes a structural defect looks exactly like a bad
coefficient**, and both had to be fixed.

### Proving a design is progress that cannot be lost

A trial was one all-or-nothing daily roll. A failure cost a quarter of the
insight, set the stage back to `researching` **and left the prototype materials
spent** — so a second attempt at cordage wanted another three thatch, and nothing
anywhere recorded that two trials had already happened. The owner reported it as
being stuck, which from inside the game is indistinguishable.

`Idea` now carries `trials` and `proof`. Proof only goes up: a good trial adds
`1 / trialsToProve`, a bad one adds `failedTrialCredit` of that, and the design
stays on the bench either way. Luck decides how long a design takes, not whether
it arrives. The numbers are in `Config.knowledge` — `trialsToProve: 3`,
`failedTrialCredit: 0.34`, `trialChance`, `conceptionBase` — which is the
"adjustable via parameters" the note asked for; conception also rose from 0.045
to 0.06, bounded by `ideas-are-conceived` rather than by taste.

`FAILED_TRIAL_CEILING` is documented for what it actually does, which is **not**
what its first comment claimed. That at least one trial must go well is
guaranteed by the control flow — only the passing branch calls `prove` — and a
test written against that comment duly passed with the ceiling removed, because
nothing rested on it. What the ceiling buys is an honest bar: without it a run of
failures under a generous credit fills the proof bar to the brim and parks it
there beside a design that is not proven. The test asserts *that* now, and fails
when the ceiling goes.

### Three things the player could not see

- **A proven design went on asking for its prototype materials.** An idea
  survives being proven — it stays on the person to be refined and only retires
  at its ceiling — and `TechWeb.detail` gated the whole "where it has got to"
  block on whether an idea *existed*. So cordage, built and worked out, still
  said "Needs 3 thatch to build one", under an insight bar showing the refinement
  progress `prove` had just reset to zero. It asks the stage now, shows trials
  rather than insight while a design is on the bench, and says whether the
  materials are actually in hand. `STAGE_LABELS` moved to `Synthesis.ts` beside
  the stages it names, rather than being copied into a second panel.
- **There was no craft menu at all.** `RECIPES` was reachable only by
  right-clicking bare ground, and an entry the actor could not make was left out
  rather than greyed — so proving hafting changed nothing anywhere visible. New
  craft bar on **M**, mirroring the build bar, with ingredients, greyed entries
  carrying `missingIngredients`' reason, and a "not yet known" line. It is **per
  person** where the build bar is per society, and that is not an inconsistency:
  a building is raised by a band, an axe is made by one pair of hands.
- **Proving something now says what it gave you** — the building or the recipe it
  unlocks, falling back to `TECH_EFFECTS` for the quiet ones. Cordage unlocks
  neither, which is exactly why the owner saw nothing happen.

### 5b. Weapons, and the first thing made to be used *on* something

`doAttack`'s damage line had **no item term at all**, so a man with a spear hit
exactly as hard as a man with his hands and every weapon in the game was a
decoration. `ItemDef` gains `weapon?: { damage, reach, hunt, tech }` and
`armour?`, read through two new helpers in `Tech.ts` — `weaponOf` and `armourOf`
— and therefore through `techPower`, so a refined design is worth more than a
first attempt at one and a fine spear handed to a novice is still just a spear.

- **`reach` is how a spear beats a fist without ranged combat existing.** It
  widens the gap `approach` will settle for, and only for a blow, so a fight is
  decided partly by who has to close the distance.
- **`hunt` is a separate number from `damage`**, because a bow is a far better
  answer to a deer than to a neighbour and a hand axe is the reverse.
- Three new nodes — `spear`, `bow`, `leatherwork` — each with the code that makes
  it real, three recipes, and `handaxe` gains the small weapon block it always
  deserved.

**`hunts-succeed-and-fail` has reported n/a for the whole life of the project**
and now passes: 12 kills against 9 misses on `craft`. A fresh deer outruns a
person, so before this a hunt could only be won by draining an animal's stamina,
which is why a two-year run produced about three kills. That is the long-standing
"hunting is a garnish" entry in `bugs.md` closed at its root, and it is upstream
of two more: hides are taken off kills, and a hide in cold hands is clothing's
heaviest spark.

**`leatherwork` shipped briefly unreachable and a test caught it.** All of its
routes wanted a hide in hand, and hides are scarce precisely because hunting is —
the deadlock `every-tech-has-an-ordinary-route` exists to catch. It has a winter
route now that needs nothing scarce.

**`weapons-are-made-and-used` was written and deliberately not kept**, for the
reason recorded beside `prototypes-can-fail`: a world check needs the world to
produce a sample, and this one cannot. See the finding in `bugs.md`. The claims
are asserted deterministically in a new `combat.test.ts` instead, and the
`armed_blow` and `armed_hunt` counters still read out in the events table so
anybody can see how often it actually happens.

### The recipe ceiling stopped meaning what it said

`tech.test.ts` held every recipe to 400 novice ticks, on the stated grounds that
a longer craft is interrupted, restarts from the beginning and never finishes.
That stopped being true in this same pass: `doCraft` and `doPrototype` bank their
hours on the person now, the way a building banks on the site and a carving on
the stone. The bow — 140 ticks, exactly 400 for a novice — is what exposed it,
and shortening the bow to squeeze under a line that had stopped meaning anything
would have been the wrong fix. The ceiling is a sanity bound now, and the
banking is guarded end to end in `orders.test.ts` instead.

Banking is worth its own line: on the `craft` scenario it took finished goods
from **10 to 22** against the same run length.

### Fixed on the way past

- **`doHunt` reported to nobody.** It counted `hunt_ended_<reason>` and called
  `finish` directly, so a chase broken off by thirst reached neither the player's
  floater nor `person.resume`: the standing "the UI says why" rule with a hole in
  it, and the telemetry counter beside it is what made the hole look deliberate.
- **The build bar printed raw technology ids.** "Granary (needs pottery)" read
  correctly only because the ids happen to be English words.
- **`.hud-buildbar` matched two elements** once the craft bar borrowed the class.
  A selector that can no longer name either bar is as ambiguous in a stylesheet
  as it is to Playwright; the craft bar has its own class and the styling is
  shared by naming both.

### Verification

Twenty seeds, before and after the whole pass: **72.7% → 75.7%** mean survival,
268 born against 317, adult starvation 165 against 149 — and collapses below a
quarter went 1 to 2. A three-point move is **not** resolvable at twenty seeds,
where a strictly better change has measured nine points worse, so the honest
claim is that none of this is a regression rather than that any of it is an
improvement. The needs rework alone measured 75.0% at its own checkpoint.

`century/population-persists` fails at 10 alive against a threshold of 11.
Investigated rather than tuned: it fails at **8** with `conceptionBase` put back
to 0.045, and at 10 with the whole thirst model neutralised, so it is the
divergence `AGENTS.md` warns about on this scenario and not this pass. Left
failing.

Three new checks, every one verified against a build without its feature:

| check | reports (century) |
|---|---|
| `drinking-is-paced` | 563 drinks finished over 2807 person-days |
| `food-work-continues` | 14 ticks of gathering pushed through hunger; **0 with the exemption removed** |
| `trials-accumulate` | 22 good trials across 7 designs proven; equal to the proof count under the old one-roll model |

`food-work-continues` is keyed by verb as well as by need, because a first
version could not tell hunting from berry-picking and passed happily on a build
with the gathering exemption removed — the hunts alone kept it above zero.

Two new e2e specs — the craft bar's greyed reason, and a proven design that no
longer asks for materials, which fails if the stage guard is removed. Three
existing specs and three unit tests encoded rules this pass changed; they were
updated, and the order tests now ask `sim.config` for the thirst that stops work
rather than restating 40, which is why they broke when the limits moved.

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
