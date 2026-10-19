# M16 doubts

## Phase 11.5 — D-19 coast-card wording (2026-10-20)

- **Phase:** 11.5 — action labels in both languages, including the coast-card
  copy required by D-19.
- **Expected:** the phase card's step 5 and D-19 require the comarca card to say
  “Coast: there may be no reachable shore.”
- **Found:** `WorldPicker.ts:388` currently says “Coast: you will begin on the
  shore.” Its Spanish entry at `src/i18n/es/ui.ts:174` says “Costa: empezarás
  en la orilla.” These statements make different promises about access to a
  reachable shore; the card does not explain whether the wording was intended
  to change or which copy reflects the owner's decision.
- **Resolution:** R0. No 11.5 implementation was started. The labels work and
  coast-card copy are left untouched; the phase is marked skipped pending a
  decision. Continue with the next independent phase, 2.1.

## Phase 2.19 N36 travel and living-person views — 2026-10-18

- **Phase:** 2.19 — N36 expected that after scouting east, the family/tribe
  views would appear empty and returning west could report land under the sea.
- **Found:** `m16-scout-roundtrip.test.ts` passes on the pre-N36-change code:
  east travel keeps the active identity and living people in both views, and
  west travel returns home without a refusal. The test in
  `src/sim/__tests__/comarca-travel.test.ts:362` also documents that
  `initialGeographicStart` must be set after `installCurrent`.
- **Decision:** R22 classifies this as already fixed in M15 (`124c0a7`). The
  card's suspected stale-start/view defect is not present on this build; no
  travel or view code changed. Keep the regression coverage.

## Phase 1.7 fast-level duration — 2026-10-18

- **Phase:** 1.7 — run levels `check:fast`, `check:area`, `check:full`.
- **Expected:** the card defines `check:fast` as `npm run typecheck && vitest
  run` and requires it to complete in under two minutes.
- **Found:** the required full Vitest suite took 896.46 seconds (14m56s) on the
  phase 1.6 build: 327 files passed, 2,398 tests passed, one skipped. The same
  machine's 1.1 timing recorded the unit suite at 1,061.52 seconds (17m42s).
  Making the command faster would require changing which tests run or changing
  the stated limit; neither choice is specified by the card.
- **File:line:** `docs/m16/phases/1.7-run-levels.md:13-15,21-22`,
  `docs/m16/timings.md:68-69`,
  `artifacts/verification/m16-1.6/after/unit-tests-full.log`.
- **Resolution:** R0: leave phase 1.7 unchanged and mark it skipped pending a
  decision on whether `check:fast` means the full unit suite or a smaller,
  named subset. Phase 1.8 depends on 1.7; phase 1.9 depends only on 0.1 and is
  the next independent card.

## Phase order and phase protocol — 2026-10-16

- **Phase:** 0.1 / 0.2 / 0.3
- **Expected:** The ordered cards say to finish 0.1 and 0.2 before 0.3 creates
  branch `m16` and the diary; the protocol also requires every phase to run on
  `m16` and append its diary before committing.
- **Found:** That order cannot satisfy the protocol. The starting checkout was
  `codex/m15-closeout-20261016` at `0946fa7`, with a pre-existing user change in
  `docs/notes_for_m15.txt`.
- **File:line:** `docs/m16/README.md:158`, `docs/m16/README.md:204`,
  `docs/m16/README.md:306-308`, `docs/m16/phases/0.3-rules-and-version.md:12-24`.
- **Resolution:** Created local branch `m16` at the plan-only M16 commit and
  added this diary scaffold before phase 0.1. The user's pre-existing change is
  preserved and excluded from phase commits. Phase 0.3 still needs to verify
  the remaining rules and version note; its branch-creation step is already
  done and should be recorded as such rather than repeated.
