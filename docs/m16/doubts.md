# M16 doubts

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
  the remaining rules, version note and branch setup.
