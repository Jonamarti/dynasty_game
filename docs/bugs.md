# Known bugs and rough edges

As of 2026-09-09. Everything here is real and reproducible; nothing here is
speculative. Fixed defects are in [changelog.md](changelog.md).

## The open question left by M8.1, 2026-09-10

### The food economy has no headroom for spoilage, and that is the finding

Not a bug in the mechanism — the mechanism works and is tested. It is a fact
about the world that only building it could establish, and it is the reason
`needs.spoilRate` ships at 0.

Twenty seeds on `traps`: mean survival **92.2% → 88.8%**, infant starvation
**4 → 10**, and one world in twenty collapsing where none had. Four rates
between 0.35 and 1 are indistinguishable from each other, so this is not a
coefficient. `preserving` does not recover it — the band that could preserve
survived *worse* than the band that could not, at 91.5% against 94.1%, which is
noise rather than a mechanism. Making stores nearly perfect keepers changed
nothing, which locates the loss in **packs**: people carry a great deal of food
and all of it rots.

What would have to change before the decay half is worth switching on:

- **People should not carry a larder.** The pack is where the loss lands, and
  the answer is not a better pack — it is a reason to put food down. That is a
  scorer question, and it is the same one the larder fix answered from the other
  side.
- **Or the supply half needs to bed in first.** M8.1 added fishing, traps,
  grinding and bone in one milestone; the world has not been played at length
  with all four. Measuring a supply *cut* against a food economy that has not
  settled is measuring two changes at once.

The full machinery is in place and `fishers` exercises it, so this is a one-number
decision whenever the answer changes.

## Found while building the rest of M8.1, 2026-09-09 — open

### `jobs-bias-work` has an effect smaller than its own seed-to-seed spread

The new `hunters` scenario failed it at **-0.9 points** — holders spending less
time on their own job's work than everybody else — and four other seeds of the
same scenario report **+0.8, +1.3, +1.6 and +1.8**. The bias is real and it is
positive; it is simply about a point and a half on a band of twenty, and the
spread between seeds is wider than that.

Every other scenario in the suite passes, so this is not a defect in `Brain`'s
job bias. It is a check that will go red on roughly one new scenario in five for
no reason anybody can act on, which is the mirror image of the two larder checks
this project deleted for looking reassuring and detecting nothing.

`hunters` is seeded `bone` rather than `ivory` because of this, and the scenario
says so in its own comment rather than quietly. **The fix is to widen the check,
not the scenario**: either measure it across seeds the way `sim:seeds` does, or
state a margin it has to clear rather than a sign. Not done here because
`jobs-bias-work` gates eleven other scenarios and rewriting it inside a content
pass is how a gate gets quietly loosened.

### `tiny` fails `food-work-continues`, and did before any of this

Recorded because it was hit repeatedly while measuring M8.1 and mistaken for a
regression twice. On `tiny` the check reports **0 ticks of food-gathering
continued through hunger (658 hunting)** — it is a one-band eight-person world
where the whole food economy runs through the hunt, and the thing the check
measures never comes up. It fails identically on the commit before M8.1's
stations landed.

Either the check needs the same kind of honest skip the other thin-scenario
checks have grown, or `tiny` needs enough forage in it to exercise the thing.
Neither is done here.

### An animal that has been fed forgets nobody, and is inherited by no one

`taming` sets `Animal.tamedBy` to a person id, and `heel` falls back to grazing
when that person dies. So a dog whose owner dies is a dog that quietly stops
following anybody, for ever, while still not fleeing from the dead person's id.
Nothing passes it to an heir and nothing lets a second person take it over.

Deliberate for this pass — inheritance of animals belongs with the herd
mechanics in M8.2, which is where `Animal.fedBy` gets its second reader — but it
is a loose end and not a design.

## Found while building M8.1's traps, 2026-09-09 — open

### Adult starvation rose while infant starvation halved, and nothing explains it yet

Across twenty seeds of the `traps` scenario against the same scenario without the
trap half of the ladder, mean survival is identical at 89.8%, but the deaths move:
**6 infants starved against 12, and 53 adults against 38.** The plausible reading
is that trap food is collected and eaten at camp, where the youngest are, and that
the walk to empty a trap is time an adult did not spend foraging for themselves —
but that is a story, not a measurement, and this project has a rule about shipping
a comment that asserts an unconfirmed cause.

Not fixed, and deliberately not tuned: the totals are inside the noise this
project already knows twenty seeds cannot resolve, and `TRAP_ROUND` in `Brain.ts`
is the coefficient anybody chasing it would reach for. Whoever does should measure
`forage` ticks per adult-day either side, not survival.

### A trap is sited from where the band was founded, not from where its people are

`planBuildings` searches out from `band.homeX/homeY`, which never moves, and the
ring search added for the fish trap makes traps as close to that point as the
coastline allows. Collection is then scored on proximity to whoever is walking
past. A band whose daily range has drifted away from its founding fire will
therefore keep a trap it rarely passes, and that trap fills and stops catching.

Not a defect in the trap so much as the absence of anything that moves a camp, and
worth remembering when M7's interiors or any later migration lands: the trap
sweep counts `trap_full_<id>` days precisely so this is visible when it happens.

### `sparks-are-various` now skips on any scenario handed six or more technologies

Added in this pass, and the trade-off is real in both directions. Without the skip
the check fails on `traps` for a reason that has nothing to do with the web: a band
handed eight nodes has almost nothing left to conceive, and it read "3 routes into
1 technologies". With the skip, a future scenario that starts people rich would
stop reporting a genuine collapse of the spark table.

The line is drawn at six because `craft` (four) and `scribes` (five) still answer
the question honestly and `traps` (eight) cannot. If a third rich scenario arrives,
the better fix is to measure routes against *what was left to conceive* rather than
against the whole table.

### `basketry` does not make stores cheaper, though the plan said it would

The plan's line for the node was "a `basket` item raising `carryFactor`; a cheap
material for stores". Only the first half shipped. Adding `basket` to
`storage_pit`'s materials would have made the pit — the first thing any band
builds — unbuildable until somebody could weave, which is the granary defect in
miniature and exactly what `buildings-ask-for-things-that-exist` was written
after. A new cheap store gated on `basketry` is the honest way to do it, and it
belongs with the rest of the tier rather than retrofitted onto the pit.

## From the owner's notes, triaged 2026-09-09

### "Needs 3 thatch to build one" after cordage was already made — **not reproducible**

Reported in `notes.txt`. Investigated on 2026-09-09 and the line cannot appear
in that situation any more: `TechWeb.detail` gates the whole prototype block on
`idea.stage !== 'proven'`, and `KnowledgeSystem.advance` never puts a proven
idea's stage back — refinement raises `techLevel` and leaves the stage alone. So
the note predates the fix rather than describing a live defect. Recorded here
rather than silently dropped, because "the owner reported it and nothing was
found" is worth being able to look up.

What the investigation *did* find was a blank: a proven design being refined
showed nothing at all in that pane, so somebody quietly improving something for
days looked idle. Filled in the same pass — see the changelog.

### The craft bar was reachable only by pressing `M` — **fixed 2026-09-09**

Reported as "cannot see the crafting menu for things that are not buildings".
The bar itself was correct: `renderCraftBar` renders, `availableRecipes` gates
per person on `techPower`, and the CSS is shared with the build bar. Two things
made it read as missing, and both are fixed:

1. **It had no button.** `B` and `M` were named in one line of HUD chrome that
   `H` hides. A menu nobody can find is missing whether or not it renders.
2. **It is usually empty.** Every recipe is gated on a technology, and
   [next-steps.md](next-steps.md) records that a typical run ends with two to
   five known — so the honest common case is a bar saying "they do not know how
   to make anything yet", which from outside is indistinguishable from a broken
   bar. It now says what it is waiting on.

### The calendar and the ageing clock are two different clocks

`TimeManager.year` divides by `daysPerSeason * 4`; `Person.years` divides by
`DAYS_PER_YEAR`, a module constant of 80 in `Person.ts` that `Tree`,
`LifeSystem`, `ForestSystem` and `Founding` all import. They agree only because
20 × 4 = 80. Now that `daysPerSeason` is a player-facing setting, moving it
decouples them: at `daysPerSeason: 30` the HUD prints Y2 while somebody born on
day 1 is three years old.

Not fixed, deliberately. Making `DAYS_PER_YEAR` derived means threading the
season length into `Person`, `Tree` and two systems, and it silently rescales
every lifespan, gestation, tree maturity and elder-decay curve in the game. The
setting instead says in its own hint that it changes the calendar and the
weather and not how fast anyone ages, and the difficulty slider does not touch
it.

### Three lines in `main.ts`'s Escape handler were dead code

`if (techWeb.isOpen) techWeb.close()` and its two siblings could never fire.
Each graph overlay registers its own bubble-phase Escape listener when it is
constructed, and all of them are constructed above the main `keydown` handler,
so they had already closed themselves by the time it ran. Harmless until
something needed to know whether Escape had been *consumed* — which the pause
menu does. Fixed with a capture-phase snapshot; the three lines are kept as belt
and braces and now say so.

## Found while building M6b phase 6, 2026-09-08 — open

### A job does not protect someone from the chief's own labour draft

`BandSystem.directWork` sends any available idle adult to build or haul for an
unfinished site, without asking what job they hold. A hunter can be drafted
onto a hut for the day exactly as readily as an unemployed person can, and
`Brain`'s job bias does nothing to stop it — an explicit order from `directWork`
goes through `command`, not the scorer, so there is no bias term for it to
weigh against. This is arguably correct today (a job is described everywhere
in the UI as "a lean, not a command"), but it means a band can never actually
protect its hunter from spending the week on scaffolding, which will read as a
bug the day the player has deliberately built a specialised workforce and
watches the chief draft it away regardless.

### `farm` and `smith` are real skills with nothing that trains or reads them

Both were added to `SKILLS` in this pass, deliberately, so that founding,
inheritance, ageing and the character-creation point budget all know about
them before M8 gives either one an action — see the comment beside `SKILLS` in
`Person.ts`. Until then they behave like `heal`, already in the roster and
already unused: a character can be built with points in `farm` and nothing in
the game will ever notice. Not a defect on its own, since `techs-have-effects`
and its siblings police *technologies* declared without an effect and a skill
is not a technology, but worth a name here so nobody mistakes silence from
`farm` for a bug once M8.2 exists to compare it against.

## Found while planning M8, 2026-09-08 — open

Seven findings from reading the code and instrumenting two runs. None was fixed,
because the pass was a planning pass; each is scheduled in
[m8_plan_the_ages.md](m8_plan_the_ages.md) at the point where it does damage.

### Only three of seventeen technologies are ever conceived — on one seed in twenty

**Corrected on 2026-09-08 by M8.0.** As written below this was a finding about
the game; it is a finding about the `century` seed, which is the worst of twenty.

A two-year `century` run ends in the Age of Fire with two technologies known to
anybody, and across the whole run exactly three nodes are ever conceived:
`cordage` (16 times), `plant_lore` (13) and `firemaking` (5). Every one of those
numbers reproduces exactly. Across the canonical twenty-seed cohort
(`npm run sim:seeds -- --seeds 20`) the same scenario averages **5.4
technologies known at the end, 4.2 conceived past the root nodes and 124 things
taught or picked up by watching**, and reaches depth two — `stoneworking` and
`leatherwork` — routinely. The century seed is the only one of the twenty that
never gets past a root node.

The research pipeline is healthy, which the original entry had right: 34 ideas
became 8 prototypes and 7 proofs off 139 ponder breakthroughs and 28 from
discussion. What is wrong is the conclusion that **the rate of discovery is set
by transmission**. Transmission tracks adult person-days almost exactly — 24
things passed on in a world with 1,405 of them, 194 in a world with twice that —
so on the collapsing seed the thin teaching is a symptom, not the cause. Sorting
the cohort by survival sorts it by the climb.

**The open defect is the collapse**, not the tree: two of twenty worlds fall
below a quarter of their peak population, and those two are the two worst
climbs. `conceptionBase` remains the obvious wrong knob, and so, it turns out,
does anything else in `KnowledgeSystem`.

### `sparks-are-various` passed while detecting nothing — fixed in M8.0

It reported "8 distinct spark routes fired" on the run above and passed — and
all eight routes belonged to those same three technologies. A check that reads as
healthy on a world where 82% of the tree has never occurred to anyone is exactly
the "looks reassuring and detects nothing" failure `AGENTS.md` warns about, and
this project has already deleted two checks for it. It now counts technologies as
well as routes and asserts both, and `the-tree-is-climbed` was added beside it.

### One `spawnRng` is shared by three spawn passes

`spawnResources`, `spawnHerds` and `spawnPeople` all draw from the same forked
stream, so **adding one entry to the `plan` array in `spawnResources` moves every
herd and every person in every world.** This is not a fork-order violation, so
`determinism.test.ts` does not catch it — it compares two runs of the same build.
Any pass that adds a resource kind and then measures itself against a baseline
will be measuring the reshuffle. Now recorded in `AGENTS.md`.

### `tracking` is unreachable, and two spark ingredients never occur

**`tracking` fixed 2026-09-08; `store_empty` still open, see below.** Found by
instrumenting the daily conception pass in M8.0. `tracking` is a **root node**
— empty `requires`, so every adult in the world qualifies for it on every day
of their life — and it was conceived in **none** of twelve instrumented
worlds, and independently reproduced at 1 of 20 seeds in the canonical cohort
before the fix. On the century seed it was one ingredient short of firing on
1,404 of 1,405 adult person-days, and the missing ingredient was always the
same one.

Two `saw:` ingredients in `TECH` are keyed to events that essentially never
happen:

- **`quarry_escaped`**, the weight-1.0 route into `tracking`, is emitted only
  when an animal gets more than twice `PURSUIT_LIMIT` away. `hunt_lost` is **2**
  over two in-game years. Tracking's other two routes need `doing: hunt` with
  hunger, or forest plus winter plus wandering, and between them they fire twice
  in two years and have never carried an idea. **Fixed**: a fourth route,
  `{ doing: forage, place: forest }` at weight 0.7, gives `tracking` an
  ordinary daily story that does not wait on a hunt. Measured across the
  twenty-seed cohort — see `changelog.md`. The three original routes are
  untouched.
- **`store_empty`**, the weight-1.0 route into `marking`, is emitted by `doTake`
  when somebody walks to a store and finds nothing in it. `Brain` scores stores
  by what is in them, so it never sends anyone to an empty one, and the counter
  is **0** in every run inspected. `marking` survives on its other two routes,
  so this one is **still open** but no longer blocks anything in M8.1.

`tracking` no longer blocks M8.1, which puts `snares` and `taming` behind it.

### The RNG fork comment points at the wrong place

The named fork block ends at `recordRng` with a comment saying to append after
it, and there is an **anonymous fourteenth fork twenty-five lines below**, the
one handed to `seedInitialForest`. Appending where the comment invites you to
consumes that fork's draw and silently replants every forest in every saved seed.
Also now in `AGENTS.md`.

### `household.store` is written and never read

`LifeSystem` puts a dead person's goods into their household's store, and
**nothing anywhere in the codebase ever takes them out again** — verified by
grep; that line is the only reference to the field. An estate therefore
disappears into a container nobody can open. Harmless today, and it will become
visible the moment food spoilage exists, since it is the one stock whose losses
nobody will ever see.

### Two effects bypass `techPower`, and one weapon stat is ignored

Every technology effect is supposed to read the seam. Three do not:

- **`hafting`'s felling bonus** is `inventory.has('handaxe') ? 0.5 : 1` in both
  `doChop` and `Progress.ts` — item presence, unscaled by refinement. Refining
  hafting therefore does nothing to felling.
- **`armourOf`** reads `ITEMS[id].armour` directly, so hide armour protects
  somebody who could not make it and refining `leatherwork` is worthless.
- **`doHunt` uses the bare `REACH` constant** rather than the weapon's, so the
  bow's `reach: 1.6` does nothing while hunting — the one place it should matter
  most. `doAttack` applies reach correctly; only the hunt path misses it.

### `NODE_LABELS` is not compiler-enforced and `RESOURCE_COLORS` is

The renderer's colour table is keyed on `ResourceKind`, so a new resource kind
fails the build until it is coloured. The HUD's label table is a plain
`Record<string, string>`, so the same new kind silently prints its raw id in the
panel. Cheap to fix; the point is the asymmetry, because one of the two will be
forgotten.

## Reported from play, 2026-09-02 — fixed

Five defects reported by the project owner after M6a. **All five are fixed**;
the diagnosis is section M6c of
[m6_plan_households_sleep.md](m6_plan_households_sleep.md) and the fixes are in
[changelog.md](changelog.md). Regression tests are in
`src/sim/__tests__/orders.test.ts`.

Four of the five were one root cause: the simulation never told the player why
an order stopped. `interruption()` returns eight reasons and `abandon()` a dozen
more, and all of them were telemetry counters only. They now reach a floater and
the panel's action line.

One thing worth carrying forward from that pass: **the berries-versus-flint
asymmetry was not eliminated, and cannot be by tuning.** The interruption
thresholds are absolute need levels, so whether a job is ever interrupted
depends on how long it runs — berries are stripped in 148 ticks and never cross
the line, flint takes 416 and always does. What was fixed is the *consequence*:
interrupted orders are now set aside and picked back up, so the job gets done
either way. If someone later wants the rule itself to be uniform, that is a
redesign of `interruption`, not a coefficient change.

## Fixed in M6b phase 1

### The longhouse was never buildable

`BUILDINGS.longhouse` was gated behind `requiresTech: 'carpentry'` while
`'carpentry'` was not a member of `TECHS`, so nothing could ever satisfy the
gate. The best shelter in the game was unbuildable for its entire existence and
sat permanently in `lockedDesigns()`, which is exactly how it stayed invisible:
a locked design looks like content you have not reached yet. `carpentry` is a
real technology now, and `tech.test.ts` asserts every `requiresTech` in
`BUILDINGS` names one.

## Fixed in M6b phase 5, 2026-09-07

The three things reported in `docs/notes.txt`, and four defects found beside them.
Diagnosis and reasons in [changelog.md](changelog.md).

- **Work was interrupted by the need it was answering** — a forager stopped
  picking berries because they were hungry. The limits are contextual now.
- **A proven design went on advertising its prototype cost.** `TechWeb.detail`
  asked whether an idea existed, not what stage it was at, and an idea survives
  being proven.
- **A failed trial destroyed the work and the materials**, so a design could look
  permanently stuck. Proof accumulates and cannot go backwards.
- **There was no craft menu**; `RECIPES` was reachable only by right-clicking
  bare ground, and unmakeable entries were hidden rather than greyed.
- **`hunt` was never gated by `pressedByNeed`**, the same defect crafting was
  fixed for in pass A. Latent until thirst started answering to exertion, at
  which point it cost a run its entire population.
- **`doHunt` never told the player anything**, calling `finish` directly.
- **The build bar printed raw technology ids.**

### Nobody fetches materials for something they want for themselves

The reason the hand axe has always been rare, found while trying to write a
health check for weapons and worth more than the check was.

`Brain`'s craft term only scores a recipe whose ingredients are **already in the
pack** (`hasIngredients`). Pass A taught the scorer to go and fetch ingredients
for a recipe a *building site* is waiting on — `gather_for_site` looks up the
recipe and fetches its parts — but there is no equivalent for `keep`, the "you
want one of these on you" case. So a personal craft only ever happens when the
right materials happen to have been picked up for some other reason.

The numbers: the whole `craft` scenario, whose founders already know how to knap
and now how to make a spear, yields **one spear and two hand axes** across
twenty-four people and eight thousand steps, against twenty pots — because the
pots are what a granary is waiting for and the axes are not waiting for anything.

This is why `weapons-are-made-and-used` was written and not kept: whether an
armed blow lands in a given run is chance, and a check on it is either flaky or
permanently n/a. The mechanism is asserted in `combat.test.ts` instead.

Not fixed here because it is a scorer change and `Brain`'s coefficients are
calibrated against each other — a new fetch term competes with foraging for the
same ticks, and this pass had already spent its risk budget on the needs rework.
It is the obvious next thing for anyone who wants weapons, axes or clothing to be
ordinary rather than occasional.

## Open — behaviour, found in phase 5

### Nobody knows how often the owner thinks people drink

The note asked for "twice a day at baseline, four times under hard work or in
summer", against a reported "several times a day". The report can now measure it
and the answer is **0.07 to 0.22 completed drinks per person-day** across every
scenario — two orders of magnitude below the target and well below the
complaint.

The gap is almost certainly what is being counted. The walk to the water happens
*inside* the `drink` action, so what a player watches is a character heading for
the river, and there are far more of those than there are drinks that run to the
bottom of the thirst: `century` spends 8,255 ticks drinking to produce 563
completions, so roughly half of all trips are broken off part-way. Somebody
watching two or three characters at speed would reasonably call that "several
times a day".

**This pass therefore did not tune to the number**, because tuning to a number
whose definition is unknown is how you ship a coefficient chosen by noise. What
it did is give thirst the *shape* the note describes — sleeping is cheap, felling
a tree in July is not — and lower the base rate, which took drinking ticks down
by 27% and thirst interruptions from 72 to 18 on `century`. If the owner wants an
actual frequency, `drinking-is-paced` is the instrument and the first question is
which of the two numbers they mean.

### The proof bar can sit still for a long time

`trialChance` is 0.18 a day and a design needs three good trials, so the median
gap between building a prototype and proving it is now appreciably longer than it
was under the single roll — around three weeks of game time at the shipped
numbers. That is the intended shape: the days between building a thing and
believing it are no longer silent, since each trial fires a floater and moves a
bar. It has not been checked against how it *feels* at normal speed, which is a
question only play answers.

### `century/population-persists` fails, and it is not this pass

10 alive against a threshold of 11. Investigated rather than tuned: the same seed
ends at **8** with `conceptionBase` restored to its old 0.045, and at 10 with the
thirst model wholly neutralised, so the build under test is if anything the
better of the three. Twenty seeds moved 72.7% to 75.0% over the pass. This is the
divergence `AGENTS.md` warns about on this scenario. The check has *not* been
moved to accommodate it.

## Fixed in M6b phase 4, 2026-09-07

- **Children were excluded from knowledge entirely**, so a parent could not
  teach their own child anything and every technology had to be re-derived from
  nothing by each generation.
- **Neither the scorer nor the radial menu checked a pupil's prerequisites**,
  though `KnowledgeSystem.teach` has always dropped what a pupil cannot follow.
  People were sent to give lessons that could not land, and the menu offered a
  Teach that silently did nothing.
- **A long single-pull job could never be finished by a novice.** Carving a
  stone was twelve hundred ticks and thirst interrupts at four hundred, so the
  action restarted from nothing every time. Work banks on the record now.

## Open — behaviour, found in phase 4

### Reading only happens when the chain breaks

By design, and recorded because it looks like a defect from the outside. A
living teacher is quicker to reach than a stone across the valley, so `read`
fires when the last holder of something is dead or when a record carries
something newly worked out. Neither happens inside a fifty-eight-day run, so
`scribes` shows plenty of carving and no reading. A twenty-four-thousand-step
run does produce both (`read_firemaking`, `recovered_firemaking`).

If it should be more common, the lever is not the `read` weight — it is how
readily knowledge is *lost*, which is the same lever as mortality.

### `people-survive` asks the wrong question of a run between one and two years

The check demands 67% survival below two in-game years and switches to "the line
continues" above. That threshold was calibrated against runs of twelve to
thirty-three days; nothing in the suite sat between thirty-three days and two
years until `scribes` did. At a hundred days the world loses more than a third
of its people to two winters, and an **illiterate control at the same length
survived worse** (6/24 against 10/24), so it is the question and not the world.

Left alone deliberately: moving the survival bar is a food-economy decision and
this was a knowledge-transmission pass. `scribes` is fifty-eight days, which
sits inside the calibrated range. Whoever takes on the supply half of
`next-steps.md` §0 should fix the check as part of it.

### A half-cut record can be orphaned

If the carver dies or wanders off and nobody else is literate, a stone sits half
cut with its flint already spent. The scorer prefers finishing a nearby
half-cut record over starting a new one, so this self-heals wherever there is a
second scribe, and does not where there is not. That is arguably the right
story; it has not been measured.

### `clay_tablet` is not portable

The plan called clay tablets portable. They are not: they are cheaper, hold two,
and perish, which are three real differences the world acts on. Portability was
dropped because **nothing in the world would read it** — bands do not move camp,
and a `portable` flag nothing acts on is precisely the class of declared-inert
content this project keeps deleting. It comes back with whatever gives it a
consumer.

## Fixed in pass A, 2026-09-06

Four defects, three of them reported from play and one found while checking the
other three. Diagnosis and reasons are in [changelog.md](changelog.md).

- **`doCraft` had no interruption check** — 258 ticks for a novice during which
  nothing at all could reach the knapper, and no report to the player when the
  stretch ended.
- **The granary was unbuildable**, and in four separate ways: nothing produced
  `pottery`, `doCraft` knew only the hand axe, `Brain` could not fetch a
  material that has to be made rather than found, and **no band ever planned a
  granary or a longhouse at all** — `planBuildings` chose between three
  hardcoded ids and never asked what its members could actually raise.
- **A refusal by authority never set `lastRefusal`**, so the player read a bare
  "X refuses" while `standing.because` was computed and discarded one line
  earlier.

## Found during pass A — open

### The screenshot tour had quietly stopped showing what it claims to

Two shots in `e2e/screenshots.spec.ts` were pictures of the player's own panel
rather than of a tree and its menu. The tour runs at 120 steps a second and the
camera follows the player, so a screen position read in one round trip pointed
somewhere else by the time the click landed in the next. Fixed by pausing for
those shots — but the general point stands and is worth remembering: **the tour
asserts nothing, so it degrades silently.** Anything that depends on a click
landing needs the world held still, and anything it stops showing has to be
noticed by a person looking at the images.

### The player is not told when a chief is refused

`BandSystem.directWork` goes through `Simulation.command` like any other order,
so a refusal there now sets `lastRefusal` — but nothing reads it on that path,
and `reportInterruptions` in `main.ts` filters to `person.isPlayer` or the
person the player is currently commanding. A chief being told no by their own
band is invisible unless you happen to be one of the two people involved.

Deliberately left. Whether the player should see refusals between NPCs at all is
a question about omniscience rather than a defect: the same gate is why insights
and deeds are reported only within sight of the player's own character. It wants
an answer, not a patch.

### What is drawn and what is clickable are up to a third of a tile apart

Interpolation moved the drawn position off the stepped one, while hit-testing
still asks the simulation's spatial hashes — as it should, since the alternative
is the renderer answering questions about where things are. The gap is at most
one step of movement, 0.32 tiles at `BASE_SPEED`, and `GRAB_MARGIN` 0.25 plus a
person's 0.45 hit radius absorb it comfortably. Recorded because it is a real
difference that did not exist before, and because it will grow if anything ever
moves faster.

### Floaters do not follow the entity they are about

`Floaters.push` freezes a world position at the moment it is called, so a label
over somebody walking is left behind by up to a step. Visible now that people
move smoothly rather than in jumps. The clean fix is an optional `followId` on
`Floater`; it was not worth widening this pass for.

### Crafting is interrupted often, and NPC crafts are not resumed

`person.resume` is only set for *ordered* work — `noteStop` returns early when
`person.order === null` — so an NPC whose craft is broken off by thirst simply
starts again from the beginning later, losing the ticks already spent. Nothing
is lost but time, since materials are consumed only on the last tick, and the
alternative is set-aside errands accumulating on people nobody is watching. In
the `craft` scenario this shows up as 14 broken-off attempts against 10 finished
items. Worth revisiting if crafting ever becomes central rather than occasional.

## Found during M6b phase 2 — open

### Band membership is never reassigned on marriage

`Person.bandId` is set at birth or at founding and nothing ever changes it.
Marriage merges *households* (`Simulation.mergeHouseholds`) and leaves both
spouses in the bands they were born into, so a woman who marries into the band
across the valley remains, forever, an outsider to every social measurement and
to anything that reads `bandId` — chief authority, exile quorums, `ownerBandId`
on a store.

Found because it broke `kin-outrank-strangers` on the century seed: that check
compares mean opinion for household, band and outsider ties, and one cross-band
marriage in a population worn down to twelve survivors put mean *stranger*
regard above mean *band* regard. The check itself had a real defect alongside it
— its three categories were not disjoint — and that is fixed. The underlying
model is not.

Not fixed here because it is not a phase 2 problem and it is not small:
reassigning `bandId` on marriage touches chiefs, exile, band-owned stores and
who counts toward an era, and every one of those wants a deliberate answer to
"which band does a married couple belong to?" rather than a default.

### Nobody hunts, so hides are scarce

Known since M6a and unchanged, but phase 2 made a consequence of it visible.
Over a two-year century run hunting accounts for under a hundred ticks out of a
million, so `hide` — added in this pass, taken off every kill — almost never
enters the world. Clothing's heaviest spark is cold hands holding fur, and in
practice it is the *other* routes that fire.

The prototype cost was moved off hides for exactly this reason, because an idea
that can be had and never built is inert content. The spark is left alone: it is
the right story, and phase 5's weapons and `tracking` are the intended fix for
the hunting rate rather than anything in the knowledge system.

### A century run reports fewer technologies than it feels like it should

**Superseded 2026-09-08 — see "Only three of seventeen technologies are ever
conceived" at the top of this file.** The instrumented run this entry asked for
was done, and the answer was not a slow stage in the pipeline. Original text
follows.

Four to seven proven technologies over two in-game years, against five for the
build before this pass. That is not a regression in reachability — the pipeline
now has five stages where it had one roll, and `ideas-are-conceived` reports
around one idea per person-year with eleven distinct spark routes firing — but
it does mean the *rate* is set by the slowest stage rather than by
`CONCEPTION_BASE`, and nobody has measured which stage that is. Worth an
instrumented run before anyone reaches for the conception constant, which is the
obvious wrong knob.

## Open — behaviour

### The island supports a population, but only just

**Was the biggest open problem; substantially fixed 2026-09-02.**

`npm run sim:seeds` measures this properly — a single `century` run is too
chaotic to read. Across ten seeds, mean survival over two in-game years went
from **40% to 59%** when the larder gate was fixed, and the two seeds that
collapsed outright (one to two survivors) stopped collapsing. Details in
[changelog.md](changelog.md).

What remains, and it is a different problem from the one that was fixed:

- **Deaths have shifted to adults** — 99 adults against 40 infants across ten
  seeds. Distribution is no longer the constraint; total food is.
- **Redistribution cannot help further.** The `feed` behaviour measurably moves
  deaths from infants to adults without changing the total, which is what you
  would expect: handing food around does not create any.
- The levers left are supply-side — forage density, hunting yield (currently a
  garnish, see below), or a slower birth rate — and each is a design decision
  rather than a tuning one.

Do not attempt to fix this by tuning `interruption()` thresholds or the scorer's
food weights. That ground has been covered and the numbers are in the changelog.

### Hunting is rare — fixed in phase 5, kept for the diagnosis

**Fixed 2026-09-07 by weapons.** `hunts-succeed-and-fail` now reports 12 kills
against 9 misses on `craft`, where it had reported n/a for the whole life of the
project. The diagnosis below was right and is kept because it names the mechanism:
the answer turned out to be the second half of it — an armed hunter does not have
to outlast the animal.

`hunts-succeed-and-fail` reported **n/a** on most scenarios — "too few strikes to
tell". A 3,000-step band run produced about three kills. The chain works end to
end (`people-eat-meat` passes, meat is taken and eaten), but wild meat is a
garnish rather than a food source.

Causes, both deliberate and both probably overtuned:

- A fresh deer is faster than a person and re-alarms whenever a hunter comes
  within its notice radius, so a hunt only ends once stamina is drained.
- Herds are sparse relative to berry bushes, and `Brain` searches only
  `sightRadius * 1.5` for a quarry.

### Courtship nearly stopped after founding families landed

Over two in-game years the `century` scenario went from 177 courtships to
around 8. This was investigated and is **not** the courtship gate — lowering
`opinion > 5` to `> 0` changed the number not at all, and that change was
reverted rather than shipped with a comment asserting a cause the data
contradicted.

The actual cause appears to be demographic: a world founded from married
couples has almost no unmarried adults in it, so there is nobody to court until
the founding children grow up. Marriages still happen (10 over two years) and
births still happen, so this may be correct behaviour rather than a defect —
but it has not been confirmed, and it deserves a look before anyone tunes
courtship.

### Winter still kills the unlucky

Exposure is a leading cause of death in a long run. Bands build more shelter
than they used to (the planner counts floor area now, not roofs), but a band
that loses its builders in one bad season does not recover.

### Exile never fires in practice

`exiled` is 0 across every scenario. The threshold is −28 average opinion with
a quorum of four, and M6a raised the starting point for outsiders from −14 to
−6, so a stranger now has further to fall. Deeds should still dominate, but the
mechanism is currently untested by any run in the suite.

## Open — measurement

### Ten seeds cannot resolve a change of under about ten points

Found during M6b phase 1, and it changes how the food economy should be
measured from here on. Four variants of one change, none of which touched the
food economy deliberately, produced ten-seed mean survivals of 73.1%, 65.2%,
64.4%, 63.6% and 59.3%. At one point a **strictly better** skill-learning rate
measured nine points *worse* than the version it replaced, which cannot be a
mechanism.

Twenty seeds is tighter: 65.7% before the phase against 64.6% after it.

The practical rule: `npm run sim:seeds` at its ten-seed default is only good for
changes the size of the larder fix, which moved 40% → 59%. For anything smaller
pass `--seeds 20`, and never tune against a single ten-seed figure — that is how
you ship a coefficient chosen by noise and a comment asserting a cause the data
does not support.

### `food-work-continues` flips on a one-tick margin on `tiny`

Found landing fishing (M8.1, mechanism 2). The check was already passing
`tiny` by the barest possible margin — one tick of food-gathering pushed
through hunger, against a floor of more than zero — and adding fish as a
second food option, with no change to `interruption()` or to `tiny`'s berries,
flint or people at all, tipped that one tick to zero and failed it. Confirmed
by stashing the fishing changes and re-running the same seed: 1 before, 0
after. Not investigated further, because it is exactly the class of thing
`AGENTS.md` already warns about — a single small scenario amplifying an
unrelated change into a threshold flip — and guessing a new floor from one
run is how a coefficient gets chosen by noise. Left as-is; whoever next
touches food-gathering-under-hunger on `tiny` should know this check has no
margin to spare there.

### Older-child starvation may have risen, and nobody has confirmed it

Over twenty seeds, starvation among children older than five went from 9 to 27
across the phase-1 changes, while infant deaths (80 → 77) and adult deaths (195
→ 195) did not move. That is a large relative change on a small count and it may
well be noise on the same scale as everything above, but it is the one number in
the cohort that moved in a direction worth checking. It has not been
investigated.

## Open — interface

### The panel's work bar is the only thing patched between rebuilds

`Hud.refreshPerson` patches the action line, the need bars, the score table and
the work bar. Everything else in the panel is only correct because the cache key
(`selectionKey`) happens to change. The key now folds in `inventory.version` and
whether a work bar exists; anything else that changes without changing the key
will go stale the same way the Kit tab did. If a future action mutates a pack
many times per tick, the key should become a throttle rather than a raw counter.

### `Camera.following` is public and the tests set it directly

Three e2e specs snap the camera to an off-screen target and set
`camera.following = false` to stop the frame loop dragging the view back. It
works and is honest about what it is doing, but it is a test reaching into
render state.

## Traps that bit during M6a and will bite again

### An author `display` beats the browser's rule for `hidden`

A full-screen overlay styled `display: grid` stays laid out when its `hidden`
attribute is set, and silently swallows every click on the game underneath. The
project had already learned this once — `.succession` carries a comment about
it — and M6a reintroduced it twice, in `.newgame` and `.picker`, which broke
sixteen e2e tests at once with a message about an invisible div intercepting
pointer events.

**Every overlay needs an explicit `[hidden] { display: none; }` rule.**

### `git worktree remove --force` follows directory junctions

Creating a junction from a scratch worktree to the project's real
`node_modules`, then removing the worktree, deletes the real `node_modules`.
Recovering costs an `npm install --legacy-peer-deps`. Do not link into the
project from a directory you intend to delete.

### Two definitions of "in the world"

`simcheck` hand-wrote `person.x > width - 1` while `World.inBounds` uses
`x < width`. Someone standing at x=127.6 on a 128-wide map, on a walkable tile
the movement system had just approved, was reported as having escaped the
island. The check now asks the world. Do not recompute a predicate the
simulation already owns.
