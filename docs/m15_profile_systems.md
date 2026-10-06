# M15 32a — Perfil de referencia por sistemas

Medición del 2026-10-03. Se ejecuta con `npm run profile:systems`.
`PROFILE_STEPS` permite ampliar la muestra (mínimo 240); por defecto son
480 pasos, dos días del calendario actual. No modifica el juego normal.

El instrumento abre Chromium headless nuevo por población y modo, con semilla
`profile-4` y 30/300 fundadores naturales concentrados en un campamento. Detiene
`requestAnimationFrame` antes de arrancar y ejecuta exactamente los pasos
síncronos, sin calentamiento y durante los primeros dos días del mundo.
Esto mide simulación en navegador; no mide dibujo, HUD, FPS,
latencia de controles ni velocidades del bucle de presentación.

Los wrappers se instalan solo en esa página. Sus tiempos incluyen llamadas
anidadas y trabajo de instrumentación: **no se suman**. `Brain.think` llama a
`score`, pero el jugador también recibe `score` directamente fuera de `think`.
No se atribuye a esos métodos el trabajo del paso que queda sin instrumentar.

## Resultado

Chromium 151.0.7922.34 en este host; una muestra por tamaño/modo, sin prometer
un overhead fijo ni un presupuesto de producción.

| Humanos | Sin wrappers, ms/paso | Con wrappers, ms/paso | Pasos en ambos |
|---|---:|---:|---:|
| 30 | 1,09 | 1,18 | 480 |
| 300 | 28,72 | 28,47 | 480 |

La repetición anterior de 300 dio 26,49/31,20 ms. La variación entre corridas
impide interpretar la diferencia de la tabla como una mejora o estimar un
coste fijo del perfilador. Son observaciones, no checks de rendimiento.

| Método, 300 humanos | Llamadas | Tiempo inclusivo total, ms |
|---|---:|---:|
| `Simulation.step` | 480 | 13.666,2 |
| `Brain.score` | 20.470 | 4.915,7 |
| `Brain.think` | 19.990 | 4.715,7 |
| `Action.execute` | 140.160 | 660,2 |
| `Movement.advance` | 63.528 | 293,8 |
| `Needs.update` | 480 | 222,9 |
| `Social.dailyUpkeep` | 2 | 79,7 |
| `Bands.daily` | 2 | 33,4 |
| `Knowledge.daily` | 2 | 12,4 |

Los dos bloques diarios tienen una muestra insuficiente para caracterizar su
variación. La resolución del reloj redondea muchas llamadas pequeñas a cero;
el JSON conserva las distribuciones observadas sin tratarlas como latencia real.

## Visión y conservación

Al arrancar, los 300 fundadores están dentro de `sightOf(player)` (13,17
casillas); el radio de renderer actual es 12. Hay 70 animales, 4 dentro y 66
fuera. Durante el avance, los wrappers clasifican cada llamada por la posición
y visión efectiva del foco en ese instante: 955 `Brain.think` y 8.370
`Action.execute` se ejecutan fuera de visión (160,5 y 42,8 ms inclusivos).
Esto documenta detalle remoto actual; no es trabajo compacto ni activa un LOD.

Los hashes SHA-256 iniciales y finales coinciden entre perfil y control para
ambas poblaciones, al tick 480. Incluyen estado mutable de mundo, entidades,
relaciones, sistemas y todos los RNG, excluyendo funciones. Antes de medir,
el control negativo cambia hambre y consume un draw del RNG raíz: detecta
ambas alteraciones y verifica la restauración exacta del hash. Si la equivalencia
falla, el CLI termina con error; no se entrega una tabla de rendimiento válida.

Datos finales y controles:
`artifacts/verification/m15-systems-2026-10-03T12-07-39-289Z/report.json`.

## Ampliación del 2026-10-06: distribución, duración y percepción

Tercer modo del instrumento, `counted`, más un cronómetro por paso en los tres.
Datos: `artifacts/verification/m15-systems-2026-10-06T15-45-59-374Z/report.json`
(mismo host, semilla `profile-4`, 480 pasos). Los hashes SHA-256 de estado/RNG de
`unprofiled`, `profiled` y `counted` coinciden al inicio y al tick 480 con 30 y
con 300 humanos: **la instrumentación es bit-idéntica**. El CLI falla si alguno
de los tres difiere, o si repetir las consultas de percepción cambia el hash.

La interpretación (percentiles, reparto por banda, estimación de percepción)
está en `tools/profile-stats.ts`, puro y cubierto por
`src/sim/__tests__/profile-stats.test.ts`, con controles negativos (misma media y
cola distinta; cero llamadas, cero coste). Las tablas de la sección «Resultado»
son de la corrida anterior (2026-10-03) y no se mezclan con las de esta.

### Duración por paso

Un par de `performance.now()` alrededor de cada `step()`, fuera de todo bucle
interior. ms por paso:

| Humanos | Modo | media | p50 | p95 | máx |
|---|---|---:|---:|---:|---:|
| 30 | sin wrappers | 1,29 | 0,90 | 2,90 | 22,4 |
| 30 | con wrappers | 1,39 | 1,00 | 2,80 | 23,3 |
| 30 | contadores | 1,26 | 0,90 | 2,90 | 22,3 |
| 300 | sin wrappers | 21,66 | 21,40 | 38,00 | 171,5 |
| 300 | con wrappers | 22,53 | 22,80 | 38,10 | 169,9 |
| 300 | contadores | 21,53 | 21,30 | 37,60 | 169,7 |

El intervalo largo no es ruido: en 300 los pasos más lentos son los mismos
índices en los tres modos: 239 (171 ms: el paso que cruza el día, con los
bloques diarios), 0 (129 ms: arranque en frío, sin calentamiento por diseño) y
479 (68 ms: el segundo día). El p95 (38 ms) ya es 1,8 veces la mediana; el máximo,
8 veces. Un presupuesto por media esconde esos picos. La resolución del reloj de
Chromium (del orden de 0,1 ms) hace poco fiables los p50 de 30 humanos. Una sola
muestra por celda: las diferencias de media entre modos no son un coste del
perfilador.

### Distribución dentro/fuera de visión

Los wrappers de `Brain.think` y `Action.execute` cuentan además por banda (solo
contadores). En 300 humanos: `think` 19.508 dentro / 1.643 fuera (7,8 %),
`execute` 130.179 dentro / 9.981 fuera (7,1 %). En 30: 1.591/98 y 13.579/821.
Los fundadores arrancan todos dentro de la visión; al tick 480 han salido de ella
6 de 30 y 57 de 300 (19 %). **Con una sola banda (`bandId 0`) el reparto entre
bandas/asentamientos es trivial**: el instrumento ya lo emite por banda, pero esta
muestra no lo ejercita; hace falta un mundo con varias bandas (pendiente). Las
cifras de fuera de visión difieren de las del 2026-10-03 (955/8.370): no se ha
investigado si es por cambios de código posteriores o por la clasificación, y no
se comparan.

### Percepción sin wrapper

Modo `counted`: el único cambio es un contador entero en `SpatialHash.queryRadius`
y `findNearest` (sin cronómetros por llamada), que guarda los argumentos de una de
cada 64 llamadas. Con el bucle terminado, esas consultas se repiten sobre los
hashes finales en bloques, con **un solo par de cronómetros por bloque** (9
repeticiones, mediana), y el coste de percepción se estima como llamadas contadas
x coste unitario. El paso en este modo (21,53 ms) no se distingue del no
instrumentado (21,66): el contador no distorsiona la medida a esta resolución.

| Humanos | Consulta | Llamadas | /paso | µs/llamada | ms/paso |
|---|---|---:|---:|---:|---:|
| 300 | `queryRadius` | 395.318 | 824 | 2,22 | 1,83 |
| 300 | `findNearest` | 360.201 | 750 | 2,79 | 2,10 |
| 300 | total | | | | 3,93 (18 % del paso) |
| 30 | total | 80.009 | 167 | | 0,23 (18 %) |

**Sesgos que quedan** (es una estimación, no una suma de tiempos medidos):

1. El coste unitario se mide sobre el estado final, no el de cada llamada, y con
   cachés calientes por repetir las mismas consultas: tiende a **subestimar**.
2. Solo se repite 1 de cada 64 llamadas (630/394 muestras en 300), con sus
   predicados de filtro; pueden ser más baratos o caros que la media.
3. Solo cubre consultas por el hash espacial: la reconstrucción de hashes,
   `sightOf`, `Knowledge` y los recorridos de arrays que no pasan por hash no entran.
4. Incluye el cuerpo de los filtros de `findNearest`, que es lógica de decisión y
   no solo percepción.
5. El contador añade una llamada de función por consulta: invisible en el ruido
   aquí, pero no medible por separado.

No es un presupuesto de producción.

## Pendiente de 32a

Siguen pendientes, dependientes de 32b/32c: las cohortes de **visibles, registros
compactos y pueblos agregados** frente al detalle actual (aún no hay modelos
implementados). Sin cubrir: reparto en un mundo con varias bandas, más semillas,
otras partes del paso sin wrapper, transiciones, velocidades altas y controles del
bucle real. El LOD aprobado aún no está activo.
