# M16 / issue #9 — E2E registration gate

The repository contains 117 Playwright spec files. **This PR registers 98** in `npm run e2e`, including the previously deferred `save-load.spec.ts` (save/import/export and rejection of invalid saves) and `world-picker.spec.ts` (world selection, fresh water and Spanish interface). The remaining **19** are classified in `tools/e2e-exclusions.json`: **15 deferred functional** and **4 manual visual**. The new registrations are *candidates pending GitHub E2E evidence*; they are not declared passing merely by appearing in this file.

`node tools/check-e2e-registry.mjs --json e2e-registry.json` checks exact set coverage and fails for new unregistered files, stale or duplicate entries, absent reasons or issues, and unknown filenames. `node --test tools/check-e2e-registry.test.mjs` exercises the negative cases without a browser.

**Screenshot prerequisite:** PR #35 has been integrated into `master`. Both newly registered specs write under `artifacts/playwright/captures/` by default (or the guarded `DYNASTY_CAPTURE_DIR`); neither writes to historical `artifacts/screenshots/`. CI checks the screenshot-history fixture and guards before running E2E. The two recovered specs must actually pass on the PR's GitHub Actions run, including their original behavioural assertions; if they fail, repair the product or test assumptions rather than weaken the assertions. This partial graduation **does not close #9**.

To graduate a deferred spec: make its capture path safe, run it individually, add its path exactly once to `scripts.e2e`, delete its entry from the exclusions file, and verify the 4-shard full gate. Preserve every original behavioural assertion.
