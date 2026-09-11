# M7 movement, and M9.3 quantities

## Context

The owner reported two things, and the first is a real cause of death.

**People get stuck on coastline and die.** Movement is greedy vector steering
with three fallbacks (`moveToward`, `src/sim/systems/MovementSystem.ts:57-97`) —
step toward the target, else x-only, else y-only, else a perpendicular sidestep.
There is no pathfinder anywhere in the codebase. `World.sameRegion`
(`src/sim/core/World.ts:120-123`) already stops anybody setting out for
something across water, but it proves only that *a* path exists — a concave
shoreline, a lagoon, a rock ridge or an inlet inside one region still traps a
walker. The file header at `MovementSystem.ts:9-16` and the `region` comment at
`World.ts:34-46` both record earlier populations starved by exactly this.

**Two confirmed defects make it lethal rather than merely annoying:**

1. **The zombie order.** `giveUp` (`MovementSystem.ts:171-186`) calls
   `clearTarget()`, which does *not* clear `person.order`. In `Simulation.step`
   at `src/sim/core/Simulation.ts:1993`, `committed = actionTimer > 0 || order
   !== null` stays true, so `needsThink` is false and the brain never re-plans.
   `ActionSystem.execute`'s `case 'wander': default:`
   (`src/sim/systems/ActionSystem.ts:393-396`) calls `step` and **discards the
   return**, so `finish()` — the only thing that clears an order — is never
   reached. Once the random hop is reached, `step` returns true every tick and
   the person stands still for ever. `wander` exertion is 1.0, so thirst goes
   critical at ~1,130 ticks and they are dead 2,000-2,500 ticks after freezing:
   **seven to eight minutes of play**, from a character who looks like they are
   thinking. AI-planned actions recover within five ticks; only someone with an
   order freezes — the player's own character, anyone the player commanded, and
   anyone a chief commanded. That is the "random" death.
2. **The give-up is silent.** `giveUp` only increments `gave_up_walking`
   telemetry. Every other stop routes through `abandon`/`stop` → `ctx.onStopped`
   (`ActionSystem.ts:429-457`), and `AGENTS.md:71` makes surfacing refusals a
   standing instruction. No check in `tools/simcheck.ts` asserts the counter
   either.

**Quantities.** Give, store and take-from-store already prompt as of today's
`m9.2` commit (`src/ui/QuantityPicker.ts`, invoked at `main.ts:430`, `:465`,
`:1187`). Three paths still move everything without asking: `drop_item`
(`main.ts:413`), pile pickup (`main.ts:1096` → `Simulation.takeFromPile`, which
takes no `itemId` or `count`), and the radial menu's **"Store what you carry"**
(`ActionCatalog.ts:429` → `doStore`, which dumps the whole pack). The last is
almost certainly the one the owner hit, since right-clicking a granary is the
natural way to store.

**Two more bugs found while reading, both worth fixing here:**

- `doStore` under-fills a store. `ActionSystem.ts:896` computes `const room =
  store.storageFree - moved`, but `storageFree` is *derived*
  (`Building.ts:401-403`: `def.storage - store.total`) and has already dropped
  by `moved`. With room 10 and two stacks, the second sees `4 - 6 = -2` and
  breaks. "Store what you carry" has never stored what you carry.
- `escapeFoundSomething` (`main.ts:203`) omits `itemPicker` and
  `quantityPicker`, both shipped today, so Escape on the amount prompt also
  opens the pause menu — the exact failure the comment above that line
  describes.

**Decisions taken:** all of it, staged. People get routing; animals keep greedy
steering. The amount prompt starts at the whole stack.

---

## Stage A — quantities (commits 1-4)

Bit-identical to today's baseline (36 of 36, 27 n/a) for commits 1-3, so these
land **first**, measured against the existing documented numbers rather than
after a movement change forces a re-baseline. Follow M9.2's precedent
(`docs/changelog.md:15-19`): defaulted optional parameters, so every AI caller
stays byte-identical.

### 1. `drop_item` prompts; Escape fixed

`main.ts:413-417` wraps `sim.drop` in `quantityPicker.show(...)` exactly as
`store_item` does at `:465`, `initial` defaulting to the whole stack.
`Simulation.drop(person, itemId, count)` (`Simulation.ts:875`) already takes a
count — no simulation change at all.

Same commit: `escapeFoundSomething` gains `itemPicker.isOpen ||
quantityPicker.isOpen`.

`e2e/smoke.spec.ts:1062` breaks, and that is correct — its premise is that Drop
moves the whole stack instantly, which is what the owner asked to change
(`AGENTS.md:197-200`). It gains a confirm click on `.quantity-picker-confirm`
and keeps its assertion.

### 2. Pile pickup prompts

Widen the method rather than adding verbs to the pile panel: the HUD's item-verb
channel is gated on `currentSelection?.kind === 'person'` (`Hud.ts:345`), so a
pile panel would need a second implementation of what `handleItemAction` already
is.

```ts
takeFromPile(person: Person, pile: ItemPile, itemId?: string, count?: number): number
```

Both omitted means "everything, in pile order" — today's behaviour, byte-for-byte.
`main.ts:1096-1102` becomes `issuePickup(actor, pile, screenX, screenY)`,
mirroring `issueTake` (`main.ts:1184-1213`): room guard first with a spoken
reason (`QuantityPicker.show` refuses `max <= 0` silently, and a popup that never
appears is the worst outcome); one kind → straight to the amount; several →
`itemPicker.show` then the amount. No knowledge gate — goods on the ground are
visible to anyone standing over them.

Also: `issue`'s `pickup` branch runs before the command branch and uses `actor`
(always `sim.player`), while `ActionCatalog.ts:180-186` computed `enabled` from
the *subordinate's* capacity. There is no `pickup` verb in `ActionSystem`, so it
cannot be ordered — return the option disabled with `reason: 'You cannot order
somebody else to pick that up'`, using the `commanding` already on
`CatalogContext`.

### 3. Radial "Store what you carry" prompts

The count path is **opt-in on `targetItemId`**, exactly as `doTake` already is
(`ActionSystem.ts:915-926`). `doStore`'s "empty the pack" is what the AI wants —
a forager's trip to the granary is *about* putting the load down — and no AI
caller ever names an item (`Brain.setup`'s `store` case sets only
`targetBuildingId`; `BandSystem` commands carry `{ buildingId }` alone), which is
the proof that this stays bit-identical.

`main.ts` gains `issueStore(actor, store, screenX, screenY)` beside `issueTake`,
over `actor.inventory.entries()`. No knowledge gate — the player is choosing
from their own pack. Skip the picker at one stack (`main.ts:445`, `:1202`
precedent). Commanding somebody else stays blind down the existing `sim.command`
path, for the reason `issueTake` already writes down.

`Simulation.order` already threads `itemId`/`count` (`Simulation.ts:1204-1207`)
and `ResumedOrder` already carries them (`:1078-1079`), so an interrupted store
resumes for the same item. New reason `store_item_gone` → `STOP_REASONS`
(`src/render/Floaters.ts:215-260`).

**Extract a shared helper** rather than a third copy (`AGENTS.md:225-230`):
`Building.accept(from: Inventory, itemId: string, count: number): number` in
`src/sim/entities/Building.ts`, used by `Simulation.storeItem`
(`Simulation.ts:987-995`) and both `doStore` branches. One definition of how much
fits.

### 4. The `doStore` room double-count

`const room = store.storageFree - moved` → `const room = store.storageFree`.
Two characters, but it changes AI behaviour, so **not** bit-identical and it must
not ride inside commit 3. Measured on `stored`, the report's `store` column, and
`npm run sim:seeds -- --seeds 20` — food-economy territory, where
`AGENTS.md:157-169` says one run cannot answer the question.

---

## Stage B — M7 movement (commits 5-9)

### 5. Instrumentation only, no behaviour change

This commit exists so the before-and-after of commits 6 and 8 uses **identical
instrumentation on the same code**. That is why no `pathfinding` config flag is
needed — a flag doubles the behaviour surface and leaves a switch behind.

- Move `stuckTicks` off the module-level `Map` in `MovementSystem.ts:38` onto
  `Person.stuckSteps`, cleared by `clearTarget()`. The map leaked an entry for
  everyone who died mid-slide, and the move is what makes the unit test in
  commit 6 possible.
- `telemetry.count('gave_up_under_orders')` inside `giveUp` when `order !==
  null`; plus `walk_arrived`, `route_arrived`.
- `tools/simcheck.ts`: a `StallWatch` per-step watch in `runScenario`'s loop
  (same pattern as `WildlifeWatch`, `simcheck.ts:1724-1758`) and the check
  **`nobody-stalls-under-orders`**: for each living person, if `order !== null
  && actionTimer === 0` and position has not moved >0.05 tiles and the action has
  not changed, count ticks; crossing `ticksPerDay` counts one stalled person.
  Cause-agnostic on purpose — it catches any future freeze, not just this one.
- **Record every number**: `npm run sim:check:all` and `npm run sim:seeds --
  --seeds 20`. This is the "before".

### 6. The zombie fix

**Delete `giveUp` entirely** and split its two jobs.

`MovementSystem.step` is **renamed** to `advance(person, tick): Arrival` and
returns a tri-state, so the compiler walks every one of the fifteen call sites —
a numeric enum where `Moving = 0` is falsy would let `if (movement.step(p))`
keep compiling with its meaning inverted.

```ts
export const ARRIVAL_RADIUS = 0.6;
/** Deliberately not a boolean: `step` returned one and two of its fifteen
 *  callers threw the answer away, which is how a person under orders came to
 *  stand still until they starved. */
export const enum Arrival { Moving = 0, Arrived = 1, Blocked = 2 }
```

*Deciding to stop* moves to a new helper in `ActionSystem`, where `abandon`,
`stop` and `ctx.onStopped` already live:

```ts
private travel(person: Person, ctx: ActionContext): boolean {
  const arrival = ctx.movement.advance(person, ctx.tick);
  if (arrival === Arrival.Blocked) { this.abandon(person, 'cannot_reach', ctx); return false; }
  return arrival === Arrival.Arrived;
}
```

Thirteen of the fifteen sites become `if (!this.travel(person, ctx)) return;`
and keep their shape. Two of them are shared helpers, so the real edit is
smaller: `reachBuilding` (`ActionSystem.ts:783-805`, six callers) and `approach`
(`:1360-1378`, the social verbs) both currently discard the result and walk on
the spot for ever.

`abandon` counts `abandoned_cannot_reach`, reports through `onStopped` →
`Simulation.noteStop` → the floater and `hud.noteStop`, calls
`noteSaw('cannot_reach')`, and calls `finish` — which clears the target **and
the order**. The zombie cannot form and the refusal reaches the player.
`cannot_reach` → `STOP_REASONS`: `'they could not get there'`. It is **not**
added to `RESUMABLE_STOPS` (`Simulation.ts:99`) — a route that does not exist now
will not exist in two hundred ticks.

*"Hop somewhere else first so the next attempt comes from a different angle"* is
**not** reimplemented. It was a workaround for greedy steering. With A* plus the
region pre-check, `Blocked` means the goal is on another landmass, has nothing
standable near it, or the budget bailed — none of which a hop improves. If
`abandoned_cannot_reach` is not near zero across the seed cohort, that is a
*target-selection* bug in `Brain`, and the counter is what will find it. Papering
over it is how this stayed invisible.

`case 'wander'` honours the result:

```ts
if (ctx.movement.advance(person, ctx.tick) !== Arrival.Moving) this.finish(person);
```

**The catch:** `finish` calls `noteDid`, so `'wander'` would start entering
`person.lately` — which revives the dead `tracking` spark route at
`src/sim/knowledge/Tech.ts:259-261` (it needs `{ kind: 'doing', action:
'wander' }`, and `case 'wander'` has never reached `finish`, so that ingredient
has never been satisfiable). Changing the tech economy inside a movement commit
is not acceptable, so the same commit makes `Person.noteDid` (`Person.ts:520-523`)
ignore `'wander'` alongside `'idle'` and `'dead'`, with a comment saying why.
Reviving that route is commit 10, alone.

`default:` also fixes the player's own character stuck showing `action = 'walk'`
after the keys are released (`Simulation.ts:1982` sets it, nothing clears it).

**Gate:** a new test in `src/sim/__tests__/orders.test.ts` — order a `goto`, set
`person.stuckSteps = PATIENCE + 1`, step, assert `person.order` is null. It fails
on today's build. Then `gave_up_under_orders` → 0 and
`nobody-stalls-under-orders` green, against commit 5's recorded numbers.

### 7. `src/sim/core/Pathfinder.ts`, wired to nothing

`core/`, not `systems/`: a pathfinder is a world query like `sameRegion` and
`findWalkableNear`, and it has three customers that must not import a system —
`MovementSystem`, the harness checks, and later `Brain`. `Simulation` constructs
exactly one and exposes it `readonly`, so the checks measure the same instance
the simulation uses (the `noticeOf` argument at `Simulation.ts:1035-1043`: two
definitions of "can they get there" is one too many).

A* over the existing tile arrays, **8-connected with a corner rule**, octile
heuristic, binary min-heap with lazy deletion.

- **8-connected, not 4**, because travel time is load-bearing:
  `MovementSystem.ts:24-29` records a base speed of 0.11 killing whole bands by
  dehydration on the walk to the river, and a 4-connected route is up to 41%
  longer than the diagonal it replaces. That is a change to the food economy
  dressed as a pathfinding decision. `moveToward` already moves along an
  arbitrary float vector, so diagonal legs need no new machinery.
- **The corner rule** — a diagonal step by `(dx,dy)` is legal only if
  `isWalkable(x+dx, y)` **and** `isWalkable(x, y+dy)` — earns its keep three
  times: no clipping the corner of a rock or a lagoon; it keeps 8-connected
  reachability *identical* to `World.region`'s 4-connected flood fill (any legal
  diagonal implies a two-step orthogonal detour through a tile the rule just
  tested), so `sameRegion` stays a sound precondition and the oracle the Brain
  trusts in eleven places keeps its promise; and it guarantees the tiles either
  side of a compressed diagonal run are walkable under floating-point error.
- **Costs** 1 orthogonal, `Math.SQRT2` diagonal; `h = (dx + dy) + (SQRT2 - 2) *
  min(dx, dy)`. Uniform terrain cost, because `World.ts:190` gives every
  non-water non-rock tile the same passability. The header says where a terrain
  cost would go and that adding one changes every travel time.
- **No RNG.** The class takes no `RNG` — the type system enforces it. Heap
  comparison is `f`, then `h`, then tile index. The `h` tie-break is not
  cosmetic: exact-`h` A* with `f`-only ordering expands the whole equal-`f`
  plateau, ~2,000 expansions on a 25-tile errand instead of ~100.
- **Zero allocation per query.** Scratch allocated once at `n = width * height`
  (16,384): `gScore`/`hScore`/`fScore` `Float32Array`, `cameFrom` `Int32Array`,
  `seen`/`closed` `Uint32Array` generation stamps, `heap` `Int32Array` doubling
  from 1024, `route` `Int16Array(n*2)`. A `private gen` counter means nothing is
  ever cleared — a query touching 200 tiles costs 200 writes, not 16,384. Handle
  the `Uint32` wrap explicitly and out loud: a silent wrap marks every tile
  visited and every path fails, after hours of play, in a way no short run
  reproduces.
- **Region pre-check before the heap is touched**, so "explore the whole
  landmass and then fail" (16,384 expansions, the only thing capable of breaking
  `perf-budget`) is impossible. `NoRoute` is therefore a statement about the
  world, never about the search.
- **Goal snapping** via `world.findWalkableNear(toX, toY, 8)` when the goal tile
  is unwalkable. Unused today — building footprints are always walkable
  (`Simulation.ts:1501-1508`) — but it is the cheap half of the machinery
  `next-steps.md` §7b promises N1's fishing spots.
- **Tiles truncated, never rounded** (`x | 0`), because `World.isWalkable`
  truncates (`World.ts:212-214`). Disagreements at tile edges are exactly how a
  walker ends up aiming into a rock.
- **Reconstruction compresses collinear runs only** — a 40-tile route becomes
  4-8 waypoints. **No string-pulling or any-angle smoothing:** a line-of-sight
  shortcut between distant waypoints is how a walker crosses the corner of a
  river, and the corner rule only protects steps between adjacent tiles. The
  start and goal tiles are not waypoints; the final leg aims at the real float
  `targetX/targetY`, preserving the 0.6 arrival radius untouched.
- **Not reentrant** — one shared scratch set, so the result is copied out before
  the next call. Say so in the file.

```ts
export const enum PathStatus { Found = 0, AlreadyThere = 1, NoRoute = 2, GaveUp = 3 }

export class Pathfinder {
  constructor(world: World);
  readonly route: Int16Array;   // flattened [x0,y0,x1,y1,…]
  routeLength: number;          // waypoints, not elements
  lastExpanded: number;
  find(fromX, fromY, toX, toY, maxExpansions?): PathStatus;
  reachable(fromX, fromY, toX, toY): boolean;   // for the health checks
}
```

`DEFAULT_MAX_EXPANSIONS = 2000` — roughly 12% of the map, a bail-out and not a
working limit. Counters: `path_found`, `path_no_route`, `path_gave_up`,
`path_expanded` (as an amount). Four, not one, because they need different
responses.

Lands with unit tests and **no callers**, so a bisect can separate "the search is
wrong" from "the following is wrong" — the two failure modes that are otherwise
indistinguishable.

### 8. `MovementSystem` follows routes

The path lives on `Person`, not in a map in `MovementSystem`, because a route and
an aim have to be forgotten together — `clearTarget` is the single place that
forgets where somebody was going, and a route outliving it sends them to the
last errand's bush. `path: Int16Array | null`, `pathCount`, `pathAt`,
`pathGoalX/Y`, `pathTick`. The buffer is kept and reused when a route is dropped;
one allocation per person for life.

`moveToward` is **not touched**. It stays the one primitive that decides what a
legal step is and reports honest displacement; path-following sits above it and
calls it once per leg. That is what satisfies "both callers move together"
without writing a second steerer — the "deer standing in lakes" warning at
`MovementSystem.ts:44-56` is about a second steerer, and this creates none.

`advance` in order: arrival check (unchanged) → `needsRoute` → `requestRoute` →
skip waypoints already behind us → `moveToward` toward the next waypoint (or the
real target on the final leg) → displacement check → stuck backstop.

Waypoint skipping is **speed-relative**, `Math.max(0.5, speed * 1.1)`, and that
is load-bearing: a fixed 0.3 radius against a 0.32 step is stepped over every
tick, and the walker orbits a waypoint for ever while `moveToward` reports full
progress — invisible to a displacement-based detector.

`needsRoute` is true when `pathCount === 0`; when the goal moved more than
`GOAL_TOLERANCE = 2` tiles from `pathGoalX/Y`; or when the next waypoint is no
longer walkable. The last is one line for M7's walls and M8.3's mining rather
than a live case, and it is the hook that makes incremental region repair an
addition rather than a rewrite.

`requestRoute` gates on `REPATH_COOLDOWN = 15` ticks (~4.8 tiles; bounds the
worst case at `people / 15` searches per tick *and* stops a person with a
genuinely unroutable target searching every tick — fifteen ticks of greedy
steering between attempts is exactly today's behaviour, so the fallback does not
regress) and on `MAX_PATHS_PER_TICK = 3`, reset lazily inside `requestRoute` when
the tick changes, so `Simulation.step` needs no new call and no ordering rule.
The queue is index-ordered and never shuffled — a shuffle would need a draw, and
one tick's outcome must not depend on the RNG.

**Stuck detection survives as the backstop**, unchanged in mechanism: the
`GaveUp` fallback is greedy, walls will mutate `walkable` under a live route, and
the waypoint-orbit mode above is invisible to everything else. Out of patience
buys one free re-route before `Blocked`.

**Pursuit needs no special case.** `doHunt` rewrites `targetX/Y` every tick;
`needsRoute` sees the goal moved and the cooldown refuses more than one search
every 15 ticks. Between searches the walker follows the stale route and then aims
straight at the animal on the final leg — the right shape anyway, since routing
matters for reaching the herd and the last few tiles of a chase are open ground.
`PURSUIT_LIMIT * 2` (`ActionSystem.ts:973`) already bounds it.

`resetMovementState()` and its call at `Simulation.ts:287` go away with the
module-level map.

**Gates:** `perf-budget` (floor 2,000 steps/s; baseline measured at 3,413-3,501
at 30 people, so there is 1.7x headroom, not the 4-10x the README's 8,000-20,000
suggests — this is why the budget and the region pre-check exist),
`people-on-land`, `walk_blocked` ≈ 0, `paths-are-found`, 20 seeds.

### 9. `nobody-walled-in`, the TRAVEL report block, docs

**`paths-are-found`** — sample `K = 200` tile pairs deterministically by striding
the tile array with two coprime strides (no RNG; a check must not draw from a
stream the simulation shares), keep pairs both walkable and in the largest
region, assert `find(...) === Found` for every one, and report mean and worst
expansions. Also assert `path_gave_up === 0` in play. This check *cannot* fail on
the broken build because its subject does not exist yet — say so, and verify it
by **mutation** instead, naming each in the commit message: drop
`maxExpansions` to 50 → fails; remove the corner rule → the diagonal-water unit
test fails; remove the region pre-check → `path_no_route` goes non-zero and worst
expansions jump to five figures.

**`nobody-walled-in`** — for every living person, `reachable` to the nearest
shore tile and the nearest food node in their own region, nearest via the
existing `shoreHash`/`nodeHash` with the same `sameRegion` filter
`Brain.findWater` and `Brain.findNode` use. Turns the region oracle's promise
into an assertion. Passes today by construction; it is the gate the day walls,
digging or mining can strand somebody. Mutation-verified by a unit test that
paints a ring of `walkable = 0` around a person.

**A `TRAVEL` report block** near `TERRAIN` — routes found, mean/worst expansions,
searches per 1,000 ticks, `route_arrived`, `walk_blocked`,
`abandoned_cannot_reach`. `AGENTS.md:138-147`: chase the report, not the check.
The expansions figure is what will explain steps/s when it moves.

Optionally, draw `person.path` for the player's own character inside the existing
selection drawing — the only way to *see* the fix in play, and restricted to
their own character so it does not read a stranger's private state.

### 10. Optional, alone: let `wander` reach `lately`

One line in `noteDid`, reviving `tracking`'s fourth spark route
(`Tech.ts:259-261`). Measured on `conceived_tracking` with
`npm run sim:seeds -- --seeds 20`.

---

## Determinism and seeds

**No new fork and no new draw site.** The pathfinder takes no `RNG`; every
tie-break is positional. So the fork order is untouched and the
fourteenth-anonymous-fork / `fishRng` trap (`AGENTS.md:36-49`) is not in play.

**There are no saved games** — nothing in `src/` serializes a simulation, and
`localStorage` holds only HUD state and settings. So "invalidating seeds" means
invalidating **pinned baselines**: the scenario seeds in `simcheck.ts`, the seed
cohort in `tools/seeds.ts`, the numbers quoted in `docs/`, and the geographic
premises of a few e2e specs.

**Every world changes anyway, and pretending otherwise would be the lie.** People
walk different routes, arrive at different ticks, meet different neighbours and
spook different herds. `moveRng` is a dedicated stream consumed only by
`moveToward`'s sidestep and `giveUp`'s hop, so deleting `giveUp` and making the
sidestep rare shifts nothing but the jitter — but positions differ regardless.
Do **not** draw-from-but-ignore `moveRng` to "preserve the stream": it is only
meaningful if positions are identical too, and a fake draw puts a false claim in
the code, which is the thing `AGENTS.md:193-195` records a revert for.

Handle it by re-baselining explicitly — both sets of numbers in
`docs/changelog.md`, with the exact commands — and noting in
`docs/optimizations.md` and at the top of the M7 entry that pre-M7 figures are
not comparable. `src/sim/__tests__/determinism.test.ts` needs no change and must
keep passing: it compares two runs of the *same* build, which is the property
that matters and the one the pathfinder preserves exactly.

## Explicitly not in this pass

`next-steps.md` §6 says M7 lands alone, and each of these would confound the
measurement:

- **Walls, interiors, beds.** `World.isWalkable` stays exactly as it is, with
  `needsRoute`'s waypoint test as the hook they need.
- **Dynamic tiles and incremental region repair**, and M8.3's mining as its
  second customer. The region pre-check assumes `region` is immutable, and that
  assumption is doing real work here.
- **Boats.** `sameRegion` forbids crossing water by construction; a logboat
  changes the reachability model, not the search.
- **N1's fishing spots.** The goal-snapping half ships and stays unused; the
  `Brain.findNode` region test, the placement pass and its appended RNG stream
  do not.
- **Terrain movement costs**, **animal pathing**, **path distance in `Brain`'s
  scorer** (`proximityBonus` runs over every candidate for every person every
  five ticks — a search per candidate is orders of magnitude over budget; the
  cheap future version is a chunk-graph oracle, and `World.chunkIndex`
  (`World.ts:239-243`) already exists with zero callers), and **any `Brain`
  coefficient change** (`AGENTS.md:178-180`: they are calibrated against each
  other).

## Verification

```bash
npm run typecheck                      # ~3s
npm test                               # unit + determinism
npm run sim:check                       # 36 of 36, 27 n/a is the Stage A gate
npm run sim:check:all                   # five scenarios
npm run sim:seeds -- --seeds 20         # commits 4, 6, 8, 10
npm run e2e                             # DYNASTY_PORT=5399 if EACCES
npm run why -- --person 0 --from 1700 --to 1760
```

Per stage: commits 1-3 gate on `sim:check` staying **bit-identical** to
36/36, 27 n/a. Commit 6 gates on the new `orders.test.ts` case failing before and
passing after, `gave_up_under_orders` reaching 0, and
`nobody-stalls-under-orders` green. Commit 8 gates on `perf-budget` with the
expansions figure reported, `paths-are-found`, and 20 seeds against commit 5's
recorded numbers.

**In the real game**, which is where the owner saw this: `npm run dev`, take a
character, order a walk to a spot around a headland or across a bay on the same
landmass, and watch them route around it instead of pressing into the shoreline.
Order a walk to a genuinely unreachable spot and confirm a floater says *"they
could not get there"* and the character goes back to thinking rather than
freezing. Then right-click a granary → "Store what you carry", confirm the item
and amount prompts appear, drop a partial stack, and pick part of it back up.

## Docs

`docs/changelog.md` (one entry per commit, with the reason and the numbers),
`docs/next-steps.md` §6 (what landed; what M7 still owes: walls, interiors, beds,
boats, region repair), `docs/optimizations.md` (new steps/s, mean/worst
expansions, "one path per errand, budgeted per tick"), and `docs/bugs.md` for the
found-not-fixed items: the dead `tracking` spark route (until commit 10), radial
`pickup`'s absent reach test, `heel` having no stuck handling at all (a tamed dog
following its owner round a headland presses into the shoreline indefinitely —
deferred to the wildlife pass with its own measurement), and the player's
`action = 'walk'` sticking after key release (fixed in commit 6, worth recording
as found).
