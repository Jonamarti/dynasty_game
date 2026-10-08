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

## Paso 0 (2026-10-08): la mitad del paso que faltaba, por bloque

`npm run profile:step -- --humans=30,300` (`tools/profile-step.ts`). El
instrumento de navegador de arriba envuelve métodos, y más de la mitad de
`Simulation.step()` no es un método: es el bucle por persona, la
reconciliación de carga, el contexto que se construye cada tick. Ahora
`step()` llama a `stepMark('etiqueta')` entre bloques (`src/sim/core/StepProbe.ts`,
un módulo aparte y no un campo de `Simulation`: el hash de estado distinguiría
`null` de una función) y la herramienta, en Node y sobre el mismo mundo
(`profile-4`, una banda de N fundadores concentrados, dificultad normal), carga
el tiempo desde la marca anterior a cada etiqueta. Todo el paso queda atribuido.

**Es bit-idéntico por construcción y por prueba.** Cada población se ejecuta dos
veces desde un mundo nuevo, control sin gancho y marcada, y el SHA-256 de todo
el estado (todos los campos, todos los RNG; mismo codificador que
`profile-systems`) debe coincidir al empezar y a los 480 pasos, o la
herramienta termina con error. Control negativo: perturbar un hambre en una
millonésima cambia el hash. `step-probe.test.ts` repite la comparación en el
conjunto de pruebas (estado completo, con la memoria de lugares de cada persona,
tras 400 pasos con y sin gancho, y un control negativo con otra semilla).
`--methods=brain` envuelve además cada método de un subsistema (tiempos
inclusivos, solapados) para bajar un nivel; `--json=` guarda los datos.

### Dónde va el tiempo (ms por paso, 480 pasos, esta máquina, una muestra)

| Bloque | 30 | 100 | 200 | 300 | ×(300/30) |
|---|---:|---:|---:|---:|---:|
| `loop: brain` (`think` + `score`) | 0,710 | 2,764 | 7,276 | 15,736 | 22 |
| `loop: observePlaces` | 0,113 | 1,480 | 6,037 | 15,614 | **138** |
| `loop: execute` | 0,108 | 0,342 | 0,706 | 1,367 | 13 |
| `needs.update` | 0,052 | 0,176 | 0,376 | 0,666 | 13 |
| `loop: chronic drives` | 0,027 | | | 0,307 | 11 |
| el resto (hashes, fauna, diarios, carga...) | ~0,2 | | | ~1,0 | ~5 |
| **paso con marcas** | **1,21** | **5,2** | **15,2** | **34,7** | 29 |

El bloque que la tabla de métodos no veía es **`observePlaces`**: 45 % del paso
a 300 personas (9 % a 30), casi todo lo que el paso no atribuía. `needs.update`,
como dice §0.1 del LOD, es un 2 %: lo caro es pensar, y pensar es `brain` más
`observePlaces`.

### Qué crece de forma superlineal, y por qué

1. **`observePlaces`: cuadrático (138 veces el coste con 10 veces la gente;
   de 100 a 200 cuesta 4,1 veces, de 200 a 300 cuesta 2,6 veces por 1,5 veces la
   gente).** Cada vez que alguien piensa (cada 5 ticks, escalonado) consulta el
   hash de personas dentro de su radio de visión (13 casillas) y, por cada persona
   vista, llama a `PlaceMemory.remember('person', ...)`. En un campamento de 300
   todos ven a los otros 299: N personas × N vistas. Y no es solo recorrer: la
   memoria guarda como máximo 48 registros por tipo (`capPerKind`), así que con 299
   vistas cada `remember` de una persona que no está ya guardada **expulsa** a la
   más débil (`weakestKey`: un recorrido completo de los 48, más dos
   `SpatialHash.remove`, dos `insert`, varias asignaciones de objetos) y la
   siguiente vista expulsa a la que acaba de entrar. La memoria de personas es una
   cola FIFO que gira entera en cada observación. Perfil de CPU a 300
   (autotiempo): `weakestKey` 9,8 %, `remember` 6,3 %, `SpatialHash.remove` 5,2 %,
   `setRecord`/`deleteRecord`/`indexAvailability` 8 %, recolector de basura 9 %:
   más de un tercio de todo el proceso. A 30 personas no hay expulsión (29 < 48).
2. **`Brain.think/score`: entre lineal y cuadrático (22 veces con 10 veces la
   gente).** Las llamadas por paso son lineales (4,5 a 45). El coste por `score`
   pasa de 197 µs (30) a 232 (100) y 373 (300), un factor 1,9 que viene de (a) los
   recorridos de `neighbours` (toda la vista, 299 personas, con `filter`/`find`
   dentro de varios puntuadores) y (b) `findExplorePoint`, de 275 a 560 µs por
   llamada, que se llama más cuanto más agotada está la comida cercana: recorre
   anillos de casillas de 4x4 por todo el mapa asignando cinco arrays por paso del
   anillo. (b) es coste fijo del mapa por llamada, no de N; que se llame más es
   consecuencia emergente de que 300 personas agotan la comida de su radio.
3. **Lineal**: `execute`, `needs.update`, `chronic drives`, `reconcileCarry`, los
   hashes (13 veces con 10 veces la gente, o menos).

**Decisión de diseño que no se toca:** que cada persona recuerde como máximo 48
personas (`capPerKind`) y que en un campamento todos vean a todos. Los arreglos
de las secciones siguientes conservan esa semántica al bit.
