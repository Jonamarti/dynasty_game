# M15 phase 16: household and comfort cohort protocol

Status: protocol and controls delivered 2026-10-12; three matched 20-seed
century arms completed 2026-10-13 after phase 12f closed. This is a marginal
measurement, not coefficient calibration; no population benefit is claimed.

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

## Completed cohort (2026-10-13)

All three arms ran serially against the identical HEAD
266130439448e05b563bcf68e8e8c1a14fae7a8e, package 0.15.122-alpha,
Node v23.7.0, npm 10.9.2, scenario century, 20 named seeds and
40,000 steps per seed. Commands were exactly the three listed above. Baseline
ran 1804.3 s, comfort-drive ablation 1726.3 s, and sleep-quality ablation
1664.9 s; all exited 0. The full stdout files and per-run metadata are retained
under artifacts/m15-homes-cohort-2026-10-12/. Two earlier baseline attempts
were interrupted (one while 12f was active, one after HEAD advanced); both are
labeled discarded and excluded.

The CSV contains all 20 paired seed values and deltas for population, survival,
extinction, starvation deaths by age, household counts/rate, night sample counts,
physical sleep-surface counts/shares, comfort/security, physical/effective
quality, and furniture totals/items:
[paired per-seed results](m15_homes_cohort_per_seed_2026-10-13.csv). Means and
medians below are unweighted across seed-level values; rates use the matching
seed's denominator and report n/a at zero. Direction counts in each delta cell
are decrease / equal / increase / n/a (treatment minus baseline). Survival
per seed is calculated exactly as end population / peak population; the runner's
cohort headline uses total end / total peak, so its aggregate percentage can
differ slightly from the mean of per-seed percentages. Quality and mood values
are limited to the precision printed by the runner (two decimals).

Cohort headlines: mean survival was 45.6% baseline, 45.4% with
comfortDriveEnabled=false, and 45.7% with
sleepQualityEffectsEnabled=false. Each arm had 1/20 extinctions; collapse
below one quarter was 2/20, 6/20, and 4/20 respectively. Starvation deaths
(infants / older children / adults) were 38/13/75, 43/13/89, and 35/19/72.
These totals do not show a consistent treatment advantage.


### Población y hambre

| Métrica | Baseline media/mediana | Comfort OFF media/mediana | Δ media/mediana; ↓/=/↑/n/a | Quality OFF media/mediana | Δ media/mediana; ↓/=/↑/n/a |
|---|---:|---:|---:|---:|---:|
| Pico | 31.45 / 31.00 | 31.30 / 31.00 | -0.15 / 0.00; 2/16/2/0 | 31.70 / 31.50 | 0.25 / 0.00; 2/15/3/0 |
| Población final | 14.35 / 14.50 | 14.20 / 13.50 | -0.15 / 2.00; 9/1/10/0 | 14.50 / 13.50 | 0.15 / -1.00; 10/2/8/0 |
| Supervivencia por semilla | 45.37% / 46.77% | 45.07% / 44.25% | -0.30% / 6.25%; 9/1/10/0 | 45.21% / 44.30% | -0.16% / -3.23%; 10/1/9/0 |
| Extinciones (fracción de semillas) | 0.05 / 0.00 | 0.05 / 0.00 | 0.00 / 0.00; 1/18/1/0 | 0.05 / 0.00 | 0.00 / 0.00; 0/20/0/0 |
| Muertes por hambre: infantes | 1.90 / 2.00 | 2.15 / 2.00 | 0.25 / 0.00; 6/7/7/0 | 1.75 / 2.00 | -0.15 / 0.00; 7/5/8/0 |
| Muertes por hambre: niños mayores | 0.65 / 0.00 | 0.65 / 0.00 | 0.00 / 0.00; 7/7/6/0 | 0.95 / 0.50 | 0.30 / 0.00; 7/4/9/0 |
| Muertes por hambre: adultos | 3.75 / 4.00 | 4.45 / 4.50 | 0.70 / 0.00; 7/6/7/0 | 3.60 / 3.00 | -0.15 / 0.00; 9/3/8/0 |
### Hogares y muestras nocturnas

| Métrica | Baseline media/mediana | Comfort OFF media/mediana | Δ media/mediana; ↓/=/↑/n/a | Quality OFF media/mediana | Δ media/mediana; ↓/=/↑/n/a |
|---|---:|---:|---:|---:|---:|
| Hogares completos | 0.80 / 0.00 | 0.35 / 0.00 | -0.45 / 0.00; 7/11/2/0 | 0.40 / 0.00 | -0.40 / 0.00; 7/11/2/0 |
| Hogares vivos | 6.05 / 7.00 | 5.50 / 5.00 | -0.55 / -1.00; 11/2/7/0 | 5.80 / 6.00 | -0.25 / 0.00; 8/5/7/0 |
| Completos / vivos | 13.46% / 0.00% | 10.18% / 0.00% | -3.47% / 0.00%; 7/9/2/2 | 8.51% / 0.00% | -4.96% / 0.00%; 8/9/2/1 |
| Muestras de sueño | 683.70 / 714.00 | 693.05 / 684.00 | 9.35 / -46.50; 12/0/8/0 | 757.55 / 772.00 | 73.85 / 55.00; 9/0/11/0 |
| Muestras a cielo abierto | 645.10 / 630.50 | 665.95 / 636.00 | 20.85 / -25.00; 10/0/10/0 | 716.05 / 762.50 | 70.95 / 34.00; 9/0/11/0 |
| A cielo abierto | 94.50% / 100.00% | 95.71% / 100.00% | 1.21% / 0.00%; 5/10/5/0 | 94.13% / 100.00% | -0.37% / 0.00%; 5/8/7/0 |
| Muestras en interior sin superficie | 36.15 / 0.00 | 26.85 / 0.00 | -9.30 / 0.00; 6/10/4/0 | 41.50 / 0.00 | 5.35 / 0.00; 7/8/5/0 |
| Interior sin superficie | 5.25% / 0.00% | 4.24% / 0.00% | -1.01% / 0.00%; 5/10/5/0 | 5.87% / 0.00% | 0.62% / 0.00%; 7/8/5/0 |
| Muestras en lecho o alfombra | 2.45 / 0.00 | 0.25 / 0.00 | -2.20 / 0.00; 2/17/1/0 | 0.00 / 0.00 | -2.45 / 0.00; 2/18/0/0 |
| Lecho o alfombra | 0.25% / 0.00% | 0.05% / 0.00% | -0.20% / 0.00%; 2/17/1/0 | 0.00% / 0.00% | -0.25% / 0.00%; 2/18/0/0 |
| Muestras en cama | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.00; 0/20/0/0 | 0.00 / 0.00 | 0.00 / 0.00; 0/20/0/0 |
| Cama | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00%; 0/20/0/0 | 0.00% / 0.00% | 0.00% / 0.00%; 0/20/0/0 |
| Muestras en otra superficie | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.00; 0/20/0/0 | 0.00 / 0.00 | 0.00 / 0.00; 0/20/0/0 |
| Otra superficie | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00%; 0/20/0/0 | 0.00% / 0.00% | 0.00% / 0.00%; 0/20/0/0 |
### Ánimo, calidad y acción de muebles

| Métrica | Baseline media/mediana | Comfort OFF media/mediana | Δ media/mediana; ↓/=/↑/n/a | Quality OFF media/mediana | Δ media/mediana; ↓/=/↑/n/a |
|---|---:|---:|---:|---:|---:|
| Δ ánimo: comfort | 0.03 / 0.22 | 0.07 / 0.20 | 0.04 / -0.01; 13/0/7/0 | -1.14 / -1.08 | -1.17 / -1.18; 19/0/1/0 |
| Δ ánimo: security | -0.31 / -0.28 | -0.30 / -0.30 | 0.02 / 0.01; 9/0/11/0 | -0.28 / -0.26 | 0.03 / 0.03; 6/2/12/0 |
| Calidad ánimo física | 0.854 / 0.860 | 0.859 / 0.875 | 0.004 / -0.005; 10/3/7/0 | 0.872 / 0.885 | 0.017 / 0.010; 3/4/13/0 |
| Calidad ánimo efectiva | 0.854 / 0.860 | 0.859 / 0.875 | 0.004 / -0.005; 10/3/7/0 | 0.700 / 0.700 | -0.154 / -0.160; 19/1/0/0 |
| Calidad recuperación física | 0.843 / 0.850 | 0.844 / 0.855 | -0.000 / -0.010; 12/1/7/0 | 0.870 / 0.880 | 0.027 / 0.025; 3/5/12/0 |
| Calidad recuperación efectiva | 0.843 / 0.850 | 0.844 / 0.855 | -0.000 / -0.010; 12/1/7/0 | 1.000 / 1.000 | 0.157 / 0.150; 0/0/20/0 |
| Muebles NPC fabricados | 0.10 / 0.00 | 0.05 / 0.00 | -0.05 / 0.00; 2/17/1/0 | 0.00 / 0.00 | -0.10 / 0.00; 2/18/0/0 |
| Muebles NPC colocados | 0.10 / 0.00 | 0.05 / 0.00 | -0.05 / 0.00; 2/17/1/0 | 0.00 / 0.00 | -0.10 / 0.00; 2/18/0/0 |

## Interpretation and limits

The comfort-drive arm has mixed paired survival direction (9 lower, 1 equal,
10 higher; mean paired delta -0.30 percentage points, median +6.25). The
sleep-quality arm is also mixed (10 lower, 1 equal, 9 higher; mean -0.16 pp,
median -3.23 pp). Extinction stayed at one seed in all arms. These results do
not establish a population effect, and no coefficients were adjusted.

The quality ablation did what its contract specifies: effective mood quality
was 0.70 on average in every seed, while physical mood quality remained
observable; effective recovery quality was 1.00 in all 20 seeds while physical
recovery quality stayed variable. The comfort-drive ablation did not create a
consistent shift in observed comfort or population endpoints.

Furniture activity was rare: NPCs crafted and placed two items in baseline
(one rug and one bedding), one rug with comfort drive disabled, and none with
quality effects disabled. No bed surface was observed in any arm. Shares are
among observed midnight sleepers, not person-nights; total midnight sample
counts are included in the CSV. Several per-seed home-completion rates have no
living-household denominator and are marked n/a rather than zero.

The 20 seeds are a noisy screening cohort. The review did not set numerical
decision thresholds before looking at these results, so this run must not be
used to select or tune a coefficient. A stronger calibration claim would need
pre-registered thresholds and another confirmatory paired cohort. The staged
homes mechanism checks remain separate from organic home adoption.

## Current recommendation

Keep the default controls unchanged. Record the marginal controls and their
expected effective-quality behavior as verified; treat population calibration
and the broader furniture-adoption question as open. Do not claim that either
ablation improves survival or that current furniture use is sufficient.
