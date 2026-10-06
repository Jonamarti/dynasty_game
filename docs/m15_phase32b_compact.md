# M15 32b — Registros y compacto local (nivel 1), mecanismo a mecanismo

2026-10-06. Punto 2 de §7 de [m15_simulation_lod.md](m15_simulation_lod.md).
Todo vive en `src/sim/compact/`, sin renderer ni DOM, **inerte**: ningún sistema
del juego lo llama, `Simulation.step()` sigue ejecutando a todos en detalle y el
juego normal es bit-idéntico (ver «Verificación»). No se filtra el loop detallado.

Orden elegido (distinto del sugerido): scheduler primero, porque es puro, no
depende de `Person` y lo necesitan las otras tres piezas (fechas de eventos,
ledger de transacciones); después agenda y conversión; avance al final, porque
es lo único que exige calibrar.

## 1. `CompactScheduler` (commit «scheduler»)

`compact/CompactScheduler.ts`. Eventos `{id, tick, phase, subjectId, kind, data}`
ordenados por **tick, fase, sujeto, id**; el orden de inserción no cuenta (test:
adelante y atrás drenan igual). Fases: urgente, llegada, trabajo, demografía —
en un mismo tick las llegadas y urgencias se resuelven antes que el trabajo
ordinario (§2: nadie aparece de golpe junto al jugador). `drain(tick)` entrega lo
vencido y fija el horizonte: programar detrás de él o drenar hacia atrás falla,
porque una transición no puede leer un registro atrasado.

Además lleva el **ledger de transacciones**: `commit(id)` devuelve `false` en la
segunda aplicación de un mismo id (la defensa contra «duplicar una transferencia»,
§3/§4). Snapshot JSON de pendientes y transacciones, con restauración.
Sin RNG, sin FPS, sin reloj de pared.

Controles negativos en `compact-scheduler.test.ts`: id de evento duplicado,
transacción repetida, snapshot que pierde eventos (distinto del original),
transacciones duplicadas en el snapshot, tick negativo, programar en el pasado.
