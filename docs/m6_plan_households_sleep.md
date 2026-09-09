# M6a — Hands, households and hooves

## Context

M0–M5 are done. The world runs and the player can operate it: people forage,
gossip, marry, inherit, fell trees, choose chiefs, discover fire and teach it on.
M5 closed the worst friction — the progress bar, the inventory tab, the item
piles, the command banner, the drink-on-water refusal.

Playing it turns up a second layer of friction that M5 did not reach, and a set
of shallow places the interface implies are deep:

- The **inventory panel does not update while you harvest**. You watch a bar
  fill, the berries land in the pack, and the Kit tab still says what it said a
  minute ago.
- **Clicks land on things you were not pointing at.** The picker uses fixed
  radii up to 1.6 tiles, so a tree captures a click a tile and a half away.
- **Stacked entities are unreachable except by guessing.** Repeated clicks cycle
  blindly through the stack with no indication of what is under the cursor.
- **Bands build more than they need** — a fourth storage pit while three stand
  empty.
- **Everyone starts as a household of one**, so there are no families in the
  world until someone marries one, and the game opens with no character
  creation at all.
- **Hunting is picking berries.** Game is a static resource node.
- **The panel covers the map** and cannot be moved out of the way.
- **20 steps/s** is too fast to read what is happening.
- Strangers are met with a flat −14 and band-mates a flat +10, with no extra
  warmth at all for one's own family.

This pass fixes all of that and puts three tribes of real families in the world.
The depth work M6 originally carried (tech tree, research, weapons, jobs,
visualisers) moves to **M6b**, and walkable interiors move to **M7**, because
A\* replaces the movement system every agent uses every tick and must land alone.

---

## 1. The inventory panel that keeps up

**The bug.** `Hud.update` ([Hud.ts:277](../../Documents/Work/Programs/dynastyGame/src/ui/Hud.ts#L277))
caches on `selectionKey(selection) + ':' + this.tab` and, when that key is
unchanged, calls `refreshPerson`, which patches only `.hud-doing`, the
`[data-need]` bars and `.hud-scores`. The Kit tab has none of those, so it is
built once and never touched again. The "Carrying" line in the Now tab is a
plain `.hud-sub` and has the same problem.

**Fix.** Give `Inventory` ([Item.ts:37](../../Documents/Work/Programs/dynastyGame/src/sim/entities/Item.ts#L37))
a `version` counter bumped in `add` and `remove`, and fold
`person.inventory.version` into the panel cache key. Any change to the pack then
rebuilds the panel, verb buttons included — which is also the correct behaviour,
since `itemActions` depends on what is carried. A rebuild every harvest cycle
(8–35 ticks) is nothing.

While in there: add a work bar to the Now tab from `person.cycleProgress`
([Person.ts:181](../../Documents/Work/Programs/dynastyGame/src/sim/entities/Person.ts#L181)),
so the panel says the same thing the floating bar over the actor says.

## 2. Clicking the thing you meant

**The bug.** `candidatesAt` ([main.ts:223](../../Documents/Work/Programs/dynastyGame/src/main.ts#L223))
picks with fixed radii — person 1.2, node 1.4, tree 1.6, pile 1.2 — regardless of
how large the thing is drawn. A seedling drawn as a two-pixel sprig swallows
clicks a tile and a half away.

**Fix.** Each candidate gets a hit radius matching what the renderer actually
draws, plus one shared grab margin (~0.25 tiles) so precise clicking is not
miserable:

| target | hit radius |
|---|---|
| person | 0.45 (body is 0.34 × 0.52 tiles plus head) |
| node | `0.18 + fullness * 0.22`, floored at 0.3 — a stripped bush is small |
| tree | `tree.radius * 0.55`; a seedling ~0.2 |
| pile | 0.3 |
| building | `Building.contains()` — already exact |

These numbers live in `Renderer.ts` beside the drawing code that produces them
(a `hitRadiusOf(target)` export next to `pickPerson`/`pickNode`/`pickTree`), so
the picker and the painter cannot drift apart. `candidatesAt` rejects anything
outside `hitRadius + margin` and falls through to `ground`.

## 3. Bubbles for a stack

Replace the blind cycling (`lastPick`, [main.ts:429](../../Documents/Work/Programs/dynastyGame/src/main.ts#L429))
with an explicit chooser.

New `src/ui/EntityPicker.ts`, modelled on `RadialMenu.ts` — a DOM element on
`document.body` (not inside `#hud`, which rebuilds its own subtree and would
erase it), dismissed by a click elsewhere or Escape, same as the radial menu.

- `candidatesAt` returns 0 or 1 real entity → behave exactly as today.
- 2 or more → show one bubble per candidate at the cursor: icon, name as the
  player's character knows it (`knowledgeOfPerson` / `knowledgeOfNode` /
  `knowledgeOfTree`, so the picker cannot leak a stranger's name), and a hover
  highlight that outlines that entity on the map.
- Left-click flow: pick a bubble → it becomes the selection.
- Right-click flow: pick a bubble → the radial menu opens for *that* target,
  with the existing title and command-mode handling unchanged.

Ground stays available as a final bubble ("the ground here") so walking to a
crowded tile is still possible.

## 4. Speed, and a panel you can fold away

- Starting speed **5/s**. `main.ts:50` currently hardcodes `20`, and the Hud
  slider hardcodes `value='20'` and the `'20/s'` label. Set
  `Config.time.tickRate` to 5 and have both read it, so the default lives in one
  place instead of three.
- **Collapsible panel.** `.hud-panel` ([style.css:158](../../Documents/Work/Programs/dynastyGame/src/style.css#L158))
  gains a header row with the selection name and a chevron; collapsed it shrinks
  to that strip. State on the `Hud` instance and mirrored to `localStorage` so it
  survives a reload. Add `H` to hide every piece of HUD chrome at once, for
  looking at the map and for screenshots.

## 5. Bands that stop over-building

`BandSystem.planBuildings` ([BandSystem.ts:139](../../Documents/Work/Programs/dynastyGame/src/sim/systems/BandSystem.ts#L139))
counts *buildings*, not capacity or use, so `stores * 14 < members.length` plans
a fourth pit while three sit empty. Three changes:

1. **Stores are wanted only when the ones you have are filling.** Compute
   `used / capacity` across the band's completed stores; want another only above
   ~0.6. An empty pit is proof you do not need another.
2. **Shelter counts capacity, not roofs.** Sum `width * height` over completed
   and planned shelters and compare against `members.length`, rather than
   `roofs * PEOPLE_PER_HUT`. A 3×3 hut and a 2×2 windbreak are not the same
   amount of roof.
3. **A hard ceiling per band**, `ceil(members / 4) + 2` completed structures, so
   no combination of conditions produces a field of huts.

Also drop sites that have gone nowhere: a site with no work and no delivery for
several days is removed, so `underway >= MAX_SITES` cannot deadlock the planner
behind a hut nobody will ever haul timber to.

## 6. Kin, band, stranger

`SocialSystem.introduce` ([SocialSystem.ts:248](../../Documents/Work/Programs/dynastyGame/src/sim/social/SocialSystem.ts#L248))
stamps ±(10 / −14) on first sight. Replace with a three-rung ladder, checked
household-first:

```
own household   +18
own band         +6
anyone else      -6
```

Distrust of outsiders becomes small, as asked, and family outranks band — which
is the point, and which the current code cannot express at all since it only
knows about bands. Blood kinship (`KIN_PARENT` 60, `KIN_SIBLING` 40,
`KIN_SPOUSE` 55) stays separate and additive on top; the household rung is what
covers in-laws, step-kin and fostered members who have no kinship edge.

Note the knock-on: the exile threshold (−28,
[BandSystem.ts:27](../../Documents/Work/Programs/dynastyGame/src/sim/systems/BandSystem.ts#L27))
is now reached from a friendlier starting point for outsiders. Deeds dominate
it, so exile should still fire, but `opinions-diverge` and the exile count in
`crowded` are the checks to watch.

## 7. Sleep, as distinct from sheltering

Today `shelter` ([ActionSystem.ts:525](../../Documents/Work/Programs/dynastyGame/src/sim/systems/ActionSystem.ts#L525))
is standing indoors waiting out the cold, and `rest` is sitting down anywhere at
0.35 fatigue/tick. Neither is sleeping.

New `sleep` action:

- `ActionCatalog.buildingActions` offers "Sleep here" on any completed building
  with `shelter > 0`, alongside the existing "Shelter here".
- `ActionSystem.doSleep` reuses `reachBuilding`, then restores fatigue at ~0.9
  per tick and holds until fatigue reaches zero, dawn breaks, or `interruption()`
  fires — the interruption check is not optional, per the standing rule that
  every long action gets one.
- Warmth needs no special case: `NeedsSystem.shelterAt` already reads position,
  so someone asleep inside a hut is warm because of where they are.
- `Brain` scores `sleep` above `rest` when a shelter is within reach and it is
  night: `fatigue * (isNight ? 3.2 : 1.0) * proximityBonus(shelter)`. `rest`
  stays for people with no roof.

## 8. Three tribes, made of families

- `Config.population.bands`: 2 → **3**.
- Replace the "everyone is head of a household of one" loop
  ([Simulation.ts:282-302](../../Documents/Work/Programs/dynastyGame/src/sim/core/Simulation.ts#L282))
  with a founding generator in a new `src/sim/systems/Founding.ts`, so character
  creation can call the same code:
  - Fill each band with families until `peoplePerBand` is met. A family is a
    married couple (ages 20–45, wed through `social.wed` so kinship, chronicle
    and telemetry are identical to an in-game marriage), 0–3 children, and
    sometimes a widowed elder parent or an unmarried adult sibling.
  - One `Household` per family, shared surname, head chosen by the same
    eldest-adult rule `settleAffairs` already uses.
  - Kinship edges written both ways with the existing `KIN_*` constants. Factor
    the edge-writing out of `registerBirth`
    ([Simulation.ts:327](../../Documents/Work/Programs/dynastyGame/src/sim/core/Simulation.ts#L327))
    into a shared `linkFamily` helper so a founding sibling and a born sibling
    cannot end up with different edges.
  - Children's traits blend the parents' plus drift. Factor that out of
    `LifeSystem.conceiveChild`
    ([LifeSystem.ts:125](../../Documents/Work/Programs/dynastyGame/src/sim/systems/LifeSystem.ts#L125))
    into `inheritTraits(child, mother, father, rng)` and call it from both.
- This all draws from `spawnRng`, which is its own fork, so the number of draws
  can change without shifting any other stream. The fork order in the
  constructor stays untouched — it is part of the seed contract.

## 9. Character creation

New `src/ui/NewGame.ts`, an overlay on `document.body` modelled on
`SuccessionOverlay` ([Succession.ts](../../Documents/Work/Programs/dynastyGame/src/ui/Succession.ts)).
The world and its three tribes generate first; the player then chooses a life
inside it, paused, before the first step runs:

1. **Tribe** — three cards: name, size, the biome their camp sits in, and their
   norms in words ("hold theft very gravely", "care little for oath-breaking"),
   derived by comparing `Band.norms` against `DEFAULT_NORMS`.
2. **Person** — a shortlist of that tribe's adults, each showing family, age,
   sex and a one-line temperament. "Roll again" reshuffles the shortlist.
3. **Skills** — accept the rolled skills, or spend a fixed budget (60 points
   across the ten skills, 40 max in any one) which *replaces* them, so point-buy
   is a different character rather than a strictly better one.

Then generalise `possessFirst` into `possess(person)` and hand over. `main.ts`
keeps `possessFirst()` as the headless fallback, and `?skipIntro=1` bypasses the
screen so the existing Playwright specs and `sim:check` are not rewritten around
it.

## 10. Animals that move

Game stops being a resource node. New `src/sim/entities/Animal.ts` and
`src/sim/systems/WildlifeSystem.ts`:

- `Animal { id, species, x, y, herdId, health, alarmedUntil }`, with species defs
  (deer, boar, hare) carrying meat yield, speed, skittishness and herd size.
- `Simulation` gains `animals`, `animalsById` and `animalHash` — same shape as
  `peopleHash`, rebuilt in `rebuildHashes`. One new RNG fork, **appended** after
  `knowledgeRng` so existing seeds keep their streams.
- `WildlifeSystem.update` each tick: drift toward the herd centroid, graze, and
  bolt from any person inside a flight radius at a speed above a person's
  `BASE_SPEED` while alarmed. To keep animals and people agreeing about what
  walkable means, extract `moveToward(entity, tx, ty, speed, world, rng)` from
  `MovementSystem.step` ([MovementSystem.ts:74](../../Documents/Work/Programs/dynastyGame/src/sim/systems/MovementSystem.ts#L74))
  and share it, rather than writing a second steerer.
- **Hunting becomes a chase.** New `hunt` action: close the distance on a
  moving, fleeing target, then roll `skillFactor('hunt')` against the animal's
  evasion. Success kills it and yields meat; failure sends the herd running and
  costs fatigue. The `track` skill shrinks the radius at which the animal
  notices you — the first thing `track` has ever done.
- `ActionCatalog` gains an `animal` target kind; `Renderer` draws animals and
  exposes `pickAnimal` for the new hit-box picker.
- Remove `game` from `RESOURCE_KINDS`, `RESOURCE_DEFS`, `suitsBiome`,
  `RESOURCE_COLORS`, `NODE_LABELS` and the Brain's food-node filter.
  `Config.world.gameAnimals` becomes a herd count. Two food systems is one too
  many, so the node goes.
- Cheap hooks left in place for the next pass, since adding them later is a
  migration and adding them now is two fields: `Animal.temperament` and a
  `fedBy` set, which is what taming and "friendly if not attacked" will read.

---

## Deferred, deliberately

**M6b — depth.** The tech tree at ~22 nodes with real prerequisite chains;
accumulating research fed by `intelligence` and personal interest;
`industriousness` and `intelligence` as trait axes (rebelliousness stays
*derived* from `loyalty` — two knobs for one behaviour is how a scorer becomes
untunable); weapons with a term in `doAttack`; a jobs tab biasing the scorer with
rebellion rolled through `social/Authority.ts`; and the two visualisers (family
tree from `motherId`/`fatherId`/`spouseId`; tribe as an opinion-weighted graph).

**M7 — A\*, walls, interiors, beds.** `World.isWalkable`
([World.ts:225](../../Documents/Work/Programs/dynastyGame/src/sim/core/World.ts#L225))
is the single chokepoint walls insert behind. It lands alone, behind
`paths-are-found`, `nobody-walled-in`, `people-on-land` and `perf-budget`,
because the greedy steerer has already produced two of the worst bugs in this
project's history and replacing it must not share a milestone with anything.

**Later — dynamic tiles.** Shovels, canals, moved dirt, defensive trenches,
piled rock. The architecture note worth writing down now: `World.walkable` and
`World.biome` are already `Uint8Array`s behind accessors, so mutating a tile is
easy — the expensive part is `World.region`, the flood-filled landmass index
that keeps people from walking at food across water. Any tile change needs
incremental region repair, and that is exactly the machinery M7's walls need
too. Build it once in M7 and digging becomes content on top of it.

**Later — wildlife with needs.** Herbivores grazing and carnivores hunting them,
predators that will take a person, taming by feeding, and animals remembering
who fed or hurt them. The `Animal.temperament` and `fedBy` hooks above are what
that pass builds on.

---

## Verification

Existing gates must stay green: `npm run typecheck`, `npm test`,
`npm run sim:check:all`, `npm run e2e`, `npm run verify`. The determinism test
([determinism.test.ts](../../Documents/Work/Programs/dynastyGame/src/sim/__tests__/determinism.test.ts))
is the one to run first after the founding-families and animal work, since both
add RNG draws.

New checks in [simcheck.ts](../../Documents/Work/Programs/dynastyGame/tools/simcheck.ts):

| check | asserts |
|---|---|
| `animals-move` | mean animal displacement per day is well above zero |
| `animals-flee` | animals near people end up further away a few ticks later |
| `hunts-succeed-and-fail` | both outcomes occur — a hunt that always works is gathering |
| `people-eat-meat` | the hunt → meat → eat chain still feeds people |
| `bands-dont-overbuild` | structures per band stay under the cap, and no band holds two stores below 10% full |
| `families-exist` | at t=0 every band has several multi-person households and every adult has at least one kinship edge |
| `sleep-restores` | people sleep at night, and fatigue falls while they do |
| `kin-outrank-strangers` | mean opinion of household > own band > other bands |

`people-harvest` needs updating: it currently counts `harvest_game`, which will
no longer exist.

**Manual pass** — `npm run shots`, then look at: the new-game screen with three
tribes and their norms; the bubble picker over a person standing on a berry
bush; the panel collapsed with the map visible behind it; a deer breaking away
from a hunter; someone asleep in a hut at night; and the Kit tab ticking up
while its owner picks berries.

---

## Risks

- **Removing the `game` node touches more than it looks like.** It appears in
  the resource tables, biome suitability, renderer colours, HUD labels, the
  Brain's food filter and a health check. Do it as one commit with
  `sim:check:all` green before the wildlife behaviour is tuned.
- **Rebuilding the panel on every inventory change** could churn if a person's
  pack changes many times a tick. It does not today — a harvest cycle is 8+
  ticks — but if a future action adds items in a loop, the key should switch to
  a throttle rather than the raw version.
- **The bias change is a global tuning shift.** Every opinion in the world
  starts from a different place, and exile, marriage and chief selection all read
  opinion. Run `century` and compare marriages, exiles and chief turnover against
  the current numbers before calling it done.
- **Founding families change the starting population's shape.** Today thirty
  unrelated adults; after this, families with children, which means fewer working
  adults on day one and a different curve on `people-survive`. Expect to retune
  `peoplePerBand`.
- **The scorer gains `sleep` and `hunt`.** It already carries around twenty
  terms. Both need a reading in `npm run why` before they are called done, and
  `ai-uses-many-actions` is the tripwire for one swamping the rest.

---

# M6c — What playing it turned up

**Added 2026-09-02, after M6a shipped.** Five defects reported from play, all
reproduced and diagnosed against the code rather than guessed at. The measured
numbers below come from throwaway harness scripts on seed `repro` — construct a
`Simulation`, zero the subject's needs and `workedTicks`, issue the order, step,
and read the `work_ended_*` / `woke_*` / `abandoned_*` counters. The world is
deterministic so they are re-derivable, but the scripts themselves were not
kept.

Four of the five share a single root cause, so that is stated first.

## 11. Nothing tells the player why an order stopped

**This is the root of items 12, 14 and 15, and should be built before them.**

The simulation has an unusually rich vocabulary for why work ends and an
unusually poor one for saying so. `ActionSystem.interruption`
([ActionSystem.ts:215](../src/sim/systems/ActionSystem.ts#L215)) returns eight
distinct reasons — `hands_full`, `thirsty`, `hungry`, `cold`, `under_attack`,
`long_enough` — and `ActionSystem.abandon` a dozen more: `tree_gone`,
`node_gone`, `site_gone`, `quarry_escaped`, `store_full`, `nothing_to_haul`.
**Every one of them is recorded only as a telemetry counter for the headless
health report.** From inside the game the order simply stops, the character
reverts to `idle`, and the floater changes to "thinking".

There is already a correct precedent for the fix: `Simulation.lastRefusal` is a
string set when an order is refused *at the moment it is issued*, read once by
`main.ts`, and shown as a floater with the reason attached. That was M5's answer
to exactly this complaint, and it stops at the issuing moment.

**Fix.** Extend the same channel to mid-action stops.

- `Simulation.lastInterruption: { personId: number; action: string; reason: string } | null`,
  set from `finish`/`abandon` when the person was under a player order, and
  drained by `main.ts` once per frame the way `lastRefusal` is.
- Reasons become player-facing prose in one table, not raw ids: `hands_full` →
  "their hands are full", `tree_gone` → "the tree is gone", `thirsty` → "they
  stopped for a drink".
- The panel's action line (`.hud-doing`) carries the last reason for a few
  seconds, so it is still readable after the floater fades.

Only orders the player gave should announce themselves. An NPC breaking off to
drink is ordinary life, and thirty floaters a minute is noise.

## 12. Sleep restores nothing unless it is night and your hands are empty

**Reported:** sleeping in a mud hut does not restore fatigue.

**Measured**, with fatigue set to 60 and a completed mud hut:

| conditions | result |
|---|---|
| night, empty hands | works — 37 ticks, fatigue 60 → 25.8 |
| **daytime**, empty hands | **ends after 0 ticks, no telemetry, no message** |
| night, **carrying a full pack** | **ends after 0 ticks**, `woke_hands_full` |

Two independent causes, both silent:

1. `doSleep` reuses `interruption()`, whose *first* clause is
   `if (person.isLaden) return 'hands_full'`. That is a reason to stop
   **gathering** — your pack cannot hold another berry — and it has nothing
   whatever to do with lying down. A player who has been out foraging is laden
   by definition, walks back to the hut, orders sleep, and nothing happens.
2. `else if (!ctx.isNight) this.finish(person)` ends a daytime nap on the first
   tick. That is arguably correct behaviour, but it is delivered without a word.

`doSleep` also runs `person.workedTicks++`, so sleeping counts toward
`MAX_WORK_STRETCH` and would eventually report `long_enough`. Sleeping is not
work.

**Fix.** Sleep gets its own wake list rather than borrowing the work one:

```
wake on:  thirst > 45 | hunger > 50 | under attack | dawn | fatigue 0
never on: hands_full | long_enough
```

The thresholds sit *above* the work ones deliberately — you sleep through mild
thirst and wake for real thirst. Drop the `workedTicks++`. And per item 11,
"they were too thirsty to sleep" and "nobody sleeps through the day" both have
to reach the screen.

## 13. A "go to" button on the Ties tab

**Reported:** selecting an NPC in the Ties section should offer a button to
focus the camera on them.

The Ties tab already renders each known person as a `.hud-person-link` with
`data-person`, wired through `HudCallbacks.onSelect` ([Hud.ts](../src/ui/Hud.ts)).
Selecting them changes the panel but not the view, so a name you cannot find on
the map is a dead end.

**Fix.** A second small button per row, `data-focus`, and an `onFocus(person)`
callback that `main.ts` answers with `camera.recentre(person.x, person.y)`.

**On the knowledge pillar**: this reveals nothing the player could not already
get. The camera pans freely over the whole island and `F` re-centres on the
player; the map is not fog-of-warred. What is gated is a stranger's *name,
skills, condition and history*, and none of those are touched by moving the
view. Worth stating in a comment so a later reader does not "fix" it.

## 14. Interruption is arbitrary from the outside

**Reported:** collecting berries never gets interrupted, but gathering clay or
flint does.

**Measured**, all four starting from zero thirst, hunger and cold:

| node | capacity | ticks/pull | worked | thirst reached | outcome |
|---|---|---|---|---|---|
| berries | 14 | 8 | 148 | 13 | stripped it — never interrupted |
| sticks | 12 | 7 | 147 | 13 | stripped it — never interrupted |
| clay | 24 | 12 | 220 | 19 | **interrupted** |
| flint | 30 | 14 | 416 | 35 | **interrupted** |

The code path is identical for all four — `doHarvest` calls the same
`interruption()`. The difference is entirely **how long the node takes to
strip**. The thresholds are absolute need levels (thirst > 35, hunger > 40), so
a short job finishes before the need can climb to them and a long job cannot.

The player sees no node capacities, so from the outside the rule reads as
"berries are uninterruptible and flint is not", which is arbitrary. It is also
unstable: a character who starts a berry bush at thirst 30 rather than 0 *will*
be interrupted, so the same action behaves differently on different days for
reasons nothing on screen explains.

**Fix**, in the order they are worth doing:

1. **Say it** (item 11). Most of the complaint is that the interruption is
   invisible, not that it happens.
2. **Make it predictable.** Interrupt on *projected* need rather than current
   need: stop when finishing the next pull would leave the person over the
   threshold. The rule becomes "he will not start a pull he cannot afford",
   which is legible and does not depend on node size.
3. **Do not silently abandon a player's order.** An NPC breaking off for water
   is correct. An order the player gave should announce the break and, ideally,
   resume afterwards — but resumption is a larger change and should not be
   smuggled into this one.

## 15. Felling shows nothing in the panel, and ends instantly with a full pack

**Reported:** felling a tree bare-handed shows nothing in the UI and jumps
straight from "felling" to "thinking".

Three separate faults, measured on a mature tree needing 210 progress at 0.50
per tick — about 424 ticks bare-handed, roughly 85 seconds at the new 5 steps/s:

**(a) The panel work bar does not cover felling.** M6a added a work bar to the
Now tab reading `person.cycleProgress`, which is timer-based and is `null`
throughout a chop — confirmed directly. `Renderer.workProgress`
([Renderer.ts](../src/render/Renderer.ts)) already handles all three ways work is
measured in this game: a countdown timer for harvest cycles, `tree.chopProgress`
for felling, and `site.completion` for building. The panel reimplemented one
third of it. This is the same "two implementations drift" mistake `moveToward`,
`linkFamily` and `hitRadiusOf` all exist to avoid — the fix is to share
`workProgress` between the floater and the panel, not to add two more cases to
the panel.

**(b) A full pack aborts the fell on tick one.** Measured: laden, the chop
lasted **0 ticks** and reported `work_ended_hands_full`. Felling needs pack room
only at the instant the trunk drops and the wood is picked up; `hands_full`
should not gate the swinging. This is the same misapplied clause as item 12.
Where it *is* right is at the end — and `doChop` already clamps the yield to
`carryCapacity - carrying`, so a laden feller currently loses the timber
silently as well. The remainder should fall as an `ItemPile` rather than
evaporating, which is the rule the rest of this world already keeps: goods move,
they do not appear and vanish.

**(c) A tree can vanish from under the axe.** Measured: at the day boundary
(tick 240) a tree that was standing and actively being chopped was removed from
`treesById` by the daily forest pass, and `doChop` ended the order through
`abandon(person, 'tree_gone')` — silently, with the accumulated `chopProgress`
lost with it. Either the forest pass should not retire a tree somebody is
working on, or — better, since it is one line — the abandonment should say so,
which item 11 delivers.

## Verification for M6c

New checks in [simcheck.ts](../tools/simcheck.ts):

| check | asserts |
|---|---|
| `sleep-is-not-work` | a laden sleeper at night still loses fatigue, and sleep never ends for `hands_full` or `long_enough` |
| `orders-explain-themselves` | every interruption of a player-ordered action sets a reason string |
| `felling-survives-a-day-boundary` | a tree under active felling is still in `treesById` after the daily forest pass |
| `work-bar-covers-every-job` | `workProgress` is non-null for someone harvesting, someone felling and someone building |

The existing `work-runs-in-stretches` check is the one to watch while changing
`interruption()`: it asserts that work ends for stated reasons at all, and a
projected-need rule will change the mix it reports.

**Manual pass** — order a laden character to sleep at night and watch fatigue
fall; order one to sleep at noon and read the reason; fell a tree bare-handed
and watch the panel bar fill; strip a flint outcrop and read why they stopped;
and click a name in Ties and land on them.
