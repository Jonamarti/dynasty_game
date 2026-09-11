# M9 — Words and hands: the social and interface pass

## Context

M8.1 closed on 2026-09-10 with the food-supply half of the tech ladder done and
`next-steps.md` naming M8.2, the Neolithic, as next. But `docs/notes.txt` had
accumulated thirteen untriaged notes from the owner, eight of them added after
the last triage on 2026-09-09, and almost all of them are about the same thing:
talking, teaching, choosing, and seeing what is on the ground. That is the layer
the player touches, not the content the player eats or builds with.

The owner decided that **this is the next milestone**, ahead of the Neolithic,
and reordered `next-steps.md` accordingly. M8.2 is still planned, in
[m8_plan_the_ages.md](m8_plan_the_ages.md); it now runs after M9.

Every note was verified against the code before being assigned a phase. The
table below is that verification, not a summary of the owner's words.

---

## The triage, note by note

| # | note | verified diagnosis |
|---|---|---|
| 1 | With two NPCs together, clicking only offers one | `candidatesAt` ([main.ts:582](src/main.ts#L582)) calls `Renderer.pickPerson` and its five siblings, and all six are `SpatialHash.findNearest`: **one candidate per kind, always**. `SpatialHash.queryRadius` ([SpatialHash.ts:60](src/sim/core/SpatialHash.ts#L60)) already exists and returns every match |
| 2 | Cultivate a relationship with the tribe and its leader | `talk` is scored only by loneliness × regard × proximity ([Brain.ts:433](src/sim/ai/Brain.ts#L433)). The only group bias is `firstImpression`, a static one-time value: +18 household, +6 band, −6 outsider. Nobody *cultivates* a bond over time |
| 3 | The controlled NPC does not drink, eat or sleep on its own | Deliberate: the player character is scored but never steered — `score()` instead of `think()` ([Simulation.ts:1965-1974](src/sim/core/Simulation.ts#L1965-L1974)). Needs still rise regardless, so the player can starve or die of thirst doing nothing at all |
| 4 | Thinking is not the same as wandering | `ponder` requires a workable idea ([Brain.ts:900-911](src/sim/ai/Brain.ts#L900-L911)); with no idea, a comfortable person falls back to `wander` at score 0.02. And sparks come from `tryConceive` ([KnowledgeSystem.ts:298-353](src/sim/systems/KnowledgeSystem.ts#L298-L353)), which **never checks whether anyone has been pondering** |
| 5 | Conversation needs modes | Already diagnosed as O1: `TALK_TICKS = 45` against 240 ticks/day ([ActionSystem.ts:113](src/sim/systems/ActionSystem.ts#L113)) — four and a half in-game hours per chat |
| 6 | Discussing and teaching should build relationship | Confirmed: `doDiscuss` ([ActionSystem.ts:1902-1963](src/sim/systems/ActionSystem.ts#L1902-L1963)) touches neither relationship nor `company`. `doTeach` emits the `teach` deed (weight 0.6) but also never touches `company` or familiarity. There are no "personality types": there are `traits`, and the nearest equivalent is `intelligence` |
| 7 | Sticks, clay and flint look alike | Every `ResourceNode` is **the same square**, scaled by `fullness`; only the fill colour changes ([Renderer.ts:213-233](src/render/Renderer.ts#L213-L233), `RESOURCE_COLORS` [Renderer.ts:38-45](src/render/Renderer.ts#L38-L45)). `sticks` (`#8b5a2b`) and `clay` (`#a97b5d`) are the two closest browns — and dropped-item piles are drawn in `#b08a52` ([Renderer.ts:260](src/render/Renderer.ts#L260)), a third brown |
| 8 | Sleeping together should build closeness | `Building` ([Building.ts:310](src/sim/entities/Building.ts#L310)) has no occupant list and no capacity field. `NeedsSystem.shelterAt` ([NeedsSystem.ts:72](src/sim/systems/NeedsSystem.ts#L72)) tests geometric containment per person per tick; nothing records who shares a roof with whom |
| 9 | Choosing quantities | `handOver`, `storeItem`, `doStore`, `takeFromPile` and `drop` all move a whole stack to wherever it fits. `doTake` ([ActionSystem.ts:911-933](src/sim/systems/ActionSystem.ts#L911-L933)) always takes a **fixed 6 units** of whichever item the simulation picks (`bestFood() ?? entries()[0]`). No quantity selector exists anywhere in the game |
| 10 | The menu should nest | `RadialMenu` is flat, a single ring ([RadialMenu.ts:53-109](src/ui/RadialMenu.ts#L53-L109)). `groundActions` puts **one option per recipe** ([ActionCatalog.ts:570-573](src/sim/ai/ActionCatalog.ts#L570-L573)). And "only cordage" is not a menu bug: `personActions` only ever considers the actor's **single current idea** ([ActionCatalog.ts:242](src/sim/ai/ActionCatalog.ts#L242)) |
| 11 | Ask to be taught; order someone to teach | No `ask` verb exists: teaching can only be started by the teacher. `ORDER_COST` ([Authority.ts:47](src/sim/social/Authority.ts#L47)) is where the cost of an order lives |
| 12 | War and slavery between tribes | **No state exists between bands at all.** `Band` ([Simulation.ts:104-119](src/sim/core/Simulation.ts#L104-L119)) is `id`, `name`, `homeX/homeY`, `norms`, `chiefId`, `outcast`. `BandSystem` is entirely intra-band. `steal` and `attack` ignore the victim's band membership |
| 13 | See and choose what to take from a pile | `ItemPile.label` ([ItemPile.ts:44](src/sim/entities/ItemPile.ts#L44)) already exists and **nobody reads it**: the picker says "dropped goods" ([main.ts:721](src/main.ts#L721)), and contents only appear in the side panel after selecting |

### Three defects found along the way

1. **`give_item` picks the recipient and swallows the refusal.** `handleItemAction`
   ([main.ts:400-405](src/main.ts#L400-L405)) grabs the nearest neighbour without
   asking, and although `Simulation.handOver` sets `lastRefusal` to
   `"<name> cannot carry any more"` ([Simulation.ts:960](src/sim/core/Simulation.ts#L960))
   when the recipient is full, that branch never reads it — it says "nobody to
   give it to" even when somebody was right there. This breaks the standing rule
   in `AGENTS.md` that every refusal must reach the player.
2. **`next-steps.md` asserts something false.** It says bands have "standing with
   each other" (in the open-gaps section, and O4 leans on it). They do not — see
   note 12 above. O4 and O5 were planned against a mechanism that does not exist.
3. **`NODE_LABELS` is not compiler-enforced, `RESOURCE_COLORS` is.** Already in
   `bugs.md` ([bugs.md](bugs.md)); note 7 is the cheap opportunity to close it in
   the same pass that reworks node art.

---

## The measurement that orders the phases

This is a behaviour pass, not a content pass, so the ordering question is not
"what does the tech tree need" but **what changes the simulation's scoring, and
therefore risks a regression `sim:check` can catch, versus what only changes
what is drawn or clicked.**

Phases 1 through 3 touch no scorer at all — they are interface work end to end,
so `npm run sim:check` must report **bit-identical** results before and after
them, and any drift is a bug in the phase, not a side effect to explain away.
Phases 4 and 5 change `Brain`'s scoring and `KnowledgeSystem`'s conception
chance respectively, which is exactly the class of change `AGENTS.md` says must
be measured with `npm run sim:seeds -- --seeds 20`, never a single run. Phase 5
goes last and alone because it is the riskiest: it competes with foraging for
ticks and touches idea conception, the two things this project's changelog has
the longest history of overtuning by accident.

Six phases:

### Phase 1 — Seeing and pointing

**Shipped 2026-09-10** — see `changelog.md`. `sim:check` stayed bit-identical
(36 of 36, 27 n/a, matching the baseline below).

Notes 1, 7, 13. Zero simulation changes, so `sim:check` must stay bit-identical
and any movement in its numbers is a failure of the phase, not something to
explain.

- **The plural picker.** `candidatesAt` moves from six `findNearest` calls to
  `SpatialHash.queryRadius` plus a filter on `hitRadiusOf(target) + GRAB_MARGIN`,
  sorted by distance and capped at a small count — the picker's bubble column is
  DOM, so a cap keeps it usable rather than protecting a budget.
- **Shape per resource kind in `drawNode`.** Crossed sticks, angular flint, a
  clay mound, upright reeds, berry dots, a fish wedge. `hitRadiusOf` lives next
  to the drawing code specifically so the two cannot drift apart — both change
  in the same commit.
- **`ItemPile.label` reaches the picker**, and a content label appears over
  piles within a few tiles of the player's own character — not at any distance,
  since that would be omniscience the knowledge-gating rule already forbids.
- **`NODE_LABELS` becomes typed over `ResourceKind`** while touching this code,
  closing the bug recorded in `bugs.md`.

### Phase 2 — Quantities and recipients

**Shipped 2026-09-10** — see `changelog.md`. `sim:check` stayed bit-identical
(36 of 36, 27 n/a, matching the baseline below).

Note 9, and the `give_item` defect.

- A quantity selector reusing `src/ui/SliderRow.ts`, which already exists and is
  unused for this purpose.
- `handOver` and `storeItem` accept a `count` parameter the way `drop` already
  does. `doTake` stops taking a fixed 6 of whatever the simulation likes, and
  instead receives the item and count named by the order.
- Giving gains a recipient picker, and the branch in `main.ts` reads
  `lastRefusal` instead of assuming failure means nobody was there.

### Phase 3 — Menus that nest, and asking

**Shipped 2026-09-11** — see `changelog.md`. Not bit-identical, and the plan
was wrong to expect it to be: the `ask` verb it calls for is a channel the AI
uses too, so it was measured with twenty seeds instead. Transmission went from
265.4 lessons passed on to 367.0, mean survival from 99.6% to 99.9%, and
starvation down on both counts.

Notes 10 and 11.

- `ActionOption` gains `children`; `RadialMenu` gains a page stack with a way
  back. "Make…" groups recipes into one entry; "Discuss tech with…" groups
  **every** workable idea, not only the current one.
- That requires the order to carry the chosen `tech`, the way it already
  carries `recipe` — `doDiscuss` currently re-derives it from `workableIdea`
  every time, which is what makes it always the same technology.
- An `ask` verb, the mirror of `teach` but started by the pupil, with
  acceptance gated on `opinion(teacher→pupil)`; and ordering someone to teach,
  through `Simulation.command` with its own `ORDER_COST` entry. Every refusal
  reaches `lastRefusal`.
- **This is transmission**, and `next-steps.md` §0 identifies transmission as
  the tree's real bottleneck. It is measured with
  `npm run sim:seeds -- --seeds 20`, never a single run.

### Phase 4 — A conversation worth having

**Shipped 2026-09-11** — see `changelog.md`. Eight commits, each measured across
twenty seeds. Against the phase's own starting point: mean survival 99.9% →
100.0%, technologies known 9.1 → 10.1, conceived past roots 8.8 → 9.4, lessons
passed on 360.1 → 420.7.

Two things the plan did not anticipate, both caught by measurement. The
conversation rungs are priced by their **cooldown**, not their warmth, and the
first tuning — which read "a greeting is worth little" as a small familiarity
gain — closed the gossip channel outright. And the cost of a cheap conversation
is the **walk to it**, not the conversation: the scorer has to scale its pull by
what the rung will actually answer, or the ladder doubles starvation while `talk`
itself takes under two per cent more of the day. O2's own warning, that a passive
pass must not grant the full value of a deliberate conversation, was earned
twice by two different routes.

Notes 5, 6, 2 and 8 — and this closes O1, O2 and O3 from the owner's older list.

- Conversation modes in `SocialSystem.converse`, chosen by `familiarity` and
  `lastContact`, both already on `Relationship`: greeting, small talk, asking
  about interests, deep talk. Each mode has its own cost and cooldown.
- `doDiscuss` and `doTeach` route through a shared social settlement:
  familiarity rises, and `company` drops by a **partial** amount — not to zero,
  which is what a full conversation costs. Scaled by `traits.intelligence`,
  which is the real "intellectual" trait the note was reaching for.
- A bond term in the `talk`/`give` scorer: pull toward the band and an extra
  pull toward the chief, scaled by `traits.loyalty` and reduced by grievance,
  using the same `grievance * (1 - loyalty)` account `considerRebellion`
  ([BandSystem.ts:293](src/sim/systems/BandSystem.ts#L293)) already uses.
- A nightly pass that groups everyone sleeping under the same roof and adds a
  small amount of familiarity. Once a day, not per tick, capped per building.

### Phase 5 — Thinking

Note 4, and it runs **alone and last** among the simulation-touching phases
because it is the riskiest: it competes for the same ticks food-gathering
needs, and it touches idea conception.

- A `reflect` verb, available with no prior idea, when the person is
  comfortable, not fatigued, has no work pending and is not under order. The
  HUD must say "thinking," distinct from wandering.
- Feeds conception two ways: as a `doing` ingredient in `Synthesis.ts`'s spark
  table, and as a factor in `tryConceive`'s `chance`.
- **A warning already lives in the code, and it is worth repeating rather than
  ignoring.** `Brain.ts:906-909` records that on an earlier pass `ponder`'s
  weight was raised and thinking became the sixth most common activity in the
  world, ahead of building and sleeping — "which is not a stone age." `reflect`
  must be measured against that exact failure with `ai-uses-many-actions` and
  twenty seeds, and **`conceptionBase` is not the lever to touch** — it never
  has been, on this project's own record.

### Phase 6 — Letting the character look after itself

Note 3. Independent of everything above it.

- Three visible, switchable states: manual (today's behaviour), "handle what's
  urgent" (the brain acts only on a critical need and only with no order
  pending), and automatic. An explicit order always overrides whichever state
  is active.
- A change to the branch at
  [Simulation.ts:1965-1974](src/sim/core/Simulation.ts#L1965-L1974), and a new
  `Settings` field. The comment already there ("scored but never steered: the
  human decides whether to listen") explains the *original* decision and should
  be replaced with the reasoning for the new one, not deleted — this project's
  house style keeps the why, including the why that used to hold.

### A design section for M10, not for M9: note 12

Documented in full — standing between bands, territory grown from
`homeX/homeY`, pressure from scarcity, a raiding-party organiser in
`BandSystem.daily`, captivity as a state on `Person` — and scheduled **after
M8.2**, on the same argument the plan already uses for O4 and O5: today a band
owns a storage pit; after the Neolithic it owns fields, a herd and a kiln, and
only then does raiding mean something. The owner said as much directly: bands
cooperate early because there is plenty, and stop later because there is not.

---

## Gates

- **Phases 1-3**: `npm run sim:check` bit-identical to the M8.1 baseline below.
  Any drift fails the phase.
- **Phase 3's `ask`/teach-order channel**: `npm run sim:seeds -- --seeds 20`,
  read against `next-steps.md` §0's transmission finding.
- **Phase 4**: `ai-uses-many-actions`, twenty seeds, watching that conversation
  does not starve foraging of ticks.
- **Phase 5**: `ai-uses-many-actions` and twenty seeds, explicitly checked
  against the "sixth activity" failure mode `Brain.ts` already records. No
  change to `conceptionBase`.
- **Phase 6**: no simulation gate — it is a control-scheme change. Verified by
  play: an "attend to urgent needs" player character must not die of thirst
  while idle, and must still yield instantly to a manual order.

## Risks

- Phase 4's bond term and Phase 5's `reflect` both change `Brain`'s scores,
  and `AGENTS.md` warns that its coefficients are calibrated against each
  other — a change to one can silently disable a gate elsewhere. Run
  `ai-uses-many-actions` after each, not only at the end of the milestone.
- Phase 3's nested menu is the only UI-only phase with real complexity risk:
  a page stack that does not return to the right place, or that hides an
  option a flat menu used to show, degrades silently the way the screenshot
  tour already has once (`bugs.md`).
- Phase 6 changes a branch `AGENTS.md` calls out by name as a deliberate
  design choice from M6a. The replacement comment must explain the new
  decision as thoroughly as the one it replaces explained the old one.

## Baseline to compare against

`npm run sim:check` re-run on 2026-09-10, before any M9 code: **36 of 36
applicable checks pass**, 27 n/a. Throughput is noisy run to run — this pass
measured 3,534 steps/s, `next-steps.md` recorded 3,836 the same day — so
`perf-budget`'s 2,000 floor is what matters, not the exact figure. Phase 1's
promise of being bit-identical is checked against the pass/fail line and the
per-check numbers above it, not against steps/s.
