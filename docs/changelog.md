# Changelog

Every change, with the date it was made and the reason it was made. Newest
first. Reasons matter more than descriptions here: a later reader can see *what*
changed from the diff, but not *why*.

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
