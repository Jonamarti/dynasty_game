# M15 28 — Reloj y corrientes RNG

2026-10-03. `persistence/ExecutionRecords.ts` compone un checkpoint inerte
v1 del reloj y las corrientes aleatorias que siguen vivas en una `Simulation`.
Incluye el RNG raíz, las trece corrientes privadas del motor y la corriente de
`MovementSystem` que el motor mantiene como campo privado. Los forks usados
solo durante la generación inicial no sobreviven a la construcción y no forman
parte del banco ejecutable.

El sobre conserva rutas estables y una tabla de referencias a identidades RNG
canónicas. La inspección actual encuentra quince instancias distintas, sin
aliases; la captura falla si una ruta exigida no contiene un RNG y conserva
las identidades compartidas con una referencia canónica. Al cargar, las rutas aliasadas de un
registro válido apuntan al mismo objeto RNG, sin constructor, fork o draw. El
reloj se reconstruye desde `TimeSnapshot`, y su tick debe coincidir con la marca
del sobre.

`toExecutionRecord` no avanza reloj ni corrientes. `fromExecutionRecord`
devuelve una `TimeManager`, un mapa de streams por path y otro por identidad; no
aplica nada a `Simulation`, ni restaura entidades, IDs, mundo o agendas. Las
pruebas ejecutan una simulación real, recorren independientemente su grafo para
encontrar instancias RNG, comparan continuaciones de streams después de JSON y
comprueban las rutas, el tick, los aliases, la independencia y entradas corruptas.
Esto prepara una pieza del futuro cargador coordinado, no completa guardado de
partida ni LOD.

Typecheck limpio, 3/3 pruebas focales y suite completa 935/935 en 127 archivos;
72/72 pruebas de navegador. Registro visual general sin cambio de interfaz:
`artifacts/screenshots/m15-stream-records-2026-10-03-pass1/` (tour 1/1 e imagen
inicial revisada). La comparación de matriz se registra al integrar la pasada;
la referencia ya presenta 104 fallos entre 27 escenarios.
