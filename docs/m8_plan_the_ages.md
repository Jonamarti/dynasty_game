# M8 — The Ages: a technology ladder that runs to iron

## Context

Two requests from the project owner, planned together on 2026-09-08 because the
second sets the shape of the first: **lay out what the next steps are**, and
**extend the tech tree, as realistically to human history as possible.**

Asked how far the ladder should reach, the owner chose **iron** over stopping at
the Neolithic or the Bronze Age. Asked what to build first, they chose **jobs and
the visualisers** — M6b phases 6 and 7 — ahead of the ladder. Asked how eras
should be named, they chose **both**: the real archaeological period as the
title, the evocative line kept as its description.

Seventeen nodes reach from struck flint to a timber longhouse and stop. This plan
adds forty-eight more across four ages, and — because no node may enter `TECHS`
without the code that makes it matter shipping alongside it — about eight new
simulation mechanisms with them.

The intended outcome: a player starts a family of foragers on a cold island and,
over enough generations and with enough of the chain held by enough living heads,
watches them arrive at a bloomery — and can see on one screen why each step
followed from the last, in the order our own species actually took them.

---

## The measurement that reordered this plan — and its correction

**Read both halves before acting on either.** The first is what the plan was
written on; the second is what M8.0 measured on 2026-09-08, and it changes the
conclusion rather than refining it.

### What one instrumented run said

A two-year `century` run was instrumented during planning. It ends in the Age of
Fire with **two technologies known to anybody**, and across the whole run exactly
**three of the seventeen nodes were ever conceived by any person**: `cordage`
(16 times), `plant_lore` (13) and `firemaking` (5). The other fourteen have never
entered a single head.

| stage | count over two in-game years, ~30 people |
|---|---|
| ticks spent pondering / discussing / prototyping | 36,311 / 6,747 / 1,616 |
| breakthroughs from `ponder` / from `discuss` | 139 / 28 |
| ideas conceived | 34 |
| **distinct technologies ever conceived** | **3** |
| prototypes built | 8 |
| trials passed / failed | 22 / 7 |
| technologies proven | 7 |
| technologies known to anybody at the end | 2 |

Every number in that table reproduces exactly, and the pipeline below conception
is healthy: thirty-four ideas became eight prototypes and seven proofs. The
funnel is not leaking at the bottom, and `conceptionBase` is the obvious wrong
knob — raising it would conceive `cordage` a fourth time.

### What twenty seeds said

**That run is the worst of twenty, and the conclusion drawn from it was wrong.**
`npm run sim:seeds -- --seeds 20` now reports the tree beside the population, and
across the canonical cohort the same scenario averages **5.4 technologies known
at the end, 4.2 conceived past the root nodes, and 124 things taught or picked up
by watching**. Depth-two nodes — `stoneworking`, `leatherwork` — are reached
routinely. The century seed, at 2 known and 0 past the roots, is the **only one
of the twenty that never gets past a root node**.

`AGENTS.md` says in as many words that the century scenario is chaotic and that
one run of it is not evidence about anything. This plan quotes that rule in its
own risk section and then rested its ordering on exactly that. The instrumented
run was real; generalising from it was the error.

**The gate is the population, and transmission is a symptom of it.** Sorting the
cohort by survival sorts it by the climb: the two seeds that collapse below a
quarter of their peak are the two worst climbs. Teaching tracks adult person-days
almost exactly — 24 things passed on in a world with 1,405 of them, 194 in a
world with twice that — because a lesson needs somebody who knows something and
somebody with the years to be taught, and a halved population has neither.

**What this changes for the milestone.** The four-hypothesis list below is
answered: transmission is refuted, the idea cap is refuted, and **the food-supply
pass in M8.1 is the tech-rate fix**, exactly as the fourth point guessed. The
order of the tiers does not change — M8.1 still comes first — but the reason it
comes first is population, not teaching. Nothing in this plan should be built to
make teaching cheaper on the strength of the century run.

### M8.0 — the pass that came first: done, 2026-09-08

The deliverable was a measurement and at most a small change. What shipped:

1. **`sparks-are-various` was measuring the wrong thing** — it reported "8
   distinct spark routes fired" and passed, and all eight routes belonged to
   those same three technologies. It now counts technologies as well as routes
   and asserts both, and reads "8 routes into 3 technologies". **Done.**
2. **`the-tree-is-climbed` was added** and asserts a run of a year or more
   conceives something past the four root nodes. It fails on century today (0 of
   3), as intended, and its comment says plainly that it is a tripwire on the
   worst case rather than the measurement. **Done. It is the gate every tier
   below is held to.**
3. **`sim:seeds` reports the tree**: technologies known at the end, nodes
   conceived past the roots, and things taught or watched, with a mean line and a
   count of worlds that never got past a root node. This is where a change to the
   pace of discovery is judged. **Done.**
4. **`MAX_IDEAS` and `STALE_DAYS`: measured and refuted, and nothing changed.**
   Raising `MAX_IDEAS` from 2 to 4 across the twenty-seed cohort moved
   technologies known from 5.4 to 5.5 and nodes past the roots from 4.2 to 4.3 —
   far inside the ten-point floor this project already knows ten seeds cannot
   resolve. The instrumented run says why: an adult held a full slate on 539 of
   1,405 person-days, but on only **20** of those was an idea open that the cap
   was actually blocking.
5. **Transmission rates: refuted as the bottleneck.** See above.
6. **The population is collapsing: confirmed, and it is the gate.** Two of twenty
   worlds fall below a quarter of their peak, and those two are the two worst
   climbs. `population-persists` and `the-tree-is-climbed` are now two views of
   one defect on the century seed.

**One new finding, and it blocked M8.1 — fixed 2026-09-08.** `tracking` is a root
node that every adult qualifies for on every day of their life, and it was
conceived in **none** of twelve instrumented worlds: its weight-1.0 route needs
`saw: quarry_escaped`, which happens twice in two years, and its other two
routes have never carried an idea. M8.1 puts **`snares` and `taming` behind
`tracking`**, so both would have shipped unreachable — the `leatherwork` failure
again. Fixed by adding a fourth, ordinary route — `{ doing: forage, place:
forest }` — measured across twenty seeds before and after: see `changelog.md`
and `bugs.md`. `marking`'s weight-1.0 route needs `saw: store_empty`, which
still never happens, because `Brain` scores stores by what is in them and never
sends anyone to an empty one — `marking` survives on its other two routes, so
this one is left open and does not block M8.1.

> **Do not ship a comment asserting a cause you have not confirmed.** Every claim
> in this section is now measured across the canonical cohort. The claims it
> replaces were measured on one seed, and that is exactly how they went wrong.

---

## The era ladder

> **Shipped 2026-09-16**, as far as the technologies that exist allow — see
> `changelog.md`, "The ages get their real names". What is live is the bottom of
> this table with two changes, both argued in the doc comment on `ERAS`: a
> **Middle Palaeolithic** rung this table did not have, holding `firemaking`
> alone, because without it a band that has carried fire for three generations
> still reads as Lower Palaeolithic and the one rung a short run reliably climbs
> would not exist; and `netting` in the Mesolithic where the table says
> `preserving`, which is the M8.1 node held back with spoilage. **The Neolithic
> rung shipped 2026-09-21**, in M11 phase 10's third commit, the one that
> finally gave it all three of `farming`, `herding` and `masonry` — held back
> until then because a rung whose `needs` name a technology nobody can learn is
> declared content that does nothing, which `eras-name-only-real-technologies`
> exists to catch. The rungs above it are still not in the code, for the same
> reason.
>
> The `age` and `firstKnown` axes below also shipped in that pass, on all
> thirty-two existing nodes. **Every node this document adds needs both**, and
> the age test refuses a node dated earlier than something it rests on.

`ERAS` in `knowledge/Tech.ts` is replaced. The real period is the `label`; the
evocative line the project already wrote survives as the `description`.

| id | label | description | adds to `needs` | `heldBy` |
|---|---|---|---|---|
| `lower_palaeolithic` | Lower Palaeolithic | Flint, sticks, and what the land offers. | — | 0 |
| `upper_palaeolithic` | Upper Palaeolithic | Fire carried, hide sewn, and a winter night that can be survived. | firemaking, hafting, clothing, cooking | 0.35 |
| `mesolithic` | Mesolithic | The bow, the net and the snare — food you go and take rather than food you find. | + bow, fishing, preserving | 0.35 |
| `neolithic` | Neolithic | Seed saved from one year to sow the next, and a herd that comes back on its own legs. | + farming, herding, pottery, masonry | 0.3 |
| `chalcolithic` | Chalcolithic | The first metal: hammered cold, and then smelted hot. | + kiln, smelting | 0.25 |
| `bronze` | Bronze Age | Two ores worth nothing apart, and an edge that can be poured. | + alloying, writing | 0.2 |
| `iron` | Iron Age | The edge everybody can have. | + bloomery, forging | 0.15 |

Two invariants must survive, both already asserted in `tech.test.ts`: `needs` is
cumulative and never shrinks, and `eraFor` takes the *furthest* era whose
condition holds, so a world can still fall back down the list when a generation
dies badly.

**`heldBy` falls as the ladder climbs, deliberately.** A smith is a specialist
and always was; requiring a third of a band to know bloomery smelting would make
the Iron Age unreachable for reasons that have nothing to do with knowledge.

**Two existing tests hardcode the era ids** `stone` and `fire`, so renaming is a
test change as well as a data change. That is the spec being out of date rather
than the game being broken — but check which it is before editing a test. The HUD
and the health report both read `stats.era`, which is the *label*, so they need
nothing.

> **It was three, not two.** `e2e/smoke.spec.ts` also asserted the top bar reads
> "Stone Age" — the label, exactly as this paragraph says nothing would — and
> `Simulation` held a fourth copy of the first rung, hand-written as a field
> initialiser, which is the same "second list nothing keeps in step" defect
> `ERA_ORDER` was derived to fix. It now reads `ERAS[0]`.

**Say the honest thing in the doc comment:** on a 128x128 island with three bands
of ten, a playthrough will usually stop in the Neolithic, and that is the correct
outcome rather than a bug. What lets a world past it is exactly what let ours —
population growth, writing and teaching holding a chain longer than one life, and
trade between bands. If the upper ladder proves unreachable *in principle* rather
than merely rare, the levers are population and transmission, never
`conceptionBase`.

---

## Three new axes

**`TechDef.age: AgeId`** — the period a node belongs to. It drives the tech web's
radius, groups the tables below, and is what makes the tree legible as history. A
test asserts a node's `age` is never earlier than any of its prerequisites'.

> **`age` is descriptive; `requires` is still the gate.** `age` says when *our*
> species got there and is what the web draws. `requires` says what this person
> must already understand. They deliberately do not agree: `writing` sits in the
> Bronze Age because that is when writing happened, while its prerequisites are
> only `marking` and `stoneworking`, so a lucky band can invent it in the
> Mesolithic. That anachronism is the player's to earn. It is the same
> distinction the project already draws between `requires` and `sparks`, and it
> needs saying in the doc comment or somebody will "fix" it by gating on the age.

**`TechDef.firstKnown: string`** — a plain line, "about 40,000 years ago" or
"about 3300 BC", shown in the tech web's detail pane. Free to add, and it is most
of what "as realistic as possible to human history" actually asks for: the player
finds out that the needle is older than the pot, and that iron is younger than
writing.

**Two new skills, `farm` and `smith`, and two new domains, `metal` and `water`.**
Ten skills cover twenty-nine verbs already, and tillage and metalwork are not
`build`. Note that **`heal` and `cook` are currently never practised by any
action** — `herbalism` and the food-processing nodes finally give both a job.

The skills land in pass 6 with the jobs table that names them, **not** in the
middle of a content tier: `SKILLS` is iterated by `Founding`, by `Person`'s
constructor, by `LifeSystem.ageSkills` and by `NewGame`'s point-buy budget (60
points across ten skills; it becomes twelve), and hiding that migration inside a
content pass is how it goes wrong quietly.

## Where the seventeen existing nodes land

Nothing moves and nothing changes; they are only labelled, which is what lets the
web draw the picture.

| age | existing nodes |
|---|---|
| Lower Palaeolithic | firemaking, stoneworking, hafting, cordage, plant_lore, tracking, spear |
| Upper Palaeolithic | clothing, cooking, leatherwork, marking |
| Mesolithic | bow, carpentry |
| Neolithic | pottery |
| Bronze Age | writing, clay_tablet, library |

---

## M8.1 — Upper Palaeolithic and Mesolithic

Fourteen nodes, and the pass that finally answers `next-steps.md` section 0: the
island is short of food, and only supply can fix it. Fish, snares, traps and
preserving are supply, and they are historically what the Mesolithic *was*.

**`fishing` and mechanism 2 shipped 2026-09-08** — see `changelog.md`. Measured
across twenty seeds: mean survival 76.2% → 79.2%, technologies known 6.2 →
6.5, fish caught in 20 of 20 seeds.

**`basketry`, `netting`, `snares`, `fish_trap` and mechanism 3 shipped
2026-09-09.** Measured across twenty seeds of the new `traps` scenario against
the same scenario without the trap half of the ladder: mean survival 89.8% either
way, 0 collapses against 1, infant starvation 6 against 12 and adult starvation
53 against 38. Traps caught 10-268 items a run and were emptied in every seed.
Two design corrections came out of measuring rather than out of the plan, and both
are in `changelog.md`: traps must not compete with a half-dug storage pit for a
band's two site slots, and **nothing walks to a trap out of hunger** — `Brain`
needed a second route to `take`, the round, or traps stand full for fifty
trap-days a run while people go hungry beside them.

**Still to come in this tier: nine nodes** — `bone_working`, `tailoring`,
`preserving`, `grinding`, `atlatl`, `ochre`, `flute`, `herbalism`, `taming` — and
mechanisms 4 (crafting stations) and 1 (spoilage, last and alone).

| node | domain | requires | what it does, and where that is read |
|---|---|---|---|
| `bone_working` | beasts | hafting | `doHunt` yields `bone` and `sinew` beside meat and hide; `bone_point` gets an `ItemDef.weapon` block read through `weaponOf`; a `needle` recipe |
| `tailoring` | cloth | clothing, bone_working | a third term in `warmthFrom`, and a `fur_coat` item — the eyed needle is what let people live in the cold |
| `fishing` | water | spear | a new food channel off the shore; mechanism 2. **Shipped 2026-09-08** |
| `netting` | water | cordage, fishing | a `net` item, and one branch in `forageYieldFactor`. **Shipped 2026-09-09** |
| `fish_trap` | water | netting, basketry | passive yield; mechanism 3. **Shipped 2026-09-09** |
| `snares` | beasts | cordage, tracking | passive small game; mechanism 3. **Shipped 2026-09-09** |
| `preserving` | fire | firemaking, plant_lore | multiplies `spoilTicks`; a `drying_rack` building. Mechanism 1 |
| `grinding` | plants | stoneworking | a `quern` station and a `meal` item; the companion to `nutritionFactor` |
| `atlatl` | beasts | spear | a weapon between spear and bow in `reach` and `hunt`. It precedes the bow historically, so it requires only `spear` |
| `basketry` | cloth | cordage | a `basket` item raising `carryFactor`. **Shipped 2026-09-09**, without the "cheap material for stores" half: retrofitting a basket into `storage_pit`'s materials would have made the pit unbuildable until somebody could weave, which is the granary defect in miniature |
| `ochre` | stone | firemaking | a third `INSCRIPTIONS` form: cheap, holds one technology, perishes fast, legible to anyone who knows `ochre` rather than `writing`. A picture is readable where a script is not, and that is the historical point |
| `flute` | beasts | bone_working | a `play` action relieving the `company` need in a radius. Today `company` is answered only by `talk` |
| `herbalism` | plants | plant_lore | a `tend` action — **the first use the `heal` skill has ever had** — raising `recoveryRate` on the treated person |
| `taming` | beasts | tracking | reads `Animal.fedBy` and `Animal.temperament`, inert by design since M6a. A fed animal follows; a dog raises the hunt roll and shrinks `noticeRadius` |

## M8.2 — Neolithic

Seventeen nodes. The pass where a band stops moving to the food.

| node | domain | requires | what it does |
|---|---|---|---|
| `ground_stone` | stone | stoneworking, hafting | polished axe and adze: felling, and a term in `buildFactor`. **Shipped 2026-09-21** (M11 phase 10), and it repaired the long-standing `handaxe`-bypasses-`techPower` bug this document's "three repairs" section names, via a new `Tech.axeFactor` |
| `spinning` | cloth | cordage | `thread`. **Shipped 2026-09-21** (M11 phase 10), in the same commit as `weaving` — thread has no reason to exist without the loom |
| `weaving` | cloth | spinning, basketry | a `loom` station and a `cloth` item: warmth, and the first thing worth trading. **Shipped 2026-09-21** |
| `farming` | plants | plant_lore, grinding | **fields. Shipped 2026-09-17.** A `field` design carrying a `Crop`, `sow` and `reap` (tilling folded into sowing), a `grain` item, wild cereal to take it from, and the three soil layers of `core/Soil.ts` under all of it. Returns `farming` to `TECHS` and closes the oldest open entry in `next-steps.md`. See `changelog.md` for the two designs that were measured and rejected on the way |
| `sickle` | plants | farming, hafting | reaping speed. **Shipped 2026-09-21** (M11 phase 10), via a `Tech.reapFactor` term on `REAP_TICKS` |
| `bread` | fire | grinding, farming, firemaking | an `oven` station; `bread`, high nutrition and long keeping. **Shipped 2026-09-21** (M11 phase 10) |
| `brewing` | fire | pottery, farming | `beer`: relieves `company`, raises opinion at a feast. Neolithic, and social |
| `herding` | beasts | taming | a `pen` building and penned livestock that breed. Renewable meat. **Shipped 2026-09-21** (M11 phase 10, third commit) — the one node in this tier needing a real mechanism, reusing `Building.store`/`doTake` rather than a new verb, with growth proportional to what a pen already holds. Also closes the Neolithic rung of `ERAS`, its last dependency |
| `dairying` | beasts | herding, pottery | `milk`, and `cheese` once `preserving` is known |
| `wool` | cloth | herding, spinning | warmer cloth than flax |
| `wattle_daub` | timber | carpentry, cordage | a cheaper, warmer hut than the mud hut. **Shipped 2026-09-21** (M11 phase 10), as `wattle_hut` — no wood in its materials at all, which is the honest version of "cheaper" |
| `masonry` | stone | stoneworking, carpentry | a `stone_house` with the best shelter in the game — and the worked stone M7's walls will want. **Shipped 2026-09-21** (M11 phase 10); the worked-stone-for-M7 half is still to come |
| `kiln` | fire | pottery, masonry | the **first crafting station** (mechanism 4); better pots, and the temperature that leads to metal. The pivot node of the whole ladder. **Shipped 2026-09-21** (M11 phase 10, fourth commit) as `RECIPES.kiln_pot` — a second, cheaper-in-mud recipe for `pottery` rather than a `station: 'kiln'` retrofit onto `pot`, because the two would otherwise have competed on identical terms and `Brain`'s craft scorer has nothing that would ever let the station one win. The metal half of "the pivot node" is M8.3's to build |
| `well` | stone | masonry | water away from the shore. **The first technology to touch thirst at all. Shipped 2026-09-21** (M11 phase 10, fifth commit). No new verb: `ActionSystem.waterWithinReach` and `Brain.findWater` both accept a well the way they already accept a water tile, and neither checks band ownership |
| `calendar` | plants | marking, farming | sowing in the right season: a yield term, and a hint from the elders. **Shipped 2026-09-21** (M11 phase 10), via `Tech.calendarFactor` on `doReap`'s grasp term; no hint from the elders yet |
| `the_wheel` | timber | carpentry, ground_stone | a cart: capacity and speed on `haul`, a real action with a real scorer. **Shipped 2026-09-21** (M11 phase 10) as a `carryFactor` term — capacity only. The "speed" half is deliberately not built: this game has no ladenness penalty for a cart to answer, and inventing one to make the claim true was out of scope for a numeric-term commit |
| `trade` | cloth | marking | a `barter` action between bands reading `ItemDef.baseValue` — **which today only `doSteal` reads.** Pairs with the owner's O4 |

## M8.3 — Chalcolithic and Bronze

Ten nodes, and the pass that puts ore in the world.

| node | domain | requires | what it does |
|---|---|---|---|
| `charcoal` | fire | firemaking, carpentry | a charcoal pit; `charcoal` burns hotter than wood and is the prerequisite for every furnace below |
| `mining` | stone | ground_stone, hafting | new resource nodes — `copper_ore` in hills and rock, `tin_ore` rare — and a `mine` verb |
| `native_copper` | metal | stoneworking | cold-hammered `copper`: awls and ornaments. The first metal anyone actually used |
| `smelting` | metal | native_copper, charcoal, kiln | a `furnace` station: copper out of ore |
| `bellows` | metal | smelting, leatherwork | furnace yield and speed — the enabling technology, not a flourish |
| `casting` | metal | smelting, pottery | moulds; `copper_axe` and `copper_dagger` |
| `alloying` | metal | casting, mining | tin and copper: `bronze` |
| `bronze_tools` | metal | alloying | axe, adze, sickle — work rates across the whole economy |
| `bronze_arms` | metal | alloying, spear | sword and helm. **`armourOf` finally goes through `techPower`** |
| `goldwork` | metal | native_copper | ornaments: standing, and the highest `baseValue` in the game |

## M8.4 — Iron

Six nodes.

| node | domain | requires | what it does |
|---|---|---|---|
| `bog_iron` | metal | mining, smelting | `iron_ore` on wet ground — `beach` tiles through the `shoreHash` that already exists, since `BIOMES` has no marsh and does not need one. This is exactly how an island gets iron, and it needs no mountain |
| `bloomery` | metal | bog_iron, bellows | the bloom |
| `forging` | metal | bloomery | hammer and anvil; `wrought_iron` into tools |
| `carburising` | metal | forging, charcoal | `steel`: the best edge in the game |
| `iron_tools` | metal | forging | the point of iron — ore is common, so this is the first metal *everybody* can have, and its effect is economy-wide rather than elite |
| `ploughshare` | plants | iron_tools, farming, herding | the ox-drawn ard, and the surplus everything else was waiting on |

**Sixty-five nodes in total: seventeen existing, forty-eight new.**

---

# The mechanisms

Each is a real subsystem, and each is the reason its tier cannot be "just add
nodes". These designs were validated against the code; line numbers are from
2026-09-08.

## Order, and why

**fishing, then traps, then stations, then spoilage.** `bugs.md` says total food
is the constraint and redistribution cannot help; spoilage is a supply *cut*.
Doing it first spends the whole milestone's risk budget on a change that makes
the world worse, and then hides the fishing gain inside the recovery. **Spoilage
ships alone, in its own commit, last.**

## A seed trap that sits above all four

`Simulation`'s constructor shares **one `spawnRng`** across `spawnResources`,
`spawnHerds` and `spawnPeople` (Simulation.ts:308-310). **Adding an entry to the
plan array in `spawnResources` shifts every subsequent draw** — herds move,
people move, every pinned world and every scenario baseline changes.

This is not a fork-order violation, so **`determinism.test.ts` will not catch
it**, and it silently makes every before/after measurement in this milestone
meaningless. Mitigation: fork a dedicated stream, **appended**, and spawn the new
resource in its own pass *after* `spawnPeople`. The pre-change world is then
bit-identical except for the thing you added.

> And a second, related trap. The named fork block ends at `recordRng`
> (Simulation.ts:279) with a comment saying to append there — but there is a
> **fourteenth, anonymous fork twenty-five lines below it**, `seedInitialForest`
> at Simulation.ts:304. Appending where the comment invites you to consumes the
> draw that fork expects and silently replants every forest in every saved seed.
> Either hoist that fork into the named block first, as its own commit with the
> determinism test run against it, or append genuinely last.

**None of the four mechanisms needs a new RNG stream** if accrual and decay are
deterministic. That is a design advantage worth stating in the commit message
rather than an accident.

## Mechanism 1 — Spoilage

`ItemDef.spoilTicks` is declared and **read nowhere in the codebase** — the
largest piece of inert data in the game, and the thing `preserving` must
multiply.

**Shape: a per-inventory freshness carry, swept once a day.** `Inventory` gains
`spoilage: Map<string, number>` holding accumulated fractional loss for
perishable ids only, and one method `spoil(elapsedTicks, factorFor)`. All
thirty-six `add`/`remove` call sites are untouched, and `count`, `has`,
`entries`, `total` and `bestFood` are unchanged — so "a plain map of id to count"
stays true for every reader that relies on it.

Two alternatives were considered and rejected. A **decay roll per stack** needs
an appended fork and injects variance into the exact system ten seeds cannot
resolve. An **age-cohort list** tells the nicer story — a pile picked on day 3
rots on day 13 whatever you add on day 9 — but needs the day at every `add`,
which is a signature change at thirty-six sites or module-global mutable state,
for three to five times the code. Note it as the upgrade path if per-batch
preservation is ever wanted.

**Deliberate honesty: adding fresh units does not reset the carry.** That is the
same trade `architecture.md` already made keeping per-unit quality out of
`Inventory`'s stacks. Say so in a comment, and assert it in a test rather than
leaving it to be discovered.

**The sweep** runs in the daily block, immediately after `refreshRecords()` —
beside the other thing in this world that rots — over four collections: every
living person's pack, `building.store` and `building.delivered`, `pile.contents`,
and `household.store`.

> **`household.store` is a write-only black hole.** `LifeSystem.ts:243` puts a
> dead person's goods there and **nothing anywhere ever reads it** — verified by
> grep. Spoiling it is correct, but it must not be counted as the feature
> working. Recorded in `bugs.md` as a separate defect.

**The multiplier.** Packs go through `spoilFactor(person)` in `Tech.ts`, beside
`forageYieldFactor` — every effect through `techPower`, per the standing rule.
Buildings get **`BuildingDef.preserves?: number`**, because a person-based factor
is wrong for a thing owned by a band, and baking the storer's power in at deposit
time would need per-unit state. A `drying_rack` at `preserves: 0.35` is then a
real second reason to build one, and the granary gets `0.6`.

**Cost.** About 140 inventories of ~4 stacks is ~600 map entries a day, one
lookup and one float add each: roughly **2.5 map operations per step** amortised,
three to four orders of magnitude below the noise floor at 4,200 steps/s. A
*per-tick* sweep would be ~600 ops/step, comparable to the whole of
`NeedsSystem.update`, and is the version to refuse.

**Staging — the part that matters.**

| stage | ships | measured |
|---|---|---|
| 0 | full machinery with `spoilRate` defaulting to **0**, plus a `would_spoil_*` dry-run counter that accrues without removing anything | `sim:seeds --seeds 20` baseline *with the code in place*, so "the sweep changed the world" and "spoilage changed the world" are two separate measurements |
| 1 | nothing | read `would_spoil_*` against `harvest_*`. **This sizes the change before paying for it**: under 2% and the feature is inert and `spoilTicks` is wrong; 40% of everything stored and the numbers are lethal. The cheapest possible way to size a change ten seeds cannot resolve |
| 2 | — | fishing and traps have landed and been measured |
| 3 | `spoilRate: 1` | `sim:seeds --seeds 20` comparing (fishing on, spoilage off) against (both on). That pair is the only one that isolates spoilage |

**Risks.** The sharpest is **the larder gate**: `Brain` scores a store by
`min(1, store.total / LARDER_WORTH_THE_WALK)`. Spoilage shrinks totals, lowers
`take` scores, and pushes people back onto bushes in winter — the exact failure
the larder fix repaired, which took mean survival from 40% to 59% and remains the
largest single change in this project's history. Watch withdrawals and the
`store` column, not just survival. And `stats().stored` will fall for two
different reasons at once (less deposited, more rotted); the telemetry split is
what tells them apart.

**Checks.** `food-spoils` is trivially failing before, so keep it. Do **not**
write `stores-are-emptied-before-they-rot` yet — it is the shape of the two
larder checks that were deleted for looking reassuring and detecting nothing.
Write it only after measuring it against a build with `spoilRate` ten times too
high, and delete it if the distributions overlap.

## Mechanism 2 — Fishing

**Shape: a new `ResourceKind`.** It reuses the most machinery by a wide margin,
and one property settles it: `doHarvest` already computes `answers: 'hunger'`
from the item's nutrition, so a fish node inherits the food-work exemption, the
lookahead interruption and the stop/resume reporting **with no new code at all**.

The alternatives cost more for less. A **`doFish` action against water** needs a
new `execute` case, a new long action with its own interruption check, a new
scorer term, a new `FoundTargets` field, a depletion model invented from scratch,
and an addition to the shore-routing clause in `Simulation.order` or clicking
water offers "Fish" and then refuses "they cannot walk there". **Animal-style
shoals** are worse still: `MovementSystem` is built on `world.isWalkable` and
water is not walkable, so a swimming entity needs a second notion of passable
ground. That is a world-model change, not a fishing feature.

Two food predicates are hardcoded to berries and must become data-driven **in one
place, not two** — `Brain`'s forage filter (Brain.ts:236) and
`Simulation.stats().foodInWorld` (Simulation.ts:1682) both test
`n.kind === 'berries'`. Two copies of "what counts as food" is exactly the drift
the house style rule exists to prevent.

`netting` is then **one branch in `forageYieldFactor`** and no new code path.

Two things that will bite:

- **`NODE_LABELS` in the HUD is a plain record and is not compiler-enforced**,
  unlike `RESOURCE_COLORS` in the renderer, which is keyed on `ResourceKind`. A
  missing entry silently prints the raw id. Add it.
- **`ResourceNode.regrow` scales by `time.growth`, which is zero in deep
  winter** — so fish would stop replenishing exactly when they are needed, which
  is the whole point of adding them. Either accept it as the design or give the
  kind a winter floor, but **decide deliberately and write down which**.

Bands sited inland will never see a fishing spot and the feature will report n/a
across the suite, so this needs a `coast` scenario rather than stretching
`craft`, whose numbers other checks read as a baseline.

## Mechanism 3 — Passive traps

**Shipped 2026-09-09.** The design below survived contact almost intact — all
three caveats were real and all three bit — but two things it did not predict are
recorded in `changelog.md` and worth reading before mechanism 4: a trap must not
compete with a half-finished store for a band's site slots, and the scorer needed
a *second* route to `take` rather than a bigger coefficient on the first.

**Shape: a `Building` with a `yields` field**, plus `requiresShore` for the fish
trap, since `canPlace` has no per-design placement predicate today. `Building`
already supplies everything the requirement asks for — `ownerBandId` for the
owner, `place`/`canPlace` and the build menu for placement, `store` for
accumulation, `doTake` and `reachBuilding` for collection — reusing nine existing
systems against a new entity's zero. `Inscription` is the precedent for the other
route and it touched about twelve files; promote to it only if stealing from a
rival's snare turns out to matter. An `ItemPile` variant is not viable: piles are
removed when emptied, so a trap would vanish the moment it was collected.

Accrual is one deterministic loop in the daily block beside the spoilage sweep.
**The fractional-carry arithmetic is the same one spoilage needs — write it
once**, in `core/Progress.ts` beside `workProgressOf`. Two copies is the drift
the house style rule exists to prevent.

**Three caveats, each a real and findable bug:**

1. **Do not ship a 1x1 trap.** `reachBuilding` requires
   `building.contains(person.x, person.y)` at margin 0, a 1x1 building spans half
   a tile either side of its centre, and movement stops within 0.6 tiles of it —
   so a person can arrive and never be "inside", giving **an infinite walk loop
   with no interruption check in it**. Make traps 2x2, or give `reachBuilding` a
   margin.
2. **Traps must be excluded from both building counts.** `planBuildings`' hard
   ceiling counts *all* complete buildings, so five snares would stop a band ever
   raising another hut, and `bands-dont-overbuild` would fail for the same
   reason.
3. **No band will ever plan one.** `planBuildings` only wants shelter or storage,
   and a trap is neither — which is exactly the granary and longhouse failure
   that `architecture.md` and `bugs.md` both name. It needs a third branch.

And the scorer will not walk to one unaided: an eight-item snare barely clears
the larder floor, and proximity decides everything. Either give traps their own
term or make the larder constant relative to `def.storage`, and read it with
`npm run why` rather than by eye.

## Mechanism 4 — Crafting stations

`RecipeDef` has no station or tool requirement and `doCraft` never looks at a
building. Adding `station?: string` turns out to be unusually cheap, for two
reasons worth recording because neither is obvious:

- **The shared reach helper already exists.** `ActionSystem.reachBuilding`
  (ActionSystem.ts:743) is used by `doHaul`, `doBuild`, `doStore`, `doTake` and
  `doShelter`. Give it an optional predicate and five existing callers are
  unaffected.
- **`Simulation.order` already supports it.** It sets `targetRecipe` before the
  target branches, and the `buildingId` branch sets the rest, so ordering a craft
  with both a recipe and a building works with **no change to `order` at all**.
  Resume works too: `noteStop` captures both and `resumeOrders` passes the
  building id unconditionally.

`doCraft` must **not** search for a station itself — buildings have no spatial
hash, and `optimizations.md` already owns the decision that those scans stay
linear. The scorer and the menu choose the station and pass its id.

**The refusal reaches the player through two channels**, answering two different
questions: `lastRefusal` via `cancelOrder` when the player orders a station
recipe with no station, and `onStopped` into `Simulation.interruptions` when the
kiln is demolished mid-craft. Use a **per-station reason id** rather than a
generic one — it gives `abandoned_no_station_kiln` for free, matching the
existing `completed_<id>` and `harvest_<kind>` idiom, and that counter is the
only way to find out that a station is unreachable and everybody keeps trying
anyway.

`CatalogContext` gains `stationFor`, following `nearWater` — the UI precomputes
it and hands it in, precisely so the catalogue does no world queries. `Brain`'s
craft scorer needs the **`proximityBonus`** the `build`, `store` and `take`
scorers already use; without it a station craft scores identically to a
station-less one while carrying a walk, and it will simply never fire.

> **Do not retrofit a station onto any recipe an existing check or building
> depends on, in this pass.** Adding `station: 'kiln'` to `pot` would break
> `pots-reach-a-granary` *and* make the granary unbuildable again — the defect
> that took four separate fixes to close. Introduce stations on *new* recipes
> (cloth on the loom, flour on the quern) and retrofit the pot later, with
> `craft`'s starting conditions extended and the check re-verified.

Also: the `craft` scenario starts with knowledge and **no buildings**, so any
station-gated recipe reports n/a there — and n/a is not a pass. Either the
scenario places a kiln at founding, or the checks skip honestly.

## Three repairs to make while passing

- **`hafting` does not go through `techPower`.** `doChop` (ActionSystem.ts:679)
  and `Progress.ts:39` both test `inventory.has('handaxe')` and halve the work —
  item presence, unscaled by refinement, where every other effect in the game
  reads the seam. Fix it when `ground_stone` arrives, since that node adds a
  second axe and the bug doubles.
- **`armourOf` bypasses `techPower` too**, so hide armour protects somebody who
  could not make it and refining `leatherwork` does nothing. Fix it when
  `bronze_arms` arrives.
- **`doHunt` uses the bare `REACH` constant** (ActionSystem.ts:936) rather than
  the weapon's, so the bow's `reach: 1.6` does nothing while hunting — the one
  place it should matter most.

---

## Verification

Existing gates stay green at every tier boundary: `npm run typecheck`,
`npm test`, `npm run sim:check:all`, `npm run e2e` (`DYNASTY_PORT` must be set on
this machine — Windows reserves TCP 5111-5210 and swallows Vite's 5173).

**Anything touching the food economy is measured with `npm run sim:seeds --
--seeds 20`, before and after, never by eye and never on one run.** Ten seeds
cannot resolve a change under about ten points, and a strictly better change has
measured nine points worse. That covers all of M8.1 and `farming` in M8.2.

**New scenarios**, using the affordance `craft` and `scribes` already use — move
the starting conditions so a run can reach the thing under test, rather than
weakening the test until it passes:

| scenario | founders start knowing | so that |
|---|---|---|
| `coast` | fishing | bands sited on water, so the fish chain is exercised at all |
| `fishers` | fishing, netting, preserving | the whole Mesolithic food chain can be measured |
| `farmers` | farming, herding, pottery, grinding | fields, sowing, reaping and a herd run |
| `smiths` | kiln, charcoal, mining, smelting | the metal chain is reachable inside a run |

**New checks in `tools/simcheck.ts`, each verified to fail on the build without
its feature** before it is kept:

| check | asserts |
|---|---|
| `the-tree-is-climbed` | a long run conceives technologies beyond the root nodes. The M8.0 gate every tier is held to; `sparks-are-various` is amended to count technologies, not routes |
| `food-spoils` | stored food falls over a season with nobody eating it |
| `preserving-keeps-food` | the same run with `preserving` loses measurably less |
| `fish-are-caught` | fishing produces food; skips honestly when no band's region has a fishing spot |
| `traps-yield-and-are-emptied` | a snare left alone accrues and is collected, and `trap_full` stays a small share of `trap_yield` |
| `fields-are-sown-and-reaped` | the whole till, sow, reap, grain chain completes across a year |
| `herds-breed-and-are-culled` | penned livestock increase, and are eaten |
| `stations-are-required` | a station recipe refuses away from its station, **with a reason the player is given** |
| `crafts-happen-at-stations` | goods are made at stations, with `abandoned_no_station_*` small |
| `ore-becomes-metal` | mine, charcoal, smelt, cast completes on `smiths` |
| `ages-advance-and-fall-back` | a world climbs the era ladder and can lose a rung |

**New unit tests:**

- `tech.test.ts` — a node's `age` is never earlier than any prerequisite's; the
  era table stays cumulative; every new building material and recipe output is
  producible; **`recipe.station` names a building that exists** — without that
  last one, `station: 'kiln'` with no kiln in `BUILDINGS` is exactly the
  `requiresTech: 'carpentry'` longhouse defect and every other test passes.
- `world.test.ts` — a non-perishable stack never spoils; the last unit is lost
  rather than rounding away; **adding to a stack does not reset its carry**,
  which states the decision rather than assuming it.
- `orders.test.ts` — a station recipe refuses away from its station and says why;
  a person walks to the kiln and finishes there.
- `synthesis.test.ts` — its existing guards do most of the work for forty-eight
  new nodes: two sparks each, every ingredient real, every `knows:` also in
  `requires`, every ingredient renderable to prose, and at least one route built
  from ordinary things — the check that caught `leatherwork` shipping
  unreachable. Any new verb needs an entry in `DOING_WORDS` or it fails.
- `techweb.test.ts` — determinism at sixty-five nodes, no overlap at the
  separation the layout actually enforces, every edge with both endpoints.

**Manual pass** — `npm run shots`, then: the tech web zoomed out to seven
labelled age bands and zoomed in on one; a fish trap being emptied; a field
between sowing and harvest; a furnace lit; a drying rack in autumn.

---

## Risks

- **The largest risk is that none of it is ever reached.** Three of seventeen
  nodes are conceived in two in-game years. Forty-eight more would be a tree
  whose upper four-fifths no player ever sees — the inert-content rule failing at
  the scale of a whole milestone rather than one node. M8.0 exists to answer this
  first, and `the-tree-is-climbed` is the gate afterwards.
- **Spoilage is the dangerous mechanism.** It makes every existing food stock
  worse from the tick it ships, in a world `bugs.md` already describes as
  supporting its population "only just". Staged, dry-run-sized, shipped alone and
  revertible as one commit. If mean survival drops and does not come back, the
  honest answer is to keep the supply half and hold the decay half.
- **Forty-eight nodes is forty-eight chances to ship inert content.**
  `techs-have-effects` only checks that a `site` string exists — it is prose.
  Every tier needs a *world* check that the chain it added actually runs.
- **A spark can deadlock the tree.** Every node needs one route made of ordinary
  things, or it is unreachable in play while passing every static test. That was
  the `leatherwork` failure and it will recur in the metal tiers, where every
  obvious ingredient is scarce by design.
- **Two new skills change every character in the world.** Founding, inheritance,
  ageing and the point-buy budget all iterate `SKILLS`. Pass 6, alone, with the
  determinism test run first.
- **`century` is chaotic** and `population-persists` already fails at 10 against
  11. Do not read one run of it as evidence about any of this.
