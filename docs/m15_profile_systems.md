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

## Pendiente de 32a

Ampliar duración y semillas, distribución entre asentamientos, coste de
observación/percepción y otras partes del paso sin wrapper; luego comparar
visibles, registros compactos y pueblos con los modelos implementados.
Siguen pendientes la referencia demográfica y su calibración, transiciones,
velocidades altas y controles del bucle real. El LOD aprobado aún no está activo.
