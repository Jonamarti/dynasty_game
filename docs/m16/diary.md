# M16 diary

## M16 0.1 — Freeze the M15 baseline (2026-10-16, `71e5729`)

Goal: establish a fixed, reviewable starting point for M16.

What was done: recorded the M15 closing commit and version, ran the requested
checks, and saved the raw outputs. The per-scenario CSV keeps all 43 matrix
results and the exact names of their failed checks.

Before and after: before this phase, M16 had no baseline file; now the matrix
records 17 clean scenarios, 1,810/1,928 applicable checks passing and 118
failing. The unit suite passed 320 files (2,339 passed, one skipped), and E2E
reported 186/186 cases correct.

What turned out differently from the card: the `century` cohort overlapped the
unit suite for part of its runtime, so its throughput is not an isolated
performance measurement. E2E reported all cases correct but exited 1 during
runner teardown.

What is left open: M15's accepted gates remain open; M16 phases 0.2 and 0.3
remain to be done.

Screenshots: none; the UI did not change. Historical screenshots rewritten by
E2E were restored.

## M16 0.2 — Actualizar el triaje (2026-10-16, `1b615c6`)

Goal: separar los defectos ya corregidos de los que siguen pendientes y enlazar
los informes recientes con fases concretas.

What was done: se revisaron las entradas de M15 posteriores al triaje y los
hallazgos nuevos de `docs/bugs.md`. T9, T10 y A9 quedan cerrados con evidencia
de la línea base o cambios de M15; A5 y A10 siguen activos tras revisar su
flujo actual. N9, N16/N40, N21 y E7 reflejan qué parte cubrió M15 y qué prueba
capability falta todavía.

Before and after: el triaje tenía 2 filas V sin verificar y 3 defectos A/V;
ahora no queda ninguna etiqueta V. Se enlazaron los seis grupos de hallazgos
posteriores al 13-10 con fases o gates existentes; no se necesita una tarjeta
nueva.

What turned out differently from the card: los dos fallos E2E antiguos y los
fallos de `herding.test.ts` no reaparecieron en la línea base completa; A9 ya
había sido atendido durante M15. La lectura actual confirma que A5 y A10 siguen
abiertos.

What is left open: las pruebas capability de N9, N16/N40, E7, A5 y A10 siguen
en sus fases programadas. Los gates de M15 permanecen abiertos y fijados como
baseline.

Screenshots: none; no UI change.
