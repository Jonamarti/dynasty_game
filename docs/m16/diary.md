# M16 diary

## M16 0.1 — Freeze the M15 baseline (2026-10-16, `71e5729`)

Goal: establish a fixed, reviewable starting point for M16.

What was done: recorded the M15 closing commit and version, ran the requested
checks, and saved the raw outputs. The per-scenario CSV keeps all 43 matrix
results and the exact names of their failed checks.

Before and after: before this phase, M16 had no baseline file; now the matrix
records 17 clean scenarios, 1,810/1,928 applicable checks passing and 118
failing. The unit suite passed 320 files (2,339 passed, one skipped), and E2E
reported 186/186 cases correct.

What turned out differently from the card: the `century` cohort overlapped the
unit suite for part of its runtime, so its throughput is not an isolated
performance measurement. E2E reported all cases correct but exited 1 during
runner teardown.

What is left open: M15's accepted gates remain open; M16 phases 0.2 and 0.3
remain to be done.

Screenshots: none; the UI did not change. Historical screenshots rewritten by
E2E were restored.
