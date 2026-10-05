# M15 phase 27 evidence

Baseline gameplay: `cf903f7`. Frozen final gameplay/harness: `4a0b798`.
The later `4b05a55` changes slope telemetry and adds its regression test.
`source-manifest.mjs` verifies that undoing exactly that measurement edit in
memory reproduces the frozen movement source byte-for-byte after LF normalization.
It rejects any other source mismatch.

The final cohort uses only v3 worker rows and the paired food-news run. The
intermediate v1/v2 runs are excluded. Source snapshots are not committed here;
reconstruct `baseline/src`, `baseline/tools`, `final/src` and `final/tools`
from the two named commits to rerun. On Windows use Git archives and native
`Expand-Archive`; do not create directory junctions into `node_modules`.
The source hashes identify every snapshot file.

From the repository root:

```powershell
npm.cmd exec -- vite-node artifacts/verification/m15-phase27-20261005/cohort.ts --baseline --worker=0 --workers=6
npm.cmd exec -- vite-node artifacts/verification/m15-phase27-20261005/cohort.ts --worker=0 --workers=6
npm.cmd exec -- vite-node artifacts/verification/m15-phase27-20261005/paired-food-news.ts
node artifacts/verification/m15-phase27-20261005/summarize-cohort.mjs
node artifacts/verification/m15-phase27-20261005/source-manifest.mjs
node artifacts/verification/m15-phase27-20261005/compare-matrices.mjs
```

Repeat the cohort commands for workers 1–5. `tail-cohort.ts` independently
runs the last five scenarios with workers 0–2, writing final workers 6–8.
It was used to occupy spare CPU slots. Duplicate scenario/seed rows must
have identical peak, end and step count; the reducer rejects disagreements
and counts each pair once. Main workers can stop after every assigned non-tail
case is present: their remaining five scenarios are fully covered by the three
tail workers. All six main workers were stopped after checking their complete
73, 73, 74, 74, 73 and 73 assigned non-tail rows respectively. This removes duplicate work without
losing a scenario or changing its statistical weight.

`cohort-paired.jsonl` is the canonical paired dataset. `cohort-summary.tsv`
includes weighted survival, arithmetic means, collapses and approximate paired
intervals. `food-news` seed exclusions and replacements are explicit in their
selection JSON. The numeric cost gate is per scenario, not pooled.

The compact matrix identifies failures and the number of applicable checks.
An absent previous failure is not proof of a pass: it may have become n/a.
The slope-measure negative log is an intentional failing control. The first
v4 full suite exhausted a 15-second test timeout under concurrent cohort load;
its failed log is retained separately from the serial verification.
