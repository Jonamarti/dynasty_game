# Architecture

Current as of 2026-10-03 (M15 art memory budgets, gathering animation, 26b tools and 26f region audit). No runtime
dependencies, Vite + a 2D canvas.

## Layout

```
src/
  sim/          PURE simulation. No DOM, no renderer imports, no Math.random.
    core/       Simulation, World, TimeManager, RNG, SpatialHash, Telemetry,
                Config, Progress
    entities/   Person, Household, Tree, ResourceNode, Building, Animal,
                Item/Inventory, ItemPile, Recipe, Inscription
    ai/         Brain (utility scorer), ActionCatalog (every verb, and when)
    social/     Events + norms, Memory, Relationships, SocialSystem, Authority,
                Conversation (the four rungs a conversation can be),
                Knowledge (what one person can tell about another)
    knowledge/  Tech definitions and eras
    systems/    Needs, Movement, Action, Life, Forest, Band, Knowledge,
                Wildlife, Founding
  render/       Canvas 2D renderer, Camera, Floaters
  ui/           Hud, RadialMenu, EntityPicker, NewGame, Succession
  data/         Name syllables
tools/          simcheck (library) + headless / scenarios / seeds / why (CLIs);
                demographic cohort observer for seeded calibration
e2e/            Playwright smoke tests and screenshot tour
```

## Planned simulation LOD — owner's decision, 2026-10-03

The current step still executes all living NPCs. Fog is not simulation LOD.
The approved design limits full AI/actions to the selected NPC's vision and
keeps everyone outside it evolving through compact individual/band records or
aggregate peoples. The same rule applies to friendly and rival bands; observing
one member must not activate the whole band. Selection is passed to simulation
as an explicit focus id, independently of camera/rendering and without granting
private knowledge. The scope, transition invariants, world evolution, calibration
and implementation order live in [m15_simulation_lod.md](m15_simulation_lod.md).

High simulation speeds may reduce drawing/HUD frame rate. All tiers keep the
simulation clock, events and seeded RNG independent of presentation cadence.
The benchmark must separate visible individuals, compact records and peoples;
the previous 300 fully simulated humans measure the current cost, not the target
architecture. This section describes planned work, not a shipped optimization.

Phase 28 now has inert JSON graph snapshots in `persistence/EntityRecords.ts`.
They preserve entity-owned state, class methods and internal aliases without
constructors, ID allocation or RNG draws; the known belief callback is rebound
to the hydrated person. They do not register people, transfer authority or
compress simulation work. External relationships now have separate versioned
JSON codecs in `persistence/SocialRecords.ts`, preserving directed opinions and
band standing/stances with independent storage and Map order. `RosterRecords`
now composes these codecs at one capture tick, validates membership and returns
canonical arrays/maps. It preserves the full retained person archive separately
from the active list, including a dead player awaiting succession. Loading into
a live Simulation, transfer of authority and the compact scheduler remain pending;
see [m15_phase28_records.md](m15_phase28_records.md).

`RNG` and `TimeManager` also have independent v1 JSON checkpoints: RNG hydration
does not expand a seed or draw from a parent, and the clock retains its own
calendar. System stream/schedule composition and coordinated Simulation loading
remain pending; see [m15_phase28_execution.md](m15_phase28_execution.md).

`Simulation.ids` owns the ten entity/event allocation namespaces. Creation
passes this `IdSpace` explicitly to entities and systems; the optional second
Simulation constructor argument shares it between local simulations. The JSON
checkpoint validates all counters and restores monotonically. Births take a
factory from their own `LifeContext`, so constructing another world cannot
replace newborn identity, calendar or learning settings. Standalone constructors
keep legacy counters for fixtures/tools; entities inserted into a simulation
must use its allocator. Band/herd namespaces now share the same allocator,
reserving historical preferences or deterministic free IDs on collision.
Its v2 checkpoint retains occupied group IDs, including departed herds; v1 is
explicitly rejected because it has no group history. Band colour follows the
public outcast flag, rather than an ID range. Coordinated world loading remains
pending. See [m15_phase28_ids.md](m15_phase28_ids.md) and
[m15_phase28_groups.md](m15_phase28_groups.md).

`tools/profile-systems.ts` wraps methods only inside its profiling browser and
compares whole-state hashes against unprofiled worlds, including RNG. It measures
the current all-detailed loop over fixed synchronous steps, with presentation
stopped; inclusive methods overlap. Call counters inside/outside the player's
effective vision describe existing remote detail, not LOD activation. Conditions
and incomplete coverage are in [m15_profile_systems.md](m15_profile_systems.md).

## The rules that hold it together

**Work animation is presentational.** `render/WorkAnimation.ts` reads active
harvest timers, valid node/tree targets and the shared `ARRIVAL_RADIUS`; movement
takes priority. Four `g0`–`g3` poses advance from `workedTicks` plus the render
accumulator fraction, so pause freezes the gesture without storing an animation
clock in the simulation or consuming RNG. Gathering hides a carried weapon while
the hand is working. Other work families keep their existing poses.

**Earthmoving has one tool selector.** `core/Earth.ts` chooses the strongest
usable carried digging tool through `techPower`: sticks without a technique,
an antler pick with bone working, and a wooden spade with carpentry. The
catalogue, order validation, executor and held sprite ask that same selector.
Missing tools and unfamiliar tools have separate visible refusal reasons.
Work remains banked in `World.offset`; acceleration changes lift time, never
the amount of earth moved or the safe depth of a player order.

**Cached art pays for visible pixels.** `ArtAtlas.sprite()` unions the selected
manifest cell bounds, preserving integer offsets, a one-pixel sampling margin,
the original cell clipping and west mirroring. Runtime `drawPerson()` keeps the
old logical 96-pixel origin while drawing one trimmed cached canvas. `compose()`
expands a full cell for tools/exports only. Shared `PixelCache` applies LRU and
budgets of 24 MiB/4,096 entries for figures and 8 MiB/6,000 entries for tinted
layers. `cacheStats` counts RGBA pixels, hits, misses and evictions; these bytes
exclude browser/GPU overhead. Asset sheets are shared and already deduplicate
identical source drawings, independent of NPC population.

**Animal animation events are observations.** Activity pictures read
`lastMealAt`, `lastAttackAt` and `lastRunAt`, written at real simulation events.
No decision, RNG draw or food yield may depend on them. `AnimalAnimation`
follows the world clock and interpolated distance, including north/south
movement. Species keep their idle scale across trimmed poses and share the
same atlas; no animal gets a composed canvas cache. Sleep pictures are prepared
art, with no AI sleep routine yet. Inactivity cannot stand in for an action.

The final-world harness independently recomputes connected components through
`tools/regions.ts`. `regions-stay-true` compares partitions rather than raw
labels and verifies each region's own size, including stale entries. The
earthmoving property tests share this audit; its fault-injection tests prove
it detects an unrepaired bridge cut. This O(tiles) audit runs after a scenario,
never inside the simulation tick, and consumes no RNG or simulation state.

**The State hangs off the chief's own head** (M15 block IX, `social/Polity.ts`).
A temple is the band's largest granary *if its chief* knows redistribution; the
levy, the soldiers' pay, the written ledger, the law and the crown each read the
chief's own `techPower`. Nothing about a government is stored on the band except
the levy's chosen rate and the declared stances in `BandRelations`, so a State
lapses the day its chief is replaced by somebody who never learned to run one,
and a civilisation (`civilisationLacks`) is derived fresh on every call. Only a
government (`governs`: `law_code` or `kingship`) can declare war, make peace or
take a tributary. Everything the bands do with it is decided in `BandSystem`
deterministically: its `rng` is the forest's, and the block adds no draw there.

These are not style preferences. Each one is load-bearing, and each was learned
by breaking it.

**The simulation never imports the renderer.** `src/sim/` is data and logic; the
renderer reads it and never writes back. That is what lets `tools/simcheck.ts`
run exactly the code the browser runs, thirty times faster than real time.

**Nothing calls `Math.random()`.** Every draw comes from a seeded `RNG`, and
subsystems take *forked* streams so that adding a draw in one system does not
shift every later draw in another. A determinism test asserts two runs of one
seed are byte-identical after 500 steps.

> **The fork order in `Simulation`'s constructor is part of the seed contract.**
> New streams are *appended*, never inserted. `wildlifeRng` was added after
> `knowledgeRng` for exactly this reason. Inserting one above another silently
> invalidates every saved seed in the project.

**Every proximity query goes through a spatial hash.** `peopleHash`,
`nodeHash`, `treeHash`, `pileHash`, `shoreHash`, `animalHash`,
`inscriptionHash`. The predecessor
project scanned all entities for every "nearest X" question, which made
per-step cost quadratic in population. `SpatialHash` is checked against brute
force in the tests, because an index that returns a *different* answer than the
naive scan is worse than no index at all.

NPC scavenging of edible food uses `pileHash`, stores the selected item and pile
as the `pickup` target, and collects through `ActionSystem` after walking there.
The remaining M15 phase 11d paths (non-food needs and automatic tool fitting)
are still pending; see `m15_plan.md`.

**Knowledge is held by people, not by a civilisation.** There is no global tech
tree and no unlock. `Simulation.knownTech` is recomputed daily from the
**adults** alive, so a technology leaves the world when its last holder dies
with nothing anywhere having to remember to take it away.

> Adults, since phase 4, because children can now be taught and can pick things
> up by watching. What a child holds is real and personal and they keep it — but
> it is latent: they cannot pass it on, and the world does not count on it until
> they are grown. Two concrete reasons beyond the story. The era fraction
> divides holders by adults, so children in the numerator alone could put it
> over one; and `knownTech` gates the build menu, so a band would otherwise
> raise a granary because somebody's daughter watched a pot being fired.

**Writing is the one exception, bought on purpose.** `Simulation.recordedTech`
is what a society could *get back*; `knownTech` is what it can presently *do*.
They come apart exactly when a band loses its last holder of something and still
has the stone. It is not free: materials, a long job, stone that cannot be
moved, later forms that perish — and **a record is inert to anyone who cannot
read**, which is what makes literacy the thing worth having and the death of the
last reader worse than the death of the last potter. See
`entities/Inscription.ts`.

> Not every record gives the same thing back. `InscriptionDef.fidelity` splits
> `instruction` forms — stone, clay — which hand a reader the finished design,
> from `reminder` — `ochre` — which only sparks a `conceived` idea, insight
> zero: the picture shows that something was done, not how. `recordedTech`
> counts strictly `instruction` records, because a spark is not something a
> society can be said to hold in reserve; `Simulation.rememberedTech` is the
> other half.

> Every effect a technology has goes through `techPower(person, tech)` in
> `knowledge/Tech.ts` rather than through `knownTech.has(...)` at the point of
> use. There were six such call sites and each would have had to learn
> separately about prototypes and refinement; one function learns instead.
>
> `techPower` returns three things, not two: 0, `PROTOTYPE_POWER` while the
> design is built but untested, and `1 + level × REFINEMENT_STEP` once proven.
> **It is pure and must stay pure** — the renderer, the HUD and the action
> catalogue all call it, so a draw from an `RNG` in there would make what the
> world does depend on how often it was looked at. That is why the roll that
> proves or breaks a prototype happens once a day in `KnowledgeSystem` rather
> than at the point of use.

**Ideas are held by people too, and are lost the same way.** `Person.ideas` and
`Person.techLevel` are per-person state with no global counterpart, so a
half-finished design dies with the person who was half-finishing it, and a
refinement somebody spent years on is not transferred by teaching — what you are
shown is the plain version. Refinement lives on the *knower* rather than the
object: a fine axe handed to a novice is just an axe. That is a deliberate trade
for keeping per-unit quality out of `Inventory`'s stacks, which are a plain
id-to-count map that nearly everything relies on being one.

**Discovery is situated, and `requires` is not `sparks`.** Since M6b phase 2 the
tree is a web. `TechDef.requires` is the scaffolding you must already have to
*understand* a thing; it gates teaching, observation and conception alike and is
what keeps the graph acyclic. `TechDef.sparks` is the set of situations that
make it *occur to you*, and gates conception only. Each is a whole situation —
what you know, what is in your hands, what you have been doing, what you feel,
what is underfoot, what you saw, what season it is — and each technology has
several, which is where the web comes from. See `knowledge/Synthesis.ts`.

> A spark naming an ingredient that does not exist would be a technology nobody
> could ever conceive of, passing every other test in the suite — the same shape
> of defect as `requiresTech: 'carpentry'`. `synthesis.test.ts` checks every
> item, action, biome, need, season and deed id named in the table, and checks
> that every node has at least one route built out of things an ordinary day
> supplies.

**No technology ships inert, and neither does anything it gates.** A node may
not enter `TECHS` without an entry in `TECH_EFFECTS` saying what it does and
where that is read, and `tech.test.ts` fails the build otherwise.

> The rule was not enough on its own. `pottery`'s declared effect was the
> granary — and the granary asked for six `pottery`, which nothing in the world
> could produce, while no band ever planned one in the first place. It passed
> `techs-have-effects` and did nothing. Two more tests close that gap: every
> material in `BUILDINGS` must be something the world can actually make, and
> every recipe's output must be something that is either worth carrying or asked
> for by a building. **`BandSystem.planBuildings` also asks what its own members
> can raise** rather than choosing from hardcoded ids, which is what makes a
> gated design something the simulation can reach and not only the player. This is a reaction to a real pattern: `farming` gated
a whole era while doing nothing on the ground, `clothing` and `cordage` unlocked
nothing, and the longhouse sat behind a `requiresTech` naming a technology that
did not exist, which made it unbuildable for its entire existence without
anything noticing.

**The player is not omniscient.** Everything the inspector shows is filtered
through `sim/social/Knowledge.ts`. This now extends to the entity picker and to
the tech web: a bubble for a stranger says "a man", never their name, and the
web opened on a stranger shows the veil and not one node. A UI that reads out a
stranger's private state hands the player exactly the god's-eye view the
simulation is built to withhold, and a map of somebody's *mind* is the easiest
possible way to do it.

**Property is attention, not an invisible wall.** `social/Property.ts` is the
single answer to whether somebody may use a building: their own band always
may; a rival may while no living owner is within sight of it; an owner who can
see can stop them. The scorer, catalogue, executor and direct inventory action
all ask it. Foreign use emits a social deed (`theft` for taking,
`trespass` for other use, `sabotage` for wrecking — M11 phase 11b), because
ownership that nobody can witness or tell a story about is only a hidden
permission flag. `sabotage` is the one verb that must refuse a target
`mayUse` calls `ours`: every other property verb reads `ours` as "no offence,
proceed", which is exactly wrong for a deliberately hostile act, so the
refusal is checked explicitly rather than left to the shared helper. Scorer-
side candidates also need `World.sameRegion`: same-band ownership used to
guarantee that accidentally, and allowing foreign buildings exposed
impossible walks across water.

**A building's `durability`** is the structural half of the same idea —
`progress` measures how much has been built, `durability` how much is still
standing, and the two are deliberately never the same number. Null until
`addWork` completes the building and forever null on anything with no fabric
to knock down (`Building.isStructure`), so `sabotage`'s target check and the
UI's condition bar can both tell "not yet built" apart from "wrecked" without
a separate flag. A ruin is inert everywhere its `def` claims it is not — no
shelter, no water, no fresh storage — routed through one choke point,
`storageFree`, rather than scattered `!ruined` checks; repair answers `build`
on an already-complete site rather than getting a verb of its own.

> Overlays live on `document.body`, never inside `#hud`, which rebuilds its
> subtree every frame. The z-index ladder is radial 20, picker 21, techweb 30,
> newgame/succession 40. Each needs `[hidden] { display: none; }` — see
> `AGENTS.md`; the project has made that mistake four times now.
>
> A panel that redraws every frame also detaches whatever the cursor is over
> before a hover can land on it. `TechWeb` keeps a digest of what is on screen
> and redraws only when it changes; anything else that updates in place will
> need the same.

**Every long action gets an interruption check, and the line it checks is not
flat.** `ActionSystem.interruption` is the only thing that can reach a committed
worker, because a committed person does not re-plan. Omitting it has produced the
two worst bugs in this project's history — woodcutters who chopped through to a
hundred thirst, and builders a chief had ordered onto a hut who worked through a
winter until they died. `doHunt` calls it, and any new long action must too.
`doSleep` and `doRest` use `wakeReason`: it reuses danger/family interruptions
with pack and work-need gates disabled, then checks urgent hunger and thirst.
A full pack is not a reason to stop sleeping. The check runs while approaching
the roof too, so a committed journey cannot hide an urgent need.

> **The base limits are low because a need parks at whatever line stops it.**
> Work continues right up to the limit and ends there, so `Config.needs.workLimits`
> is also where the population's average hunger and thirst settle. An early build
> put them near the lethal line and a healthy band was carrying 82 thirst inside
> a fortnight. Raising them is therefore not a way to make people work longer;
> it is a way to make everyone permanently hungrier.
>
> `ActionSystem.workLimit` is how work gets to continue without moving that
> average, by making the exceptions *per job* rather than raising the line for
> everybody. **A job is not interrupted by the need it is answering** — picking
> berries is how you stop being hungry — decided per node rather than per verb,
> since `forage` is berries at one bush and flint at the next. A pull that is
> nearly done finishes, which is the far half of the berries-versus-flint
> asymmetry `bugs.md` recorded as untunable. Work the player ordered gets a
> little more rope. Everything else still stops where it always did.
>
> **`pressedByNeed` asks the same function**, because the scorer has to know
> where the line is before it starts a long job. An action that checks its
> interruption *during* one long pull rather than *between* short ones will
> otherwise be started by somebody already over the line, stopped on the next
> tick, and chosen again — 786 abandoned attempts per finished axe when crafting
> had this shape, and eleven and a half thousand broken-off chases when `hunt`
> turned out to have it too.

> **A long job must bank its progress somewhere.** The interruption check is
> not the only ceiling: a novice picks up thirty-five points of thirst in four
> hundred ticks, so any single uninterrupted pull longer than that restarts for
> ever and never completes. Carving a stone is twelve hundred, and the first
> version of it spent forty-five thousand ticks producing nothing. Work
> accumulates on the record the way it accumulates on a building site. Shrinking
> the job until it fits only moves the line.
>
> `doCraft` was found without an interruption check at all in pass A, having
> gone the whole life of the project unreachable for 258 ticks at a time. It also showed the other half
> of the rule: **an action that is one long pull rather than a run of short ones
> needs the scorer to know where the line is.** Every other long action checks
> *between* cycles, so it never begins on the wrong side of a threshold; a craft
> checks *during*, so `Brain` would start one for somebody a point over the
> limit, watch them stop on the next tick, and choose it again. The thresholds
> live in `Config.needs.workLimits` and are asked for through `workLimit` and
> `pressedByNeed` rather than copied, because two copies of them would drift.

**Needs are not all alike, and thirst answers to effort.** Hunger, fatigue and
company climb at a flat rate; cold is a function of the season and what is over
your head; and thirst is a function of what you are *doing*, through `EXERTION`
in `NeedsSystem` and a heat term read off the same `time.temperature` that drives
cold. Before that a person asleep in a hut in February got thirsty at exactly the
rate of one felling a tree in July. Hunger is deliberately still flat: the food
economy is the most fragile thing in this world, and giving two needs the same
treatment at once would have put two changes inside one measurement.

**If the simulation stops something, the UI says why.** `interruption()` and
`abandon()` between them carry thirty-odd reasons; they reach the player through
`ActionContext.onStopped` → `Simulation.interruptions` → a floater and the
panel. Before this they were telemetry counters only, and an order simply
stopped. Research added five of its own — nothing on your mind, nothing came of
it, not ready to build, a partner who knows nothing about it, a partner who will
not discuss it — plus a second queue, `Simulation.insights`, for the other half
of the same duty: saying that somebody *did* work something out.

**One `step()` is one simulation step.** No hidden amplification, so the step
budgets in the harness mean what they say.

**Carrying is bounded by hands and fitted containers.** `Person.inventory`
remains the count of everything carried, while `Carry.ts` checks the item
class, hand limit, and equipped container slots. Recipes and pickups fit a
container into its slot; if an older transfer puts too much into somebody's
inventory, `Simulation.step()` drops the excess at their feet rather than
destroying it. A meal eaten at the bush or tree never enters inventory, so it
must not remove a second carried unit. With full hands and food in sight, the
AI can store a stack of unequipped material to free room while retaining its
carried food. Feeding a dependent child delivers nourishment directly; adding
it to the child's already-full inventory would only drop it at their feet.
`Config.carry.legacyPack` still changes `Carry`'s capacity calculation, but
`Person.carryCapacity` and `isLaden` remain hand-based, so this flag is not a
whole-simulation comparison with the old pack.

## The AI is a utility scorer

Each person, on their own staggered think tick, scores every candidate action
and takes the best:

```
score = needUrgency² × opportunity(distance, skill) × personality × commitment
```

A state machine encodes *transitions*, which explode combinatorially. A utility
score encodes *desire*, which composes: adding theft means adding one scorer,
not auditing every transition. It is also inspectable — the HUD and
`npm run why` show the same table.

The scorer now carries about two dozen terms. Two things to know before adding
another:

- **Coefficients are calibrated against each other, not in isolation.** The
  courtship gate `opinion > 5` was written when the in-group bias was 10; when
  M6a lowered that bias to 6 the gate started sitting exactly on it. (It turned
  out not to be what suppressed courtship — see [bugs.md](bugs.md) — but the
  coupling is real and there are more like it.)
- **Proximity usually decides.** Berry bushes outnumber animals six to one, so
  they are always nearer. `hunt` scored nothing at all until its coefficient
  was raised to nine, because distance settled every comparison before the
  needs did. `ai-uses-many-actions` is the tripwire for the opposite failure.

## Systems, in the order `step()` runs them

1. `time.advance()` and `rebuildHashes()` — people and animals move every step,
   so their indices are rebuilt every step; trees and piles only when changed.
2. Resource regrowth, coarse-grained: every 20 steps at 20× the rate.
3. `WildlifeSystem.update` — herds drift, graze and bolt.
4. `NeedsSystem.update` — needs climb, cold bites, critical needs cost health.
5. Once a day: social upkeep, forest growth, band decisions, knowledge,
   era recount, life cycle (aging, conception, birth, mortality).
6. Per person: `Brain.think` (staggered, and skipped while committed) then
   `ActionSystem.execute`.
7. `cleanupDead` — estates settle, households pass, succession is offered.

## What M6c and the winter pass added

- **Every reason reaches the player.** `ActionContext.onStopped` →
  `Simulation.interruptions` → a floater and the panel's action line. Twenty-odd
  reasons in `interruption()` and `abandon()` used to be telemetry counters only.
- **`Person.resume`**: an order broken off for a need is set aside and picked
  back up once the person is comfortable, so a long job and a short one behave
  the same from the player's side.
- **Sleep has its own need thresholds**, while reusing danger/family interruptions
  without the work list's pack gate.
- **`workProgressOf`** (`sim/core/Progress.ts`), shared by the renderer and the
  panel, covering all three ways work is measured.
- **The larder gate**, which was the single biggest change to the world's health
  in this project's history: mean survival across ten seeds 40% → 59%.

## What M6a added

- **Founding families** (`systems/Founding.ts`). The world opens with three
  tribes of married couples, their children, and the occasional widowed parent
  or unmarried sibling — not thirty unrelated adults in households of one.
  `linkFamily` and `inheritTraits` are shared with birth so a founding sibling
  and a born sibling cannot end up with different kinship edges.
- **Animals** (`entities/Animal.ts`, `systems/WildlifeSystem.ts`). The `game`
  resource node is gone. Deer, boar and hares move in herds, notice hunters at
  a radius the `track` skill shrinks, bolt as a herd, and tire — persistence
  hunting is what makes a chase finishable at all, since a fresh deer is faster
  than any person.
- **Sleep**, distinct from sheltering and from resting.
- **A three-rung opinion ladder**: own household +18, own band +6, anyone else
  −6, with blood kinship separate and additive on top.
- **An entity picker** (`ui/EntityPicker.ts`) replacing blind click-cycling, and
  hit radii that match what the renderer actually draws
  (`Renderer.hitRadiusOf`).
- **Character creation** (`ui/NewGame.ts`) over a world that already exists.
  `?skipIntro=1` bypasses it.

## Verifying a change

Four layers, fastest first. `npm run verify` chains them.

```bash
npm run typecheck      # ~3s
npm test               # unit + determinism            ~1s
npm run sim:check:all  # world health, every scenario  ~15s
npm run e2e            # Playwright                    ~21s
```

`npm run sim:seeds` runs a scenario across ten seeds and reports mean survival —
the only way to tell whether a change to the food economy helped, since one long
run is chaotic. Ten seeds cannot resolve a change of under about ten points; use
`--seeds 20` for anything smaller.

The `craft` scenario exists because knowledge takes years to work out, so no run
in the suite ever made anything or reached a gated design, and every check about
either reported n/a. Its founders start knowing three technologies through
`population.startingTech`, which is empty in every world a player starts. Moving
the starting conditions until a run can reach the thing under test is the same
affordance `harsh-winter` uses when it shortens a season to six days.

`npm run sim:check` is the one to reach for first: 38 named checks across five
scenarios, and checks a scenario cannot exercise report **n/a** rather than
passing silently. `npm run why -- --person 0 --from 1700 --to 1760` prints one
person's score table tick by tick, which is the actual reason for every
decision they make.

## Human sleep pressure — M15 review, 2026-10-03

`core/Circadian.ts` computes perceived fatigue from physical debt plus a continuous
cosine of the day's fraction: midnight adds pressure and noon subtracts it.
`needs.circadianAmplitude` is 60 fatigue points initially; zero removes the clock
modulation, and `motivation.nightSleep` disables its use. The scorer and autonomous
waking read the same quantity. Sleeping reduces physical debt without cancelling
the clock's pressure, so reaching zero debt at midnight does not cause a repeated
wake/sleep loop. Exhaustion can outweigh daytime alertness and permit a nap;
hunger, thirst, danger and a crying baby can interrupt sleep at any hour.

Rest and sleep query the building spatial hash for a usable nearby roof even in
warm daylight. Both carry that destination and approach it before recovering.
Cold sheltering retains its separate refuge destination. The clock does not
assign an action: food, water, safety and the other scores still compete.
Player orders to sleep recover physical debt; an order to rest remains held
when rested, while urgent interruptions stay visible through onStopped.
