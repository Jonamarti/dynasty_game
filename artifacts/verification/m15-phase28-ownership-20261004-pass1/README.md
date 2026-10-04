# Phase 28 ownership verification — 2026-10-04

Final production code: single-use park/resume, atomic transfer, shared IdSpace,
Simulation/SocialSystem guards, canonical entity inputs and retained callbacks.

- `typecheck-final.log`: exit 0.
- `unit-closure.log`: exit 0, 972 tests in 134 files.
- `authority-focused-final-tests.log`: 9 transfer regressions pass, including
  final assertions for the successful atomic shortcut and reentrant rollback.
- `authority-focused-final.log`: earlier combined 49-test loader/identity/family
  run, before those last assertions (no production changes after cry guard).
- `e2e.log`: exit 0, 74 browser tests pass.
- `screenshots.log`: exit 0, 1 tour passes; 13 captures under
  `artifacts/screenshots/m15-phase28-ownership-2026-10-04-pass1/`.
  The tour waited for its own Vite server to close after completing; PID 14864
  was stopped only after the browser suite using that server finished.
- `negative.log`: expected exit 1. Its isolated config replaces only the
  private Simulation entrypoint authority assertion and the retired-owner
  step assertion fails. Production files remain unchanged during injection.
- `baseline-verbose.log` and `final-closure-verbose.log`: complete 27-scenario
  world matrix before and after. Both have inherited failing checks (exit 1).
  Run `node artifacts/verification/m15-phase28-ownership-20261004-pass1/compare-matrix.cjs`
  to reproduce `comparison.json`, including full PASS/FAIL/n/a metrics except
  perf-budget and throughput. No check thresholds are changed.

The other unit/typecheck/matrix logs preserve intermediate verification runs.
`final-verbose.log` predates the last SocialSystem canonical check;
`final-stable-verbose.log` predates the cryReaches guard. The closure comparison
uses only `final-closure-verbose.log`, captured after all production edits.
JSON checkpoint equality normalizes negative zero only. Copy loading remains
independent; parked handles are in-memory ownership tokens, not save files.
