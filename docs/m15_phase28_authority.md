# M15 28 — Transferencia de un único dueño ejecutable

2026-10-04. `Simulation.parkForTransfer()` captura un checkpoint completo y
revoca el motor de origen. Devuelve un `ParkedSimulation` opaco, mantenido en
memoria; no es un formato de partida ni un registro que se pueda fabricar
mediante JSON. `Simulation.resumeTransfer(handle)` reconstruye el motor sin
generación ni nuevas tiradas y consume el handle solamente si tiene éxito.
Una carga fallida permite reintentar, con el origen todavía aparcado.

`sim.transferAuthority()` ofrece la transferencia directa. Mientras reconstruye,
el origen no admite mutaciones; si falla, recupera su autoridad. Después de un
éxito, solamente el destino puede avanzar. Una reentrada durante la carga no
puede consumir el mismo handle ni crear un segundo dueño.

El destino conserva **el mismo objeto `IdSpace`** del origen. Otros motores
pueden reservar identidades mientras el registro está aparcado: reanudar no
restaura los contadores a una fecha anterior. El estado local, las referencias
canónicas, los callbacks y los índices pertenecen al nuevo motor. Una referencia
a una persona, edificio o pila del origen no basta para modificar el destino,
aunque tenga el mismo ID: se exige la instancia canónica de su mapa.

Las entradas de mutación de Simulation y del sistema social ligado a ella
comprueban la autoridad antes de consumir IDs, RNG o modificar estado. Los
callbacks retenidos de fundación también comprueban el dueño al invocarse.
El error `SimulationAuthorityError` es un error de uso de API, no una negativa
de una acción del personaje. El renderer todavía no llama estas transiciones.

Este contrato gobierna las APIs de ejecución. No congela los objetos públicos
ni convierte el asignador compartido en una frontera de seguridad: un consumidor
que llame directamente `ids.allocate()` puede reservar IDs por diseño. Modificar
campos crudos del origen modifica su grafo separado; no es una transición válida.
`fromCheckpointRecord` sigue siendo una copia independiente reutilizable, con
su propio asignador, y no debe usarse como transferencia del mundo global.

Las regresiones comparan checkpoints JSON completos durante transferencias
repetidas con tala bancada, nacimiento diario y sucesión. También cubren
rechazo de origen revocado y referencias antiguas sin cambios en ambos grafos,
contador compartido que avanza durante el aparcamiento, reentrada y fallos de
carga recuperables. La comprobación conserva RNG y agendas; JSON normaliza `-0`.

Verificación: typecheck limpio, 972/972 unitarios en 134 archivos, nueve casos
de autoridad y 74/74 e2e. El negativo aislado sin guardia falla. La matriz
completa antes/después mantiene los mismos 108 fallos en 27 escenarios y cero
diferencias de todos los checks/métricas PASS/FAIL/n/a, excluyendo rendimiento.
Evidencia: `artifacts/verification/m15-phase28-ownership-20261004-pass1/`.
Registro visual general: 13 capturas en
`artifacts/screenshots/m15-phase28-ownership-2026-10-04-pass1/`.

La fase 28 entrega identidad, registros completos y esta base de transferencia
del motor local. El scheduler compacto, la materialización individual entre
niveles, los viajes entre comarcas y la UI de partidas continúan en sus fases
32–35. Todos los NPC vivos siguen en el loop detallado.
