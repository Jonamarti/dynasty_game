# M16 / issue #9 — E2E registration gate

The repository currently contains 117 Playwright spec files but `npm run e2e` explicitly registers only 96. The missing 21 are **not** assumed to have passed. `tools/e2e-exclusions.json` makes each omission visible, with a reason and issue number. The 17 deferred functional specs must be safely migrated and executed, not permanently ignored; the four visual/capture specs stay in reviewed milestone workflows.

`node tools/check-e2e-registry.mjs --json e2e-registry.json` checks exact set coverage and fails for new unregistered files, stale or duplicate entries, absent reasons or issues, and unknown filenames. `node --test tools/check-e2e-registry.test.mjs` exercises the negative cases without a browser.

**Dependency:** PR #35 relocates historic screenshot writes away from `artifacts/screenshots/`. Do not add deferred browser specs to the standard `e2e` command until those protections are integrated and the individual tests have actually passed on GitHub. Running excluded specs against the current master can overwrite historical images. This registry is a first safe deliverable and deliberately does not claim #9 completed.

To graduate a deferred spec: make its capture path safe, run it individually, add its path exactly once to `scripts.e2e`, delete its entry from the exclusions file, and verify the 4-shard full gate. Preserve every original behavioural assertion.
