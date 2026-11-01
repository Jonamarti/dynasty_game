# CI full gate for stacked PRs (issue #10)

The full workflow now receives `pull_request` events regardless of target branch, while preserving the lightweight push gate. Unit/build, each of four scenario shards, and each of four Playwright shards publish small, run-scoped proof files only after their checks pass. A final job `Full verification verdict` runs even if an upstream job fails/skips, and accepts only successes from all required jobs plus exactly nine proofs matching `GITHUB_SHA`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` and event type. Empty/missing shards, cancelled jobs, stale run evidence and invalid proofs yield failure.

Negative tests: `node --test tools/ci-full-verdict.test.mjs`. The workflow runs them in its CI contract job without npm dependencies.

## Integration precautions

This PR is deliberately stacked on PR #34 (#8): `baseline-diff` must use explicit `--shard` coverage. The baseline retains inherited red checks; do not change the baseline merely to turn the verdict green. The PR should remain draft until actual GitHub CI has run on the intended branch combinations and every required proof was verified.

The repository's branch metadata currently reports `master` unprotected, and `/rulesets` returns an empty array. The integration must therefore enable repository branch protection/settings to require the **stable status check named `Full verification verdict`** on `master`, alongside protecting against direct bypass. CI code alone cannot enforce a merge restriction. The connector cannot read or edit branch protection here (403 on protection endpoint). After applying PR #34 then #10, recheck the resulting merge SHA, then stacked-PR runs targeting the parent and runs targeting `master`. Do not infer a green gate for older PRs from another PR's execution.
