# Architecture

Current as of 2026-09-05 (M6b phase 1). Roughly 11,900 lines of TypeScript, no
runtime dependencies, Vite + a 2D canvas.

## Layout

```
src/
  sim/          PURE simulation. No DOM, no renderer imports, no Math.random.
    core/       Simulation, World, TimeManager, RNG, SpatialHash, Telemetry,
                Config, Progress
    entities/   Person, Household, Tree, ResourceNode, Building, Animal,
                Item/Inventory, ItemPile
    ai/         Brain (utility scorer), ActionCatalog (every verb, and when)
    social/     Events + norms, Memory, Relationships, SocialSystem, Authority,
                Knowledge (what one person can tell about another)
    knowledge/  Tech definitions and eras
    systems/    Needs, Movement, Action, Life, Forest, Band, Knowledge,
                Wildlife, Founding
  render/       Canvas 2D renderer, Camera, Floaters
  ui/           Hud, RadialMenu, EntityPicker, NewGame, Succession
  data/         Name syllables
tools/          simcheck (library) + headless / scenarios / seeds / why (CLIs)
e2e/            Playwright smoke tests and screenshot tour
```

## The rules that hold it together

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
`nodeHash`, `treeHash`, `pileHash`, `shoreHash`, `animalHash`. The predecessor
project scanned all entities for every "nearest X" question, which made
per-step cost quadratic in population. `SpatialHash` is checked against brute
force in the tests, because an index that returns a *different* answer than the
naive scan is worse than no index at all.

**Knowledge is held by people, not by a civilisation.** There is no global tech
tree and no unlock. `Simulation.knownTech` is recomputed daily from who is
alive, so a technology leaves the world when its last holder dies with nothing
anywhere having to remember to take it away.

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

**No technology ships inert.** A node may not enter `TECHS` without an entry in
`TECH_EFFECTS` saying what it does and where that is read, and `tech.test.ts`
fails the build otherwise. This is a reaction to a real pattern: `farming` gated
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

> Overlays live on `document.body`, never inside `#hud`, which rebuilds its
> subtree every frame. The z-index ladder is radial 20, picker 21, techweb 30,
> newgame/succession 40. Each needs `[hidden] { display: none; }` — see
> `AGENTS.md`; the project has made that mistake four times now.
>
> A panel that redraws every frame also detaches whatever the cursor is over
> before a hover can land on it. `TechWeb` keeps a digest of what is on screen
> and redraws only when it changes; anything else that updates in place will
> need the same.

**Every long action gets an interruption check.** `ActionSystem.interruption`
is the only thing that can reach a committed worker, because a committed person
does not re-plan. Omitting it has produced the two worst bugs in this project's
history — woodcutters who chopped through to a hundred thirst, and builders a
chief had ordered onto a hut who worked through a winter until they died.
`doHunt` calls it, and any new long action must too. `doSleep` is the one
deliberate exception: it has its own `wakeReason`, because the work list's first
clause is `isLaden` and a full pack is not a reason to stop sleeping.

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
- **Sleep has its own wake list** rather than borrowing the work-interruption
  one, whose first clause is `isLaden`.
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
run is chaotic.

`npm run sim:check` is the one to reach for first: 38 named checks across five
scenarios, and checks a scenario cannot exercise report **n/a** rather than
passing silently. `npm run why -- --person 0 --from 1700 --to 1760` prints one
person's score table tick by tick, which is the actual reason for every
decision they make.
