# M15 phase 16: household and comfort cohort protocol

Status: observation and control contract delivered on 2026-10-12. No cohort or
calibration was run while M15 phase 12f was active. This document does not
claim a population benefit.

## What the existing checks answer

`npm.cmd run sim:check -- --scenario homes` is the mechanism gate. The `homes`
fixture stages finished houses and a bed, then checks sleep quality, comfort and
safety inputs, furniture placement, walls, and paths for 2,400 steps. It does
not measure natural home construction, long-run furniture adoption, or
population outcomes.

`npm.cmd run sim:seeds -- --scenario homes --seeds 20` repeats that staged
fixture for each seed. It reports general demographic, cohesion, and history
summaries plus the phase-16 observations below; it still does not execute the
scenario's named checks or return a pass rate for them. There is no `--checks`
option. `sim:check` runs checks for one scenario instance; `sim:seeds` does not
call that check path.

The runner's new phase-16 section reports, per seed: living households with a
completed, unruined interior home; midnight sleeping samples by physical
surface (outdoors, bare interior, bedding/rug, bed, other); comfort/security
mood deltas per sample, mood/recovery quality physical vs effective averages;
and NPC furniture craft/placement counts by item.
Existing per-seed output also reports peak/end population and starvation
deaths by age (infant/child/adult). Household, surface and mood rates show
`n/a` when their denominator is zero. These observations are read-only and use
the existing midnight and action-completion events.

Named mechanism checks still need the single-seed `sim:check -- --scenario
homes`; the cohort report is observational and does not turn a count into a
pass/fail threshold.

## Required setup before measuring

1. Wait until phase 12f's cohort has finished. Record the exact baseline and
   candidate commit IDs, Node/package versions, command, scenario, seed pool,
   and step count. Keep both builds on the same machine and dependency set.
2. Keep the single-seed `homes` mechanism check as a regression gate. Do not
   treat its prepared house as evidence of organic adoption.
3. Use the per-seed observations above. Midnight surface shares are shares of
   observed sleepers (children included), not of every living person-night;
   compare their sample counts too. Comfort/security values are the mood deltas
   applied by that sample. Physical quality is recorded beside effective
   quality, so an ablation does not hide the surface actually used.
4. Use the `--set` switches below to define a treatment control for a marginal
   measurement. Comparing a pre-16 build with the current build would bundle
   housing, furniture, sleep, and other intervening changes, so it would not
   isolate the comfort drive or quality effect.

## Paired cohort after phase 12f finishes

Use the naturally developing `century` scenario for the primary population
comparison. The runner uses the same deterministic named seed pool for each
invocation; run the baseline and treatment with the identical scenario, seed
count, steps, size, and all other settings. Defaults keep both effects enabled.
Example invocations for separate ablations are:

```powershell
npm.cmd run sim:seeds -- --scenario century --seeds 20
npm.cmd run sim:seeds -- --scenario century --seeds 20 --set motivation.comfortDriveEnabled=false
npm.cmd run sim:seeds -- --scenario century --seeds 20 --set motivation.sleepQualityEffectsEnabled=false
```

`comfortDriveEnabled=false` removes only the pressure derived from negative
sleep comfort from AI scoring. `sleepQualityEffectsEnabled=false` makes sleep
recovery quality neutral at 1.0 and neutralizes only quality's contribution to
sleep comfort mood at the exposed-ground baseline 0.7; cold, snow and all
security inputs remain active. It also removes the sleep-quality preference
from shelter scoring and NPC demand/routing for bedding, rugs, and beds. Those
physical pieces, other furniture and household construction remain available;
the cohort still reports what exists and what NPCs do. Both are experimental
scenario controls outside the UI, default true, and add no RNG draws. Run each
ablation separately to distinguish its effect; a combined-off run tests their
interaction.

Preserve complete output and exact commands. Do not infer a control from a
different historical build. `generations` is reserved for an explicit question
about recovery after a major population fall; its long runtime makes it a poor
routine first pass.

For each endpoint, report all 20 matched per-seed values and deltas, cohort
mean/median, direction counts, and any missing or censored observations. Treat
survival, extinction, viable bands, and starvation as guardrails; interpret
home construction, sleep-surface adoption, comfort samples, and furniture
activity as mechanism outcomes. Set decision thresholds before viewing results.
If an endpoint is unavailable in a seed, report it as unavailable, not zero.
Do not tune a coefficient from one seed or from a single cohort whose direction
is inconsistent across seeds.

## Current recommendation

Do not start the 20-seed measurement while the 12f run is active. Once it
finishes, use the documented controls and per-seed output to collect a baseline
and matched ablation. Comfort/furniture calibration remains unmeasured until
those results are reviewed.
