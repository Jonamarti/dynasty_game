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

## 2. `CompactPerson`, `CompactAuthority` y la conversión (commit «persona compacta»)

`compact/CompactPerson.ts`. Una persona compacta **es la misma persona**: posee la
instancia única de `Person` (identidad, parentesco, hogar, inventario, equipo,
heridas, recuerdos, órdenes y trabajo ya contabilizado) y añade solo lo que el
scheduler necesita: `lastAdvancedTick`, un **stream propio derivado**
(`deriveCompactStream(semilla, personId)`, hash de `compact|semilla|id`, fuera del
contrato de forks de `Simulation`), una etiqueta de agenda (`obtain_food`,
`build`, `care`, `travel`, `idle`, con `target` tipo `building:12`) y un `epoch`.
La etiqueta se **lee** de la acción/orden actual; el progreso real sigue en la
persona (`workedTicks`, `workBank*`, `resume`) y en la cosa trabajada, de modo
que no hay un segundo contador que pueda divergir. `toCompactRecord` /
`fromCompactRecord` serializan a JSON usando el `PersonRecord` completo de fase 28
(mismo sello de tick; el decodificador rechaza versión, tick, id y agenda
inválidos).

`compact/CompactAuthority.ts` es el registro de dueño único: `demote` (detallado →
compacto, misma instancia, nada se clona), `promote` (exige que el registro esté
avanzado hasta el tick de la transición), `adopt` (rehidratar desde JSON tras una
recarga). Rechaza, con motivo nombrado: ya compacto, ya detallado, registro viejo
(`epoch` distinto), copia decodificada que no es el dueño vivo, atrasado respecto
al tick, y las personas que el nivel compacto aún no sabe resolver — jugador,
muerto, llevado en brazos, retenido/atado/cautivo, que lleva un bebé, o en medio
de una interacción con otra entidad (`interacting`: objetivo/perseguido/huyendo).
Esos rechazos son conservadores: el puente de interacciones de §4 (punto 3 de §7)
los levantará. El stream de una persona se conserva al promover y se retoma al
volver a degradar (no se vuelve a derivar: «materializar no repite tiradas»).

**Alcance.** Todavía no saca a nadie de `Simulation.people` ni de los hashes: el
registro es la autoridad de nivel y el guardia que `Simulation` llamará al
integrarse (punto 3). Sin esa integración no hay «dos dueños» posibles porque nadie
llama a `demote` en el juego. No hay camino de UI para estos rechazos porque aún no
existe ninguna orden del jugador que los dispare; cuando exista, cada motivo
tendrá que pasar por `lastRefusal` y `t()` (anotado en `bugs.md`).

Tests (`compact-person.test.ts`): ida y vuelta repetida cuatro veces por JSON a una
autoridad nueva con un mundo evolucionado 700 pasos (registro de `Person` idéntico,
mismo id y hogar, inventario, trabajo bancado, el stream continúa la misma
secuencia que un control); negativos: demote duplicado, promote doble, adopt de un
segundo vivo y de un registro viejo, copia decodificada, tick atrasado, cada
motivo de rechazo, un registro que pierde inventario (distinto del original) y
registros dañados.
