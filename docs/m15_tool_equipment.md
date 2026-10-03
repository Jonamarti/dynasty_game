# M15 phase 11d: automatic tool fitting

NPCs fit an owned tool when they reach work that needs it: the most effective owned axe
for `chop`, the best known weapon for `hunt`, and empty hand slots for `forage`.
The item stays in `Person.inventory` while it is carried; only
`Person.equipment.left/right` says what is actually in hand. With
`carry.autoEquipTools` enabled, chopping and hunting use only fitted tools.
This keeps a spare tool in a pack from silently improving the action. Forage
drops hand-held items into a ground pile before its next pull.

Changing the fit costs `carry.equipTicks` (3 by default). Its countdown lives in
`Person.toolChangeAction` and `Person.toolChangeTicks`; `actionTimer` mirrors the
remaining setup ticks only so the existing AI commitment gate holds the chosen
action. A completed setup clears those fields before the work timer starts, so a
harvest timer cannot be reset by tool handling. An absent work denominator also
keeps setup from looking like a new harvest animation after an earlier pull.
Setup checks the same
interruption path as other work and carries the action's hunger/cold exception.
Arms and ownership are checked again during setup. One arm occupied by a baby
precludes a bow: an already fitted bow is released once, with a one-handed
weapon preferred when available. No available weapon means bare hands.

If a hand must be freed, the displaced item is dropped at the worker's feet.
Two-handed fitted loads are released before another tool occupies the hands.
Dropping a fitted container reduces its cached capacity and runs `reconcileCarry`
so cargo that no longer fits also becomes a pile; item counts remain accounted
for. The simulator ablation `carry.autoEquipTools=false` preserves the earlier
inventory-based modifiers and does not change equipment during these actions.

## Evidence

Declared measurement limit before the cohort: mean survival may fall by no more
than 3 percentage points against both `lean` and `century` baselines. No
coefficients were changed. Final `lean` comparison over 20 seeds: 4.2% with
fitting disabled, 4.0% enabled (-0.2 percentage points), both 20/20 collapses
and 191 births. This meets that declared limit and does not fix lean survival.
Final `century` over 20 seeds: 77.6% disabled and 77.4% enabled (-0.2 points),
one versus two collapses and 656 versus 646 births. Both declared limits pass,
without establishing improvement. Earlier enabled measurements are superseded
by the final setup/baby correction. The CLI percentage is pooled end/peak.

`npm.cmd run sim:check` before edits reported 2/131 failures:
`cravings-steer-the-diet` and `perf-budget`. Coverage includes container-capacity reconciliation, actual
chop setup delay, tool use in the action, and a complete forage pull after
clearing hands, baby arms and a bow released exactly once. A temporary old
null-tool shortcut makes the baby regression fail; an old gathering selector
makes the setup-animation regression fail. Both pass with the corrections.
The final integration passes 949 tests in 129 files, typecheck and 74 e2e;
the render/setup/tool group passes 24/24 focused cases. The Spanish world soak
contains 524 distinct lines and none flagged as English. Evidence and counts
are recorded in `docs/m15_pending_verification_20261003.md`.

The 27-scenario matrix fails: 104 failed instances before, 108 after (93
retained, 15 newly observed, 11 removed). Twelve scenarios have an applicability
audit against the disabled fitting branch: 12 checks become `n/a`, including
meat in `craft`/`lean`, and four become applicable. A `n/a` is not a fix. See
`docs/bugs.md` and the raw validation evidence; no coefficient/check was tuned
to make this table green and the new failures are not classified as inherited.

The browser regression shows the fitted axe while the spear remains packed,
then verifies the disabled branch and cancellation. It captures both the
worker and Kit's actual right-hand slot; both were reviewed:
`artifacts/screenshots/m15-tools-2026-10-03-final-pass4/`.
The selector uses visible fitted slots and static item kinds, not private
inventory or techniques; a throwing getter detects the former reads.
Occupation-tool pickup and the manual slot controls remain phase 11d work.
