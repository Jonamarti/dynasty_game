# M15 12f — nights, 2026-10-12

`npm.cmd run sim:check -- --scenario nights` runs 150 ticks in hard winter,
two bands with firemaking and hafting prerequisites. The fixture supplies two
matched hand-axe orders and a fat torch beside a completed hearth. Its carrier
has learned that torches help in darkness, has a real warmth need, and receives
no `light_torch` order: the AI scorer must choose and complete ignition. Home
pressure is disabled only in this controlled fixture so the night-return errand
does not dominate the decision. It never assigns a burning hand or fabricated
work progress.

Three mechanism checks pass on the current readers:

- `darkness-hides`: one controlled observer, identical positions, real theft
  emission at midnight and noon: 0 versus 1 witnesses. The victim's automatic
  knowledge is not a witness. The spatial index is temporarily restricted to
  the paired participants and restored immediately, so wandering unrelated
  people cannot make a disabled sight reader pass.
- `torches-are-carried`: 6 winter-night samples with an owned, usable burning
  torch after autonomous ignition. The negative test removes the supplied
  torch and the check fails.
- `light-lets-work`: positive, banked hand-axe progress per active night tick,
  1.000 beside the hearth versus 0.545 in the dark. Completion resets are
  excluded; both workers start with identical skill and recipe inputs.

Negative verification is part of the unit tests: disabling the light readers
fails darkness and work, while removing the supplied torch before ignition
fails the torch check. The first observer fixture incorrectly passed the
disabled-reader mutant because additional people walked into range by noon;
it was corrected before shipping, without changing a check threshold.

The focused unit run passes 3/3; the single-seed scenario passes 3/3, none n/a.
The typecheck blocker recorded during the original concurrent implementation
was resolved; the current checkout passes `npm.cmd run typecheck`. The earlier
single-seed baseline had inherited failures in `cravings-steer-the-diet`,
`perf-budget` and `hills-see-farther`.

## Population cohort, 2026-10-12

The two runs below used `lean`, the same 20 canonical seeds and 24,000 steps
per seed, serially on HEAD `0c93cfc` (`0.15.121-alpha`). Only
`light.enabled` changed; both arms retain the 12e physical-heat behavior.

| Metric | Light enabled | Light disabled |
|---|---:|---:|
| Mean survival | 4.2% | 6.1% |
| Extinct worlds | 7/20 | 6/20 |
| Worlds below 25% of peak | 20/20 | 20/20 |
| `inBandKillRate` / 1,000 person-years | 0.000 | 0.000 |
| Violent adult deaths | 6.5% | 7.9% |
| `CONFLICT` blows / murders | 126 / 9 | 32 / 1 |
| Own-band blows / own-band thefts | 0 / 0 of 260 thefts | 0 / 0 of 14 thefts |

Enabling 12b/12d reduced mean survival by 1.9 percentage points in this
paired cohort, within the declared maximum 3-point cost. The within-band kill
rate remained below the 1-per-1,000 ceiling in both arms. The world stayed
highly fragile in both arms (all 20 worlds fell below 25% of peak), and this
single scenario does not establish a general survival improvement. The higher
cross-band conflict count with light enabled is an observed aggregate, not a
night-only rate or a reason to tune the scorer from this cohort alone.

The cohort does not measure population torch adoption: `sim:seeds` does not
report burning-torch person-days. It also pools theft by event, without a
day/night split, so it cannot establish the organic night-versus-day robbery
fraction. Autonomous ignition remains covered by the controlled `nights`
scenario. Phase 12f remains partial for those measures. The separate 12e
physical-heat cost is not isolated by this pair.

Two earlier attempts are discarded: a preliminary active-light run stopped
after two seeds; then a 20-seed active run at `0.15.119-alpha` and a control
aborted at `0.15.120-alpha` after the code changed between arms. Neither is
included above. The full unit snapshot recorded during this work was 2,211
passed, 9 failed and 1 skipped; these are unrelated existing failures, and
this cohort does not clear them.

## Cohort protocol and limits

The owner authorized the heavy measurement on 2026-10-12. Reproduction uses
two serial, paired runs on the same HEAD and the same 20 canonical `lean`
seeds:

```powershell
npm.cmd run sim:seeds -- --scenario lean --seeds 20 --set light.enabled=true
npm.cmd run sim:seeds -- --scenario lean --seeds 20 --set light.enabled=false
```

The toggle isolates the 12b/12d light readers and torch decisions while keeping
the 12e physical-heat change identical in both arms. Compare mean survival and
collapses (the declared 12b/12d ceiling is a loss of at most 3 percentage
points), then compare pooled `CONFLICT` and `VIOLENCE` totals, including own-
band thefts. `HISTORY` reports `inBandKillRate` from own-band murders divided
by person-years; check it against the project ceiling of 1 per 1,000 person-
years. These aggregate totals answer whether the feature changes overall
robbery/violence pressure; this runner does not separate events by day
fraction, so they cannot establish the night-versus-day robbery share.

No code or commit may land between the two commands. Run them serially to avoid
competing for the same machine. The two discarded attempts described above
must not be pooled or cited. No adoption-rate claim can be made from the
current `sim:seeds` summary; the controlled `nights` scenario remains the
available evidence for autonomous torch ignition.
