# CI matrix diagnosis — 2026-11-01 (issue #8)

The same scenario transitions were observed in GitHub Actions master run 40341219533 (2026-10-26, SHA ba7cb0d) and stacked PR #37 run 41296935836 (2026-11-01). These are **already present on master**; this does not imply that they are accepted baseline regressions.

- Shard 1: herders (generations-turn-over, health-holds-up, moods-move-choices, needs-not-pinned, population-persists, techs-are-refined, bands-take-sides), labour-from (jobs-bias-work), culture (people-act-on-what-they-know), generations (bands-dont-overbuild, moods-move-choices, shelter-answers-cold, crafting-is-interruptible, the-hurt-are-tended).
- Shard 2: lean (research-is-social and techs-are-refined moved from NA to FAIL). The old comparator on master returned green because it ignored NA to FAIL; PR #34 correctly blocks them.
- Shard 3: no regression.
- Shard 4: conquest (pictures-are-painted, techs-are-refined NA to FAIL) and orchard (gossip-is-aimed, needs-not-pinned, shelter-answers-cold PASS to FAIL).

The root cause of simulation divergences is not yet established. Do not re-pin fixtures automatically, change gameplay assumptions, or waive these failures. The new CLI produces `matrix-diff.json` / `matrix-diff.md` on exit 0/1/2, including known baseline reds, transitions, and coverage failures. CI uploads reports as artifacts even when the comparison fails. Review this issue separately from gameplay fixes.

This tooling PR is based on #8. Stacked #37/#38 must be updated against its new head and rechecked after #34 is integrated.

## 2026-11-03 — fail-closed empty-check records

The matrix parser previously accepted a scenario with all three status lists empty. If both baseline and actual contained the same empty record, coverage comparison could return success despite exercising **zero checks** for that scenario. The CLI regression test `rejects a scenario with no checks, even if both inputs match` records the negative case; the parser now rejects such records as invalid (exit code 2), rather than reporting a green diff. The existing unexpected-scenario fixture now includes a real check so it still exercises the intended coverage branch. This changes only CI validation, not simulation or the pinned baseline. CI execution is required on the updated branch; the PR remains draft with existing matrix failures.

## 2026-11-03 — integration with current master

Merged `master` at `011463bd` into the #8 branch while retaining both independent tooling changes: `--diagnose` and detailed matrix JSON output in `tools/scenarios.ts`, and the master Node pin, screenshot-history guards and E2E steps in `.github/workflows/ci.yml`. No simulation, pinned baseline or screenshot history was changed by this reconciliation. Fresh full CI must verify the combined revision before any merge.
