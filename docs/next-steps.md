# Next steps

Rewritten 2026-09-08, reordered 2026-09-10, brought up to date 2026-09-12 on
the close of M9.
Ordered, with the reason for the order.

**2026-09-10: the owner moved the social and interface pass ahead of the
Neolithic.** `docs/notes.txt` had accumulated thirteen untriaged notes, eight of
them since the last triage on 2026-09-09, nearly all about talking, teaching,
choosing and seeing — the layer the player touches rather than the content
underneath it. That pass is now **M9**, planned in full in
[m9_plan_words_and_hands.md](m9_plan_words_and_hands.md), and it runs before
M8.2. See §7c below for the triage itself, and note the correction to §5's
O4/O5 discussion: this document previously said bands carry "standing with
each other." They do not, and never did; see below.

The previous version was written on 2026-09-02 and amended in place for a week.
By the end it described the tech tree as "ten nodes so far" when there were
seventeen, listed weapons and knowledge-transmission as future work when both had
shipped, and marked two of the owner's requests done inside a section that said
nothing was scheduled. It has been rewritten rather than amended again.

---

## Where things actually stand

`npm run sim:check` on the default twelve-day scenario, re-run 2026-09-16 at
the close of M9.5: **39 of 39 applicable checks pass**, 29 n/a, ~2,600 steps/s
against a 2,000 floor. The applicable count moved rather than fell — phases 4c
and 4d added checks for content a twelve-day run cannot reach, which is the
same reason the n/a count is high. M9 phase 6 and M9.5 phase 4e both left every
one of those numbers bit-identical, as they had to: no scenario possesses a
player, so neither the character's autonomy nor the panel's rank model is
reachable from the harness at all. The n/a count is high because M8.1 added checks for content a
twelve-day run cannot reach; the scenario that covers each one is named in its
skip line, and `npm run sim:check:all` is the number that matters — **14
scenarios as of M9.5 phase 4c** (`labour` joined, so that `jobs-bias-work` has
a world whose founders know `division_of_labour`), **13 fully green**, with
`crowded`'s `perf-budget` the only failure left. The three kinds of failure
below are kept because two of them are borderline checks that have now changed
sides three times, which is a finding in itself — see `bugs.md`:

**Updated 2026-09-17 by M9.6 phases 0-3.** The matrix is now **16 scenarios,
12 fully green**, with four failures: `crowded`'s `perf-budget` below, plus
`the-hurt-are-tended` on both `century` *and* `millers` — newly applicable on
both, because M9.6 phase 1's repaired harvest carries those worlds as far as
`herbalism` — and `kills-are-butchered-for-bone` on `hunters`, which is a
one-event-wide check in a scenario that was already documented as fragile. All
three of those scenarios are green at the commit before, all three were measured
against it rather than assumed, and all three are written up in
[bugs.md](bugs.md) and [changelog.md](changelog.md). The open balance question
M9.6 phase 1 raises — a fruit tree now yields what its table always claimed,
which is several times what the world has had since M9.5 phase 3 — is in the
changelog and is the owner's to answer.

- `crowded`'s **`perf-budget`** has been failing since before M7. M9 phase 4
  made it worse rather than better, by 17%, and `optimizations.md` and
  `bugs.md` between them name the cause: a relationship graph that grew denser
  because people who work side by side now know each other, walked daily by a
  `decay` that can never delete an edge. **This is the real one.**
- `century`'s **`the-hurt-are-tended`** is newly *applicable* rather than newly
  broken. Phase 5 pushed worlds far enough up the tree that `century` reaches
  herbalism, making it the only scenario in the suite that exercises tending at
  all — and on its first exposure nobody tends anybody. See `bugs.md`.
- `millers`' **`spatial-hash-spreads`** is a mis-specified instrument: one
  snapshot on the final tick of a nineteen-person world, against a bound that
  `items * 0.5` pushes above the floor of 8 exactly where the floor was meant to
  protect. `band` and `crowded` both got *less* clustered on the same change.
  See `bugs.md`.

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
| M8.1 — `basketry`, `netting`, `snares`, `fish_trap`; mechanism 3, the traps | shipped 2026-09-09 |
| M8.1 — `grinding`; mechanism 4, the crafting stations | shipped 2026-09-09 |
| M8.1 — `bone_working`, `tailoring`, `atlatl` | shipped 2026-09-09 |
| M8.1 — `ochre`, `flute`, `herbalism`, `taming` | shipped 2026-09-09 |
| M8.1 — mechanism 1, spoilage | **built and switched off, 2026-09-10.** See below |
| M8.1 — `preserving` and the drying rack | **held.** They are what spoilage is switched off *from* |
| M7 — stages A, B and C: routing, and the coastline | shipped 2026-09-10 |
| M9 phases 1-2 — seeing, pointing, quantities, recipients | shipped 2026-09-10 |
| M9 phase 3 — menus that nest, and asking | shipped 2026-09-11 |
| M9 phase 4 — a conversation worth having | shipped 2026-09-11 |
| M9 phase 5 — thinking | shipped 2026-09-12 |
| M9 phase 6 — letting the character look after itself | shipped 2026-09-12. **M9 is complete** |
| M9.5 phase 1 — people who look like people, drawn once | shipped 2026-09-14. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 2a — the ground turns with the year | shipped 2026-09-15. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 2b — snow accumulates, and buries what is small | shipped 2026-09-15. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 3 — a shorter year, and one clock instead of two | shipped 2026-09-15. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 4a — `threaten`: coercion that needs no technology | shipped 2026-09-15. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 4b — a chief holds a term, and a new chief is welcomed | shipped 2026-09-15. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 4c — `division_of_labour`, a real gate | shipped 2026-09-16. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 4d — `chiefdom`, the second rung | shipped 2026-09-16. See [m9_5_plan.md](m9_5_plan.md) |
| M9.5 phase 4e — the layered view | shipped 2026-09-16. **M9.5 is complete.** See [m9_5_plan.md](m9_5_plan.md) |
| The ages get their real names | shipped 2026-09-16. §4's two remaining bullets, deliberately before M8.2 |
| M8.2 — the ground, and the first field | shipped 2026-09-17. `farming`, soil, wild grain, `sow` and `reap` |
| M8.2 — `composting` | shipped 2026-09-17. The heap, `spread`, and the answer to exhaustion |
| M9.6 phase 0 — game speed stops being a difficulty override | shipped 2026-09-17. See [m9_6_plan.md](m9_6_plan.md) |
| M9.6 phase 1 — the autumn harvest repaired, and fruit that falls | shipped 2026-09-17. 1a the midnight sample, 1b the swell, 1c the windfall |
| M9.6 phase 2 — a tribe graph that holds still | shipped 2026-09-17 |
| M9.6 phase 3 — a depleted thing looks depleted | shipped 2026-09-17 |
| M11 phase 0 — the fork table, the stranger instrument, and a world with pressure | shipped 2026-09-17. `lean` is the seventeenth scenario |
| M11 phase 1 — the choice stops being argmax | shipped 2026-09-17. Free across 20 seeds, and it took two old failures green |
| M11 phase 2 — theft and violence read the target, and predation exists | shipped 2026-09-17 |
| M11 phase 3a — the urge to go and tell somebody | shipped 2026-09-17, and it flushed out the reachability defect |
| M11 phase 3b — the secret is a thing you can see | shipped 2026-09-17. An unseen deed involving your character says so over their head |
| M11 phase 4 — property is protected by attention | shipped 2026-09-17. Unwatched foreign use is possible; an owner in sight can stop it |
| M11 phase 5a, bundled with M9.6 phase 4a — `malice`, and a mood that exists | shipped 2026-09-17. The trait and the four channels are inert; nobody reads either yet |
| M11 phase 5b — the event table stops declaring what nobody does | shipped 2026-09-17. `talk`/`trade` removed, `help` connected, `slander`/`praise` declared ahead of their verb |
| M11 phases 3c and 5c — gossip is grounded, and a subject does not hear about it by magic | shipped 2026-09-18. `slander`/`praise` read `Memory.bestSignedStory`; the subject learns only by witnessing it; no player menu entry yet, same as `court` |
| M11 phases 5d-5f — factions, exile that reaches, and the door back | shipped 2026-09-20. `Factions.conspiracyAgainst` replaces exile's dead average-opinion gate; `considerAdoption` mirrors it for a wandering outcast |
| M11 phases 6a-6e — inequality | shipped 2026-09-20. `Household.homeBuildingId` replaces the unreachable `store`; a greedy household hoards there; `renown` gets a writer (`onDeed`) and two readers (`standingOver`, `chooseChief`), both relative to the band's own average. A five-commit downward drift in `lean`'s mean survival (91.2% → 88.1%) was flagged for the owner, who read it as the intended cost of the arc — continue without a hard floor |
| M11 phase 7 — `BandRelations`, its four engines, its three readers | shipped 2026-09-20. `firstImpression`, cross-band deeds, marriage, territory, trade, `mayUse`'s ally exception, `Conversation.crossBand`, and `Brain`'s `bandHostility` in `steal`/`threaten`/`attack`; `bands-take-sides` gates on the spread, length-floored at 60 days |
| M11 phase 8 — macronutrients | shipped 2026-09-21. `ItemDef.macros`, `Person.macroBalance`/`macroTarget` (the latter shifted by `NeedsSystem.exertionOf`, reused rather than duplicated), `Macros.malnutrition` capping and slowing health recovery — never a direct drain, `LETHAL_NEEDS` untouched — and a Diet section on the Now tab. Declared budget of 5 points of mean survival was not spent: `lean` 88.1% → 88.1%, `century` 99.0% → 99.5%, both within documented noise |
| M11 phase 9a — a painting is a spark, not a transcript | shipped 2026-09-21. `InscriptionDef.fidelity` splits `instruction` (stone, clay — hands over the finished design) from `reminder` (`ochre` — seeds a `conceived` idea instead); `recordedTech` narrows to `instruction` and the new `rememberedTech` takes the other half. Found and fixed along the way: `Brain` and `ActionCatalog`'s `read` scorers judged a record solely by `!knownTech.has`, which a `reminder` never satisfies, so people kept walking to an already-sparked painting and being turned away — visible as `craft` losing `spatial-hash-spreads` and `perf-budget` to clustering before the scorers got the same guard `doRead` has |
| M11 phase 9b — the oral channel | shipped 2026-09-21. A new practice `storytelling` (tried by `talk`, no prerequisite) scales `KnowledgeSystem.teach`'s chance and buys an extra story at the `deep` conversation rung; `tradition` enters that same chance formula for the first time (it already weighted `Brain`'s teach scorers); `KnowledgeSystem.hearthLesson`, a new `hearthRng`-gated nightly roll on the same midnight sample `shareTheHearth` already takes, lets a household's wisest adult teach a child under the same roof with no travelling or asking. 10-seed cohorts: `century` 99.7% (447 born, 12.6 technologies known at the end against phase 0's 5.4 baseline), `lean` 86.7% (within documented ten-seed noise of phase 8e's 88.1%) |
| M11 phase 9c — writing goes behind the surplus | shipped 2026-09-21, closing phase 9. `writing.requires` gains `farming`, historically (script answers a surplus) and mechanically (9a's nerf to `ochre` had made `writing` the dominant record channel by sitting one step off the root nodes). `scribes`'s founders needed `plant_lore`/`grinding`/`farming` to stay literate at all, and a new `PopulationConfig.startingTechByBand` gives its two bands different extra technologies (`basketry`/`clothing`) so there is finally something on a stone that somebody lacks — `records-are-cut` went from reporting 0 reads to 5, in a deliberately separate second commit from the re-gating that could not have fixed it alone |
| M11 phase 10, first commit — four widened-Neolithic nodes | shipped 2026-09-21. `ground_stone` (two tools, and the `axeFactor`/`buildFactor` repair to the long-standing `handaxe`-bypasses-`techPower` bug), `spinning`+`weaving` (thread, cloth, and the loom as mechanism 4's third station), `sickle` (a `reapFactor` term shortening `REAP_TICKS`). 20-seed `century` cohort: survival 99.7% → 99.6% (noise), technologies known 12.3 → 13.2, conceived past the root nodes 9.9 → 11.6. Eleven Neolithic nodes remain |
| M11 phase 10, second commit — five more widened-Neolithic nodes | shipped 2026-09-21. `masonry`+`wattle_daub` (`stone_house` and `wattle_hut`, two more shelters `BandSystem.planBuildings` picks up with no code change), `calendar` (a practice, tried by `sow`, multiplying `doReap`'s grasp term rather than its floor), `the_wheel` (a `cart` term on `carryFactor` — the plan's haul-speed claim is left out, on record, since nothing in this game slows a laden walker to begin with), `bread` (mechanism 4's fourth station, `BUILDINGS.oven`). 20-seed `century` cohort essentially flat against the first commit: survival 99.6% → 99.7%, technologies known 13.2 → 13.4. Six nodes remain |
| **M11 phase 10, continued, and phase 11** | **next.** `herding`, `dairying`, `wool`, `brewing`, `well`, `kiln` — `herding` is the one that needs a real new mechanism (penned, breeding livestock), `wool`/`dairying` depend on it, `well`/`kiln` depend on `masonry` (now shipped), and the Neolithic era rung still waits on `herding` specifically — then war. See [m8_plan_the_ages.md](m8_plan_the_ages.md) |
| M9.6 phases 4b–5 — happiness reads, and sleeping rough | planned; 4a (the field) shipped with M11 phase 5a; runs after M8.2 and before M10, so M10's fences have something to pay off in |
| M8.3–M8.4 — the rest of The Ages | planned; see that document |
| M10 — standing, territory and raids between bands | designed in M9's closing section; runs after M8.2 |
| M7 — walls, interiors, beds, region repair | what M7 still owes after stage C |
| Owner's list O1–O5 | **O1-O3 shipped in M9 phase 4; O4 in M11 phase 4.** O5 remains with M10. O6 and O7 shipped in pass A |

**Thirty-four technologies**, fourteen recipes, twelve buildings, thirty-one items,
thirty-seven actions (`sow`, `reap` and `spread` are new), twelve skills (`heal`, `cook` and
now `farm` all have a use; **`smith` still does not**, and waits for M8.3),
**five jobs** (the farmer, offered only to a band with ground broken), eight domains,
**four eras** — Lower Palaeolithic, Middle, Upper, Mesolithic, the real periods
since 2026-09-16, and the ladder stops there until M8.2 brings a Neolithic
anybody can reach — three forms of record, three full-screen graphs
(`G`/`K`/`T`).

**Sixteen scenarios** (`labour` joined in M9.5 phase 4c, and `farmers` and
`stewards` in M8.2 — the same seed and the same ground, with and without the
idea of putting something back), four of them new in the M8.1 tier: `millers` for the
stations, `hunters` for the bone chain, `culture` for the four nodes that are
not about food, and `fishers`, which is the only run in the suite where food
goes off.

**The default world stopped being bit-identical at M7**, and everything before
that milestone is a different world rather than a worse or better one: people
now route around a headland instead of grinding into it, so they arrive at
different ticks, meet different neighbours and spook different herds. M9 phase
3's `ask` verb and the practice/device split moved it again, and so did all
eight commits of M9 phase 4 — every one of them deliberately, and every one
measured across twenty seeds. Pre-M7 figures anywhere in these
documents are not comparable with post-M7 ones; each milestone's entry in
[changelog.md](changelog.md) carries its own before-and-after pair.

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
5. ~~**M8.1 — Upper Palaeolithic and Mesolithic.**~~ **Done, 2026-09-10**, in
   four commits and one deliberate non-delivery. Fourteen nodes were planned;
   **thirteen shipped and `preserving` is held**, because the mechanism it
   answers is switched off. See section 0b below, and `changelog.md` for the
   numbers behind every decision in the tier.

6. **M9 — words and hands.** Chosen by the owner on 2026-09-10, ahead of the
   Neolithic, because thirteen untriaged notes in `notes.txt` were nearly all
   about the interface and social layer rather than content. Full plan,
   phase-by-phase, in [m9_plan_words_and_hands.md](m9_plan_words_and_hands.md).
   Six phases: the plural picker and distinguishable resource art, quantities
   and recipients, nesting menus and an `ask` verb, conversation modes and
   relationship-building through discussion and shared shelter, an autonomous
   `reflect` verb, and a self-care mode for the player's own character. The
   first three phases are interface-only and must leave `sim:check`
   bit-identical; the last two change `Brain`'s scorer and are measured with
   twenty seeds each, never one run.

   **All six phases have shipped**, the last two on 2026-09-12, and every one
   of the owner's thirteen notes is either delivered or designed into M10.
   Phase 3 was the first to break the bit-identical promise, and the plan was
   wrong to make it rather than the phase wrong to break it: an `ask` verb is a
   channel the AI uses too. Phase 4 closed O1, O2 and O3 as well as its own four
   notes. Across the milestone's own twenty-seed cohort, transmission went from
   360.1 lessons passed on to 449.1 and technologies known from 9.1 to 11.1,
   with mean survival at 100.0%.

   Phase 6 is the one phase in the project with **no headless gate of any
   kind** — the harness never possesses anybody, so `sim:check` builds worlds in
   which the player-autonomy code is unreachable. Its gate is sixteen unit
   tests, each mutation-verified against a deliberately broken build. That is
   the pattern for anything else that only exists on the player's side of the
   game.
7. **M8.2 — the Neolithic.** Seventeen nodes and the pass where a band stops
   moving to the food: fields, herds, the loom, the kiln, masonry. The node
   tables are in [m8_plan_the_ages.md](m8_plan_the_ages.md).

   **The first node shipped on 2026-09-17**: `farming`, with three layers of
   soil under it, wild cereal to domesticate, a `field` design, `sow` and
   `reap`, the `farmer` job and a `farmers` scenario. The default world is
   bit-identical and the twenty-seed cohort is unmoved, because wild grain is
   invisible to anybody who cannot grind it. **`composting` followed the same day**, because the
   plan is explicit that decline without an answer is a strictly worse world: a
   heap that ripens what is put into it, a `spread` verb that fetches and
   carries as one errand, and a `stewards` scenario that ends with its ground at
   95.4% of resting against `farmers`' 81.1% on the same seed. Fifteen Neolithic
   nodes remain. See `changelog.md`.

   Three things carried forward into it from M8.1:

   - ~~**`farm` and `smith` are still skills nothing trains.**~~ **`farm` is
     trained now**, by `sow` and `reap` and by the job that names them. `smith`
     waits for M8.3.
   - **The kiln is mechanism 4's second customer**, and the machinery is all in
     place: `RecipeDef.station`, `reachBuilding`'s predicate, the per-station
     refusal reasons, `CatalogContext.stationFor` and the band planner's station
     branch. It should be a data change plus a recipe.
   - **Retrofitting `station: 'kiln'` onto `pot` is still the trap the plan
     warns about**, and is still not done: it would make the granary unbuildable
     again. When it happens it needs `craft`'s starting conditions extended and
     `pots-reach-a-granary` re-verified in the same pass.
8. **M10 — standing, territory and raids between bands.** Designed in M9's
   closing section rather than scheduled inside it, on the same argument as
   O4/O5 below: a band that owns fields, a herd and a kiln has property worth
   refusing a rival and worth burning, and today it owns a storage pit. Runs
   after M8.2.
9. **M7**, alone, whenever it is picked up.

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

## 0b. Spoilage is built and switched off, and that is the open decision

`needs.spoilRate` is 0 in the default config. The whole mechanism ships —
`Inventory.spoil`, the daily sweep over packs, stores, piles and household
goods, `BuildingDef.preserves`, the dry-run counters — and the `fishers`
scenario turns it on so the code stays exercised and gated.

It is off because it was measured. Twenty seeds on `traps`: mean survival
**92.2% → 88.8%**, infant starvation **4 → 10**, one world in twenty collapsing
where none had. Four rates between 0.35 and 1 are indistinguishable from one
another. `preserving` does not bring it back — the band that could preserve
survived *worse* than the band that could not — and making stores nearly perfect
keepers changed nothing, which locates the loss in **packs**.

**`preserving` and the drying rack are therefore held**, because a technology
whose effect is a multiplier on zero is exactly the declared-and-inert content
this project has a rule against. They are ready in
[m8_plan_the_ages.md](m8_plan_the_ages.md) and are three small commits whenever
the answer changes.

What would have to change first is in [bugs.md](bugs.md), and the short version
is: **people carry a larder.** The pack is where the loss lands, and the answer
is not a better pack but a reason to put food down — which is the same scorer
question the larder fix answered from the other side.

## 1. Food supply — the remaining half of the winter problem

The distribution half is done (2026-09-02): mean survival across ten seeds went
from 40% to 59% and nothing collapses any more. Measure with `npm run sim:seeds`
rather than a single run — one `century` is too chaotic to read.

What is left is supply, and **M8.1 was the plan for it, and has shipped.**
Fishing, snares, fish traps and grinding are all supply, and they are
historically what the Mesolithic was, so the food answer and the tech ladder
turned out to be the same pass. Measured gains, twenty seeds each: fishing
+3.0 points, grinding +2.6, the traps a wash on survival with infant starvation
halved. `preserving` is the one piece of it that did not ship — see 0b.

**The next honest measurement is a long one**: M8.1 added four supply channels
in a week and none of them has been played against a settled world. Section 1's
third candidate below is still the cheapest remaining lever and still untried.

The three candidates this section used to list are resolved:

1. ~~**Make hunting matter.**~~ Largely done 2026-09-07 by phase 5's weapons.
   `hunts-succeed-and-fail` reports kills against misses where it had always
   reported n/a.
2. ~~**Give the wood a winter role.**~~ **Done 2026-09-09 by `grinding`**, and
   by more than was asked: the oak bears acorns now, they are inedible raw, and
   a quern turns the commonest tree on the island from timber into an autumn
   harvest. `preserving` was to have been the other half and is held; see 0b.
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
herds, ore and smelting.

**Thirteen of the forty-eight have shipped**, and all four of M8.1's mechanisms
are built: fishing, traps and stations are live, spoilage is built and switched
off. What remains is M8.2 to M8.4, and the whole design, the node tables and the
traps are in **[m8_plan_the_ages.md](m8_plan_the_ages.md)**.

**Both pieces of the plan's own preamble shipped on 2026-09-16**, in one pass,
before M8.2 as intended — see `changelog.md`:

- **The era ladder has the real period names.** `ERAS` is now Lower
  Palaeolithic → Middle → Upper → Mesolithic, with the evocative line each rung
  already had kept as its `description`. Two departures from the plan's table,
  both argued in the doc comment on `ERAS`: a **Middle Palaeolithic** rung the
  table did not have, without which a band that has carried fire for three
  generations still reads as Lower Palaeolithic; and `netting` in the Mesolithic
  where the table asked for `preserving`, which is the M8.1 node held back in
  §0b. **The ladder stops at the Mesolithic on purpose** — the Neolithic needs
  `farming`, `herding` and `masonry`, and a rung no world can reach is declared
  content that does nothing. It is M8.2's to add, in the same commit as the
  field.
- **`TechDef.age` and `TechDef.firstKnown` are on all thirty-two nodes.** The
  tech web seeds its radius from the period rather than from prerequisite depth,
  so `bow` and `fish_trap` share a Mesolithic ring though one rests on three
  things and the other on four, and the detail pane reads *Middle Palaeolithic ·
  about 300,000 years ago* under a node's title. `age` is descriptive and
  `requires` is still the only gate: `writing` is Bronze Age and rests on two
  Palaeolithic nodes, so a lucky band can have it early, and a test exists to
  stop anybody "fixing" that.

**What M8.2 inherits from this pass**: seventeen new nodes each need an `age`
and a `firstKnown` as they are written — `techs-have-effects`' sibling tests will
not let them ship without — and the Neolithic, Chalcolithic, Bronze and Iron
rungs of `ERAS` are waiting in `AGES` for the technologies that would make them
reachable.

## 5. The owner's list, O1–O5

Eight things asked for by the project owner on 2026-09-06. **O6 (continuous
movement) and O7 (clicking a single entity still offers the ground) shipped in
pass A.** **O1, O2 and O3 shipped in M9 phase 4 on 2026-09-11**, and **O4
shipped in M11 phase 4 on 2026-09-17** — see `changelog.md`. O5 remains inside
M10, after M8.2.

**Correction, 2026-09-10.** This section previously said the decision for O4
"lives" in `normsByBand` and the standing machinery in `social/Authority.ts`.
Verified false while triaging `notes.txt` for M9: `normsByBand`
([Simulation.ts:229](../src/sim/core/Simulation.ts#L229)) maps a band to *its
own* norms — how that band judges a deed — not to how it regards another band,
and `standingOver` in `Authority.ts` is one person's authority over another,
not band-to-band relations. **No state between bands exists anywhere in the
codebase**; `Band` itself ([Simulation.ts:104-119](../src/sim/core/Simulation.ts#L104-L119))
carries nothing beyond `id`, `name`, `homeX/homeY`, `norms`, `chiefId` and
`outcast`. O4 and O5 are therefore redesigned in M9's closing section against a
mechanism that has to be built first, not retrofitted onto one that already
exists, and that whole mechanism is what M10 is.

**Second correction, 2026-09-20.** That state now exists: `BandRelations`
shipped in M11 phase 7a, symmetric and decaying toward 0 at 0.998/day. It
shipped inert — every pair starts and, until phase 7b's engines land, stays
at 0 — so the paragraph above is still true of the *default* world today,
but no longer true of the codebase.

**O4 and O5 are worth more after M8.2.** A band that owns fields, a herd and a
kiln has property worth refusing a rival and property worth burning; today it
owns a storage pit. Doing them after the Neolithic tier is not a delay, it is the
difference between a mechanic and a reason.

### O1. Talking takes far too long, and needs Sims-style modes — shipped 2026-09-11

**Shipped as M9 phase 4.** Four rungs in `social/Conversation.ts`, chosen from
`familiarity` and `lastContact` with no new state, and a nested menu so the
player can choose one. What the plan below did not know: a rung is priced by its
**cooldown** rather than by its warmth, and the cost of a cheap conversation is
the walk to it rather than the conversation, so `Brain` has to scale its pull by
what the rung will actually answer. Both were found by measurement, and both are
in `changelog.md` with the numbers. The original diagnosis, kept because it is
still the clearest statement of what was wrong:

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

### O2. People should be able to talk while working alongside each other — shipped 2026-09-11

**Shipped as M9 phase 4**, in the shape this section calls for:
`SocialSystem.workingAlongside`, every forty ticks, touching neither party's
action and taking no draw. The warning below — that it must not grant the full
value of a deliberate conversation — was earned rather than heeded: at twice its
final relief, conversations in `tiny` fell by two thirds and news stopped
travelling altogether. The diagnosis, unchanged:

Today `talk` is a whole action, so two people picking the same bush cannot say a
word. `Person.action` is a single string, so "foraging and talking" has nowhere
to live. The cheapest honest shape is a passive periodic pass, like
`KnowledgeSystem.tryObserve`, pairing neighbours who are working within a small
radius and running a cheap `converse` without touching either one's action. It
should feed `company` and `Relationships` and must **not** grant the full value
of a deliberate conversation, or nobody will ever choose `talk` again.

### O3. Working alongside somebody teaches you faster — shipped 2026-09-11

**Shipped as M9 phase 4**, exactly as described below: one multiplier in
`Person.practice`, fed by `Person.alongside`, scaled by the gap to the best
worker nearby rather than by their level. Technologies known across twenty seeds
went 10.4 → 11.0. The diagnosis, unchanged:

`Person.practice(skill, amount)` is the single seam every gain goes through, so
this is a per-tick company bonus computed once from `peopleHash` rather than a
multiplier at twenty call sites. Two cautions: skill sets forage yields and
therefore the whole food economy, so measure with `--seeds 20`; and it should
scale with *the best neighbour's* skill, or a crowd of novices teaches itself
expertise.

**This is also a candidate answer to M8.0**, since it is a transmission channel
and transmission is what gates the tree.

### O4. Buildings belong to a tribe, and rivals may be refused the use of them — shipped in M11 phase 4

`Building.ownerBandId` is now read through `social/Property.ts`, not through
copied same-band gates. A rival may use an unwatched store, roof, field, heap or
workshop; a living member of the owning band within sight can stop them, and
the reason reaches the player. Taking emits `theft`, while other foreign use
emits `trespass`, so what happened is known only by witnesses and later gossip.
Band-to-band standing still does not exist — M11 phase 7 builds that separate
question, which will decide how two groups feel about one another rather than
whether matter becomes physically unusable at a border.

### O5. Sabotage, so war between tribes is more than beating people up — scheduled as M10

`Building` has no condition or hit points — `complete` is a boolean and
`progress` only counts up — so this needs a durability field, a `sabotage` action
with an interruption check, and a decision about whether damage can be repaired
by the work that built it. It pairs with the long-standing gap below: bands have
norms, chiefs, territory and standing with each other, and nothing organises a
raiding party. Sabotage is what a raiding party would be *for*.

## 6. M7 — landed: A\* and the zombie-order fix. Still owed: walls, interiors, beds, boats, region repair

**What landed**, in `src/sim/core/Pathfinder.ts` and the `MovementSystem`/
`ActionSystem` rewrite around it:

- The zombie-order bug (`giveUp` cleared the target but never `person.order`,
  so `committed` stayed true forever and a stuck walk under a player's or a
  chief's order froze until the person starved). `ActionSystem.travel` is now
  the one place that decides what a blocked walk means, and `abandon` clears
  the order along with the target.
- `Pathfinder`: 8-connected A\* with a corner rule that keeps its reachability
  identical to `World.region`'s 4-connected flood fill, a region pre-check
  before the heap is ever touched, octile heuristic, zero allocation per
  query.
- `MovementSystem` follows the route a waypoint at a time, with a per-person
  repath cooldown and a population-wide per-tick search budget, and one free
  re-route before a genuinely stuck walk gives up.
- Two health checks, `paths-are-found` and `nobody-walled-in`, and a `TRAVEL`
  report block.

Measured effect: `gave_up_walking` on the `band` scenario went from 119
(zombie fix alone, no real routing) to 1 once routing landed. Across the
`century` 20-seed cohort, mean survival went 75.4% (before M7) → 61.6%
(zombie fix alone — real, and expected: without a real router, an abandoned
order can immediately re-target the same unreachable spot) → **82.6%** once
`Pathfinder` was wired in — routing does not just stop the thrashing, it
reaches reachable places faster than greedy steering ever did. See
`docs/changelog.md`'s M7 entries for the full numbers and the two pre-existing
scenario quirks it turned up (`crowded`'s `perf-budget`, `century`'s
`paths-are-found` — both are pre-existing-since-the-zombie-fix or explained by
the search budget being tuned for a local errand, not documented as newly
broken by this pass).

**M7 stage C finished the job, and the router was never the problem.** The
owner reported people still stuck on coastline after stage B. Four separate
defects downstream of routing turned out to be responsible, none of them in
`Pathfinder`:

- **Aim points were tile corners.** `World.index` truncates, so the float
  point `(tx, ty)` is a tile's north-west corner. `Pathfinder` emitted integer
  waypoints and `MovementSystem` aimed at them; `World.shoreTiles` holds
  integer coordinates that `Brain.setup` assigns straight to `targetX` for a
  `drink`. Every routed aim point in the game carried a half-tile north-west
  bias, and the one errand that ends at the water's edge aimed *at* the seam.
- **`moveToward`'s perpendicular slide was unreachable** for any axis-aligned
  heading, because the third fallback tested the tile the walker was already
  standing in, "succeeded", and returned first. Somebody pressed square into a
  shoreline vibrated sub-threshold until they ran out of patience.
- **`clearTarget()` did not reset `pathTick`,** so every new errand inherited
  the last one's repath cooldown and walked its first five tiles with no route.
- **`DEFAULT_MAX_EXPANSIONS` was 2,000, below the 4,218 worst case
  `paths-are-found` itself reports.** The bail-out was cutting off legitimate
  searches, and a search that fails leaves a walker greedy-steering into
  terrain. It was manufacturing the stuck walkers. Raising it made the game
  *faster*.

Plus `MAX_PATHS_PER_TICK` 3 → 12, which was the last thing still making people
grind on `crowded`. Effect across the canonical twenty-seed cohort: mean
survival **82.6% → 99.9%**, collapses 1/20 → 0/20, infants starved 77 → 12,
adults 91 → 17. Stuck walking ticks went from 180-270 per 1,000 to **0.0-0.2 on
every scenario in the matrix**, and `century` passed `paths-are-found` for the
first time. New gate: `walkers-do-not-grind`.

A **clearance penalty** — routes standing off the water's edge, which the owner
also asked for — was built, swept and deliberately **not shipped**: by the time
the four defects above were fixed there were no stuck ticks left for it to
prevent, and it cost 30-57% more search on the one scenario already failing
`perf-budget`. The sweep tables are in the changelog. Worth re-reading before
anyone proposes it again.

**Still owed**, all deferred on purpose because each would confound measuring
the above:

- **Walls, interiors, beds.** `World.isWalkable` stays the single chokepoint
  they insert behind; `MovementSystem.needsRoute` already has the one-line
  hook (a next waypoint that stopped being walkable) they need.
- **Dynamic tiles and incremental region repair**, and M8.3's mining as its
  second customer. `Pathfinder`'s region pre-check assumes `World.region` is
  immutable, and that assumption did real work in this pass — build region
  repair once and both digging and mining become content on top of it.
- **Boats.** `World.sameRegion` forbids crossing water by construction; a
  logboat changes the reachability model, not the search. **M8.2's `masonry`**
  is what supplies walls with a material, so boats are blocked behind it too.
- **N1's fishing spots.** `Pathfinder`'s goal-snapping (`World.findWalkableNear`
  when the target tile itself is unwalkable) shipped and is unused today —
  it is the cheap half of what a fishing spot standing over water will need.
- **Terrain movement costs, animal pathing, path distance in `Brain`'s scorer**
  (`proximityBonus` runs over every candidate for every person every five
  ticks — a search per candidate is orders of magnitude over budget; the cheap
  future version is a chunk-graph oracle, and `World.chunkIndex` already
  exists with zero callers), and **any `Brain` coefficient change** (they are
  calibrated against each other).
- **Reviving `tracking`'s fourth spark route.** `case 'wander'` now reaches
  `finish`, which would have started entering `'wander'` into `person.lately`
  as a side effect; `Person.noteDid` ignores it for now. One line, on its own,
  measured on `conceived_tracking`.

## 7. Dynamic tiles

Shovels, canals, moved dirt, defensive trenches, piled rock.

`World.walkable` and `World.biome` are already `Uint8Array`s behind accessors, so
mutating a tile is easy. The expensive part is `World.region`, the flood-filled
landmass index that keeps people from walking at food across water — any tile
change needs incremental region repair, and that is exactly the machinery M7's
walls need. **M8.3's mining is now a second customer.** Build it once in M7 and
both digging and mining become content on top of it.

## 7b. The owner's notes of 2026-09-09

Triaged out of `notes.txt` on 2026-09-09. Two of the four were fixed in that
pass and are in [changelog.md](changelog.md); these two are not scheduled.

### N1. Fishing spots belong in the water, not on the beach

Today `spawnFish` (`Simulation.ts`) places a fish node on a **land** tile:
`suitsBiome('fish')` is `biome === 'beach' && world.isShore(x, y)`. The owner
wants them on the coastline proper — in the water at the edge, with the fisher
standing on the shore.

That is a movement-system change rather than a placement tweak, which is why it
is here and not in M8.1:

- Placement can no longer go through `World.randomWalkable`; it needs water
  tiles that have a walkable four-neighbour.
- `Brain.findNode` rejects them outright today. Its `world.sameRegion` check
  fails because water carries `region === -1`, so it must test the region of the
  node's adjacent shore tile instead.
- `Brain.setup`'s `forage` case sets `targetX/Y` to the node's own tile, so the
  fisher would walk into the sea. It must target the adjacent shore tile, which
  means the node has to carry or derive one.
- `Renderer` draws a node at its own tile, so that half is free.
- Determinism: a new placement pass needs its **own appended RNG stream**, run
  after `spawnPeople`. The genuinely-last fork is now the `fishRng` in
  `Simulation`'s constructor, not `recordRng` and not `seedInitialForest`'s —
  see `AGENTS.md`.

**It shares machinery with M7.** "Stand on one tile to work another" is exactly
the problem walls and A\* create, and doing it twice is how two copies of an idea
drift apart. Worth doing with M7 rather than before it.

### N2. Sea water should not be drinkable, which means rivers

Nothing distinguishes fresh water from salt. `Brain.findWater` and the
right-click Drink path both read `world.shoreTiles`, which is every walkable
tile with a water neighbour, and `World.generate` has no river pass at all.

Milestone-sized, and it arrives as three things at once: a river generator, a
fresh/salt distinction that `shoreTiles` and everything reading it must respect,
and a bigger map to put rivers on. The map is the expensive part — `World.region`
is a flood fill over every walkable tile and the LOD chunking is sized against
the current 128×128 — so this wants to land near M7 and section 7 above, which
already need incremental region repair.

It pairs with N1: both are about the coastline meaning something.

### N3. Curiosity as a fourth transmission channel — folded into M9 phase 3

From the same notes: somebody who sees an unfamiliar object or an unfamiliar
technique should want to find out about it — asking around, seeking out whoever
has it — and a rival band that sees a thing worth having should be able to copy
it. Knowledge would then be slow to *originate* and much faster to *spread*.

**2026-09-10: this is the same channel as M9 phase 3's `ask` verb, seen from the
other side.** Phase 3 lets a pupil ask a specific teacher; N3 is the same want
without a specific person in mind — "find out about it" rather than "ask
them" — so the two are one design question, not two, and N3 is no longer listed
separately here. `KnowledgeSystem.tryObserve` is the seam — it already pairs
neighbours by proximity and reads `WATCHING_RANGE` — and
`learning.observationChance` is now the settings-screen lever over the passive
version of it. Whoever builds phase 3 should read this note first.

## 7c. The owner's notes of 2026-09-10, and where each one went

Triaged out of `notes.txt` on 2026-09-10 — thirteen notes, all thirteen given a
destination, `notes.txt` now empty. Full diagnosis, verified against the code,
is in [m9_plan_words_and_hands.md](m9_plan_words_and_hands.md); this is the
index.

| note | destination |
|---|---|
| Two NPCs together only offer one to click | M9 phase 1 |
| Cultivate relationship with tribe and leader | M9 phase 4 — **shipped 2026-09-11** |
| Controlled NPC does not drink, eat or sleep alone | M9 phase 6 — **shipped 2026-09-12** |
| Thinking should not be confused with wandering | M9 phase 5 — **shipped 2026-09-12** |
| Conversation needs modes | M9 phase 4 (= O1, above) — **shipped 2026-09-11** |
| Discussing and teaching should build relationship | M9 phase 4 — **shipped 2026-09-11** |
| Sticks, clay and flint look alike | M9 phase 1 |
| Sleeping together should build closeness | M9 phase 4 — **shipped 2026-09-11** |
| Choosing quantities given, stored, taken | M9 phase 2 |
| Menu should nest, not name one recipe | M9 phase 3 — **shipped 2026-09-11** |
| Ask to be taught; order someone to teach | M9 phase 3 — **shipped 2026-09-11** |
| War, raiding and slavery between tribes | Designed in M9's closing section; scheduled as M10 |
| See and choose what to take from a pile | M9 phase 1 |

Three defects were found alongside the notes rather than in them —
`give_item`'s swallowed refusal, `doTake`'s fixed six units, and this
document's own false claim about standing between bands — and are recorded in
[bugs.md](bugs.md) and corrected above respectively.

## 7d. The owner's notes of 2026-09-11

Two notes, both fixed in the pass that read them, so neither has a scheduled
destination — the diagnosis and the measurements are in
[changelog.md](changelog.md).

| note | what it turned out to be |
|---|---|
| "To pick things up npcs must go near the object" | `pickup` was not an action at all: the menu moved goods into the pack on the click, from any range. It is a verb now, with a walk and two refusals |
| Practices should not have prototypes to build, and should be drawn differently in the web | `TechDef.kind`: twenty-three devices that gate a recipe, a building or a form of writing, and seven practices that gate nothing. A practice is tried by doing it or by thinking it through, never built, and the web draws it with rounded ends |

Three things were found alongside them and not fixed — the catalogue reading a
stranger's knowledge to decide whether to offer a lesson, nobody but the player
ever picking anything up off the ground, and the one figure the tech-kind split
moved and did not bring back. All three are in [bugs.md](bugs.md).

## 7e. The owner's notes of 2026-09-14

Seven notes accumulated since M9 closed. The full triage, and the plan for
where each one goes, is [m9_5_plan.md](m9_5_plan.md); the table below is
that document's summary.

| # | note | destination |
|---|---|---|
| 1 | Children smaller; bodies with limbs; carried tools and weapons; faces with eyes, eyebrows, mouth | M9.5 phase 1 — **shipped 2026-09-14** |
| 3 | Seasons should look different — snow, flowers, leaf litter, browning | M9.5 phases 2a and 2b — **shipped 2026-09-15** |
| 4 | Seasons should be shorter, so tech and buildings pass to the next generations | M9.5 phase 3 — **shipped 2026-09-15** |
| 2 | The tribe graph should be a layered pyramid, unlocked by a primitive "giving orders" technology | M9.5 phase 4 — **shipped 2026-09-16**, 4a to 4e |
| 7 | Ground fertility, exhaustion, compost, crop rotation, burying fish | M8.2 — **fertility, exhaustion and compost all shipped 2026-09-17**; rotation, middens and manure follow with `herding` and `calendar` |
| 5 | Buildings degrade after a number of uses and need repair | M10 phase 1 |
| 6 | Fences that claim territory; a border-guard job | M10 phase 2 (with O4 and O5) |

The owner's decisions taken while planning this pass: the look-and-calendar
work runs before M8.2, as M9 did when the notes were about the interface;
NPC art is baked once into a sprite atlas rather than drawn shape by shape
every frame; the ageing clock and the calendar become one clock; and
coercion needs no technology — legitimate authority is what gets discovered.
`§4`'s era-rename note (real archaeological period names for `TechDef.age`)
stays where it is, and is still the cheaper thing to do before M8.2 triples
the node count.

## 7f. The owner's notes of 2026-09-17

Six notes, given directly rather than through `notes.txt`, which is committed
empty and stayed empty. The full triage, with the diagnosis for each one
verified against the code, is [m9_6_plan.md](m9_6_plan.md); the table below is
that document's summary.

| # | note | destination |
|---|---|---|
| 5 | Default speed 5 | **M9.6 phase 0** — and the config already says 5; see below |
| 1 | Fruit trees should not carry fruit out of season; it should fall as rotten | M9.6 phase 1, with the autumn-harvest repair it forces |
| 2 | The tribe graph changes shape very fast | M9.6 phase 2 |
| 6 | A depleted node should not be the same picture made smaller — nothing for sticks, a stripped bush for berries | M9.6 phase 3 |
| 3 | Happiness: a bed, a roof, talking to family and kin | M9.6 phase 4 |
| 4 | Sleeping rough is penalised unless there are guards and a perimeter | M9.6 phase 5; the guards-and-fences half stays in M10 phase 2 |

Three findings came out of the triage rather than out of the notes, and all
three are in [bugs.md](bugs.md):

- **The autumn harvest is a rounding error, and has been since M9.5 phase 3.**
  The daily block runs at midnight, where `temperature` takes its full diurnal
  penalty, so `Tree.advanceDay` spends every autumn day pinned to its
  `max(0.2, growth)` floor: an apple tree sets about 1.6 of its 14 apples and an
  oak about 4 of its 40 acorns in a ten-day autumn. This is the missing half of
  the phase-3 entry about season-gated harvests, and the reason `millers`
  stopped picking acorns. **Note 1 must not ship without it**, because taking
  the out-of-season tail away is taking away most of what an autumn tree
  currently gives.
- **The tribe graph churns because its seed order is the opinion order**, and
  familiarity moves every tick. Nothing about it is random; it is four
  continuous functions of a number that never stops changing, hashed by a digest
  precise to the pixel.
- **`time.tickRate` is already 5**, and has been since M6c, so note 5 is about
  something else — most likely a stored override on the settings screen, which
  is kept for ever and outranks the default in every new world. Phase 0 asks
  before it writes.

Two of the notes have entries in `bugs.md` written from the other side — the
graphs relaxing every frame, and the shortened season's effect on a gated
harvest — both previously left alone as "not worth a phase". The owner has now
met both from inside the game, which settles that.

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
- ~~**Exile is a one-way door**, and currently never fires at all.~~ Fixed in
  M11 phase 5e: `considerExile` now gates on `Factions.conspiracyAgainst`
  rather than a band-average opinion the average never actually crossed, and
  phase 5f's `considerAdoption` opens the door back for a wandering outcast.
- **No simulation LOD.** Everyone is simulated in full detail.
- **Nobody plants a tree.** Bands fell timber when a site needs it, but no one
  has a reason to leave a stand standing for their grandchildren. All of the
  entity machinery for it already exists in `Tree` and `ForestSystem`; what is
  missing is a `plant` action and a reason.
- ~~**`household.store` is written and never read.**~~ Fixed in M11 phase 6a:
  `Household.store` is gone, replaced by `Household.homeBuildingId` — a real
  building a dead member's unheired goods, and now a rival, can actually
  reach.
