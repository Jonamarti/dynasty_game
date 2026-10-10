# M15 phase 14c — personal garment warmth

Garments remain physical protection: their defined warmth affects the body only
when a valid owned garment occupies its slot. The `warm:<itemId>` belief is a
separate estimate used by autonomous craft and wear decisions.

An untried garment has a small, low-confidence prior so a curious cold person
can try a layer from an empty slot. It does not reveal the item definition's warmth. The
Brain compares the same-slot estimates for a candidate and the currently worn
layer; a person who has learned that a layer gives no warmth can reject it.
The shared prior permits an initial trial but does not predict adoption rates
or ensure an unknown garment will replace a layer already learned to be warmer.
When curiosity is high, the Brain may still choose one untested garment from a
small exploration score, even if the person has learned a different layer is
warmer. Completing a wear action leaves a short-lived marker in the person's
existing recency map, preventing repeated swaps while a building or hearth
masks the garment's contribution. Any own lesson, including a learned
zero, ends that trial nudge; observations remain hypotheses and do not count
as personal testing. This bounds the behavior but does not calibrate adoption
rates.

Personal evidence is recorded by `NeedsSystem` only while the person is cold,
exposed to cold, and wearing an owned garment whose marginal shelter remains
positive after accounting for buildings and a hearth. The estimate is the
garment's marginal share of shelter, not the full outfit, and can be learned
when it prevents cold from rising. A building or hearth that already provides
the same shelter blocks the sample.

Knowledge observation uses the existing daily chance, spatial hash and sight
limit. In winter, a visible, correctly slotted and owned garment offers only
the small public prior; this is a hypothesis from use, not a measurement of
the wearer's body. Ownership is checked internally so stale equipment
references are not treated as clothing. This does not inspect the wearer's
needs or beliefs.
The belief lives in `Person.beliefs`, which is already part of the person graph
record and therefore follows compact and transit ownership with that person.

## Verification and limits

The focused source review passed 18 tests in two files. Those tests cover
successful versus interrupted dressing, the public prior, own zero, marginal
outdoor protection, packed/stale equipment, dominant roof/hearth, sight and
season gates, and the real Brain's learned/unknown/zero wear candidates.
The own-zero case guards the reader; the sampler currently records only
positive attributable warmth and does not produce negative or zero lessons.

Typecheck passes. The focused browser run exercises Kit dressing and own,
nearby and remote observations, alongside outfit combination and the version
label: all four cases pass in the final completed run (14.3 seconds).
The initial run completed all four assertions but waited indefinitely during
Vite shutdown and was interrupted. Repeating against the already running
server completed with exit code zero; the interrupted run is not counted as
a completed green verification. Final capture, inspected without replacing
either earlier attempt:
`artifacts/screenshots/m15-phase14c-garment-warm-beliefs-2026-10-10T-03/01-fur-coat-worn-in-kit.png`.
The capture records the outfit and existing Kit, not a new beliefs panel.

The normal one-seed health report retains the pre-change failures
`cravings-steer-the-diet` and `perf-budget`. A second targeted single-seed
`tailors` run checks the clothing premise changed by the new scorer: both
applicable checks pass, with seven of seven supplied adult founders dressed
during a cold sample. The final run after probe isolation also passes both
checks, without letting diagnostic exposure train the live people.
This is neither an adoption calibration nor evidence of an improved economy.

Logs are under `artifacts/m15-warm-beliefs-*-20261010.log`; the initial
single-seed baseline is `artifacts/m15-garment-wear-baseline-20261010.log`.
The full unit regression completed in 588.04 seconds: 283 files, 2,040 tests
passed, eight failed and one skipped. Seven failures reproduce the recorded
baseline (compact correspondence, food counter activity, diggers, diffusion,
tribute, conspiracy and thirst deaths). The eighth was new: the existing
`tailors` checkpoint test caught probe clones sharing the live person's
beliefs after cold updates began teaching warmth. `detached()` now copies
the beliefs without the live callback. That original failing test and all
clothing/warmth tests pass in the final focused rerun: three files, 23/23.
Final typecheck passes too. The full suite is not repeated or reported green.
Final evidence logs use the suffix `*-final-20261011.log`.
No cohort or heavy scenario matrix is run, following the owner's instruction.

Removing garments in heat, pockets, physical condition ownership, wear,
mending and hide dressing remain pending. The condition ownership design is
in [m15_garment_condition_design.md](m15_garment_condition_design.md).
Phase 14c/14e and M15 remain open; this delivery stops before the next feature
to reserve the session's remaining budget for review and the functional commit.
