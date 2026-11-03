# CI full gate for stacked PRs (issue #10)

The full workflow now receives `pull_request` events regardless of target branch, while preserving the lightweight push gate. Unit/build, each of four scenario shards, and each of four Playwright shards publish small, run-scoped proof files only after their checks pass. A final job `Full verification verdict` runs even if an upstream job fails/skips, and accepts only successes from all required jobs plus exactly nine proofs matching `GITHUB_SHA`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` and event type. Empty/missing shards, cancelled jobs, stale run evidence and invalid proofs yield failure.

Negative tests: `node --test tools/ci-full-verdict.test.mjs`. The workflow runs them in its CI contract job without npm dependencies.

## Integration precautions

This PR is deliberately stacked on PR #34 (#8): `baseline-diff` must use explicit `--shard` coverage. The baseline retains inherited red checks; do not change the baseline merely to turn the verdict green. The PR should remain draft until actual GitHub CI has run on the intended branch combinations and every required proof was verified.

The repository's branch metadata currently reports `master` unprotected, and `/rulesets` returns an empty array. The integration must therefore enable repository branch protection/settings to require the **stable status check named `Full verification verdict`** on `master`, alongside protecting against direct bypass. CI code alone cannot enforce a merge restriction. The connector cannot read or edit branch protection here (403 on protection endpoint). After applying PR #34 then #10, recheck the resulting merge SHA, then stacked-PR runs targeting the parent and runs targeting `master`. Do not infer a green gate for older PRs from another PR's execution.

## 2026-11-03 — stacked branch synchronization

The #37 branch is synchronized with the updated #34 branch (`3ea06bc`). The combined CI workflow preserves #34's fail-closed scenario inventory and measurement artifacts, master Node pin and E2E screenshot-history guards, and #37's same-run proof records and aggregate verdict. E2E proofs are now written **after** the always-run screenshot-history check, so a history violation cannot produce a successful proof. Full CI on this combined commit is still required; no baseline is re-pinned and the PR remains draft.

## 2026-11-03 — preserve partial proof evidence on a red matrix

In run `41690720830`, all four E2E shards and unit/build passed and uploaded their same-run proof artifacts, but matrix shards 1/4, 2/4 and 4/4 failed. The aggregate job skipped artifact download whenever any upstream job was red, then misleadingly reported **0/9 proofs** despite six available. It still failed closed, but obscured what passed.

The verdict now downloads whatever proofs are available **even after an upstream failure** and always executes the verifier. It must still fail when a required job is not successful or any of the nine proofs is missing, stale, duplicated or invalid. The focused contract tests assert the workflow's unconditional download/verification and a representative **6/9** partial-evidence failure. This is an observability fix, not a green-light exception or baseline change. Full CI on the updated stacked branch is required.

## 2026-11-03 — save/import E2E navigation race

Run [41699668341](https://github.com/Jonamarti/dynasty_game/actions/runs/41699668341) failed one test in E2E shard 3/4: `e2e/save-load.spec.ts` reported "Execution context was destroyed, most likely because of a navigation" on `state(page)` after importing a valid save. `main.ts:reloadInto` intentionally assigns `location.search` after an asynchronous IndexedDB write, while the old test's HUD presence check could pass in the **previous** document before its navigation started. The same test passed in the concurrent #38 branch, consistent with a timing race rather than proof of a functional save regression.

Both the in-browser Load path and the imported-file path now explicitly wait for a new document that has left the `seed` and temporary `load` query flags, then for the new HUD and `__dynasty` to initialize. All save values, exact state round-trip comparisons, invalid-import refusals and runtime-error assertions remain unchanged. New CI on the updated head must pass the focused E2E before this is considered resolved. No game behavior or matrix baseline changed.
