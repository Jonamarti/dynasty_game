# M9.6 — what a person feels, and four repairs on the way

The owner's notes of 2026-09-17, triaged and planned.

> **Phases 0 to 3 shipped on 2026-09-17**, the day this was written. The
> measurements, and the three places the plan below turned out to be wrong, are
> in [changelog.md](changelog.md). In short: the soil link in phase 1c was
> designed here and dropped after checking `Soil` (untouched ground is already
> at its ceiling, so it would have bought nothing and grown the daily sweep);
> the claim in phase 2 that `TechWeb` relaxes every frame was false, as it has
> always cached its layout; and phase 1 needed a third commit nobody planned,
> because the out-of-season tail was propping up an autumn that a second defect
> had already emptied. **Phases 4 and 5 — happiness, and sleeping rough — are
> still to do**, and still run after M8.2.

## Context

Six notes, given directly rather than through `docs/notes.txt` (which is
committed empty and stayed empty). They are not one pass, and the sizes are
wildly uneven: four are an afternoon each, one is a milestone, and one of the
afternoons turned out to be sitting on top of a real defect in the autumn
harvest that nobody had measured.

Two of them already have entries in [bugs.md](bugs.md) written from the other
side — the graphs relaxing every frame (M9.5 phase 4e) and a season-gated
harvest in a half-length year (M9.5 phase 3). The owner has now seen both from
inside the game, which is the strongest argument there is for promoting a
"left alone" entry into a phase.

### Triage — where each note goes

| # | note | destination |
|---|---|---|
| 5 | Default speed 5 | **Phase 0** — verify first; the config already says 5. **Shipped** |
| 1 | Fruit trees should not carry fruit out of season; it should fall as rotten | **Phase 1**, with the autumn-harvest repair it forces. **Shipped**, in three commits |
| 2 | The tribe graph changes shape very fast | **Phase 2** — a real defect, diagnosed below. **Shipped** |
| 6 | A depleted node should not be the same picture made smaller | **Phase 3** — renderer only, bit-identical. **Shipped** |
| 3 | Happiness: beds, a roof, talking to family and kin | **Phase 4** — the milestone, and the seam `Mood.ts` names |
| 4 | Sleeping rough is penalised unless there are guards and a perimeter | **Phase 5**, with the half that needs fences deferred to **M10 phase 2** |

### The order, and why

Phases 0 to 3 are cheap and two of them are bit-identical, so they run **before
M8.2's remaining fifteen Neolithic nodes**: phase 1 changes the food economy and
wants measuring against a world nobody has just added fifteen technologies to,
and phase 3's depleted art is the thing the owner is looking at all day.

Phases 4 and 5 run **after M8.2 and before M10**. Mood ships with the proxies
for safety that are real today, and M10 phase 2's fences and border guard then
have something to pay off in — which is a better order than building fences
first and hoping a reason for them turns up.

---

# Phase 0 — the speed the game opens at (note 5)

**Verify before writing anything.** `DEFAULT_CONFIG.time.tickRate` is already
**5** ([Config.ts:248](src/sim/core/Config.ts#L248)), has been since M6c, and
the comment there says in as many words that it is the single place the default
lives. The browser loop reads it ([main.ts:99](src/main.ts#L99), and again at
[main.ts:137](src/main.ts#L137) when the start screen rebuilds the world) and
the HUD slider opens on the same number
([Hud.ts:184](src/ui/Hud.ts#L184)). A fresh profile therefore already opens at
5, and the note has to mean one of three other things:

1. **A stored override is winning.** `time.tickRate` is a tunable on the
   settings screen ([Difficulty.ts:212](src/sim/core/Difficulty.ts#L212)), and
   anything moved there is written into `dynasty.settings.overrides` and kept
   for ever ([SettingsStore.ts](src/ui/SettingsStore.ts)). Once game speed has
   been dragged on that screen, *every* world opens at the dragged value and the
   only way back to 5 is "Reset everything to Normal", which also throws away
   every other tuning the player has made. This is the most likely reading, and
   it is the same class of surprise the `AUTONOMY_KEY` comment in that file was
   written about: a control-scheme preference does not belong in a difficulty
   document.
2. **The note is about the slider, not the config** — it should snap back to 5
   on a new world however it was left.
3. **It is about walking speed**, not the clock, in which case this phase is
   aimed at the wrong file and `MovementSystem.speedOf`
   ([MovementSystem.ts:311](src/sim/systems/MovementSystem.ts#L311)) is the
   place to look.

**Ask the owner which**, then fix. If it is (1), lift game speed out of
`overrides` and store it under its own key beside autonomy — pacing is taste,
not difficulty, which is exactly what the comment above the clock group in
`Difficulty.ts` already says. No simulation change either way; `sim:check` stays
bit-identical.

---

# Phase 1 — fruit keeps its season, and windfall rots where it falls (note 1)

## What happens today

`Tree.advanceDay` ([Tree.ts:189](src/sim/entities/Tree.ts#L189)) swells fruit at
`fruitYield / 18` a day in season, and out of season takes it off at
`fruitYield / 10` a day — during which it is still on the branches and still
fully pickable. The owner is right that this is wrong twice over: the fruit is
there when it should not be, and when it goes it goes nowhere.

## The thing found while checking it

**Cutting the out-of-season tail on its own would remove most of what is left of
the autumn harvest**, because the swell it is compensating for is broken.

The daily block runs at `tick % ticksPerDay === 0`
([Simulation.ts:2316](src/sim/core/Simulation.ts#L2316)) — midnight, as
`shareTheHearth`'s header says. At midnight `daylight` is 0, so `temperature`
takes its full diurnal penalty of `-0.3`
([TimeManager.ts:70](src/sim/core/TimeManager.ts#L70)), and in mid-autumn the
seasonal term is ~0. So `growth` is about **0.08** — under the `max(0.2, growth)`
floor in `advanceDay`, every autumn day, every year. `ForestSystem.daily` is
handed the worst hour of the day and treats it as the day
([ForestSystem.ts:64](src/sim/systems/ForestSystem.ts#L64)).

At that floor an autumn crop fills at `fruitYield / 90` a day, in a season that
is now **10 days long** ([Config.ts:241](src/sim/core/Config.ts#L241)). An apple
tree sets about **1.6 of its 14 apples**; an oak about **4 of its 40 acorns**;
hazel about 1 of 9. Summer is unaffected — the seasonal term carries midnight to
`growth` around 0.71 — which is why plums and pears look fine and why the default
twelve-day spring-and-summer run still reports `forest-is-used` with 58 fruit
picked.

This is the second half of the bugs.md entry "A season-gated harvest is a much
narrower window now that a season is half as long", and it explains, exactly,
the neighbouring entry in which `millers` stopped picking acorns: the autumn
mast — the whole reason `grinding` was worth building — has been a rounding
error since M9.5 phase 3.

## Three commits, in this order, each measured

**1a — sample the day, not midnight.** Give `TimeManager` a growth that drops the
diurnal term (the seasonal curve alone, which is what "how readily anything grows
today" should have meant) and hand *that* to `ForestSystem.daily`. Every other
caller of `growth` runs per tick and averages over the day already; this is the
one daily consumer, so the change is small and its blast radius is the wood.
Measured on its own: fruit picked, `forest-is-used`, `--seeds 20`.

**1b — put the swell on the calendar.** `fruitYield / 18` is an absolute
calendar constant of exactly the kind M9.5 phase 3 spent its budget removing
(`DAYS_PER_YEAR`). Replace it with a crop that fills in a fixed *fraction of its
own fruiting window*: `fruitYield / (fruitSeasons.length * daysPerSeason * 0.8)`.
`Tree` already takes `daysPerYear` through its constructor for this exact reason
([Tree.ts:120](src/sim/entities/Tree.ts#L120)), so the migration is the one that
file has already made once.

**1c — the drop, which is the note.** On the first day out of season the crop
leaves the branches **at once**: `windfall += fruit; fruit = 0`. Then:

- `windfall` is **not food**. It is rotten; nobody picks it, and there is no
  `rotten_fruit` item and no verb for putting scraps on a heap. That second
  omission is deliberate and already argued in
  [Building.ts:330-343](src/sim/entities/Building.ts#L330-L343): a feeding verb
  would be a fourth step in a chain whose history in this project is that each
  extra step is where the chain breaks.
- What windfall *does* is go back into the ground. It decays over about four
  days and feeds humus to the soil under the canopy through `Soil`'s single
  putting-something-back entry point
  ([Soil.ts:288](src/sim/core/Soil.ts#L288)) — the first link between the wood
  and M8.2's soil layer, and true to life: an old orchard stands on good ground
  because of this.
- It is **drawn**: dark specks scattered under the canopy, fading as they rot.
  The owner asked to see rotten fruit on the ground, and a state nobody can see
  is the defect this project has a rule about.
- It is **explained**. Ordering someone to pick a tree whose crop is down must
  refuse with its own reason id (`tree_fruit_fallen`) through
  `Simulation.lastRefusal`, not fall through to the existing `tree_bare`, or the
  player is told the tree never had any. `Brain`'s fruit scorer gains the same
  season test so nobody walks half a mile to a tree with nothing on it.

**Never ship 1c alone.** 1a and 1b both give food back and 1c takes food away;
shipped together the net is unknowable, and shipped in the wrong order the world
starves for a week of measurements. One commit each, `--seeds 20` each, against
the default scenario and `century`.

## Checks

- `fruit-comes-and-goes-with-the-season`: fruit on the branches in its season,
  zero out of it, and windfall observed at the turn. **Verify it fails on the
  build without 1c** before trusting it — the tail today decays slowly enough
  that a lazily written check would pass on both builds.
- A scenario that actually reaches an autumn with mature orchard trees. The
  bugs.md entry on `millers` says plainly that no scenario in the suite has
  shown the acorn chain happening twice since the seasons halved; 1a and 1b are
  the change that should bring it back, so **the acorn count in `millers` is the
  headline number for this phase**.

---

# Phase 2 — a tribe graph that holds still (note 2)

## Why it churns

`layOutTribe` ([TribeGraphLayout.ts:150](src/ui/TribeGraphLayout.ts#L150)) is
rebuilt from nothing every frame, and it is a *continuous function of current
opinion* in four separate places:

1. **The seed order is the opinion order.** `knownBy` sorts by
   `Math.abs(opinion)` ([Relationships.ts:76-86](src/sim/social/Relationships.ts#L76-L86)),
   and `familiarity` is re-earned by standing near somebody and decays 6% a day
   ([Relationships.ts:40](src/sim/social/Relationships.ts#L40)) — so the order of
   that list churns continuously while people walk about. In the flat graph the
   index sets the ring angle; two people swapping teleport past each other.
2. **In ranked mode the row order is that same sort**, alternating out from the
   middle of the row (`seedRows`, [TribeGraphLayout.ts:250](src/ui/TribeGraphLayout.ts#L250)),
   so one swap moves two nodes several slots apart. `seedRows`' own header
   explains why the relaxation cannot undo it: with `y` pinned, a row is
   one-dimensional and neighbours are walls.
3. **The springs are continuous in opinion** — `restLength` is
   `150 - opinion * 0.9` — so even with no swap at all, 220 relaxation passes
   land somewhere slightly different every frame.
4. **The digest hashes `x.toFixed(0)`** ([TribeGraph.ts:190](src/ui/TribeGraph.ts#L190)),
   so a one-pixel difference rebuilds the whole panel. It was written to keep
   hovering alive, and at this precision it is doing the opposite.

Add the 24-person cap and the marginal acquaintance pops on and off the graph as
well. None of this is random — there is no RNG anywhere near it — but it reads
as noise, which is the note.

## The fix, in order

**2a — keep the arrangement between frames.** Cache the last position per
`personId` while the panel is open and seed the next layout from it, relaxing a
handful of iterations instead of 220. The picture then *eases* toward the new
truth instead of being re-derived from scratch, and this is also the cache the
existing bugs.md entry "The three graphs relax their whole layout every frame"
asks for. Do it for `FamilyTree` and `TechWeb` in the same pass or that entry
stays open with two thirds of its evidence intact.

**2b — freeze the order, not the position.** Work out the ring angle and the row
slot once when the panel opens, and re-sort only when the underlying order
changes by more than a hysteresis band — a pair only counts as swapped when
their opinions cross by several points, and the 24th acquaintance only leaves the
graph when it falls clear of the cap. Hysteresis is the honest fix here: the
positions are *correct* today and merely unstable, so nothing may be rounded
away that the player is entitled to see change.

**2c — quantise the digest.** Opinions to the nearest 5 and positions to the
nearest few pixels. Split it into the part computed from the world and the part
computed from the picture, which is what lets the world part run *before* the
layout — the second half of the bugs.md entry's proposed fix.

## Checks

An e2e spec with `?skipIntro=1` that opens the graph, steps a few hundred ticks
and asserts that **no node moves more than a small distance per frame** and that
**no node changes row unless its `BandRank` changed**. `perf-budget` is not the
instrument for the cost half — bugs.md records that it cannot see the renderer
at all — so measure the panel with a frame profile and quote the
before-and-after in the changelog.

---

# Phase 3 — a depleted thing looks depleted (note 6)

Renderer only. **Must leave `sim:check` bit-identical.**

Today every kind is one glyph scaled by fullness —
`size = scale * (0.18 + fullness * 0.22)` — and at zero every kind becomes the
same grey square ([Renderer.ts:553-643](src/render/Renderer.ts#L553-L643)). The
shape work that made a bush a cluster of dots and flint a shard stopped at the
outline; the *state* is still nothing but a size, and a size is exactly what a
player cannot judge at a glance.

What each kind should become. Two or three **discrete states** — full, picked
over, spent — rather than a continuous scale, so the difference is legible at
speed:

| kind | spent |
|---|---|
| `sticks` | **nothing.** The branches have been taken; there is bare ground until it regrows |
| `berries` | a stripped bush: the twiggy frame stays, the five fruit dots go |
| `reeds` | cut stubble — the same three blades, short |
| `clay` | a worked pit: the mound hollowed out and darkened |
| `flint` | a pale scar. It never regrows (`regrowPerTick: 0`), so this is permanent, and leaving it visible is `ResourceNode`'s own argument — a band should be able to see the ground it has used up |
| `fish` | nothing but a ripple |

**The trap in "show nothing".** An empty stick node still exists and still
regrows, so if it is drawn as nothing it must also be **un-clickable**:
`hitRadiusOf`'s `'node'` case is sized from the same fullness formula
([Renderer.ts:1109](src/render/Renderer.ts#L1109)), and left alone it leaves a
small invisible thing the player selects by clicking bare grass. Route it
through the same predicate the snow-burial rule already uses
([Renderer.ts:377](src/render/Renderer.ts#L377)) so there is one rule for "in the
world but not on screen", not two that will drift.

`npm run shots` is the instrument. `sim:check` must not move by a single digit.

---

# Phase 4 — happiness (note 3)

This is the milestone, and the seam is already named in writing.
[Mood.ts](src/sim/core/Mood.ts)'s header says there is no mood, happiness or
stress field anywhere in `src/sim/`; that `expressionOf` is deliberately a pure
*read* of needs, health, harm and proximity; and that a persistent, heritable
mood is the obvious next step which does not belong hiding inside an art pass,
because `TRAITS` and a new `Person` field are iterated by founding, inheritance,
ageing and the character-creation point budget. **This is that pass, and that
migration is its first commit.**

## Shape: channels, not a number

One number that goes up and down tells the player nothing and tells `Brain`
almost as little. Follow `RelationshipGraph`, which is the best-aged structure in
this codebase for exactly this reason: separate components, ageing at different
rates, so the UI can answer **why** rather than only **that**.

`Person.mood`, with four channels, each decaying toward a baseline set by
temperament:

- **comfort** — how last night was spent. A roof, warmth, a bed when beds exist;
  the open ground, the cold and the snow when they do not.
- **belonging** — kin and household near you, conversation with family, the
  hearth shared.
- **security** — recent harm, being threatened, strangers in camp, sleeping
  unguarded. This is the channel phase 5 writes to.
- **purpose** — work that comes off against work that keeps being interrupted.
  `person.noticed` is already exactly that record and `expressionOf` already
  reads it for `frustrated`.

One entry point, `mood.add(channel, amount, reason)`, keeping the last few
reasons, so the inspector can say **"slept in the open, three nights"** rather
than showing a bar. That is the same standing instruction `lastRefusal` exists
to serve, applied to a number instead of a refusal.

## What already exists to feed it

Every source the owner named has a system that already computes it, which is
what makes this affordable:

- **Indoors** — `Building.def.shelter` and `roof.contains`; and
  `shareTheHearth` ([Simulation.ts:1372](src/sim/core/Simulation.ts#L1372))
  already samples, at midnight, precisely who slept under which roof and hands
  it to `SocialSystem.hearth`. The comfort and belonging channels are a few
  lines inside a pass that already runs.
- **Family and kin** — `Relationship.kinship`, and the conversations
  `SocialSystem` already tracks with a named partner.
- **A bed** — **does not exist.** Beds are part of what M7 still owes
  (`next-steps.md` §6: walls, interiors, beds, region repair). The bed term is
  therefore *not* written into a table in this phase; it arrives with M7's
  interiors, in the commit that makes a bed a thing you can lie on. A declared
  bonus for furniture nobody can build is the defect this project has a rule
  against.

## What reads it, and in what order

Ship the machinery inert first, exactly as spoilage and M10's building wear both
do, so "the field exists" and "the field changed the world" stay separable:

- **4a** — the `Person` field, the four channels, the decay, the trait, the
  inheritance, the character-creation row, the inspector panel, and dry-run
  counters. **No behaviour reads it.** Bit-identical except for the trait
  migration, which moves the RNG and must therefore be its own commit with its
  own before-and-after.
- **4b** — `expressionOf` reads it, so the face finally has the backing its
  header wishes for. Renderer-visible, still no behavioural effect.
- **4c** — `Brain` reads it: low spirits bias toward company, rest, `play` and
  the flute — all four already exist, and `music-answers-loneliness` is already
  a check. Measured, `--seeds 20`, and `ai-uses-many-actions` read as a
  distribution rather than a pass, per `AGENTS.md`.
- **4d** — the extremes bite: a long-miserable person is likelier to rebel
  (`SocialSystem` already has rebellion), likelier to leave, slower to heal.
  Each one its own commit, each measured. **Nothing here is allowed to become a
  second starvation mechanic by accident** — watch mean survival across 20
  seeds and stop if it moves.

---

# Phase 5 — sleeping rough (note 4)

## The obstacle, which is structural

**There is no such thing as sleeping outdoors today.** `doSleep` requires a
building and returns early without one
([ActionSystem.ts:1933](src/sim/systems/ActionSystem.ts#L1933)); somebody with no
roof `rest`s instead ([ActionSystem.ts:944](src/sim/systems/ActionSystem.ts#L944)),
which is the same verb as sitting down at noon. So there is no state to hang a
penalty on.

Give `sleep` an outdoor branch — a place rather than a building — so that a
night in the open is a night, with wake reasons, a recorded location, and
something for `shareTheHearth` to sample honestly. That is a change to a verb
five other things use, so it is measured, not a data change.

## The penalty, and the relief

- Sleeping on the open ground costs **comfort**, more in cold and more with snow
  on the ground (`Snow.ts` already gives depth at a point), and costs
  **security** as well.
- The relief the owner names — **guards and a perimeter** — does not exist. There
  is no `guard` job and no fence; both are **M10 phase 2**
  ([m9_5_plan.md](m9_5_plan.md), "Fences, territory, and the border guard").
  Writing the clause now against nothing that satisfies it is inert content.
- So phase 5 ships the two proxies that are **real today**: sleeping inside your
  own band's camp (within reach of a complete building your band owns) and
  sleeping in a huddle (other band members within a short radius). Both are
  honest, both are already queryable through the spatial hash.
- **M10 phase 2 then adds the two real terms to the same function** — a claimed
  tile under you, and a guard on patrol within range. That is the payoff those
  fences otherwise lack, and it is the reason this phase runs before M10 rather
  than after it.

---

# Documentation, at the end of each pass

- `docs/next-steps.md`: **§7f — the owner's notes of 2026-09-17** with the triage
  table above, and a row per phase in the milestone table.
- `docs/bugs.md`: the M9.5 phase 3 entry on season-gated harvests gains the
  midnight-sampling half found here; the M9.5 phase 4e entry on the graphs
  closes when phase 2 lands (all three panels, or it does not close); anything
  found and not fixed goes in.
- `docs/changelog.md`: an entry per phase, with the reason and the numbers.

# Verification

Per `AGENTS.md`, fastest first.

```bash
npm run typecheck                          # ~3s
npm test                                   # unit + determinism   ~1s
npm run sim:check:all                      # 16 scenarios         ~15s
DYNASTY_PORT=5399 npm run e2e              # Playwright           ~21s
npm run shots                              # phases 1c and 3
npm run sim:seeds -- --seeds 20            # every commit of phases 1, 4c-4d, 5
```

Phase by phase:

- **0** — no simulation change; `sim:check` bit-identical, and a fresh profile
  opens at 5 with an existing one that has a stored override also opening at 5.
- **1** — `--seeds 20` per commit on the default scenario and `century`;
  `millers`' acorn count is the headline; `fruit-comes-and-goes-with-the-season`
  verified failing on the build without 1c.
- **2** — an e2e spec for stability; a frame profile before and after; the
  tribe, family and tech panels all three.
- **3** — `npm run shots`; `sim:check` **bit-identical**.
- **4** — 4a bit-identical apart from the trait migration, which carries its own
  measurement; 4c and 4d `--seeds 20` with mean survival watched as closely as
  the mood counters.
- **5** — `--seeds 20`, and `sleep-restores` must stay PASS rather than turning
  n/a: an outdoor branch that quietly stops people using huts would show up
  exactly there.

**Determinism:** phases 0, 2 and 3 touch no simulation state at all. Phase 1
changes daily arithmetic over existing state and needs no fork. Phases 4 and 5
need **no new RNG stream** if mood is arithmetic over events — and if 4a's trait
genuinely needs a draw, it is appended **genuinely last**, after the anonymous
fourteenth fork that `AGENTS.md` warns about, and never inserted into
`spawnResources`' plan array. Say which in every commit message.
