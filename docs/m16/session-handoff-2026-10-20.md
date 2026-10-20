# M16 handoff — 2026-10-20

Stop requested near 90% of the five-hour allowance; last snapshot was 88%.
Branch m16. No push or merge. Preserve pre-existing modified M15 screenshots,
docs/notes_for_m15.txt and untracked session-handoff-2026-10-18.md.

Commits: a0f8f91f (test cost/1.7 commands), 2b25754c (2.12 labels),
d58faae9 (1.8 perf); following commit contains 2.16 equipment removal.
Version 0.16.12-alpha. All functional commits include docs and UI captures.

Verification: initial band had moods-move-choices/perf-budget red. Fast gate
passed typecheck and 9 files/46 tests (Vitest 18.47s). New tooling/render
focused tests 5/5; equipment capability initially red then 4/4 green. Browser
render budgets and floater passed, including collision/fog/interpolation;
final equipment browser passed 1/1 in31.5s and typecheck passed.

Full verification is STILL RUNNING, not claimed passing. exec session25341
serially runs full unit tests then sim:check:all --json. Outputs and exit
codes: artifacts/verification/m16-session-2026-10-20/{results.txt,unit-full.log,
matrix.log,matrix.json}. Resume by reading results; if still active poll the
existing session rather than launching duplicates. Compare matrix failing
sets with artifacts/verification/m16-2.9/after/sim-check-all.log (latest docs
record152 inherited failures). Explain failures before marking phases closed.
The prior baseline matrix is red; do not describe all health checks as green.

README phase1.7 remains pending area timing/full closeout; fast subset was
explicitly authorized by owner. 1.8,2.12,2.16 implemented but full closeout
pending. Update statuses, diary/changelog and N18/A12 triage after reviewing
complete results. Do not repeat a full suite per functionality commit.

Performance completed3 serial repetitions,480 steps/arm,30/300 people,
with state equivalence and negative controls. Overall median1.4781/16.1854
ms/step. Raw profiles under m16-perf-2026-10-20T17-58-14-739Z; summary under
artifacts/verification/m16-test-costs/after/perf-final.log.

2.14 was skipped under R0: person-only assailant/action contract does not
specify animal targets. Details in doubts.md. Next independent card2.17,
after current verification closure. No further feature should start before
those results are reviewed.
