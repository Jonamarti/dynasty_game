# M9.5 and beyond — the owner's notes of 2026-09-14, triaged and planned

## Context

`docs/notes.txt` has accumulated **seven untriaged notes** since M9 closed on
2026-09-12 (the committed file is empty; all seven are working-tree additions).
They are not one pass. Two are about what the game *looks* like, one is about
the calendar, one is a UI view plus a technology that does not exist, one belongs
inside M8.2's fields, and two are property and territory — which is what M10
already is.

The owner's decisions, taken while planning this: **the look-and-calendar pass
runs first**, as M9 did when the notes were about the interface; **NPC art is
baked once into a sprite atlas**, not drawn shape-by-shape every frame; **the
ageing clock and the calendar become one clock**; and **coercion needs no
technology** — legitimate authority is what gets discovered.

### Triage — where each note goes

| # | note | destination |
|---|---|---|
| 1 | Children smaller; bodies with limbs; carried tools and weapons; faces with eyes, eyebrows, mouth | **M9.5 phase 1** |
| 3 | Seasons should look different — snow, flowers, leaf litter, browning | **M9.5 phase 2** |
| 4 | Seasons should be shorter, so tech and buildings pass to the next generations | **M9.5 phase 3** |
| 2 | The tribe graph should be a layered pyramid, unlocked by a primitive "giving orders" technology | **M9.5 phase 4** |
| 7 | Ground fertility, exhaustion, compost, crop rotation, burying fish | **M8.2**, in the same pass as `farming` |
| 5 | Buildings degrade after a number of uses and need repair | **M10 phase 1** |
| 6 | Fences that claim territory; a border-guard job | **M10 phase 2** (with O4 and O5) |

---

# M9.5 — The look and the calendar

Four phases. Phase 1 and phase 2a are renderer-only and **must leave `sim:check`
bit-identical**. Phase 2b, 3 and 4 change the world and are measured with
`npm run sim:seeds -- --seeds 20`, never one run.

## Phase 1 — People who look like people, drawn once (note 1)

Today a person is **two axis-aligned rectangles**: torso `0.34 × 0.52` tiles in
the band colour, head `#e8c9a0` above it ([Renderer.ts:602-668](src/render/Renderer.ts#L602-L668)).
There is **no age scaling** — a newborn and an elder are drawn identically — and
`Person.inventory` and `Person.job` never reach the canvas. Everything is
procedural canvas 2D; there is no sprite system and no shared shape helper.

**Bake the art once; compose it per frame.** A figure with limbs, a face and a
held tool is twenty-odd path operations per person per frame, sixty times a
second, for a crowd — against `perf-budget` on `crowded`, which is *already* the
one failing perf check. Instead, new `src/render/Sprites.ts` rasterises every
part once into an offscreen atlas at startup, exactly as
`prerenderTerrain` already does for the ground
([Renderer.ts:146-170](src/render/Renderer.ts#L146-L170)), and drawing a person
becomes three or four `drawImage` calls.

**Layers, not combinations** — baking every permutation is what makes an atlas
explode:

| layer | variants | why |
|---|---|---|
| body | 5 size classes × 6 band colours × 4 pose frames | size class from `Person.years`/`vigour`; pose from the walk phase |
| head + hair | dark / grey / balding / bald, with and without beard | **elders go grey and bald** — the owner's note |
| face | one small cell per expression | composited over the head cell |
| held item | one cell per tool or weapon | spear, axe, basket, bow, net… |

Cells are baked at 96 px — above the 80 px/tile ceiling the zoom clamp allows
([main.ts:1072](src/main.ts#L1072)) — and drawn scaled down, so the atlas is
built once per session and never on a zoom change. The bake is pure arithmetic
over the palette; it takes no RNG draw and touches no sim state.

- **Child scaling** reads `Person.years` / `Person.vigour`
  ([Person.ts:558-592](src/sim/entities/Person.ts#L558-L592)): height from ~0.55
  of adult at birth to full at `ADULT_YEARS`, with a larger head fraction when
  small. Elders lose height, stoop, and pick up the grey or bald head cell.
- **`hitRadiusOf` moves with the art.** [Renderer.ts:800-822](src/render/Renderer.ts#L800-L822)
  is the picker's mirror of the painted size and is documented as having to
  change whenever a drawn size does. A child drawn small and clicked large is
  the "what is drawn and what is clickable are a third of a tile apart" bug in
  `bugs.md` all over again.
- **Held tools and weapons** come from `Person.inventory`
  ([Person.ts:206](src/sim/entities/Person.ts#L206)) through a pure
  `heldItemFor(person)`, so the canvas and the HUD can never disagree about what
  somebody is carrying.
- **LOD.** `camera.scale` spans 8-80 px/tile. Below ~14 px/tile draw a single
  flat silhouette cell — one `drawImage`, no face, no tool. Today the renderer's
  only LOD test is `if (scale > 20)` for building icons
  ([Renderer.ts:591](src/render/Renderer.ts#L591)); follow that shape.

**Faces, and where the expression comes from.** There is no mood, happiness or
stress field anywhere in `src/sim/`. Add none now. New pure helper
`src/sim/core/Mood.ts` — `expressionOf(person, sim): Expression` — following
`workProgressOf` in [Progress.ts](src/sim/core/Progress.ts), whose header records
the bug caused by a panel reimplementing a calculation the sim owned. It reads
what already exists: `needs` and `LETHAL_NEEDS` (strain), `health` (pain),
`lastHarmedBy`/`lastHarmedTick` (fear), `noticed` — what stopped them
(frustration), opinion of the nearest person via `Relationships` (warmth), and
`traits.aggression`/`loyalty` for the resting face, so two content people do not
wear the same one. The expression picks a face cell from the atlas.

Keep the coarse expression **public** — a face is visible, and the health pip
already draws for everyone ([Renderer.ts:640](src/render/Renderer.ts#L640)) — but
anything finer than "unwell" stays behind `knowsCondition`
([Knowledge.ts:37](src/sim/social/Knowledge.ts#L37)), and say so in a comment.

> **Two things kept for a future pass, at the owner's request.** Both are new
> simulation state — an eighth trait axis and a new `Person` field — and `TRAITS`
> is iterated by founding, inheritance, ageing and the character-creation point
> budget, so this is the same migration warning `SKILLS` carried into M6b phase
> 6: it may not hide inside an art pass.
>
> 1. **A persistent `mood`** that accumulates and decays, fed by a heritable
>    temperament and readable by `Brain`, so a sour mood changes what somebody
>    chooses to do. `expressionOf` is the seam it would feed.
> 2. **A `reserved` trait.** A reserved person gives nothing away: their face
>    reads neutral to observers whatever they feel, and their intentions are not
>    legible. It belongs with `mood` rather than before it, because it is
>    defined as the *suppression* of what mood shows — and it should also reach
>    `sim/social/Knowledge.ts` (what an observer may infer) and the `threaten`
>    verb in phase 4 below, where not being readable is worth something.

**Gate:** `npm run shots` (the tour is the instrument here), `npm test`,
`perf-budget` on `crowded` measured before and after — the atlas should make it
*better*, and if it does not, the bake is wrong — and `sim:check`
**bit-identical**: a renderer phase that moves a world number has touched the sim.

## Phase 2 — Seasons you can see, and snow that covers things (note 3)

The renderer never reads `season`, `temperature` or `growth`. The only
time-of-day effect in the whole file is a four-line night wash
([Renderer.ts:368-372](src/render/Renderer.ts#L368-L372)). Terrain is one
offscreen canvas rasterised **twice in a session's life** (callers at
[Renderer.ts:122](src/render/Renderer.ts#L122) and `:141`) with a deterministic
per-tile speckle hash — there is no invalidation path below whole-canvas
granularity.

### 2a — The ground turns with the year (renderer only, bit-identical)

**Repaint on a bucket change, not per frame.** Keep a `seasonKey` on the
renderer: `season` plus `temperature` and snow depth quantised into a handful of
buckets. When the key changes — a few times per in-game year — re-run
`prerenderTerrain` with a season-aware palette. 16k `fillRect`s a few times a
year is nothing; per-frame tinting of 16k tiles is not affordable.

- **Palette lerp per biome** from `BIOME_COLORS`
  ([Renderer.ts:29-37](src/render/Renderer.ts#L29-L37)): green in spring and
  summer, gold-brown in autumn, grey-brown and then white under winter.
- **Scatter features on the same hash** that already places the speckle — flower
  dots in spring, leaf litter in autumn, snow flecks that thicken with depth,
  dried patches in high summer — using different hash bits per feature so they
  do not stack on the same tiles.
- **Trees.** `Tree.fruitSeasons` ([Tree.ts:55-97](src/sim/entities/Tree.ts#L55-L97))
  already differs by species; `drawTree`
  ([Renderer.ts:490-549](src/render/Renderer.ts#L490-L549)) should colour the
  canopy by season and go bare for deciduous species in winter while pine stays
  green. This is the highest-value frame in the phase.

### 2b — Snow accumulates, and buries what is small (measured)

The owner's note: *small things like sticks may not be visible, and small stuff
left on the ground may become invisible as more snow falls on top.* A purely
cosmetic burial would be a lie — the player would see bare ground where the AI
still picks things up — so **burial must reach the simulation in the same pass**.

- **Snow depth, cheaply.** `Simulation.snowDepth`, a scalar advanced once a day
  from `TimeManager.temperature` — accumulating below freezing, melting above,
  with a heavy fall leaving a step rather than a drift. Per-tile variation comes
  from the *existing* positional hash plus tree cover and shelter proximity, so
  there is **no new tile array and no new RNG stream**. Snow is deeper in the
  open than under a canopy, which is both true and useful.
- **What gets buried:** `ItemPile`s on the ground, and ground-level resource
  nodes — `sticks`, `flint`, `clay` — via a `ResourceDef.groundLevel` flag that
  the snow code reads (declared and used in the same commit). Berry bushes stand
  above the snow; fish are in the water; buildings are unaffected.
- **What burial does:** a buried pile or node is not drawn, is not offered by
  the radial menu, and is skipped by `Brain.findNode` — and the refusal says so,
  through `Simulation.lastRefusal`: *"it is under the snow"*. A pile buried in a
  hard winter comes back at the thaw, which makes a heavy snowfall a real event:
  firewood left out is firewood you cannot fetch.
- **Balance warning:** this removes `sticks` and `flint` from the world in deep
  winter, which is the worst possible moment. Expect survival to fall and be
  ready to answer it — deeper snow could *raise* the value of a store, which is
  the intended lesson, but it may need a cap on depth or a partial-visibility
  band. Ship it behind a `snowBuries` config flag defaulting on, so it can be
  switched off in one line if the twenty-seed run says it is a strictly worse
  world.

**Gate:** 2a — `npm run shots` in four scenarios timed to land in each season,
`perf-budget` on `crowded` unmoved, `sim:check` bit-identical. 2b —
`--seeds 20` on the default scenario and `harsh-winter`, watching the `store` and
`cold` columns together, plus a `buried-goods-return-at-the-thaw` check verified
against a build without the thaw.

## Phase 3 — A shorter year, and one clock instead of two (note 4)

The note asks for shorter seasons **so that a lifetime covers less of the tech
ladder**. That only works if a life gets shorter *in days*, because every
discovery roll is per-day (`conceptionBase` 0.06/day, `trialChance` 0.18/day,
`observationChance` 0.02/day — [Config.ts:268-284](src/sim/core/Config.ts#L268-L284)).
Today it cannot: **the calendar and the ageing clock are separate.**
`TimeManager.year` divides by `daysPerSeason * 4`; `Person.years` divides by
`DAYS_PER_YEAR = 80`, a module constant in
[Person.ts:119](src/sim/entities/Person.ts#L119) that `Tree`, `LifeSystem`,
`ForestSystem` and `Founding` all import. They agree only because 20 × 4 = 80.
`bugs.md` records this as a deliberate non-fix; **this phase is the pass that
fixes it**, and that entry closes.

**3a — derive the ageing year, change nothing else.** `daysPerYear` becomes
`daysPerSeason * 4`, threaded as a `readonly daysPerYear` on `Person` and `Tree`
set at construction (default 80, so bare-constructed test fixtures keep working)
rather than a mutable module global — two simulations exist at once in the
tests. Callers: `Person.years`/`isChild`/`isElder`/`canBearChildren`/`vigour`;
`LifeSystem` lifespan, mortality and elder decay — and the **literal `50`** at
[LifeSystem.ts:76](src/sim/systems/LifeSystem.ts#L76) should read `ELDER_YEARS`
while we are in there; `Tree.years`/maturity/`maxAgeYears`; `ForestSystem`'s
initial ages; `Founding`'s family arithmetic. At the current default this commit
is **bit-identical**, and that identity is the proof it is right.

**3b — the three hardcoded `80`s in the harness.**
[simcheck.ts:557](tools/simcheck.ts#L557), `:967` and `:1228` are literals, not
imports, so they silently decouple from both clocks. Re-tune the two scenarios
that already override season length — `harsh-winter` at `daysPerSeason: 6` and
the clothing scenario at `8` — both are chosen *relative* to the default and both
move when it does.

**3c — shorten the year and rebalance.** Default `daysPerSeason` 20 → **10**
(year 80 → 40 days). A 64-year life then spans half the days, so roughly **half
the discovery rolls per lifetime**, while the ladder advances at the same rate
per real minute: the ladder genuinely passes to the grandchildren. Winters come
twice as often in real time but each is half as long, so the die-off window
narrows and survival is expected to *rise* — confirm it, do not assume it.

Hold everything else at its current fraction of a year so only one variable
moves: `GESTATION_DAYS` 20 is exactly a quarter-year today and becomes
`daysPerYear / 4`; `BIRTH_SPACING_DAYS` likewise. (Real gestation is
three-quarters of a year and is the obvious follow-up — deliberately not in this
commit.)

**Gate:** `--seeds 20` before and after 3c on the default scenario *and*
`century`, reporting technologies-known-per-lifetime and generations-per-run —
the two numbers the note is actually about.
[world.test.ts:71-111](src/sim/__tests__/world.test.ts#L71-L111) pins the season
phase at `daysPerSeason: 20` and should keep doing so explicitly rather than
inheriting the default.

## Phase 4 — Threats, chiefs with a term, and the pyramid (note 2)

**Today**: `chooseChief` re-elects **every day**
([BandSystem.ts:166-192](src/sim/systems/BandSystem.ts#L166-L192)) on a summed
`standingScore`; `assignJobs` hands out whichever job the band has fewest of;
and `TribeGraph` is a pure sociogram — force-directed, spring rest length driven
by `opinion` ([TribeGraphLayout.ts:37-128](src/ui/TribeGraphLayout.ts#L37-L128)).
**No technology anywhere touches social organisation**: `Authority.ts`, `Job.ts`
and `BandSystem.ts` import nothing from `Tech.ts`.

Five commits. 4a and 4b stand alone and can ship first.

**4a — `threaten`: coercion needs no technology.** Before anyone has the idea of
*assigning work*, one person can still make another hand over food — by menace.
The ingredient already exists: `standingOver` computes a `menace` term from the
fight-skill gap, capped at +0.25
([Authority.ts:136-147](src/sim/social/Authority.ts#L136-L147)).

- A `threaten` verb in `ActionSystem` — short, with its own interruption check —
  demanding items, reusing M9 phase 2's quantity picker for the player's side.
- Compliance rolls on menace, `traits.aggression` and the victim's fear
  (`lastHarmedBy`), **not** on headship or chieftainship; and it works on
  strangers and other bands, which legitimate orders do not.
- It costs: a sharp `addDeed` penalty, witnesses judging it through their band's
  `norms` ([Events.ts:76-78](src/sim/social/Events.ts#L76-L78)) — where a
  tolerant band shrugs and a peaceable one remembers — and it feeds exile and
  rebellion, which already read the same regard.
- Both outcomes reach the player: `lastRefusal` when the demand is refused,
  a floater and a chronicle line when it succeeds.
- This is also the seed of M10: a raid is a threat with a band behind it.

**4b — a chief holds a term, and a new chief is welcomed.** Daily re-election is
too soon, and it makes leadership churn on noise.

- `chooseChief` runs on a **term** (`CHIEF_TERM_DAYS`, around half a year in the
  new calendar) or on a trigger — the chief dies, leaves, or is challenged
  through the existing `considerRebellion` path.
- `Band.chiefSince` plus a pure `chiefHoneymoon(band, tick)`: a positive term
  decaying over days, **no new per-edge state**. `Relationship.deeds` decays at
  0.985/day, a half-life of forty-odd days, which is far too slow to be "a
  happiness that fades" — a band-level decaying term is both truer to what the
  owner described and cheaper than touching every edge.
- It is read in two places, and both matter: `standingScore`, so a new chief is
  not unseated by the next tick of noise; and `standingOver`, so orders land
  better in the first days and the chief has to have earned real regard by the
  time the glow fades.

**4c — `division_of_labour`, a real gate.** A `practice` node, and the first
social technology in the game. It needs an eighth entry in `DOMAINS`
([Tech.ts:82-88](src/sim/knowledge/Tech.ts#L82-L88)) — `people` — which the tech
web colours and lays out, so `TechWebLayout` and the tech tests move in the same
commit.

- Sparks from crowding and friction: several band members doing the same work in
  sight of each other, a `talk` in a large band, a refused order, a successful
  `threaten` from 4a. Never a spark requiring something only the technology
  produces — that is the `leatherwork` deadlock.
- **Effect:** before it is known, `assignJob` and `BandSystem.assignJobs` refuse,
  and the player's refusal goes through `lastRefusal` in the words of the world —
  *"nobody here has the idea of setting one person to one task"* — never a silent
  no-op. Coercion via 4a still works, which is the point: the technology brings
  *legitimate, cheap, repeatable* authority, not authority as such.
- A `TECH_EFFECTS` entry naming `Simulation.assignJob` as its site, or
  `techs-have-effects` fails — which is what that test is for.

**4d — `chiefdom`, the second rung.** Requires `division_of_labour`. It turns a
flat band into layers: household heads gain a measure of authority over non-kin
band members (today `isHead`'s +0.55 reaches only their own household), and the
chief's own term rises. That middle rank is exactly what the pyramid draws, so
the view has three layers to draw only once this is known.

**4e — the layered view.** `TribeGraphLayout` gains a ranked mode. `GraphNode`
already supports `lockY` and `FamilyTreeLayout` already uses it to pin
generation rows — reuse it, do not write a second layout engine. Ranks: chief 0,
household heads 1, members 2, children 3, outcasts below; X within a row stays
force-directed on `opinion`, so allies still sit together. **Before the subject's
band knows `division_of_labour` the graph draws exactly as it does today** — the
note explicitly asks for that. The digest
([TribeGraph.ts:167-189](src/ui/TribeGraph.ts#L167-L189)) must include rank or a
promotion never redraws; the `knowsTies` veil and the hover-safety rule in
`AGENTS.md` are unchanged.

**Gate:** `--seeds 20` on 4a (a new verb competes for ticks — watch
`ai-uses-many-actions` as a *distribution*), on 4b (leadership churn: count
`chief_chosen` before and after) and on 4c (it removes jobs from the early game,
so `jobs-bias-work` needs a scenario whose founders know the node — the same
trick `craft` and `scribes` already use). Unit tests on every refusal string,
mutation-verified against a build with the gate removed.

---

# M8.2 — soil folded into `farming` (note 7)

The seventeen Neolithic nodes are unchanged
([m8_plan_the_ages.md](docs/m8_plan_the_ages.md)). What changes is that
**`farming` may not ship without soil**: a field that ignores the ground is the
inert-content defect, and soil that nothing reads is the same defect from the
other side.

`World.fertility` ([World.ts:30](src/sim/core/World.ts#L30)) is a `Float32Array`
computed at worldgen and read in **exactly one place** — the berry spawn gate at
[Simulation.ts:469](src/sim/core/Simulation.ts#L469). It stays exactly as it is
and becomes the *innate* term; repointing it at a live value would move every
berry bush in every saved seed, and `determinism.test.ts` compares two runs of
the same build, so it would never catch it.

**Three layers, because four remedies need four different answers:**

| array | mutable | meaning |
|---|---|---|
| `fertility` (existing) | no | parent material and climate |
| `soilTexture` | no | sand ↔ loam: sets both pools' capacity and the leaching rate |
| `soilOrganic` | yes | humus — the slow pool |
| `soilNutrient` | yes | what a crop actually eats — the fast pool |

`effectiveFertilityAt = clamp01(fertility*0.35 + organic*0.35 + nutrient*0.30)`.
**Tilling burns organic; reaping eats nutrient** — that split is the whole design
and is why compost, manure, fallow and rotation are four different things rather
than four skins on one number. Texture is sampled from the existing
`moistureNoise` object at a shifted offset, which **costs zero RNG draws** and so
cannot shift a seed.

**Cadence.** Drawdown is event-driven — `till`/`sow`/`reap`/`spread`/`bury` each
write the one tile the actor stands on. Recovery sweeps a
`soilActive: Set<number>` of tiles away from equilibrium, once a day, dropping a
tile when it settles: a few hundred entries, not 16,384, and insertion order is
deterministic. No per-tick sweep, ever.

**The ladder** (each with code in the same commit):

| node | requires | slice |
|---|---|---|
| `farming` | plant_lore, grinding | **minimum** — yield reads `effectiveFertilityAt` from day one |
| `composting` | farming | **minimum** — a `compost_heap` maturing green and brown material, and a `spread` action |
| `middening` | farming, fishing | full — `bury` spoiled fish and bone; gives spoilage a counterplay it has never had |
| `manuring` | farming, herding | full — `dung` from the pen |
| `crop_rotation` | farming, calendar, plant_lore | full — a pulse crop that *adds* nutrient, and `Field.lastCrop` |
| `marling` | farming, masonry | full — the only thing that raises `soilTexture` |

**The AI's reason** is two `Brain` scorers on the existing `store`/`haul` shape,
gated on `techPower(person, 'composting') > 0`, with the field's deficit cached
once a day rather than per think tick. `spread` and `bury` must join
`WORK_ACTIONS` ([Job.ts:31](src/sim/entities/Job.ts#L31)) or they escape both the
job bias and `workingAlongside`. **Proximity dominates the scorer** — fields must
be sited near `band.homeX/homeY` by the planner, or this repeats the traps that
stood full for fifty trap-days.

**The player is told**: `lastRefusal` when a `sow` is ordered on spent ground; a
floater when a reap yields nothing (which is also `composting`'s heaviest spark);
an insight when a field crosses into exhaustion; and a HUD row from a single
`Simulation.soilReport(field)` so the panel and the sim are one implementation. A
band that has not worked out composting sees *"the ground here is tired"*, not a
number — through `sim/social/Knowledge.ts`.

**Renderer**: soil draws as a per-`Field` overlay in the entity pass, like the
building progress bar. Do **not** repaint the terrain canvas on a soil change.

> **Soil decline must not ship without its remedy in the same commit.** Drawdown
> alone is a strictly worse world with no counterplay — which is exactly what
> happened to spoilage (92.2% → 88.8%, shipped switched off).

---

# M10 — wear, fences and what a raid is for (notes 5 and 6, with O4 and O5)

## Phase 1 — Buildings wear out (note 5, and O5's missing half)

`Building` has `progress` (monotonic up), `complete`, `delivered`, `store` and
`yieldCarry` ([Building.ts:310-349](src/sim/entities/Building.ts#L310-L349)) and
**no condition of any kind**. O5 in `next-steps.md` already names the gap.

- `condition = 1`, `uses = 0`, and `BuildingDef.usesPerWear` / `wearStep` /
  `weatherWear`. At `uses >= usesPerWear`, step the condition down — **stepped,
  not a drip**, so it produces a discrete event worth a floater and a chronicle
  line. `damage(amount, cause: 'wear' | 'weather' | 'raid')` means **M10's
  sabotage needs no new field**.
- One `Building.use(n)` helper, guarded on `complete`. Callers are the six
  `reachBuilding` users ([ActionSystem.ts:929-955](src/sim/systems/ActionSystem.ts#L929-L955))
  — `doStore`, `doTake`, `doSleep`, `doCraft` at a station — plus `workTraps`
  daily. **`NeedsSystem.shelterAt` must never write**: it runs per person per
  tick, and a roof wears by weather and by nights slept, not by being stood
  under.
- Degradation reads: shelter value (the one that moves survival), `storageFree`
  (goods stop fitting; nothing already stored is destroyed), `preserves`, trap
  yield, and a station below `RUINED` refusing with a **distinct** reason id, or
  `crafts-happen-at-stations`' counter is polluted.
- **`repair`** widens `stillNeeds` rather than adding a parallel ledger:
  `damage()` debits `delivered` proportionally, so `doHaul`, `Building.wants`,
  `Brain`'s `gather_for_site` scorer and the planner's material logic all keep
  working unchanged. Work banks in `repairProgress` (a half-condition mud hut is
  well over the ~140 `workTicks` ceiling `AGENTS.md` names, so it *must* bank),
  calls `this.interruption(person, ctx)` every tick, and joins `WORK_ACTIONS` and
  `JOBS.builder.actions`. The band planner prioritises repair **above** the
  shelter/store/station/trap ladder — a roof you have is cheaper than one you do
  not — but repairs must **not** occupy a `MAX_SITES` slot, or
  `bands-decide-to-build` goes PASS → n/a, which is not a pass.
- Ship the machinery at `wearRate: 0` with dry-run `would_wear_*` counters first,
  so "the sweep changed the world" and "wear changed the world" stay separable;
  then shelter only; then storage, `preserves`, trap yield and station refusal
  **one commit each**, because each attacks a different green check.

## Phase 2 — Fences, territory, and the border guard (note 6, with O4)

**No state between bands exists anywhere in the codebase** — `Band` carries only
`id`, `name`, `homeX/homeY`, `norms`, `chiefId`, `outcast`
([Simulation.ts:117-132](src/sim/core/Simulation.ts#L117-L132)), and
`Building.ownerBandId` is honoured in exactly one place (`Brain`'s store filter).
M10 builds that relationship; this phase makes it worth having.

- A cheap `fence` design; each completed segment claims the tiles within a small
  radius for its band. Territory is a `claim: Uint8Array` over the grid — the
  **first tile array written after worldgen**, a door M8.2's soil work opens
  first, which is why those two passes should share a reviewer.
- A **`guard` job** (a fifth `JobId`) with a `patrol` action along the claimed
  border — long-running, so it banks progress and takes an interruption check —
  and a challenge when a member of a band you are on poor terms with is found
  inside. `threaten` from M9.5 phase 4a is what a challenge *is*. Adding a
  `JobId` changes `assignJobs`' fewest-count distribution, so it is a measured
  change, not a data change.
- **O4** then has something to read: access to a building is decided by
  inter-band standing rather than a hard same-band test, and the refusal reaches
  the player through `lastRefusal` — a store that is silently not offered is
  precisely what that rule exists to prevent.
- **O5** is `damage(..., 'raid')` from phase 1, plus whatever organises a party
  to go and use it.

---

# Documentation, at the end of each pass

- `docs/notes.txt` emptied only once every note has a destination in writing.
- `docs/next-steps.md`: a new **§7e — the owner's notes of 2026-09-14** carrying
  the triage table above, an M9.5 row in the milestone table, and §4's era-rename
  note kept where it is — real archaeological period names and
  `TechDef.age`/`firstKnown` are still the cheaper thing to do *before* M8.2
  triples the node count.
- `docs/changelog.md`: an entry per phase, with the reason and the numbers.
- `docs/bugs.md`: the **two-clocks entry closes** at phase 3; anything found and
  not fixed goes in.

# Verification

Per `AGENTS.md`, fastest first; `npm run verify` chains the first four.

```bash
npm run typecheck                          # ~3s
npm test                                   # unit + determinism  ~1s
npm run sim:check:all                      # 13 scenarios        ~15s
DYNASTY_PORT=5399 npm run e2e              # Playwright          ~21s
npm run shots                              # the instrument for phases 1 and 2a
npm run sim:seeds -- --seeds 20            # 2b, 3c, 4a-4c, and every M8.2/M10 phase
npm run why -- --person 0 --from 1700 --to 1760
```

Phase by phase:

- **1** — `npm run shots`; `perf-budget` on `crowded` measured before and after
  (the atlas should improve it); `sim:check` **bit-identical**.
- **2a** — four tours timed to land in each season; bit-identical.
  **2b** — `--seeds 20` on the default scenario and `harsh-winter`, `store` and
  `cold` columns read together; `buried-goods-return-at-the-thaw` verified
  failing on a build without the thaw.
- **3a** — bit-identical at the current default; that identity *is* the proof.
  **3c** — `--seeds 20` on the default scenario and `century`.
- **4** — `--seeds 20` per commit; `ai-uses-many-actions` read as a distribution;
  `chief_chosen` counted before and after 4b; a founders-know-it scenario for
  `jobs-bias-work`; `npm run e2e` for the graph with `?skipIntro=1`.
- **M8.2 soil** — a `farmers` scenario; `fields-are-sown-and-reaped` PASS, not
  n/a; `soil-is-drawn-down` and `compost-answers-exhaustion` each **verified
  failing on the build without composting** before they are trusted.
- **M10 wear** — a `weathered` scenario (`tiny` and `band` are too short);
  `nobody-shelters-in-a-ruin` verified against a build with `repair` removed;
  `bands-decide-to-build` must stay PASS.

**Determinism, throughout:** no phase here needs a new RNG fork — the sprite
atlas and the season repaint are presentation, snow depth and soil are
deterministic arithmetic over event-driven state (the property `workTraps` and
`spoilFood` already have), and soil texture re-samples existing noise. Never
append to `spawnResources`' `plan` array. Say so in each commit message.
