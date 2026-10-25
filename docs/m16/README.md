# Dynasty — M16 plan (v3, single-agent, phase cards)

Written 2026-10-16 against `0.15.160-alpha` (commit `0c2214e`). Replaces the
earlier plan drafts (`m16_plan.md` v1/v2 and the QA reviews), which were
removed from `docs/` and are kept in git history at commit `99a2ec5`
(`git show 99a2ec5:docs/m16_plan.md`). You never need them to execute a
phase; their decisions are in section 2 and their phases in the cards.

**How to use this folder.** You are one agent doing one phase. Read, in this
order and nothing else unless your card tells you to:

1. `AGENTS.md` (the whole file).
2. This README, sections 1 to 6.
3. Your phase card in `phases/`.
4. Section 7 here (the sequence) only to find your card and to mark it done.

Then follow the **phase protocol** (section 4) to the letter.

| File | What it is |
|---|---|
| `README.md` (this) | rules, decisions, protocol, the ordered list of phases and their status |
| `phases/<id>-<slug>.md` | one card per phase: goal, background, files, steps, tests, done-when, pitfalls |
| `diary.md` | one entry per finished phase (template in section 4.3); raw material for the development story |
| `doubts.md` | stop-rule notes (R0): where the plan and the code disagree |
| `baseline.md` | created by phase 0.1: the frozen starting point |
| `../m16_bugs.md` | the triage (Spanish). Cards copy what they need from it; IDs such as N16, K3, E9 come from there |
| `../m16_room_temp_plan.md` | full design of outdoor/room temperature (Spanish); cards 15.0a–15.0g summarise it |
| `../m16_notes.md` | implementation observations inherited from M15 (background only) |

---

## 1. What M16 is

All features working, with algorithms still to be tuned. **Still alpha**
(`0.16.x-alpha`). Never write "beta" anywhere; if you think the game is ready
to leave alpha, say so in `docs/next-steps.md` and touch nothing else.

Goals, in order:

1. Fix what the owner reported as broken (block 2), and prove each fix with a
   test that describes what the player expects.
2. A shelter ladder that starts from nothing: caves, a stick-and-leaf lean-to,
   a cheaper mud hut, a cap on how many fit inside, and upkeep as the natural
   limit on how much a band can hold (block 14).
3. Directing a character is comfortable (block 3, 11).
4. NPCs look ahead and organise themselves: foresight, agenda, assembly,
   command (blocks 4, 5).
5. A richer physical world: temperature, shores, weather, water life, fauna
   (blocks 15, 17).
6. Objects, building and craft driven by wants instead of a planner (blocks 6, 14).
7. Other bands as rivals that are perceived and answered (blocks 7, 13).
8. Discovery by experiment rather than by reading the tech web (blocks 8, 16).
9. Calibration and close (block 10).

**Out of M16** (moved to M17 or later by the owner on 2026-10-16): item weight
(old 12.1, decision D-12), game modes (old 9.2–9.3, decisions D-10, D-14,
note N22). Also everything listed in section 8.

---

## 2. Decisions (all resolved)

Owner answers given on 2026-10-16 are marked **owner**. The rest take the
default the earlier plan proposed; the owner may override any of them later,
and a card that depends on one names it.

| # | Question | Answer | Used by |
|---|---|---|---|
| D-1 | Assembly: is each listener's answer fixed or random? | **owner:** fixed by threshold, no draw, so the "use authority" preview is exact | 5.3, 5.4, 5.6 |
| D-2 | Skill gate: who needs the minimum skill on a building? | **owner:** one master present among those working is enough; the rest help at their own rate and learn | 6.5 |
| D-3 | In "Keeps itself alive", does the character flee an attack? | default: no change; the attack warning of 3.2 covers it | 3.2 |
| D-4 | What does the tech web show of an undiscovered tech? | **owner:** the name, and the ingredients already met; of the missing ones only how many | 8.0 |
| D-5 | Marrying across bands: which band does the couple belong to? | **owner:** the band of the household where they go to live. Kept in M16 as phase 7.7 | 7.7 |
| D-6 | Performance budget | default: 300 people at normal speed | 1.8, 10.4 |
| D-7 | Emigration without travel | resolved by M15: comarca travel exists, emigrating is real travel | 5.8 |
| D-8 | May you take a loose item belonging to your own band? | **owner:** yes on common ground; no inside another household's house or store | 6.3 |
| D-9 | Which open M15 gates block M16? | **owner:** none. The open gates of `docs/m15_closeout_20261016.md` (lean, recovery, fire, correspondence, 32c peoples, 15c spoilage) are frozen as the M16 baseline by phase 0.1 and revisited in block 10 | 0.1, 10.2 |
| D-10 | Extinction rate per game mode | deferred with the modes | — |
| D-11 | Names | **owner:** `Hearth` → «Hoguera», `Fireplace` → «Hogar» in Spanish; the tribe centre building (N23) is the **Totem** («Tótem»). Internal ids (`hearth`, `fireplace`) never change | 2.15 note, 13.1, i18n |
| D-11a | Setting "Reduce flashes and shaking" | default: yes, in Settings | 3.2 |
| D-12 | Item weight | deferred with 12.1 | — |
| D-13 | Shelters without wood | **owner, replaced by the shelter ladder:** caves on the map (generated **before the people are placed**, own RNG stream), a stick-and-leaf lean-to (no axe, no mud, buildable away from water, 2 places, low warmth), a cheaper mud hut (no wood, more sticks, less mud, fewer places, warmth between lean-to and better houses), occupancy limits, and **daily wear plus repair** as the natural limit on buildings | block 14 |
| D-14 | Play as another NPC | deferred with the modes | — |
| D-15 | Weather (N26) vs the temperature plan's exclusion of rain | default: weather is its own phase 15.1, after the temperature deliveries; it lifts that exclusion only for itself | 15.1 |
| D-16 | Outdoor furniture placement | **owner:** only where `territoryOwnerAt(x, y)` is the band; a band with no territory yet may place within 8 tiles of one of its finished buildings; otherwise refused with a reason | 2.22 |
| D-17 | Fog of war | **owner:** the explored fog of the directed character is **saved with the game** ("when the game is saved, EVERYTHING is saved"). Switching character clears it (already shipped in M15: `e2e/fog-on-switch.spec.ts`). Seen tiles out of sight are dimmed, never black | 2.3 |
| D-18 | From what age does a child dress itself? | default: from the "child" `LifeStage`; before that it is never dressed, and its warmth is that of whoever carries it. A carer dressing someone else is out of M16 | 2.27 |
| D-19 | Coast card when choosing a comarca | default: the card says "coast: there may be no reachable shore"; no per-cell water forecast | 11.5 |
| D-20 | Changelog fragments per lane | moot: one agent in series, so `AGENTS.md` applies unchanged (version bump and `changelog.md` entry in the same commit) | — |
| D-21 | Which blocks get a switch? | **owner:** only the AI blocks: `foresight` (4, and 6.2/6.7 which extend the agenda), `assembly` (5), `rivalry` (7.1–7.4, 7.6), `experiment` (8, 6.4). Everything else changes the world directly and re-pins the baseline (section 5) | all |

---

## 3. Rules

Every rule of `AGENTS.md` stands. These are the ones M16 leans on most, plus
the new ones. A card may cite them by number.

| # | Rule |
|---|---|
| **R0** | **Stop rule.** If the card does not match the code (a function is missing, does something else, or a step is already done), do not invent. Write it in `docs/m16/doubts.md` (phase, what you expected, what you found, file:line), and either (a) adapt if the card's *goal* is unambiguous and the difference is only a name, saying so in the diary, or (b) leave the phase and take the next one in section 7 that does not depend on it |
| R1 | Never `Math.random()`. Every draw comes from a seeded `RNG` |
| R2 | A new RNG fork goes **after the last row of the fork table in `AGENTS.md`** (today: `redOchreRng`, #25), and gets its row in that table in the same commit. Reserved numbers: section 6 |
| R3 | `src/sim/` never imports the renderer or touches the DOM |
| R4 | Every long action checks `this.interruption(person, ctx)` and banks its progress on the thing worked on. Only exception: what phase 3.1 changes for the directed player |
| R5 | Every "nearest X" goes through a spatial hash. Never scan an entity array |
| R6 | If the simulation refuses, stops or abandons something, the UI says why (`Simulation.lastRefusal`, chronicle, insights) |
| R7 | Every player-visible word goes through `t()` with its Spanish in `src/i18n/es/`. One literal per `t(...)` call |
| R8 | The UI never reads a stranger's private state; go through `sim/social/Knowledge.ts` |
| R9 | Never edit `public/art/` by hand: change `art/src/`, run `npm run art:build`, look at `npm run art:sheet` |
| R10 | A full-screen overlay has `[hidden] { display: none; }` in CSS and does not rebuild its DOM every frame |
| R11 | **New saved state.** A new class hung on `Person`, `Household`, `Band` or `Building` is registered in `persistence/EntityRecords.ts` (`constructorEntries`) and gets a round-trip test: save, load, compare, advance, compare. Plain data saves by itself but still gets the test |
| R12 | Values computed once a day are stored on the person and **not** recomputed on load |
| R13 | **Off equals before.** With a block's switch off, seeds `1`, `2`, `3` of scenario `band` at 3,000 steps give the same checkpoint fingerprint as the pinned baseline. The test exists from phase 1.3 (`switches-off.test.ts`) |
| R14 | `Brain.ts` only receives hooks. New logic lives in new modules (`ai/Lessons.ts`, `ai/Foresight.ts`, `ai/Agenda.ts`, `social/Assembly.ts`, `social/Rivalry.ts`, …); in `Brain.ts` you add the call |
| R15 | One switch per AI block (D-21): `motivation.foresight`, `motivation.assembly`, `motivation.rivalry`, `motivation.experiment`. All default `false` until block 10 |
| R16 | Every threshold in a card comes with a starting value. Put it in `Config` with that value. Do not change it to make a test pass; tuning happens in block 10 |
| R17 | Before trusting a new test or check, make it fail without your change (comment the fix out, run, restore) |
| R18 | Never delete or loosen an existing test or check. If its premise changed, rewrite it and say so in the commit |
| R19 | Adding a scored action changes every world. Compare "before and after" with mechanism counters and paired seeds, never with one check flipping |
| R20 | 20 seeds cannot resolve less than ~10 survival points. For smaller effects: 40 seeds or a counter |
| R21 | **The baseline is red.** At `0.15.160`: the `sim:check:all` matrix has 43 scenarios, 17 clean, 118 failing checks (`docs/m15_closeout_20261016.md`). "Done" never means "matrix green"; it means "no new failure without an explanation". Phase 0.1 freezes the exact list |
| R22 | **No bug is closed without a capability test.** First write a test named after what the player expects (`m16-hearth-buildable`, not `m16-fix-n16`). If it passes on current code, keep it as a regression test, record "already fixed, verified <date>" and change no game code. If it fails, it is the live bug |
| R23 | **Every new `Config` key gets a checkpoint migration.** The codec rejects unknown or missing fields; without a migration, older saves stop loading. The migration sets the value that reproduces the old behaviour, and a test loads a checkpoint without the key and advances it identically |
| R24 | **Everything is saved** (owner, 2026-10-16). Any state the player can see or that affects play — including UI state such as explored fog — persists across save/load with a round-trip test. "Rebuild it approximately on load" is not acceptable |
| R25 | **Hot files.** `Simulation.ts`, `ActionSystem.ts`, `Brain.ts`, `BandSystem.ts`, `main.ts`, `Renderer.ts`, `Hud.ts`, `ActionCatalog.ts` are each thousands of lines. Add a call into a new module rather than a new block of logic, unless the card names the function to change |
| R26 | e2e port: if `npm run e2e` fails with `EACCES`, use `DYNASTY_PORT=5399` (PowerShell: `$env:DYNASTY_PORT='5399'`). A **new e2e spec must be added to the explicit list in `package.json` → `scripts.e2e`**, or it never runs |
| R27 | Never run two cohorts (`sim:seeds`) at once on this machine: they compete for CPU and spoil each other's timings and `perf-budget` |
| R28 | `npm.cmd` (not `npm`) in PowerShell when passing flags; check the echoed command and the file count |

---

## 3b. Glossary

| Word | Means |
|---|---|
| **Switch** | boolean field in `Config.motivation` that turns a whole AI block on |
| **Baseline** | saved results from before a phase, to compare against |
| **Pin / re-pin** | `npm run baseline:pin` (from 1.3) rewrites `fixtures/switches-off.json` after a deliberate world change |
| **Fixture world** | a checkpoint built from a recipe (phase 1.5) that tests start from |
| **Mechanism counter** | `telemetry.count('name')`: how many times something happened |
| **Paired seeds** | the same 20 seeds run with the switch off and on, same build |
| **Hardship** | how much a need was suffered in a season, remembered for years (4.1) |
| **Remedy** | a building, item or practice seen to relieve a need (4.2) |
| **Coverage** | how much of a future need is already met, 0–1 (4.3) |
| **Expected need** | predicted hardship for an upcoming season, 0–1 (4.3) |
| **Purpose** | a multi-day goal on a person's agenda (4.4) |
| **Proposal** | something put to several people at once in a gathering (5.x) |
| **Year** | 40 days; season 10 days; day 240 ticks (`Config.time`). Never hard-code 40 — read `daysPerSeason` |
| **Capability test** | a test named after what the player expects, written before any fix (R22) |

---

## 4. Phase protocol

### 4.1 Before

1. `git status` clean; on branch `m16` (pre-created from the M15 close to
   satisfy this protocol; phase 0.3 records the setup). One phase per commit;
   if a phase has several commits, each is one working feature.
2. Read `AGENTS.md`, this README §1–6 and your card. Nothing else unless the
   card says.
3. **Save the before-baseline:** run the *fast* level (§5) and the card's
   *area* command; save the output to `artifacts/verification/m16-<id>/before/`.
4. **Check names:** for every file, function and field the card cites, `grep`
   it. Cards were checked against `0.15.160`, but code moves. Mismatch → R0.
5. **Check it is not already done** (several block-2 bugs were fixed while
   closing M15). The card's first test is the judge (R22).

### 4.2 During

6. Write the capability/mechanism test first; run it; confirm it fails (or, if
   it passes, follow R22 and stop changing code).
7. Make the change following the card's steps.
8. Run the card's verification; save output to `.../after/`.
9. Compare with before. Any test or check that went pass → fail or
   pass → `n/a` is explained (diary + commit) or fixed.

### 4.3 After — the paperwork (every phase, no exceptions)

The owner wants to be able to tell the story of how the game was built, and
the next agent needs to find any bug you ran into. So:

1. **`docs/changelog.md`** — new entry **at the top**, same language as the
   recent entries (currently Spanish):
   `## YYYY-MM-DD — M16 <id>: <short title>` then **Problema / Causa / Cambio /
   Verificación**, with the *reason* for each change, counters before/after,
   and the screenshot path if UI changed.
2. **`docs/bugs.md`** — every bug you found and did **not** fix gets an entry:
   title `M16 <id>: <symptom>`, how to reproduce (seed, scenario, steps), what
   you read in the code, what you ruled out. If you fixed an entry that was
   already there, mark it resolved with the commit and point to the changelog.
   If your test showed a bug already fixed (R22), write that too.
3. **`docs/m16/diary.md`** — append:
   ```
   ## M16 <id> — <title> (<date>, <commit>)
   Goal: one sentence.
   What was done: two or three plain sentences, no jargon.
   Before and after: the counters or screenshots that show it.
   What turned out differently from the card.
   What is left open.
   Screenshots: path, if the UI changed.
   ```
4. **This README, section 7** — set the phase's status to `done <commit>` (or
   `skipped: R0, see doubts.md`, or `verified already fixed`).
5. **`docs/m16_bugs.md`** — if the phase closes a triage ID (N.., A.., K.., E..),
   add "→ closed by M16 <id> (<commit>)" to its row.
6. **`package.json` version** — bump the last number by one if game behaviour
   changed (phase 0.3 sets `0.16.0-alpha`). Docs/tooling-only: no bump.
7. **Screenshots** — if the UI changed: `artifacts/screenshots/m16-<YYYY-MM-DD>-<id>/`,
   never overwriting an older directory; path in the changelog entry. At the
   end of each stage (section 7) run `npm run shots` into a new dated directory.
8. **Commit** — `m16: <id> <summary>`, then these lines in the body:
   ```
   World changes: yes|no (baseline re-pinned: yes|no)
   Switch: <name>|none
   New RNG stream: <#name>|none
   Closes: <triage IDs>|none
   ```
   followed by the attribution lines your harness requires.
9. **Session integration (owner update, 2026-10-20):** verify the finished
   batch and merge its committed changes into `master` before ending the
   session, without waiting for all of M16 or asking permission again. Follow
   the session-close integration rule in `AGENTS.md`; explicitly report any
   pending verification or new regression that blocks the merge. Milestone
   close still requires all phases and full verification. The owner pushes
   `master` to GitHub; do not push on the owner's behalf.

### 4.4 If you get stuck

- The plan disagrees with the code → R0.
- A check you did not touch turns red → run it on the before-commit; if it was
  already red, it is baseline (R21); if not, it is yours.
- A test of another area breaks → do not edit that test to pass; find the
  premise that changed (R18) or revert your change.
- `century` flips a check between runs → chaos, not your change (`AGENTS.md`);
  measure the mechanism with counters or `npm run why`.

---

## 5. Verification levels and measuring

Until phase 1.7 exists, use the left column.

| Level | Before 1.7 | From 1.7 | When |
|---|---|---|---|
| **Fast** | `npm.cmd run typecheck` then `npm.cmd test -- --maxWorkers=1 --testTimeout=15000` | `npm.cmd run check:fast` (typecheck + explicit rules subset) | every change |
| **Area** | `npm.cmd run sim:check -- --scenario <name>` (the card names it) | `npm.cmd run check:area -- <area>` | end of each phase |
| **Full** | `npm.cmd run verify` | `npm.cmd run check:full` | end of each stage (section 7) |
| **Cohort** | `npm.cmd run sim:seeds -- --scenario <name> --seeds 20` (flag form only; add `--set motivation.<switch>=true` for the on-arm) | same | only at block gates, one at a time (R27) |

Owner update, 2026-10-20: reduce repeated test cost first; run the complete
unit suite once per M16 phase, not per functionality commit. `check:fast`
now means the explicit small rules gate in `vitest.fast.config.ts`, as
authorized by that request; it does not claim full-suite coverage. All
integration replays stay in `npm test` and `check:full`. Focused area checks
keep their inherited failures; no health threshold is weakened.

**How a gate is measured (blocks 4, 5, 7, 8):**

1. The same 20 seeds with the switch off and on (same build).
2. Compare **mechanism counters**, seed by seed.
3. An improvement counts if it shows in **14 or more of the 20 seeds**.
4. Survival is recorded but does not decide.
5. Cost: `npm run profile:systems` — the step may not cost more than 10 %
   over the block's baseline.
6. Measuring world: a normal one (`band` or `century`), never `lean`.
7. If the gate is not met, **do not tune constants**: record it and leave the
   decision to the owner.

**Phases without a switch that change the world** (most of blocks 2, 3, 6, 11,
13–17): after the change, run `npm run baseline:pin`, run the fast level, and
write "World changes: yes (baseline re-pinned)" in the commit. If the phase is
meant to change only some worlds (e.g. map worlds but not the classic island),
the card says which seeds must stay bit-identical.

---

## 6. Shared registries

### 6.1 RNG streams reserved for M16

Confirm the next free number with `grep -n "fork()" src/sim/core/Simulation.ts`
and the table in `AGENTS.md` before using one. Append in this order; if a phase
is skipped, the next one takes its number and you update this table.

| # | Stream | Phase | Note |
|---|---|---|---|
| 26 | `caveRng` | 14.7 | caves placed in their own pass **after `spawnHerds` and before `spawnPeople`** |
| 27 | `foresightRng` | 4.7 | the foresight trait; drawn whether the switch is on or not |
| 28 | `shoreRng` | 15.2 | shore tile kinds and their deposits; placed in a pass after `spawnPeople` |
| 29 | `fishSpotRng` | 15.3 | only if 15.3 needs one on the classic island; map worlds use derived streams |
| 30 | `experimentRng` | 8.1 | experiments and NPC choice of what to try |
| — | weather (15.1) and outdoor temperature (15.0) | — | **no fork**: derived `new RNG(seed)` per (comarca, time point), per `m16_room_temp_plan.md` §4.3 |

### 6.2 New `Config` keys

Every new key gets a migration (R23). Keep this list current:

| Key | Default | Phase |
|---|---|---|
| `motivation.foresight` | `false` | 4.1 |
| `motivation.assembly` | `false` | 5.1 |
| `motivation.rivalry` | `false` | 7.1 |
| `motivation.experiment` | `false` | 6.4 or 8.1, whichever comes first |
| (others) | added by cards | — |

---

## 7. The sequence

Do the phases **in this order**. Each row links its card. Status values:
`todo`, `done <commit>`, `verified already fixed <commit>`, `skipped (R0)`.
A stage ends with the full level (§5) and a screenshot tour.

### Stage 1 — Foundations

| Step | Phase | Title | Status |
|---|---|---|---|
| 1 | [0.1](phases/0.1-baseline.md) | Freeze the M15 close as the baseline | done 71e5729 |
| 2 | [0.2](phases/0.2-triage-refresh.md) | Refresh the triage | done 1b615c6 |
| 3 | [0.3](phases/0.3-rules-and-version.md) | Rules, branch and version | done 80af525; bump to `0.16.0-alpha` in the first behaviour-changing M16 commit |
| 4 | [1.1](phases/1.1-timings.md) | Measure how long everything takes | done 095d90c |
| 5 | [1.2](phases/1.2-tool-fixes.md) | Fix the test tools (T1–T5, E15, E16) | done c4c14c2 |
| 6 | [1.3](phases/1.3-comparable-baseline.md) | Comparable baseline and the "off equals before" test | done 2f3aefb |
| 7 | [1.4](phases/1.4-checkpoint-scenario-keys.md) | Checkpoints of every scenario can be saved (E10) | done 9e567c5 |
| 8 | [1.5](phases/1.5-fixture-worlds.md) | Fixture worlds | done 64aaef4 |
| 9 | [1.6](phases/1.6-from-scenarios.md) | Short scenarios that start from a fixture | done 6055379 |
| 10 | [1.7](phases/1.7-run-levels.md) | Run levels `check:fast/area/full` | commands implemented; full gate retains every layer and hearth E2E fixtures pass (2026-10-24); isolated area timings measured 2026-10-24: 5/9 areas within the 5-min budget, `assembly`/`base`/`objects`/`bands` exceed it — decision to the owner, stays open (R0, see doubts.md) |
| 11 | [1.8](phases/1.8-perf.md) | Performance command and budget | done `d58faae9`; verification closeout 2026-10-24 |
| 12 | [1.9](phases/1.9-red-test-verdicts.md) | A verdict for each known red test (E12) | done a40a6dc |

### Stage 2 — Correctness (cheapest and most visible first)

| Step | Phase | Title | Status |
|---|---|---|---|
| 13 | [2.2](phases/2.2-player-sites-kept.md) | Player sites are never dropped silently (N9) — **M15 protects player sites; verify both protection and NPC notice** | verified already fixed 112eec6 |
| 14 | [2.15](phases/2.15-work-on-fetches-materials.md) | "Work on" fetches missing materials; the hearth can be built (N16, N40) — **partly done in M15, verify** | done `9434096` |
| 15 | [2.4](phases/2.4-pickup.md) | Picking up: right reason, nothing vanishes, rest of the pile (N8, N20, K3, K4) | done |
| 16 | [2.19](phases/2.19-map-edge.md) | The map edge is not sea (N34, N36, K1, K2, K8, E1) | done |
| 17 | [2.22](phases/2.22-furniture.md) | Furniture without banners; outdoor furniture inside territory (N45, K6) | done `63bc104` |
| 18 | [2.23](phases/2.23-select-on-shore.md) | Select people standing on the shore (N46, K7) | done `80ce45d` |
| 19 | [2.27](phases/2.27-infants-cannot-dress.md) | Babies are not dressed (E9) | done `c25b967` |
| 20 | [2.29](phases/2.29-art-sheet.md) | `art:sheet` finishes (E14) | verified already fixed |
| 21 | [11.5](phases/11.5-action-labels.md) | Every action says what it is doing, in both languages (N35, K5) | skipped: R0, see doubts.md |
| 22 | [2.1](phases/2.1-season-lore-barren.md) | A stripped bush is not learnt as barren (A1) | verified already fixed `19cd284` |
| 23 | [2.3](phases/2.3-fog-and-memory.md) | Fog is saved, dimmed not black, and forgets what is gone (N6, N12, E4) | done; see diary |
| 24 | [2.5](phases/2.5-pickup-reach.md) | Picking up a far pile walks there first (A5) | verified already fixed `3b8a57b` |
| 25 | [2.6](phases/2.6-roof-art.md) | Roofed and roofless art line up (N7) | skipped: R0, see doubts.md |
| 26 | [2.7](phases/2.7-animal-alarm-sign.md) | The animal alarm sign ends with the alarm (A7) | done; see diary |
| 27 | [2.8](phases/2.8-earthworks-isolated.md) | Earthworks cut off by water close with a reason (A8) | done; see diary |
| 28 | [2.9](phases/2.9-techpower.md) | Hunting, armour and chopping read `techPower` (A9) | done `c3a2a98`; see diary |
| 29 | [2.10](phases/2.10-stranger-knowledge-menu.md) | The menu does not reveal a stranger's techs (A10) | done `f94c77e`; see diary |
| 30 | [2.11](phases/2.11-talk-under-thirst.md) | Nobody starts a chat they will abandon for thirst (A11) | verified already fixed `35a4cafd` (M12 phase 2c) |
| 31 | [2.12](phases/2.12-floaters-follow.md) | Floating labels follow their entity (A12) | done `2b25754c`; verification closeout 2026-10-24 |
| 32 | [2.14](phases/2.14-defend-from-predators.md) | Bandmates defend someone bitten by a predator (A14) | skipped (R0; animal assailant contract, see doubts.md) |
| 33 | [2.16](phases/2.16-equip-unequip.md) | Everything with a slot can be equipped and removed (N18) — **partly done in M15, verify** | done `92fd53ee`; verification closeout 2026-10-24 |
| 34 | [2.17](phases/2.17-search-food-water.md) | Hungry or thirsty people search farther (N21, N44, E2, E3) — **partly done in M15, verify** | skipped (R0; NPC no-water notice contract, see doubts.md) |
| 35 | [2.18](phases/2.18-mud-markers.md) | You can see which shore tiles give mud (N32) | done `e9bb7f36` |
| 36 | [2.20](phases/2.20-bedding-player.md) | The player can use and remove bedding (N38) | done `76ce70d6` |
| 37 | [2.21](phases/2.21-sudden-flood.md) | No sudden floods; night does not recolour the ground (N39) | done: tinte `ab6a9308`, nieve d6 `98be0fa3`, inundación `c1dc4453`; N39 reproducido y verificado en comarca 470,125, mapa 160×160, semilla numérica 728083595; fuentes locales `8151d46b` |
| 38 | [2.24](phases/2.24-load-keeps-sharing.md) | Loading keeps shared objects shared (E5) | skipped: R0, identity mismatch not localized; see doubts.md |
| 39 | [2.25](phases/2.25-compact-ration.md) | Parked comarcas: ration `RangeError` and block advance (E6, E7) — **E7 done in M15, verify** | verified already fixed `269222fe`; see diary |
| 40 | [2.26](phases/2.26-torch-transfer.md) | Handing over a lit torch keeps its fuel (E8) | done `90cebb50` (`0.16.19-alpha`); see diary and phase verification |
| 41 | [2.G](phases/2.G-gate.md) | Block 2 gate: new baseline | done 2026-10-24: full four-layer gate red inherited (R21), e2e premise fix `7f45fb44`, matrix diff against 0.1 recorded with cause lines for all 74 worsening transitions in `baseline-2.md`; cohorts `band` 98.2% (0/20) and `century` 48.7% (4/20, firemaking 9/20) recorded under R20; two flagged signals in `bugs.md` (ore-becomes-metal, hills-see-farther) |

### Stage 3 — Shelter ladder (D-13)

| Step | Phase | Title | Status |
|---|---|---|---|
| 42 | [14.3](phases/14.3-occupancy.md) | Buildings have a capacity, and it is respected | todo |
| 43 | [14.4](phases/14.4-no-wood-before-hafting.md) | No wood before hafting | implementation in draft PR; CI, scenarios and re-pin pending |
| 44 | [14.5](phases/14.5-lean-to.md) | The stick-and-leaf lean-to | draft PR — generated art, tests, scenarios and baseline pending |
| 45 | [14.6](phases/14.6-mud-hut-rebalance.md) | A cheaper, smaller, less warm mud hut | draft PR; CI, art and baseline pending |
| 46 | [14.7](phases/14.7-caves.md) | Caves | todo |
| 47 | [14.8](phases/14.8-upkeep.md) | Daily wear and repair: upkeep as the natural limit | todo |
| 48 | [14.G](phases/14.G-gate.md) | Shelter ladder gate | todo |

### Stage 4 — Player control

| Step | Phase | Title | Status |
|---|---|---|---|
| 49 | [3.1](phases/3.1-direct-control-warnings.md) | In "You direct", needs warn and do not interrupt | todo |
| 50 | [3.2](phases/3.2-attack-warning.md) | Attack warning (with reduced-flash setting) | todo |
| 51 | [3.3](phases/3.3-worked-cold.md) | Ingredient "worked while cold" | todo |
| 52 | [11.1](phases/11.1-action-queue.md) | Queue several orders (N17) | todo |
| 53 | [11.2](phases/11.2-think-submenu.md) | "Think" submenu (N13) | todo |
| 54 | [11.4](phases/11.4-ancestors.md) | Show all ancestors in the family view (N31) | todo |

### Stage 5 — Foresight (switch `foresight`)

| Step | Phase | Title | Status |
|---|---|---|---|
| 55 | [4.0](phases/4.0-viability.md) | Viability trial (not merged) | todo |
| 56 | [4.1](phases/4.1-hardship.md) | Hardship per season | todo |
| 57 | [4.2](phases/4.2-remedies.md) | Remedies learnt by their effect | todo |
| 58 | [4.3](phases/4.3-coverage-expected.md) | Coverage and expected need | todo |
| 59 | [4.4](phases/4.4-agenda.md) | The agenda of purposes | todo |
| 60 | [4.5](phases/4.5-provisioning.md) | Provisioning as a discoverable practice | todo |
| 61 | [4.6](phases/4.6-planner-shelter-store.md) | Shelter, hearth and store leave the planner | todo |
| 62 | [4.7](phases/4.7-foresight-trait.md) | Foresight trait and horizon | todo |
| 63 | [4.8](phases/4.8-join-seen-work.md) | See a building site and join it | todo |
| 64 | [4.9](phases/4.9-gate.md) | Block 4 gate | todo |

### Stage 6 — Assembly and command (switch `assembly`)

| Step | Phase | Title | Status |
|---|---|---|---|
| 65 | [5.0](phases/5.0-inventory.md) | Inventory of the existing mechanisms (no code) | todo |
| 66 | [5.1](phases/5.1-data-model.md) | Proposal data model | todo |
| 67 | [5.2](phases/5.2-convene.md) | Convene and gather round | todo |
| 68 | [5.3](phases/5.3-decide.md) | Decide | todo |
| 69 | [5.4](phases/5.4-authority.md) | Charisma or authority | todo |
| 70 | [5.5](phases/5.5-teach-many.md) | Teach several at once (N1) | todo |
| 71 | [5.6](phases/5.6-screens.md) | Proposal and decisions screens | todo |
| 72 | [5.7](phases/5.7-move-and-raid.md) | Moving camp and raiding by assembly | todo |
| 73 | [5.8](phases/5.8-emigrate.md) | Emigrate with all, some, or alone (N3) | todo |
| 74 | [5.9](phases/5.9-gate.md) | Block 5 gate | todo |

### Stage 7 — The physical world

| Step | Phase | Title | Status |
|---|---|---|---|
| 75 | [15.0a](phases/15.0a-temperature-inventory.md) | Temperature: inventory and contract | todo |
| 76 | [15.0b](phases/15.0b-outdoor-service.md) | Temperature: pure outdoor service | todo |
| 77 | [15.0c](phases/15.0c-room-occupancy.md) | Temperature: rooms and occupancy | todo |
| 78 | [15.0d](phases/15.0d-temperature-persistence.md) | Temperature: persistence and coordinators | todo |
| 79 | [15.0e](phases/15.0e-needs-and-heat.md) | Temperature: needs and physical heat sources | todo |
| 80 | [15.0f](phases/15.0f-temperature-ui.md) | Temperature: UI | todo |
| 81 | [15.0g](phases/15.0g-temperature-ai-activation.md) | Temperature: AI preference, activation, cost | todo |
| 82 | [15.2](phases/15.2-gradual-shore.md) | Gradual shores (N33) | todo |
| 83 | [15.1](phases/15.1-weather.md) | Weather (N26) | todo |
| 84 | [15.3](phases/15.3-water-fish-desert.md) | Fish in proportion to water, shellfish, rod, desert, tundra (E18, E19) | todo |
| 85 | [17.1](phases/17.1-animals-react.md) | Animals flee or attack by species and state (N41) | todo |

### Stage 8 — Objects and building

| Step | Phase | Title | Status |
|---|---|---|---|
| 86 | [6.1](phases/6.1-clear-the-site.md) | Clear the site before building (N5) | todo |
| 87 | [6.5](phases/6.5-skill-gates.md) | Skill allows or blocks (N10) | todo |
| 88 | [6.3](phases/6.3-equip-and-take.md) | NPCs equip, and take useful loose things (N8, N11) | todo |
| 89 | [6.2](phases/6.2-want-an-object.md) | Wanting an object and fetching its materials; tidying (B6, B15, N14, E23) | todo |
| 90 | [6.6](phases/6.6-terrain-paths.md) | Relief and ditches in the way (N4) | todo |
| 91 | [6.7](phases/6.7-rest-of-planner.md) | The rest of the planner becomes purposes | todo |
| 92 | [14.1](phases/14.1-demolish.md) | Demolish your own buildings (N24) | todo |
| 93 | [14.2](phases/14.2-rotate.md) | Rotate when placing (N25) | todo |
| 94 | [6.8](phases/6.8-gate.md) | Block 6 gate | todo |

### Stage 9 — Other bands (switch `rivalry`)

| Step | Phase | Title | Status |
|---|---|---|---|
| 95 | [7.1](phases/7.1-raid-cohesion.md) | Raid cohesion (N2) | todo |
| 96 | [7.2](phases/7.2-perceive.md) | Perceiving the gap | todo |
| 97 | [7.3](phases/7.3-respond.md) | Responding through the existing deciders | todo |
| 98 | [7.4](phases/7.4-band-temperament.md) | Band temperament drifts (B12) | todo |
| 99 | [7.6](phases/7.6-rival-sites.md) | Attack a rival's site or steal its materials (N15) | todo |
| 100 | [7.7](phases/7.7-membership-on-marriage.md) | Marrying in changes your band (B14, D-5) | todo |
| 101 | [13.1](phases/13.1-totem.md) | The Totem, centre of the tribe (N23) | todo |
| 102 | [13.2](phases/13.2-babies-affection.md) | Affection for the band's babies (N37) | todo |
| 103 | [11.3](phases/11.3-bands-view.md) | A separate view of other bands (N30) | todo |
| 104 | [7.5](phases/7.5-gate.md) | Block 7 gate | todo |

### Stage 10 — Discovery and technique (switch `experiment`)

| Step | Phase | Title | Status |
|---|---|---|---|
| 105 | [8.0](phases/8.0-what-the-web-shows.md) | What the tech web shows (D-4) | todo |
| 106 | [8.1](phases/8.1-experiment-player.md) | Experimenting (player) | todo |
| 107 | [8.2](phases/8.2-experiment-npc.md) | NPCs who experiment | todo |
| 108 | [8.3](phases/8.3-signals.md) | Signals of a hunch | todo |
| 109 | [6.4](phases/6.4-examine.md) | Examining an unknown object (N11) | todo |
| 110 | [16.1](phases/16.1-domestication.md) | Domestication without a fictitious precondition (N28, N29) | todo |
| 111 | [16.2](phases/16.2-healing-materials.md) | Healing needs herbs and a bandage (N42) | todo |
| 112 | [16.4](phases/16.4-historical-materials.md) | Prototype materials true to history (E20) | todo |
| 113 | [8.4](phases/8.4-gate.md) | Block 8 gate | todo |

### Stage 11 — Calibration and close

| Step | Phase | Title | Status |
|---|---|---|---|
| 114 | [10.1](phases/10.1-switch-on.md) | Switches on, one at a time | todo |
| 115 | [10.2](phases/10.2-balance.md) | Balance (C entries, M15 open gates) | todo |
| 116 | [10.3](phases/10.3-new-gates.md) | Rewrite checks that measure something else | todo |
| 117 | [10.4](phases/10.4-performance.md) | Performance | todo |
| 118 | [10.5](phases/10.5-switch-decisions.md) | Each switch: default on, or removed | todo |
| 119 | [10.6](phases/10.6-history.md) | The story of M16 | todo |

---

## 8. Out of M16

- Item weight (N19, old 12.1, D-12) and game modes (old 9.2–9.3, N22, D-10, D-14).
- Family ownership of land; political-economic systems as rule combinations.
- Player notebook between games (discarded).
- Visual redesign of the tech web (D9 in `m16_bugs.md`); sitting pose and other new art (caves get only a provisional sprite in 14.7).
- A carer dressing someone else (D-18).
- Everything labelled **D** in `docs/m16_bugs.md`, including E17 (what the compact model does not do) and the peoples-world gates (`farming-spreads`, `states-arise`), unless 16.4 fixes them.

## 9. Mapping from the old plan

Phase ids are kept from the removed `m16_plan.md` v2 (git `99a2ec5`) so that
`m16_bugs.md` still points at the right place. Changes: old 2.13 (equipment matrix investigation) is folded
into 10.2 because the M15 matrix is now the accepted baseline; old 2.28 (E12
verdicts) is 1.9; old 0.5 (lane infrastructure, `BrainHooks`, `VerbRegistry`,
worktrees, ports, merge queue) is dropped because one agent works in series;
old 9.1 is 7.7; old 14.3 is split into 14.3–14.8 by the shelter ladder; 7.6
(N15) is new; 12.1 and 9.2–9.3 are out.
