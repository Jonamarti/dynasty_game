# M15 28 — Checkpoints de reloj y RNG

2026-10-03. `RNG.snapshot()` y `RNG.fromSnapshot()` guardan los cuatro words
de xorshift128 en JSON v1 y recuperan exactamente la siguiente tirada. La carga
no ejecuta el constructor, expande semillas, consume el padre ni cambia el
orden de forks. Los words se copian y se rechazan versiones/formas desconocidas,
arrays incompletos, valores fuera de uint32 y el estado absorbente todo cero.
`getState`/`setState` conservan su API anterior.

`TimeManager.snapshot()` conserva tick y los cinco parámetros del calendario,
incluidos los de presentación. `fromSnapshot()` crea un reloj independiente
con el calendario guardado: restaurar solo ticks con los defaults cambiaría
estación, edad y frontera diaria. Valida campos propios, valores finitos,
conteos enteros positivos y límites seguros de año y día. No avanza el reloj.

Cuatro pruebas comprueban continuidad de tres streams en más de 1.500 tiradas,
gaussian/shuffle, ausencia de draw en el padre, copias independientes, rechazos
de datos corruptos y continuidad de todos los getters del reloj durante cien
pasos que cruzan medianoches, estaciones y años con calendario no estándar.

Estos checkpoints son componentes de fase 28. La composición posterior de
reloj y todos los streams vivos está en [ExecutionRecords](m15_phase28_streams.md).
Faltan agendas y config completa, y no se integra una carga de Simulation.
El guardado completo y el LOD siguen pendientes.

Typecheck y 4/4 pruebas focales pasan. Gira de seguimiento sin cambio de interfaz:
`artifacts/screenshots/m15-execution-checkpoints-2026-10-03-pass1/` (1/1 tour;
captura inicial revisada). La comprobación completa se registra al integrar la
pasada, distinguiendo el staging de hojas de arte de los fallos heredados.
