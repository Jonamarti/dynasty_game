# M15 28 — Snapshot coordinado del roster

2026-10-03. `persistence/RosterRecords.ts` compone, sin reemplazarlos, los
codecs ya existentes de Persona, Hogar, Banda y relaciones externas en un
snapshot v1 de un solo `lastAdvancedTick`.

`toRosterRecord(sim)` captura el tick actual y rechaza una marca explícita que
no coincida: no avanza ni adelanta entidades. Incluye todas las identidades que
`peopleById` aún conserva, también personas muertas que ya salieron de
`sim.people`, y guarda `activePersonIds` para conservar el orden y la membresía
actual de esa lista. Rehidratar produce `people`/`peopleById` para todo el
archivo retenido y `activePeople` como referencias a las mismas instancias.
Hogares y bandas también devuelven listas y mapas por ID coherentes.

Antes de devolver datos, el codec valida versión, forma exacta, tick, IDs
únicos por namespace, pertenencia de persona a banda/hogar, referencias de
banda de cada hogar, presencia de toda persona viva en la lista activa y
reciprocidad de `memberIds`. Los fallecidos pueden conservar `householdId` tras salir de
`memberIds`; cada ID que sí aparece en `memberIds` debe resolver a una identidad
del archivo retenido y apuntar de vuelta al mismo hogar. La simulación no elimina
identidades de `peopleById`, por lo que un miembro ausente allí sería corrupción,
no una referencia histórica válida. Tampoco se exige que una persona comparta la
banda de su hogar: el exilio cambia `person.bandId` y conserva su hogar de origen.
Un jefe o cabeza antigua puede seguir muerto o ausente. Genealogía, relaciones,
memoria y otros IDs históricos pueden apuntar fuera del roster.

`lastAdvancedTick` certifica que los registros del roster se capturaron juntos
en el tick actual. Los codecs anidados validan la forma/rango de los timestamps
que poseen, pero el envelope no los compara con ese tick ni los convierte: por
ejemplo, `Relationship.lastContact` usa ticks, mientras que `BandRelations`
guarda días de declaración en las stances.

La carga solo crea instancias independientes y mapas locales; no registra
nada en `Simulation`, ni integra `IdSpace`, recursos, edificios, RNG, agendas o
reloj. Es composición y validación coordinada de estos registros, no un guardado
de mundo, transferencia de autoridad, scheduler de compactación ni una entrega
completa de LOD.

Tres pruebas focales ejercitan una simulación real de dos bandas tras 500 pasos,
exilio, fallecido archivado y jugador muerto activo, métodos tras JSON y copias
independientes. Los negativos rechazan tick/version/forma, duplicados, referencias
ausentes, vivos fuera de la lista activa y arrays/mapas con aliases divergentes.
La carga no consume identidades standalone. Verificación conjunta final:
typecheck, 909/909 pruebas en 122 archivos y 70/70 de navegador pasan. Nueve hashes
de estado existente/RNG coinciden; los 27 escenarios conservan los mismos checks
aplicables/aprobados y 104 fallos heredados, no una matriz aprobada.
Evidencia: `artifacts/verification/m15-phase28-groups-20261003-160240/` y
`artifacts/verification/m15-phase28-tests-stable.log`.

Gira de seguimiento sin cambio de interfaz: 1/1, revisada visualmente, en
`artifacts/screenshots/m15-phase28-roster-2026-10-03-161719/`.
