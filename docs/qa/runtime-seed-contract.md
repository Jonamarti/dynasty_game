# Issue #12: reproducible seed runtime

Use Node **22.23.3** for seeded simulations, checkpoint fingerprints and matrix baselines, with `nvm use` reading `.nvmrc`. A precise version is intentional: the saved seed contract can diverge with V8 numeric implementation details. `node tools/runtime-contract.mjs assert --out runtime.json` fails before pinning if Node is incompatible and includes the V8 version in the successful provenance report. Do not use `npm run baseline:pin` until the assertion succeeds.

This PR does **not** change simulation mathematics, the RNG, baseline files or saved games. It tests that Node 24 is rejected rather than pretending its world matches Node 22. GitHub Actions tests the version gate on both runtimes and uploads the accepted Node/V8 record. Browser runtimes remain unverified separately: reproducibility here is for the exact pinned Node release, not a promise that all browser engines produce bit-identical worlds. Checkpoint verification on Node 22 is required before closing issue #12.

## Read-only cross-runtime checkpoint evidence (2026-11-01)

The `Deterministic runtime` workflow now replays `band` at 3,000 ticks for
seeds 1, 2, and 3 on Node 22.23.3 and Node 24. Each job uploads
`runtime-checkpoints.json` with its actual Node/V8, exact fixture fingerprints
and per-seed MATCH/DIFF result. The final job validates the three seed identities,
fixture agreement and pinned Node 22 success, and publishes
`checkpoint-comparison.md`. Node 24 divergence is diagnostic and does not
authorize regenerating baselines. A missing seed, invalid report or pinned
Node 22 mismatch fails the comparative gate.

This is separate from the scenario matrix and does not waive its existing
failures. Review the CI artefacts and the pinned runtime outputs before closing #12.
