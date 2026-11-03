# Temporary Pages publishing interlock — 2026-11-03

## Evidence

The legacy `.github/workflows/deploy.yml` publishes independently on every push to `master`, even when the scenario matrix in `CI` fails. On the actual merge SHA `d26b437` of PR #54, CI run [41699117228](https://github.com/Jonamarti/dynasty_game/actions/runs/41699117228) failed the scenario matrix 1/4 and 4/4 while Pages run [41699117492](https://github.com/Jonamarti/dynasty_game/actions/runs/41699117492) successfully deployed the same commit.

## Interim action

Until issue #11 / PR #38 lands, legacy Pages job `build` is explicitly skipped with `if: ${{ false }}`; the dependent `deploy` job also cannot run. This stops **all automatic and manually requested Pages deployments** temporarily, so merges of CI tooling cannot publish unverified game builds. The website may temporarily remain on an earlier build; this is intentional.

The additional `Pages safety contract` workflow checks this fail-closed state on every PR and master push. Its test also accepts PR #38's replacement only when that workflow:
- runs on completed `CI` workflows,
- checks push-to-master and a successful CI conclusion,
- evaluates the exact-SHA authorization policy,
- builds only the verified SHA and rechecks the master tip before deploying,
- does not expose an unchecked `workflow_dispatch` path.

This intervention does not change simulation, games, or baselines. Once #34 → #37 → #38 are integrated, PR #38's `workflow_run` replaces the temporary disabled legacy workflow and authorized deployments resume; do not remove this interlock without implementing an equivalent verified-CI gate.
