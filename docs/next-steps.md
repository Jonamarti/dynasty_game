# Next steps

Rewritten 2026-09-08. Ordered, with the reason for the order.

The previous version was written on 2026-09-02 and amended in place for a week.
By the end it described the tech tree as "ten nodes so far" when there were
seventeen, listed weapons and knowledge-transmission as future work when both had
shipped, and marked two of the owner's requests done inside a section that said
nothing was scheduled. It has been rewritten rather than amended again.

---

## Where things actually stand

`npm run sim:check` on the default twelve-day scenario: **37 of 37 applicable
checks pass**, 15 n/a, 4,071 steps/s against a 2,000 floor.

| milestone | state |
|---|---|
| M0–M5 | shipped |
| M6a — hands, households, hooves | shipped 2026-09-02 |
| M6c — the reported bugs | shipped 2026-09-02 |
| The winter economy (distribution half) | shipped 2026-09-02 |
| M6b phase 1 — the tech tree becomes a registry | shipped 2026-09-05 |
| M6b phase 2 — the mind, and where ideas come from | shipped 2026-09-06 |
| M6b phase 3 — the tech web | shipped 2026-09-06 |
| Pass A — reachable content, continuous movement | shipped 2026-09-06 |
| M6b phase 4 — how knowledge travels | shipped 2026-09-07 |
| M6b phase 5 — recipes, weapons, the loop you can see | shipped 2026-09-07 |
| M6b phase 6 — jobs and rebellion | shipped 2026-09-08 |
| M6b phase 7 — the visualisers, and a tech web that scales | shipped 2026-09-08 |
| M6b phase 8 — the content nodes | **superseded** by [m8_plan_the_ages.md](m8_plan_the_ages.md) |
| Fix `tracking`'s spark, the M8.1 blocker | shipped 2026-09-08 |
| M8.1 — `fishing`, mechanism 2 | shipped 2026-09-08 |
| **M8.1 — the remaining thirteen nodes; traps, stations, spoilage** | **next** |
| M8.2–M8.4 — the rest of The Ages | planned; see that document |
| M7 — A\*, walls, interiors, beds | not started, and lands alone |
| Owner's list O1–O5 | untouched. O6 and O7 shipped in pass A |

Seventeen technologies, five recipes, seven buildings, seventeen items,
twenty-nine actions, twelve skills (`farm` and `smith` new, and unused until
M8), four jobs, six domains, six eras, three full-screen graphs (`G`/`K`/`T`).

---

## The order, and why it is this order

1. ~~**Phase 6 — jobs and rebellion.**~~ **Done, 2026-09-08**: see below and
   [changelog.md](changelog.md). Chosen by the project owner ahead of the tech
   ladder, and it also carried the two new skills (`farm`, `smith`) that M8
   needs, because `SKILLS` is iterated by founding, inheritance, ageing and the
   character-creation point budget and that migration was not allowed to hide
   inside a content pass.
2. ~~**Phase 7 — the visualisers, and a tech web that scales.**~~ **Done,
   2026-09-08**: see below and [changelog.md](changelog.md). The family tree
   and the tribe graph, and the tech web rebuilt — it was measurably at its
   geometric limit and M8 triples the node count, so this had to happen before
   the tree grows, not after.
3. ~~**M8.0 — why the tree is barely climbed.**~~ **Done, 2026-09-08**, and it
   corrected its own premise: see below.
4. ~~**Fix `tracking`.**~~ **Done, 2026-09-08**: see below and
   [changelog.md](changelog.md). It was unreachable in play and M8.1 puts two
   nodes behind it.
5. **M8.1–M8.4 — The Ages**, the ladder to iron in four tiers. Unblocked; not
   started.
6. **M7**, alone, whenever it is picked up.

---

## 0. The finding that reordered this list, and what M8.0 found instead

**Written on one run; corrected on 2026-09-08 across twenty seeds.** The original
finding was that a two-year `century` run ends with two technologies known to
anybody and only three of the seventeen nodes ever conceived — `cordage`,
`plant_lore` and `firemaking` — and that the rate of discovery is therefore set
by **transmission**.

Every number in that run reproduces. It is also **the worst of twenty**.
`npm run sim:seeds -- --seeds 20` now reports the tree beside the population, and
across the canonical cohort the same scenario averages **5.4 technologies known
at the end, 4.2 conceived past the root nodes, and 124 things taught or picked up
by watching**, reaching depth two routinely. The century seed is the only one of
the twenty that never gets past a root node.

**The gate is the population.** Sorting the cohort by survival sorts it by the
climb — the two worlds that collapse below a quarter of their peak are the two
worst climbs — and teaching tracks adult person-days almost exactly, so the thin
transmission on the century seed is a symptom of the collapse rather than its
cause. Which means **section 1 below, food supply, is also the tech-rate fix**,
and the order of this list is unchanged for a different reason than it was
written for.

`sparks-are-various` now counts technologies as well as routes — it used to
report eight spark routes all belonging to those same three technologies, the
"looks reassuring and detects nothing" failure this project has already deleted
two checks for — and `the-tree-is-climbed` was added beside it. It fails on the
century seed today, deliberately, and is the gate every content tier of M8 is
held to.

**One new blocker for M8.1:** `tracking` is a root node every adult qualifies for
every day of their life, and it was conceived in none of twelve instrumented
worlds, because its main route needs an event that happens twice in two years.
M8.1 puts `snares` and `taming` behind it. Fix the spark before adding the nodes.

Full detail: [m8_plan_the_ages.md](m8_plan_the_ages.md), and `bugs.md`.

## 1. Food supply — the remaining half of the winter problem

The distribution half is done (2026-09-02): mean survival across ten seeds went
from 40% to 59% and nothing collapses any more. Measure with `npm run sim:seeds`
rather than a single run — one `century` is too chaotic to read.

What is left is supply, and **M8.1 is now the plan for it.** Fishing, snares,
fish traps, preserving and grinding are all supply, and they are historically
what the Mesolithic was, so the food answer and the tech ladder turn out to be
the same pass. The three candidates this section used to list are resolved:

1. ~~**Make hunting matter.**~~ Largely done 2026-09-07 by phase 5's weapons.
   `hunts-succeed-and-fail` reports kills against misses where it had always
   reported n/a.
2. **Give the wood a winter role.** Hazelnuts already never spoil. Folded into
   M8.1: `preserving` and `grinding` are exactly this, and an autumn glut worth
   deliberately storing is what a drying rack is for.
3. **Slow the birth rate under pressure.** Still the cheapest lever and still the
   least interesting one. Untried.

Do **not** approach this by tuning `interruption()` or the scorer's food weights.
That ground is covered and the measurements are in the changelog, including two
things that were tried and made it worse.

## 2. M6b phase 6 — jobs and rebellion, shipped 2026-09-08

`Person.job` from a small `JOBS` table (`forager`, `hunter`, `builder`,
`crafter`) in `src/sim/entities/Job.ts`; a job leans its actions' scores up
and the rest of `WORK_ACTIONS` down in `Brain`, with a factor
(`JOB_BIAS_UP`/`_DOWN`) tuned against `sim:check:all` across all seven
scenarios rather than picked once and assumed. Assigning a job to somebody
else is an order, through the new `Simulation.assignJob`, with its own
`ORDER_COST.job`; assigning your own always succeeds. The chief settles
unemployed adults into whichever job the band has fewest of, one a day.

Rebellion stays *derived*, stored nowhere: `BandSystem.daily` gains
`considerRebellion` beside `considerExile`, gated on the single most
aggrieved member's opinion of the chief rather than the band's average — a
finding from instrumenting a real run, not a starting choice, since
`chooseChief`'s daily re-election keeps the band's *average* regard for its
chief comfortably positive throughout. Three rising outcomes: refuse the
chief's orders, leave the band, or challenge for the chiefdom. Asserted
deterministically in `band.test.ts` rather than through `simcheck`, because
it is a rare stochastic event and a two-year run cannot always be expected to
produce one — see [changelog.md](changelog.md).

A sixth HUD tab, Work. And the two new skills, `farm` and `smith`, are in
`SKILLS` now and unused until M8 gives either one an action — see
[bugs.md](bugs.md).

Gates: `jobs-bias-work`, `rebellion-is-rare-but-happens`.

## 3. M6b phase 7 — the visualisers, and a web that scales, shipped 2026-09-08

`src/ui/GraphLayout.ts` is new: the relaxation loop that used to live only in
`TechWebLayout.ts`, extracted so a second and third graph could reuse it
rather than carrying their own copy. `FamilyTree` (`K`) walks
`motherId`/`fatherId`/`spouseId`/`childIds` two generations either way, with
`y` pinned per generation so it reads top to bottom; `TribeGraph` (`T`) is an
opinion-weighted sociogram — edges between any two people the subject knows
who also know each other, not only spokes from the subject — capped at the
twenty-four strongest ties. Both gated through `knowledgeOfPerson` (per node,
not only on the subject: a stranger reached through someone you do know is
still a stranger); both have their `[hidden] { display: none; }`, so the
project's count of times it has got that rule wrong stays at four.

**The tech web was rebuilt in the same pass.** `layOutWeb` no longer fits
itself into a box — it lays out at natural size and `TechWeb.ts` owns a
pan-and-zoom viewport instead, the fix for the fixed-1080x720 problem this
section used to describe. Cross-links kept their two-shared-ingredient
threshold rather than gaining a third: that was tried and measured first, and
it left three edges in the whole current table, so `MAX_SHARED_DEGREE` caps
any one node's shared-spark edges at four instead — `firemaking` alone had
eight before the cap. Collapse-to-a-chip below a zoom threshold is done; radius
staying prerequisite depth rather than becoming "the age" is the one piece of
the original plan not done as written, for a reason recorded in
[changelog.md](changelog.md) and worth revisiting once M8 gives every
technology a real archaeological age.

## 4. M8 — The Ages

Forty-eight new technologies across the Upper Palaeolithic, Mesolithic,
Neolithic, Chalcolithic, Bronze and Iron ages, each shipping with the mechanism
that makes it real — spoilage, fishing, passive traps, crafting stations, fields,
herds, ore and smelting. Eras gain their real archaeological names with the
evocative line kept as the description.

The whole design, the node tables, the four validated mechanisms and their traps:
**[m8_plan_the_ages.md](m8_plan_the_ages.md)**.

## 5. The owner's list, O1–O5

Eight things asked for by the project owner on 2026-09-06. **O6 (continuous
movement) and O7 (clicking a single entity still offers the ground) shipped in
pass A.** The rest are untouched and are not scheduled against each other; the
numbering is only so they can be referred to.

**O4 and O5 are worth more after M8.2.** A band that owns fields, a herd and a
kiln has property worth refusing a rival and property worth burning; today it
owns a storage pit. Doing them after the Neolithic tier is not a delay, it is the
difference between a mechanic and a reason.

### O1. Talking takes far too long, and needs Sims-style modes

`TALK_TICKS` is 45 against `ticksPerDay` 240, so **one conversation is four and a
half in-game hours** — the comment beside it claiming "roughly half an in-game
hour" is wrong by a factor of nine. `SOCIAL_COOLDOWN` at 220 is very nearly a
whole day between deliberate social acts.

What is wanted is not one cheaper conversation but **several kinds**, chosen by
how well two people already know each other: **greeting** (strangers, very
short), **small talk** (shallow acquaintance, and this is the one the current
cost ruins), **asking about interests** (the mode that reveals traits and skills,
and the natural player-facing partner to `social/Knowledge.ts`), and **deep
talk** (long, expensive, worth much more).

`SocialSystem.converse` is the single seam, and `Relationships` already carries
`opinion`, `romance`, `kinship` and `lastContact` — enough to choose a mode with
no new state. Each mode wants its own cost and cooldown. Watch
`ai-uses-many-actions`: conversation competes with foraging for ticks.

### O2. People should be able to talk while working alongside each other

Today `talk` is a whole action, so two people picking the same bush cannot say a
word. `Person.action` is a single string, so "foraging and talking" has nowhere
to live. The cheapest honest shape is a passive periodic pass, like
`KnowledgeSystem.tryObserve`, pairing neighbours who are working within a small
radius and running a cheap `converse` without touching either one's action. It
should feed `company` and `Relationships` and must **not** grant the full value
of a deliberate conversation, or nobody will ever choose `talk` again.

### O3. Working alongside somebody teaches you faster

`Person.practice(skill, amount)` is the single seam every gain goes through, so
this is a per-tick company bonus computed once from `peopleHash` rather than a
multiplier at twenty call sites. Two cautions: skill sets forage yields and
therefore the whole food economy, so measure with `--seeds 20`; and it should
scale with *the best neighbour's* skill, or a crowd of novices teaches itself
expertise.

**This is also a candidate answer to M8.0**, since it is a transmission channel
and transmission is what gates the tree.

### O4. Buildings belong to a tribe, and rivals may be refused the use of them

`Building.ownerBandId` exists and is honoured in exactly one place: `Brain` only
sends somebody to a store belonging to their own band. What is wanted is access
decided by **the relationship between two tribes**, not a hard same-band test.
`normsByBand` and the standing machinery in `social/Authority.ts` are where the
decision lives, and refusal must reach the player through `lastRefusal` — a store
that silently is not offered is exactly what that standing rule exists to
prevent.

### O5. Sabotage, so war between tribes is more than beating people up

`Building` has no condition or hit points — `complete` is a boolean and
`progress` only counts up — so this needs a durability field, a `sabotage` action
with an interruption check, and a decision about whether damage can be repaired
by the work that built it. It pairs with the long-standing gap below: bands have
norms, chiefs, territory and standing with each other, and nothing organises a
raiding party. Sabotage is what a raiding party would be *for*.

## 6. M7 — A\*, walls, interiors, beds

`World.isWalkable` is the single chokepoint walls insert behind.

**This lands alone.** The greedy steerer has produced two of the worst bugs in
this project's history, and replacing the movement system every agent uses every
tick must not share a milestone with anything else. M6a made animals share
`moveToward` with people, so A\* has two callers now.

Gates: `paths-are-found`, `nobody-walled-in`, `people-on-land`, `perf-budget`.

**M8.2's `masonry` is what supplies its walls with a material**, and **boats are
blocked behind it**: `World.sameRegion` forbids crossing water at all, so a
logboat is a movement-system change and belongs here rather than in a content
tier, however Neolithic it is.

## 7. Dynamic tiles

Shovels, canals, moved dirt, defensive trenches, piled rock.

`World.walkable` and `World.biome` are already `Uint8Array`s behind accessors, so
mutating a tile is easy. The expensive part is `World.region`, the flood-filled
landmass index that keeps people from walking at food across water — any tile
change needs incremental region repair, and that is exactly the machinery M7's
walls need. **M8.3's mining is now a second customer.** Build it once in M7 and
both digging and mining become content on top of it.

## 8. Wildlife, second pass

The hooks are already in `Animal`: `temperament` and `fedBy` exist and do
nothing, which is deliberate — adding them later would be a migration.

**M8.1's `taming` and M8.2's `herding` are the pass that finally reads them**, so
most of this section now has a home. What remains outside M8:

- Herbivores that graze real forage and carnivores that hunt them.
- Predators that will take a person, which is the first thing that makes the
  wilderness dangerous rather than merely empty.
- Animals remembering who fed or hurt them.

---

## Longer-standing gaps, still open

- **No raids or feuds between bands.** Bands have norms, chiefs, territory of a
  sort and standing with each other, but nothing organises a party to go and take
  something from the neighbours. See O5.
- ~~**Farming is declared but inert.**~~ It is not in `TECHS` at all, for exactly
  the right reason, and **it returns in M8.2** with fields, `sow` and `reap`.
- **Exile is a one-way door**, and currently never fires at all.
- **No simulation LOD.** Everyone is simulated in full detail.
- **Nobody plants a tree.** Bands fell timber when a site needs it, but no one
  has a reason to leave a stand standing for their grandchildren. All of the
  entity machinery for it already exists in `Tree` and `ForestSystem`; what is
  missing is a `plant` action and a reason.
- **`household.store` is written and never read.** `LifeSystem` puts a dead
  person's goods there and nothing anywhere takes them out again. Recorded in
  [bugs.md](bugs.md).
