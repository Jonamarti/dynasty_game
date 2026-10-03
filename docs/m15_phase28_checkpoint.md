# M15 28 — Checkpoint coordinado, todavía inerte

2026-10-03. `persistence/CheckpointRecords.ts` reúne configuración completa,
IdSpace v2, roster, relaciones, reloj/RNG, terreno/suelo, objetos del mundo y
libros laterales bajo un sobre JSON v1 con un tick común. La captura y la
hidratación no generan un mapa, no ejecutan pasos, no asignan identidades ni
consumen corrientes. El resultado es un `CheckpointState` independiente; no
se registra en una Simulation ni actúa como segundo dueño ejecutable.

`toCheckpointRecord(sim)` comprueba los mismos contratos de composición que
`fromCheckpointRecord(unknown)`. Rechaza versiones y campos de sobre desconocidos,
ticks mezclados, configuración incompleta, calendario o terreno discordantes,
objetos fuera del mapa y asignadores que podrían volver a emitir identidades
retenidas. La configuración conserva las reglas originales en lugar de rellenar
campos ausentes con los defaults actuales. Su validación cubre forma, tipos,
valores finitos, técnicas fundadoras y parámetros básicos de agenda; no sustituye
una auditoría de balance de cada coeficiente configurable.

Los cadáveres y la sucesión se ligan al archivo canónico de personas del roster.
Las normas de cada banda y el mapa que leerá SocialSystem vuelven a compartir
la misma instancia. Los contadores de entidades cubren también el archivo de
fallecidos; los de eventos cubren feed, deduplicación de feud, recuerdos y eventos
de hallazgo. Las reservas de grupos conservan manadas retiradas, incluidas las
que mantienen fracciones pendientes de cría. No se exige que un objeto retirado
siga presente ni que las referencias familiares históricas pertenezcan a esta
comarca.

Los libros de jefatura deben coincidir con los titulares de las bandas; los
propietarios de edificios deben pertenecer a bandas retenidas. La captura
rechaza una copia separada de normas en el mapa fuente, aunque tenga valores
iguales. Estas comprobaciones no son una validación exhaustiva de cada campo
privado o referencia histórica de todos los tipos de entidad.

El terreno no tiene un timestamp propio: está incluido en el sobre coordinado
capturado sincrónicamente. Los otros registros y el reloj deben coincidir con
la marca de avance. Cambiar de schema requiere revisar/versionar el formato;
esto todavía no define migraciones de partidas públicas.

Tres pruebas de composición usan un mundo evolucionado, una muerte real y
objetos soltados. Verifican copias independientes, alias canónicos, reglas,
reloj y asignadores intactos, y rechazos de corrupción entre registros. Las
pruebas específicas de cada codec siguen siendo responsables de métodos y
datos locales. La evidencia conjunta se guarda en
`artifacts/verification/m15-phase28-checkpoint-20261003-pass1/`.

Typecheck limpio, 957/957 unitarios en 132 archivos y 74/74 e2e. Los 27
escenarios conservan 108 fallos heredados y coinciden en todas las líneas
PASS/FAIL/n/a con sus métricas; se excluyen perf-budget/throughput de esa
comparación. `comparison.json` conserva ambas referencias. La matriz sigue roja.

La carga ejecutable continúa pendiente: debe reconstruir sistemas, callbacks,
índices espaciales y contextos sobre estos objetos sin llamar al constructor
generador de Simulation, y demostrar continuación idéntica durante acciones,
fronteras diarias y sucesión. Tampoco se aplica aún el avance compacto ni LOD.
No hay cambio de UI. Registro visual general:
`artifacts/screenshots/m15-phase28-checkpoint-2026-10-03-pass1/`.
