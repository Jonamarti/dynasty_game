# M15 phase 41 — autonomous attack on an unconscious target

## Finding

The repeat-blow contract is that an adult had time after the first blow to run
or fight back. The existing denominator already excludes victims who are held
or captive. M15 phase 21b added a knockout state that skips the victim's entire
Simulation turn, but `ActionSystem.doAttack` still approached and hit that
victim. A deterministic fixture reproduced the mismatch: the old code landed
and counted a second blow against an unconscious adult, and the new regression
test failed with `blow_repeat = 1` where it expected no follow-up hit.

That demonstrates a real incapacitation mechanism, but does not establish how
many of the eight historical unanswered events it caused. The old cohort only
reported `idle: 3` among those events; it did not record knockout state per
victim. Those three may include unconscious victims, but that link is
unconfirmed. `drink`, `give`, and `go_home` were also sampled at impact before
the same tick's `ActionSystem` interruption could clear them. The existing
aggregate data cannot say whether those victims later chose to flee or fight.

## Change

Autonomous attackers now abandon an attack when its target is unconscious,
through the normal reported-abandon path. `Brain` excludes unconscious adults
from attack candidates and does not treat a recently striking person who is
currently unconscious as an active threat. An explicit `attack` order still
continues, so the player retains control over that decision.

The new reason is localized in English and Spanish. An autonomous stop is
queued even without an order or saved commitment; the existing UI disclosure
rule still limits it to a selected NPC the player knows. The E2E fixture shows
the familiar person and the reason in both languages.

## Evidence and limits

- Before the fix, the added regression test failed: a knocked-out target took a
  counted repeat blow (`blow_repeat = 1`). Afterward, `respond.test.ts` passes
  14/14 and `i18n.test.ts` passes 6/6. The scorer regression captures the real
  score table: the hated KO neighbour has no `attack` row or `foe`, and the
  same target gains both when only its knockout expires.
- `e2e/attack-response.spec.ts` passes for English and Spanish and captured
  `artifacts/screenshots/m15-attack-response-2026-10-16/`.
- `answered`'s predicate and threshold were not changed. No completed paired
  before/after 20-seed run measures the change in its cohort rate; the initial
  exploratory run was stopped because its available baseline was not
  comparable. No persisted integrated `century` result is available for this
  close-out, so the fix is supported by the reproduced KO mechanism and its
  negative regression only, not by an answered-rate claim. The remaining
  unanswered causes and the gate result stay open.
- `npm.cmd run typecheck` passes on the current integrated checkout.

## Open M15 contracts independent of `answered`

The phase-41 answer gate is only one part of the milestone. Phase 41 also
requires `recovered` ≥50% in `generations` and `firemaking` in ≥50% of
`century` seeds. The latest recorded 20-seed results are `recovered` 0/57
(all censored), `answered` 58/72 = 80.6% in `generations`, and `firemaking`
9/20 = 45% in `century`. The current attack fix has not measured or claimed
progress on recovery or firemaking. General `sim:check:all` behavior gates
also remain open; see [calibration](m15_calibration.md) and
[`bugs.md`](bugs.md).

Phases 32 and 34 carry separate fidelity and travel contracts.
`lod-matches-detail` requires a 20-seed comparison of detailed level 0 against
level 1, with final mean population within ±15% and the same technology trend.
The equivalent `peoples-match-bands` comparison for levels 1 and 2 has the
same bounds and is also a blocking gate. The 32c world cohort requires uneven
technology, farming to originate where prerequisites exist and spread to
neighbors, and a State in at least half of 10 seeds over 200 years. The
recorded farming and State checks were 0/10, and the level-1/2 correspondence
run was not done. Detached compact-runtime fixtures do not satisfy these
integrated annual gates.

Phase 34's functional travel implementation and short `drought` /
`the-thirsty-leave` mechanism controls are not its empirical gate:
`fission-happens` still requires a cohort with a map. The phase-34 verification
note explicitly records the 20-seed migrants cohort and annual
`lod-matches-detail` as deferred. A successful `answered` result cannot close
these gates, establish compact correspondence, or demonstrate migration and
fission in a world cohort.

The phase-41 empirical gates, annual LOD correspondence, and mapped
migration/fission cohort remain independent and open. No local run of the
unpaired fix build substitutes for those specified measurements.
