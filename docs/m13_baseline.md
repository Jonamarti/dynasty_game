# M13 baseline — 2026-09-25

Read-only cohort measurements on the pre-behaviour M13 build. Each scenario
uses the named 20-seed pool in `tools/seeds.ts` and its default step count.
Complete output is retained in `artifacts/m13-base-century.txt`,
`artifacts/m13-base-lean.txt`, and `artifacts/m13-base-crowded.txt`.

## HOME

Each value pools samples across the 20 worlds. Night distance is from the
person's band camp (the baseline has no household `Anchor` yet). `near<15`,
`far>25`, and `far>45` are fractions of adult night samples. `sleep` and `rest`
are action fractions during night samples. The action list gives the ten most
common night actions and their fractions. Day distance and child-parent
distance are median / p90 / maximum and median / p90 respectively; the child
fractions count children under ten with a living parent.

| Measure | century | lean | crowded |
|---|---:|---:|---:|
| Night near camp <15 | 0.472 | 0.505 | 0.566 |
| Night far from camp >25 / >45 | 0.379 / 0.182 | 0.360 / 0.174 | 0.240 / 0.076 |
| Night sleeping / resting | 0.048 / 0.093 | 0.034 / 0.095 | 0.055 / 0.112 |
| Most common night actions | ponder .147; shelter .102; rest .093; forage .079; drink .061; pick .060; sleep .048; spar .043; talk .035; flee .032 | shelter .123; rest .095; ponder .089; drink .072; spar .062; pick .054; talk .043; flee .042; idle .040; warn .034 | chop .135; spar .132; gather .112; rest .112; haul .103; forage .087; build .081; sleep .055; drink .049; pick .048 |
| Day distance median / p90 / max | 17.9 / 52.5 / 162.5 | 19.8 / 58.1 / 146.8 | 13.9 / 40.4 / 147.0 |
| Child to nearest living parent median / p90 | 13.1 / 51.7 | 15.0 / 52.6 | 8.6 / 34.7 |
| Child farther than 12 / 30 | 0.520 / 0.252 | 0.549 / 0.284 | 0.420 / 0.140 |

## HISTORY

`drawdown` is each band's greatest fall from its running peak after it reaches
six people; the row gives pooled p50 / p90 / maximum. `recovered` counts
drawdowns of at least 40% that later returned to 75% of the triggering peak;
unrecovered events are censored at the end of the run. Band losses are grouped
by recent dominant cause (violence, need-related, other, or absorbed). `world`
is seeds ending with nobody alive; `self-destroyed` is bands whose own-band
kills reach half their peak size. Kill rate is per 1,000 person-years. Violent
adult deaths is the share of adult deaths caused by murder. `answered` is the
share of repeat blows where the struck person was already fleeing or fighting
back. War episodes group cross-band assault or murder days with fewer than five
quiet days between; peace share counts quiet days since the first blow.
`firemaking` reports the first observed day anyone knew it. Malnutrition is
the mean of the 20 per-seed person-day averages. Adoption reports
the median days from two adult holders to half the band's adults knowing the
technology, plus cases that did not reach that threshold. Diet reports mean
malnutrition and the share of consumed nutrition from foods with protein at
least 0.3.

| Measure | century | lean | crowded |
|---|---:|---:|---:|
| Drawdown p50 / p90 / max | 0.100 / 0.538 / 1.000 | 0.438 / 0.933 / 1.000 | 0.000 / 0.056 / 0.056 |
| Recovery / drawdowns (median days; censored) | 0 / 16 (n/a; 16) | 0 / 34 (n/a; 34) | 0 / 0 (n/a; 0) |
| Band losses: violence / need / other / absorbed | 0 / 1 / 0 / 0 | 1 / 3 / 0 / 0 | 0 / 0 / 0 / 0 |
| World lost / seeds | 0 / 20 | 0 / 20 | 0 / 20 |
| Self-destroyed bands | 0 | 0 | 0 |
| In-band kills / 1,000 person-years | 0.000 | 0.000 | 0.000 |
| Violent adult-death share | 0.689 | 0.483 | 0.000 |
| Repeat blows answered | 0.974 | 0.984 | 1.000 |
| War episodes / year; median episode days; peace share | 17.700; 3; 0.996 | 35.953; 4; 0.993 | 19.771; 1; 0.995 |
| First firemaking day | 37 | 32 | never |
| Adoption median days; not reached | 5; 26 | 7; 10 | n/a; 0 |
| Mean malnutrition; high-protein nutrition share | 0.256; 0.238 | 0.280; 0.111 | 0.168; 0.405 |

## Reading the baseline

The three worlds begin widely dispersed at night: only 47–57% of adult night
samples are within 15 tiles of camp, and sleeping accounts for 3–6%. Children
are often far from a living parent in `century` and `lean`. The lean world has
substantial population drawdowns, while crowded stays close to its peak. Across
all three, at least one in five recovery opportunities is not yet shown to
recover before the observation ends; the current numbers are censored evidence,
not proof that recovery never happens. Protein-rich food contributes little in
lean, alongside the highest malnutrition average.

### Measurement caveat

The existing `DemographyWatch` row in each raw artifact reports zero deaths,
even though `sim:seeds` separately counts deaths by cause and the new history
observer sees deaths. That mismatch is recorded in [bugs.md](bugs.md) and is
not used in this baseline. The M13 cohort gates use HOME and HISTORY, not that
demography row. No behaviour coefficients or needs rates changed during these
measurements.
