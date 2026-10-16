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
  20-seed run measures the change in its cohort rate; the initial exploratory
  run was stopped because its available baseline was not comparable. The
  remaining unanswered causes and the gate result stay open.
- A typecheck run during concurrent fish-cohort edits reported only the then
  current `tools/fish-placement-cohort.ts` errors (`Tree.species` and
  `Tree.growth`). That run predates the fish agent's reported correction and
  is not a final typecheck result.
