# M15 fase 10 — calibración contra la historia, primera pasada

Protocolo de `m13_plan.md` fase 14, heredado por M15 fase 10: un parámetro a
la vez, 20 semillas por valor, tabla de resultados frente a la tabla
«Objetivos históricos» de `m13_plan.md`. `--set` (fase 1b) y el escenario
`generations` (fase 10a) ya existen.

**Nota sobre el instrumento.** Al preparar esta pasada se descubrió que
`sim:seeds -- --scenario X --seeds N` llevaba desde la fase 1b (`a69eeb9`)
leyendo el propio valor de `--seeds` como si fuera `--size`, encogiendo la
isla a `N×N` mientras la población se quedaba igual — un colapso total
garantizado que no tenía nada que ver con el mundo. El arreglo y su alcance
están en `docs/bugs.md` («M15 fase 10 — `sim:seeds` …») y en el changelog del
2026-09-29. Todas las cifras de este documento están medidas **después** del
arreglo.

## Línea de partida (sin tocar ningún parámetro)

20 semillas, mundo por defecto (`Config.motivation` tal y como queda tras la
fase 9).

| métrica | objetivo | `century` (20 años, 20 semillas) | `lean` (isla pobre, 20 semillas) | `generations` (15 años, **5 semillas**) |
|---|---|---|---|---|
| supervivencia media | — (informativo) | 92,3% (1/20 colapsos) | 21,8% (11/20 colapsos) | 86,4% (0/5 colapsos) |
| `worldLost` | 0/20 | 1/20 | 0/20 | 0/5 |
| `bandLost` violencia | ≤1/20 bandas-partida | 0 | 0 | 0 |
| `selfDestroyed` | ≤1/100 | 0 | 0 | 0 |
| `drawdown` p50/p90/max | informativo | 0,059/1,000/1,000 | 0,833/1,000/1,000 | 0,380/0,759/1,000 |
| `recovered` (caídas >40%) | ≥50%, solo medible en `generations` | n/a (escenario corto) | n/a (escenario corto) | **0/7 (7 censuradas, ninguna aún)** |
| violent adult deaths (proxy de `violentShare`) | 5%-30% de muertes adultas | 4,5% | 0,2% | 8,6% |
| `inBandKillRate` /1000 persona-año | ≤1 | 0,000 | 0,000 | 0,000 |
| `answered` (adultos) | ≥90% | **33,3%** | n/a (muy pocos golpes) | **0,0%** |
| niños que huyen | ≥90% de atacados | n/a (0/0 muestras) | n/a (0/0 muestras) | n/a (0/0 muestras) |
| `peaceShare` | ≥60% | 99,9% | 99,9% | 99,7% |
| `nightNearHome` (<15 casillas) | ≥75% | 82,6% | 78,0% | 80,6% |
| niños dentro del radio (¬far>12) | ≥80% | 92,6% | 85,6% | 92,9% |
| `fireBy` | ≥50% de semillas (solo se pide en `century`) | 90,0% (18/20) | — | — |
| `adoption` mediana | ≤80 días | 7 días | 4 días (5 cohortes nunca llegaron) | 8 días (1 nunca llegó) |
| malnutrición media | por debajo de la línea base | 0,242 | 0,239 | 0,255 |

## Lectura de esta primera pasada

**Sin tocar ningún parámetro todavía**, la mayoría de los objetivos ya se
cumplen en `century` y `lean`: mundo perdido, autodestrucción, matanza dentro
de la banda, `peaceShare`, sueño cerca de casa, niños dentro del radio,
`fireBy` y la mediana de adopción están todos dentro de su rango.

**Un objetivo falla con claridad: `answered` en `century` (33,3% frente a
≥90%)**, y no se ajusta aquí porque la regla del protocolo es no tocar un
parámetro sin saber qué mide. Es probable que esté relacionado con las fases 7
(coste de las órdenes) y 8 (incursiones e instigadores), que son las más
recientes en tocar cómo se responde a una agresión; se deja anotado en
`docs/bugs.md` para diagnosticarlo con `npm run why` antes de mover ningún
coeficiente. `violentShare` en `lean` (0,2%) está muy por debajo del 5%-30%
recomendado — el mundo pobre es demasiado pacífico para su propia escasez —
mientras que `century` (4,5%) queda justo al borde inferior.

## `generations`, exploración (5 semillas, no 20)

**Coste declarado antes de medir:** a ~11 min/semilla medidos (3.333 s para 5
semillas), 20 semillas de `generations` cuestan del orden de 3,7 horas de
cómputo secuencial. Esta primera pasada usa 5 semillas para explorar (el
propio protocolo de `m13_plan.md` distingue «10 semillas para explorar, 20
para decidir»); **ninguna decisión de calibración se toma sobre esta
muestra**, solo se registra lo que dice antes de ampliarla.

**Lo que dice, con la reserva de que son 5 semillas.** La supervivencia media
(86,4%, 0/5 colapsos) y la mayoría de la tabla —`worldLost`, autodestrucción,
matanza dentro de la banda, `peaceShare`, sueño cerca de casa, niños dentro
del radio, mediana de adopción— caen dentro de objetivo, igual que en
`century` y `lean`. Dos cosas laten con la misma dirección que ya apuntaban
las cohortes más cortas y merecen seguimiento, no ajuste:

- **`recovered` es 0/7**: de las caídas de más del 40% observadas en estas
  cinco semillas, ninguna se había recuperado al terminar los quince años de
  juego — las siete quedan censuradas (la caída seguía sin resolverse cuando
  acabó la corrida), no confirmadas como «nunca se recuperan». Es la métrica
  para la que existe `generations`, así que es la primera que hay que revisar
  con una muestra de 20: si sigue en 0% ahí, la recomendación de
  `m13_plan.md` (≥50%) no se cumple y hace falta diagnosticar el mecanismo de
  recuperación (comida disponible tras la caída, natalidad, distancia a otros
  bandos) antes de tocar ningún coeficiente.
- **`answered` es 0,0% aquí**, coherente con el 33,3% ya bajo de `century` y
  reforzando que es un problema real y no ruido de una sola cohorte corta. Ver
  la entrada de `bugs.md`.

## Qué no se ha hecho en esta pasada

- **No se ha barrido ningún parámetro de `Config.motivation`.** Esta pasada es
  solo la línea de partida; el protocolo pide medir antes de tocar nada, y
  `answered` es el primer candidato una vez diagnosticado.
- La cohorte `generations` a 20 semillas ya se completó el 2026-10-12; su
  persistencia y recuperación quedan bajo objetivo. Ver resultados más abajo
  y el diagnóstico en `bugs.md`.
- **Diagnóstico de `answered`** con `npm run why` sobre una agresión concreta,
  antes de mover el coeficiente de autoridad o de ánimo de respuesta.
- **La segunda pasada de calibración (fase 41)**, después de los bloques
  III-VI (manos, sal, noche, cuerpo, fauna), que es la que de verdad fija
  `Config.motivation` para el resto de M15.

### Diagnóstico corto de dieta y pertenencia — 2026-10-13

`npm.cmd run sim:check -- --scenario band` volvió a dar `cravings-steer-the-diet`
y `moods-move-choices` en rojo. Hubo 228 comidas durante antojo proteico fuerte,
6 ricas en proteína (2,6%); en calma hubo 117, 12 ricas (10,3%). En las
decisiones con antojo, la búsqueda halló proteína alcanzable 1.039 veces y no
halló proteína en la búsqueda 2.952 veces, de 4.777. Esta medida de comidas no
condicionaba por disponibilidad. El diagnóstico posterior, y el cambio del gate
condicional, figuran en «Oportunidad proteica durante el antojo» más abajo.

El observador de `moods-move-choices` se corrigió para emparejar la acción del
paso con pertenencia capturada antes del paso; anteriormente una conversación
familiar podía elevar la pertenencia antes de que se tomara la muestra. El check
sigue rojo con 2,9% de charla en baja pertenencia frente a 3,6% en alta (950 por
grupo), así que la corrección elimina la fuga temporal pero no resuelve el
comportamiento. El test específico y typecheck pasan. No se alteró simulación,
umbrales ni versión.

### Verificación autorizada completa — 2026-10-13, `0.15.138-alpha`

`npm.cmd test -- --maxWorkers=1 --testTimeout=15000` terminó en 653,88 s con
2.280 aprobadas, 2 fallidas y 1 omitida en 311 archivos. Permanecen
`compact-correspondence` (solo `lean/delta`, sed 16,9046 frente al margen 15)
y la entrega de tributo (`tribute_ordered` > 0, `tribute_delivered` = 0). La
prueba de golpe de Estado ya pasa con la población adulta y el rencor que su
premisa requiere; la difusión y las fixtures de telemetría compacta también
pasan. No se ajustaron umbrales.

`npm.cmd run sim:check:all` recorrió 34 escenarios y terminó con salida 1. Los
escenarios de mecanismo `nights` (3/3), `salters` (1/1), `tailors` (3/3),
`homes` (7/7), los seis de hierro, `frontier-cohort` (3/3), `frontier` (2/2),
`food-news` (1/1), `conflicts` (1/1) y `shallows` (6/6) pasaron. Los generales
retienen fallos repetidos de dieta, sueño, pertenencia, supervivencia,
descubrimiento, sociedad y fauna, desglosados por escenario en la salida de
esta ejecución. Ningún peso ni check se cambió para perseguir la matriz.

E2E emitió los 179 resultados en servidor fresco: 176 pasaron y tres fallaron
al escribir PNG históricos (`UNKNOWN: unknown error, open`), sin fallar sus
aserciones de juego. Las tres specs pasaron después en ejecución focal con
directorio temporal de capturas (8/8); las dos pruebas de versión también
pasaron en puerto fresco. Ambos runners se quedaron en teardown y se
interrumpieron, así que no se afirma un exit 0 completo de Playwright. Las
ejecuciones E2E reemplazaron temporalmente capturas históricas; la restauración
quedó bloqueada por el revisor automático y requiere aprobación del propietario.

**Estado:** fase 41 y M15 siguen abiertos. La suite no autoriza a declarar
calibración cerrada mientras sobrevivan esas puertas.

## Lecturas de fase 41 — 2026-10-12

Se actualizaron checks cortos tras M15, sin cambiar parámetros:

| Escenario | Comando | Resultado | Límite |
|---|---|---|---|
| `food-news` | `npm.cmd run sim:check -- --scenario food-news` | PASS 1/1, `word-of-food-travels` | 600 pasos; prueba el mecanismo de rumor, no su adopción poblacional. |
| `frontier` | `npm.cmd run sim:check -- --scenario frontier` | PASS 2/2, `nobody-drinks-the-sea`, `rivers-are-crossed` | 300 pasos; prueba agua/frontera en una semilla. |
| `homes` | `npm.cmd run sim:check -- --scenario homes` | PASS 7/7: camas usadas, muebles, ánimo de sueño/seguridad, muros y rutas | 2.400 pasos; lector preparado, no mide construcción natural ni calibración demográfica. |
| `tailors` | `npm.cmd run sim:check -- --scenario tailors` | PASS 3/3: uso 6/7; 3.272/10.073 cold person-ticks; evitó 0,03253 de frío/probe tick; 1 rotura y 1 reparación | 2.400 pasos; mecanismo de ropa y remiendo, no economía ni supervivencia. |
| `frontier-cohort` | `npm.cmd run sim:seeds -- --scenario frontier-cohort --seeds 20` | supervivencia media 91,8%; `worldLost` 0/20; colapso 0/20; 43 nacimientos; 2 muertes por deshidratación y 24 por hambre | 12.000 pasos/semilla; 485,1 s bajo cohortes simultáneas. Sin comparación emparejada ni inferencia de mejora. |
| `band` | `npm.cmd run sim:check -- --scenario band` | 3 fallos: `cravings-steer-the-diet`, `perf-budget`, `hills-see-farther` | Una sola semilla, ejecutada mientras corrían cohortes largas; la cifra de rendimiento no es una medición válida bajo esa carga. |
| `salters` | `npm.cmd run sim:check -- --scenario salters` | FAIL `preserved-food-lasts`: 0/3 comidas invernales conservadas | El monitor de pérdida sigue sin comparación que detecte el build sin recetas de conserva; no demuestra mejora ni habilita 15c. |

La lectura de `band` no cambia el registro de fallos previos. Los tres checks
ya constan como fallos heredados en la línea base; no se ajustaron sus umbrales.
La auditoría del CLI también confirmó que `drought`, `migrants` y `caravans`,
citados como ejemplos de escenarios de mapa en notas históricas, no están
registrados en `tools/simcheck.ts`. `sim:seeds` no calcula checks de mapa
personal; esos checks se ejecutan con un escenario individual. La cohorte
`frontier-cohort` existente mide una dimensión geográfica y no sustituye una
cohorte de viajes o caravanas. La pasada nueva tuvo 91,8% de supervivencia
media y cero colapsos o mundos perdidos; se observaron dos muertes por
deshidratación y 24 por hambre. El 97,9% de la referencia del 6 de octubre era
población final/pico, una métrica distinta, así que no se calcula delta entre
ambas.

El fallo de `salters` reproduce el problema registrado el 2026-10-10, entonces
con 0/8 comidas conservadas. La semilla actualizó el conteo a 0/3; ambos son
mediciones de una sola ejecución con distinta trayectoria, no una tendencia.
`spoilage-is-answered` continúa retirado porque no supera su control negativo.
El detalle y la decisión de no activar la tasa global siguen en
[`m15_phase15d_salters.md`](m15_phase15d_salters.md) y [`bugs.md`](bugs.md).

### `century`, cohorte actual de 20 semillas

`npm.cmd run sim:seeds -- --scenario century --seeds 20` terminó en 1.964,9 s
de tiempo de herramienta, con 40.000 pasos por semilla. Resultados: supervivencia
media 54,8%; colapso 1/20; `worldLost` 0/20; caída >40% recuperada 0/31 (las 31
seguían censuradas al acabar); `answered` 79,5% (objetivo ≥90%); aprendizaje de
`firemaking` en 8/20 semillas (40%, objetivo ≥50%); `inBandKillRate` 0,000;
muertes adultas violentas 26,3%; `peaceShare` 99,8%; adopción mediana 11 días
(16 semillas no la alcanzaron); malnutrición media 0,264. Ver [hallazgo en
bugs.md](bugs.md).

La línea base previa de 92,3% se midió en otra revisión del juego. Sin un build
emparejado y sin aislar un mecanismo, esta diferencia no atribuye la caída a
una funcionalidad concreta. No se cambió ningún parámetro. Cohortes completas
de `lean` y `generations` constan más abajo; una ablación adicional de `lean`
sin depredadores mostró efecto heterogéneo y no aisló la causa alimentaria.

El diagnóstico de century `npm.cmd run violence -- --scenario century --steps
40000 --cases` sobre el seed nominal terminó sin adultos golpeados que seguir
con `why`; observó cinco muertes por hambre sin exposición individual. No
diagnostica `answered`. Un probe temporal de `generations` a 144.000 pasos dio
`blow_repeat=1` y `blow_repeat_unanswered=0`: la única repetición ocurrió en
tick 12.375 y la víctima ya ejecutaba `give`. Los casos del instrumento de
violencia (13 huidas, 1 agresor desaparecido) miden todos los golpes, mientras
`answered` solo mide el segundo golpe del mismo agresor dentro de 40 ticks.
Una muestra de un solo evento no explica el 79,5% de century; la causa sigue
abierta y no se ajusta el umbral ni los coeficientes.

La instrumentación de fase 41 mantiene el desglose del proxy y añade histogramas
del estado de la víctima justo antes de cada primer golpe adulto y cada segundo
golpe que entra en el denominador: acción, orden, acción y drive del commitment,
temporizador restante en ticks y resultado de `assailantOf` en ese
instante. `answered_under_attack_detected_tick` cuenta person-ticks en los que
Simulation leyó un agresor; `answered_interrupted_under_attack_action_*` cuenta
acciones que ActionSystem interrumpió por esa causa. Brain registra la acción
elegida cuando también encuentra un agresor mediante esa lectura compartida.
`sim:seeds` agrega las familias `answered_*` al renglón `HISTORY answered`.

Son histogramas agregados, no trazas con IDs ni parejas de eventos. La lectura
de detección cuenta ticks, no asaltos únicos; un caso sin contador de decisión
puede ser una acción que seguía comprometida o una oportunidad de pensamiento
que aún no llegó. Esto no altera el predicado, los sorteos ni las decisiones de
IA. La cohorte `generations` actual (20 semillas) aún solo tiene el desglose
anterior (`answered` 36/44, 81,8%; no respondidas `drink` 1, `give` 2,
`go_home` 2, `idle` 3); falta recoger los nuevos histogramas en una cohorte
para distinguir ocupación, detección y selección del scorer. Sin esa lectura no
se ajustan pesos ni se atribuye causa.

### Recuperación: embudo falsable de concepción

La recuperación se sigue midiendo como volver al 75% del máximo previo después
de una caída al 60% o menos. Para distinguir una falta de nacimientos de una
pérdida posterior, `LifeSystem` ahora cuenta por cohorte los días de oportunidad
de concepción y los bloqueos por espaciamiento, pareja no disponible, hambre o
salud nulas; cuenta también las oportunidades con sorteo, su probabilidad
acumulada, los rechazos por falta de techo compartido, embarazos establecidos,
pérdidas por causa y nacimientos vivos. Las filas por semilla emparejan esos
conteos con caídas recuperadas/censuradas. Son contadores observacionales: no
alteran decisiones ni sorteos.

La hipótesis que puede refutarse es que las caídas no rebotan porque las
oportunidades de concepción se cierran antes del embarazo (parejas, necesidades
o techo). Si aparecen embarazos y nacimientos en semillas/caídas que siguen
censuradas, la explicación está después de la concepción o en otra dinámica de
población; este embudo no autoriza por sí solo a cambiar el techo ni las tasas.
Los resultados son agregados por semilla, no enlazan aún cada nacimiento a una
caída concreta. Un `n/a` significa que no hubo días elegibles para intentar
concebir.

### Muestra actualizada y cohorte `answered`

La cohorte `century` de 20 semillas (40.000 pasos, 1.929,6 s) se ejecutó antes
de añadir el embudo. Sí incluye el nuevo desglose de `answered`: 35 respuestas
`flee`, 2 `give`, 1 `go_home`, 1 `drink` y 3 `idle`; 7 de 42 segundos golpes
quedaron sin respuesta (answered 0,833). Es un desglose descriptivo de esta
cohorte, no una calibración. Su recuperación anterior al embudo fue 0/42 con
42 episodios censurados, por lo que no sirve para atribuir el resultado a una
etapa de concepción.

Después de instrumentar el embudo, una muestra de formato `century`, 2 semillas
de 5.000 pasos (18,5 s), imprimió métricas agregadas y filas por semilla:
460 oportunidades, 80 bloqueos por pareja, 380 intentos, 36,440 sorteos
esperados, 350 fallos de sorteo, 30 rechazos por techo, 0 embarazos, pérdidas o
nacimientos vivos. Las semillas `century` y `alpha` mostraron respectivamente
220 y 240 oportunidades; `answered` agregado fue `n/a` con denominador 0 y el
resumen conservó los episodios de recuperación por semilla. Esta muestra valida
el flujo y el formato, no calibra recuperación ni justifica cambios de
parámetros.

No hay un barrido de parámetros ni una decisión de calibración. La muestra
única de los escenarios cortos solo confirma sus checks de mecanismo; las
cohortes y la ablación de fase 41 se registran abajo, sin afirmar causalidad
para cambios de supervivencia agregada.

### `lean`, cohorte actual de 20 semillas

`npm.cmd run sim:seeds -- --scenario lean --seeds 20` terminó en 935,1 s con
24.000 pasos por semilla: supervivencia media 4,5%; colapso <25% en 20/20;
`worldLost` 2/20; 2 nacimientos y 702 muertes (99 lactantes, 64 niños mayores,
326 adultos murieron de hambre); ninguna de 60 caídas se recuperó antes del
final y 17/20 mundos no tenían banda capaz de recuperarse. `answered` 77,3%,
malnutrición 0,249, `peaceShare` 99,8%, `inBandKillRate` 0,000; `firemaking`
se conoció primero en el día 44. Frente a la referencia de 21,8% y 11/20
colapsos, el corte emparejado más reciente ya estaba en 3,26% antes y 2,89%
después de fase 27, con 20/20 colapsos. Los tres resultados son de revisiones
distintas: el movimiento histórico grande ocurrió antes de fase 27 y el 4,5%
actual no demuestra una regresión nueva ni una mejora causal. La semilla exacta
debe compararse bajo una ablación a la vez; no se ajustan parámetros con este
dato. Hallazgo en `bugs.md`.

### `lean`, ablación emparejada sin depredadores

`npm.cmd run sim:seeds -- --scenario lean --seeds 20 --set world.predators=0`
terminó en 973,6 s con el mismo pool y 24.000 pasos/semilla. Supervivencia
media 4,9% frente a 4,5% base (+0,4 puntos porcentuales), pero extinción 4/20
frente a 2/20 y colapso <25% en 20/20 en ambos; hubo 5 nacimientos frente a 2.
Las muertes totales fueron 702 en ambos. Sin depredadores hubo 51 asesinatos
menos, compensados por 80 muertes adicionales por hambre y 23 menos por
exposición, además de pequeñas diferencias en otras causas. Las diferencias
emparejadas de supervivientes por seed fueron heterogéneas (beta +3, eta −6;
suma neta +1), sin respuesta uniforme. No respalda a los depredadores como
causa principal de la crisis alimentaria ni justifica cambiar parámetros.

### `generations`, cohorte de 20 semillas

`npm.cmd run sim:seeds -- --scenario generations --seeds 20` terminó con exit
0 en 4.218,5 s (15 años por semilla). Supervivencia media 14,7%; 9/20 mundos
extintos, 15/20 colapsaron bajo un cuarto de población, 79 nacimientos y solo
2/20 terminaron por encima de su punto mínimo. Doce no tenían una banda capaz
de recuperarse; hubo 56 muertes de lactantes, 15 de niños mayores y 119 de
adultos por hambre. Se midieron 615 golpes entre pueblos (91% cerca de un
campamento), 18 asesinatos y 14/20 mundos elegibles superaron 20 puntos de
standing. La métrica de recuperación sigue por debajo del objetivo (no se
interpreta como censura: el escenario terminó). Hallazgo en `bugs.md`.

### `generations`, ablación emparejada sin estacionalidad de bayas

`npm.cmd run sim:seeds -- --scenario generations --seeds 20 --set
world.bushSeasons=false` terminó con exit 0 en 3.818,3 s (20 × 144.000
pasos). Supervivencia media 16,8% frente a 14,7% del control (+2,1 puntos);
extinciones iguales (9/20), colapso bajo 25% en 13/20 frente a 15/20,
82 nacimientos frente a 79 y 597 muertes frente a 615. El hambre bajó a 168
(45 lactantes, 9 niños mayores, 114 adultos), desde 190 (56/15/119). Diez
mundos terminaron sin banda viable para recuperarse (frente a 12), y 3/20
acabaron por encima del mínimo (frente a 2/20). `HISTORY recovered` dio 0/52,
52 censuradas: no se equipara a la métrica de estar sobre el mínimo. La mejora
no elimina extinciones ni colapsos; no se cambia la configuración global. El
resultado apunta a un coste de disponibilidad estacional en este escenario,
pero no a una solución suficiente. La tabla por semilla queda en `bugs.md`.

### Ablación emparejada `lean`: arbustos genéricos todo el año

`npm.cmd run sim:seeds -- --scenario lean --seeds 20 --set world.bushSeasons=false`
terminó en 957,4 s, 20 semillas × 24.000 pasos. El switch conserva los
arbustos genéricos antiguos sin estacionalidad. Supervivencia media 12,8%
(+8,3 puntos frente al 4,5% del control), extinción 3/20 (control 2/20),
colapso <25% en 18/20 (control 20/20), 6 nacimientos y 645 muertes (control
702). El hambre bajó de 489 a 408 muertes: 92 lactantes, 63 niños mayores y
253 adultos, frente a 99/64/326. Ocho mundos acabaron sin banda recuperable
(control 17/20); `recovered` siguió 0/60 censurada. En los registros por seed
13 subieron los supervivientes, 4 bajaron, 2 quedaron iguales y no se recuperó
la fila de `omicron`. Es evidencia emparejada de que la disponibilidad anual
de bayas puede mejorar esta cohorte `lean`, pero no resuelve las extinciones ni
demuestra que deba desactivarse la estacionalidad en el juego. Se mide aparte
la penalización metabólica de lactancia. Hallazgo en `bugs.md`.

### Ablación emparejada `lean`: coste metabólico de lactancia a cero

`npm.cmd run sim:seeds -- --scenario lean --seeds 20 --set childhood.lactationHunger=0`
terminó con exit 0 en 883,6 s (20 × 24.000 pasos). Supervivencia media 5,3%
frente a 4,5% del control; extinción 4/20 frente a 2/20; colapso <25% en
19/20. Hubo 696 muertes totales, 486 por hambre (97 lactantes, 75 niños
mayores, 314 adultos), frente a 702 totales y 489 por hambre (99/64/326).
Nacimientos: 2 en ambas. `answered` 77,8%; `recovered` 0/60 censuradas.
Reducir solo este coste no ofrece señal de rescate agregado ni de menor hambre;
no justifica cambiar la configuración. Junto a las ablaciones de depredadores
y bayas, indica que ninguna variable aislada aquí resuelve la persistencia de
`lean`. Hallazgo en `bugs.md`.

### `century`, cohorte repetida del 2026-10-13

`npm.cmd run sim:seeds -- --scenario century --seeds 20` terminó con exit 0
en 1.726,9 s de herramienta (20 × 40.000 pasos), con el código de la versión
`0.15.126-alpha`. Supervivencia media 45,6%; extinción 1/20; colapso bajo un
cuarto 2/20; 40 nacimientos; 374 muertes y 126 muertes adultas por hambre.
`recovered` fue 0/42: los 42 episodios seguían censurados al terminar. El
proxy `answered` fue 83,3% (35/42), por debajo del objetivo ≥90%. El informe
desglosa 35 víctimas en `flee`, 2 en `give`, 1 en `go_home`, 1 en `drink` y 3
en `idle`; la instrumentación cuenta `flee` como respuesta, así que las siete
acciones restantes coinciden con los siete casos no respondidos. Esto describe
el proxy en el instante del golpe, no prueba que la víctima escapara ni explica
la secuencia de agresiones. `firemaking` llegó a 4/20 (20%, objetivo ≥50%). La
cohorte no cambia parámetros y no tiene una comparación emparejada con otra
versión; no atribuye la diferencia respecto a cohortes anteriores a una
funcionalidad. Ver [hallazgo de fase 41](bugs.md).

### `generations`, nueva cohorte de 20 semillas (2026-10-13)

`npm.cmd run sim:seeds -- --scenario generations --seeds 20` terminó con
supervivencia media 6,0%; 10/20 mundos extintos y 19/20 colapsados bajo un
cuarto de su población. Hubo 67 nacimientos y 650 muertes (155 adultas, 24 de
niños y 65 de lactantes por hambre). Solo 2/20 mundos acabaron por encima de
su mínimo poblacional y hubo 5 bandas viables. `recovered` fue 0/59, las 59
episodios censurados; `answered` 81,8% (36/44), con 8 acciones sin respuesta:
`drink` 1, `give` 2, `go_home` 2 e `idle` 3. `firemaking` no alcanzó el umbral
de 50%. Es una nueva medición sin control emparejado: no se atribuye el
resultado a cambios de interfaz ni se eligen parámetros a partir de esta
muestra. La recuperación, respuesta y adopción siguen bloqueando el cierre de
fase 41. Ver el registro en `bugs.md`.

### Diagnóstico de fase 41: límite corregido del CLI de violencia

La primera ejecución de `npm.cmd run violence -- --scenario generations --steps
144000 --cases` imprimió 1 evento social `assault` y 8 huidas observadas en
ventanas de 60 ticks, pero esos denominadores no concordaban. La causa está en
el instrumento: usaba `lastHarmedTick`, que también actualiza `AnimalAttack`,
mientras `lastHarmedBy` puede conservar al último agresor humano. Además, el
resumen final fallaba si la cohorte terminaba con cero supervivientes. Ambos
fallos del informe están corregidos y tienen pruebas focales. La corrida inicial
terminó con salida completa después de corregir el resumen; la segunda medición
se está repitiendo con ventanas iniciadas solo por eventos `assault` contra
adultos. Hasta recibir ese resultado, la salida anterior no sirve para estimar
una tasa de respuesta. Con el filtro corregido, la repetición determinista
registra 1 `assault` adulto y 1 huida en la ventana de 60 ticks; el mundo acaba
sin supervivientes (`median n/a`). Un caso no constituye muestra suficiente ni
se corresponde con el denominador de `answered` (segundos golpes del mismo
agresor en 40 ticks). El instrumento queda corregido, pero la fase 41 sigue
sin diagnóstico poblacional de `answered`; no se cambian parámetros.

### Cohorte 12f de antorchas — 2026-10-14 (`0.15.148-alpha`)

En el mismo HEAD `b68c6e4`, dos cohortes seriales `lean` de 20 semillas y
24.000 ticks por semilla dieron 0/52.702 observaciones-persona nocturnas con
antorcha encendida cuando `light.enabled=true` y 0/55.096 cuando era `false`.
Hubo 3.620 snapshots nocturnos por brazo. La supervivencia fue 4,9% frente a
5,2% (−0,3 puntos), con 5/20 frente a 7/20 mundos extintos; los veinte mundos
de ambos brazos cayeron por debajo del 25% del pico. No hay evidencia de
adopción poblacional ni señal demográfica atribuible a la luz. Como el resumen
no mide disponibilidad de antorchas, no distingue ausencia de oportunidad de
preferencia del scorer. El resultado y el límite están registrados en
[`m15_phase12f_nights.md`](m15_phase12f_nights.md); fase 12f permanece abierta.

### Cohorte de cierre `generations` — 2026-10-14 (`0.15.148-alpha`)

`npm.cmd run sim:seeds -- --scenario generations --seeds 20` terminó en 3.343,9
s sobre HEAD `be143c1`, sin cambios de código durante la corrida. Fueron
144.000 ticks por semilla. Supervivencia media 6,1%, extinción 14/20 y colapso
bajo 25% del pico 17/20. La banda no se recuperó en 0/57 episodios (57
censurados); `answered` fue 58/72 = 80,6%, por debajo de la meta 90%. La chispa
de `firemaking` apareció 23 veces; la mediana de adopción fue 7 días y 4 mundos
no llegaron a ella. El informe recogió cero portadores nocturnos de antorcha en
0/248.274 observaciones-persona. No se ajustaron parámetros: la corrida deja
abiertas recuperación, respuesta y adopción; no identifica una causa.

### Segunda pasada de fase 41 — 2026-10-14 (`0.15.148-alpha`)

Las cohortes se ejecutaron serialmente sobre el mismo código de simulación
`b68c6e4`; los commits posteriores durante esta pasada solo cambiaron
documentación. `lean` usa el brazo con `light.enabled=true` de la pareja 12f.

| Escenario | Semillas × ticks | Supervivencia media | Extinción | Colapso <25% | `recovered` | `answered` | Gate adicional |
|---|---:|---:|---:|---:|---:|---:|---|
| `generations` | 20 × 144.000 | 6,1% | 14/20 | 17/20 | 0/57, censuradas | 80,6% (58/72) | `firemaking`: adopción mediana 7 días; 4 mundos no llegaron |
| `century` | 20 × 40.000 | 43,9% | 1/20 | 4/20 | 0/41, censuradas | 81,7% (58/71) | `firemaking` en 9/20 (45%; gate 50%) |
| `lean` | 20 × 24.000 | 4,9% | 5/20 | 20/20 | — | — | Sin adopción de antorcha: 0/52.702 muestras nocturnas |
| `frontier-cohort` | 20 × 12.000 | 93,0% | 0/20 | 0/20 | 0/3, censuradas | 61,3% (19/31) | 65.639 ticks de bebida dulce, 0 de mar; 108 cruces de vado |

La pareja `lean` y los detalles del mapa están en [12f nights](m15_phase12f_nights.md)
y los logs de esta pasada en `test-results/` (no son artefactos versionados).
`frontier-cohort` mide agua continental y no diagnóstico de recuperación; su
proxy de respuesta tiene solo 31 eventos. En `century` y `generations` la
recuperación fue 0% y `answered` permaneció por debajo de 90%; no hay base para
ajustar pesos ni para cerrar M15. `sim:check:all` sigue en rojo en gates
generales, aunque los 15 escenarios de mecanismo pasaron.

### Verificación completa repetida — 2026-10-14 (`0.15.147-alpha`)

La lectura aislada `npm.cmd run sim:check` dio 145/147 en `band`: fallaron
`perf-budget` (445 pasos/s frente al suelo 1.678) y `hills-see-farther`.
`npm.cmd run sim:check:all` recorrió 42 escenarios y salió con código 1.
Los 15 escenarios de mecanismo (`nights`, `salters`, `tailors`, `homes`, los
seis de hierro, `frontier-cohort`, `frontier`, `food-news`, `conflicts` y
`shallows`) pasaron todos. En los escenarios generales reaparecieron fallos
de sueño, supervivencia, conocimiento, descubrimiento, pertenencia, política,
ecología y `hills-see-farther`; `band` dio 55/56 y solo falló este último.
La matriz no evalúa `perf-budget`, por lo que su rojo aislado no se atribuye a
la carga de la matriz. No se cambiaron reglas, parámetros ni umbrales. Esta
repetición confirma que los gates globales siguen abiertos; no cierra fase 41.

### Verificación completa del 2026-10-13

Por petición del propietario se ejecutaron las capas largas aunque M15 siga
abierta. `npm.cmd test -- --maxWorkers=1 --testTimeout=15000` terminó en 659 s:
306/310 archivos pasaron, con 2.274 pruebas correctas, 5 fallidas y 1 omitida.
Los fallos se concentran en correspondencia de sed (diferencia 16,90 frente a
tolerancia 15), el contador `compact_food_nutrition_gather` a cero, difusión
tecnológica 0,70 frente al límite 0,60 y dos aserciones de tributo/sucesión en
`polity.test.ts`. No falló ningún test de arte ni de animación. Los focos de
doma/natación dieron 90/90 y 93/93 respectivamente; cada E2E real pasó 1/1.

`npm.cmd run sim:check:all` se ejecutó secuencialmente y terminó con salida 1.
Los 15 escenarios de mecanismo —`nights`, `salters`, `tailors`, `homes`, los
seis escenarios de hierro, `frontier-cohort`, `frontier`, `food-news`,
`conflicts` y `shallows`— pasaron. Los 26 escenarios base conservaron al menos
un check fallido; dieta (`cravings-steer-the-diet`) se repite en casi toda la
matriz y hay fallos adicionales de sueño, supervivencia, conocimiento,
descubrimiento, domesticación, ecología y política según el escenario. La
matriz no incluye `perf-budget`; la medición aislada previa de `sim:check`
marcó 561 pasos/s frente al suelo de 1.678. Esto confirma los gates abiertos,
no una regresión de las dos animaciones, que solo leen estado durante el
renderizado. No se cambiaron checks ni coeficientes a partir de estas corridas.
La suite completa precede al commit del diagnóstico instrumental; después de
ese cambio pasaron 14 pruebas focales y typecheck.

**Estado:** fase 41 continúa abierta. Siguen sin resolverse supervivencia y
recuperación poblacionales, `answered` (81,8% en la cohorte `generations`, bajo
90%), `firemaking` (4/20 en la cohorte `century`, bajo 50%), los fallos de
comportamiento de la matriz y la segunda pasada de protocolo para escenarios
con mapa. No hay evidencia para declarar cerrado M15.

### `generations`, cohorte con diagnóstico de fase 41 (2026-10-13)

`npm.cmd run sim:seeds -- --scenario generations --seeds 20` terminó con salida
0 en 3.415,8 s. La demografía repitió 6,0% de supervivencia, 10/20 extinciones,
19/20 colapsos bajo un cuarto, 67 nacimientos, 650 muertes y 5 bandas viables.
`recovered` fue 0/59 (censuradas); `answered` quedó en 81,8% (36/44), con los
mismos 8 casos (`drink` 1, `give` 2, `go_home` 2, `idle` 3). La repetición no
cambió las acciones del proxy.

En los 44 impactos repetidos, `assailantOf` devolvió un agresor activo en los
44; el contador acumuló 9.857 person-ticks con detección. La acción al impacto
fue `flee` 36 veces (respuesta) y, en las 8 restantes, `give` 2, `go_home` 2,
`idle` 3 y `drink` 1. Los cinco casos de `drink`, `give` y `go_home` tuvieron
commitment coincidente; los tres
casos `idle` no tenían commitment de acción. Las lecturas del Brain registraron
6.509 decisiones `flee` mientras `assailantOf` estaba activo, pero son
histogramas globales, no se pueden asociar a cada víctima o repetición. Hubo
interrupciones por `under_attack` en 129 acciones `give`, 42 `drink`, 152
`rest` y otras acciones; tampoco están enlazadas a esos 44 casos. La detección
estaba viva en el impacto, así que la ausencia de señal de peligro en ese
instante no explica los ocho casos. La instrumentación agregada no separa aún
cuándo pensó cada víctima ni qué decisión precedió a cada golpe; no justifica
ajustar pesos. `answered` y recuperación permanecen bajo objetivo, y la fase
41 sigue abierta.

### Oportunidad proteica durante el antojo — 2026-10-13

La medición condicional aisló un fallo del selector: en `band`, antes del
cambio, había proteína rica alcanzable en 1.039 búsquedas con antojo, pero se
eligió en solo 303 (29,2%); en 736 oportunidades (70,8%) ganó otra comida. El
scorer recibía la existencia de proteína alcanzable como booleano y seguía con
la comida ordinaria. `chooseCravingFood` ahora recibe esa alternativa y la
elige si la comida ordinaria no cubre proteína. En la repetición corta se
eligió proteína en 840/840 búsquedas alcanzables (100%).

El gate `cravings-steer-the-diet` ahora exige al menos 20 oportunidades y una
selección proteica en ≥90% de ellas. El límite expresa el contrato del selector
con una tolerancia de 10%; se fija sobre oportunidades, no sobre comidas ni
sobre el resultado de la nueva build. El caso previo de 303/1.039 (29,2%) falla
y el nuevo 840/840 pasa. Las cuotas agregadas de comidas siguen impresas como
diagnóstico; en `band` fueron 10,8% ricas durante antojo frente a 14,2% en
calma (0,76×), por lo que no se presenta el cambio como dieta global ya
calibrada.

La cohorte `npm.cmd run sim:seeds -- --scenario band --seeds 20 --steps 3000`
terminó sin colapsos: 97,6% de supervivencia media, proteína alcanzable elegida
en 31.999/31.999 búsquedas, y 452/3.334 comidas ricas durante antojo frente a
1.189/3.634 en calma (0,41×). Es una cohorte corta del escenario `band`, no
demuestra el resultado nutricional a largo plazo; conserva el gate condicional
y deja la cuota global como diagnóstico para la siguiente calibración. No se
tocaron RNG, economía de recursos ni umbrales de supervivencia.

### Matriz completa tras el cambio condicional — 2026-10-13

`npm.cmd run sim:check:all` recorrió 43 escenarios (10 de mecanismo y 33
generales) y terminó con exit 1. La
puerta de dieta pasó en `band` (55/56; falló únicamente `hills-see-farther`);
la matriz no detectó un fallo de selección proteica. El resto de fallos se
resume por escenario:

| Escenario | Checks | Checks fallidos |
|---|---:|---|
| `nights` | 3/3 | — |
| `salters` | 1/1 | — |
| `tailors` | 3/3 | — |
| `homes` | 7/7 | — |
| `ironsmiths` | 1/1 | — |
| `forgers` | 1/1 | — |
| `ironminers` | 1/1 | — |
| `carburisers` | 1/1 | — |
| `ironworkers` | 1/1 | — |
| `ploughmen` | 1/1 | — |
| `smiths` | 64/70 | `nights-are-slept`, `gossip-is-aimed`, `projects-find-backers`, `roast-wins`, `cooking-spreads`, `discovery-is-situated` |
| `frontier-cohort` | 3/3 | — |
| `frontier` | 2/2 | — |
| `food-news` | 1/1 | — |
| `conflicts` | 1/1 | — |
| `tiny` | 39/42 | `moods-move-choices`, `forest-is-used`, `predators-hunt` |
| `band` | 55/56 | `hills-see-farther` |
| `crowded` | 54/55 | `moods-move-choices` |
| `century` | 71/77 | `nights-are-slept`, `moods-move-choices`, `children-keep-close`, `population-persists`, `the-wise-avoid-baneberries`, `bands-take-sides` |
| `craft` | 69/74 | `nights-are-slept`, `people-survive`, `shelter-answers-cold`, `sub-webs-are-climbed`, `discovery-is-situated` |
| `wilds` | 68/70 | `nights-are-slept`, `projects-find-backers` |
| `emptied` | 55/59 | `nights-are-spent-at-home`, `needs-not-pinned`, `gossip-is-aimed`, `shelter-answers-cold` |
| `hearths` | 66/73 | `nights-are-slept`, `moods-move-choices`, `projects-find-backers`, `roast-wins`, `sub-webs-are-climbed`, `bands-take-sides`, `hills-see-farther` |
| `porters` | 55/57 | `nights-are-spent-at-home`, `moods-move-choices` |
| `scribes` | 66/69 | `nights-are-slept`, `the-wise-avoid-baneberries`, `discovery-is-situated` |
| `harsh-winter` | 55/58 | `needs-not-pinned`, `shelter-answers-cold`, `hills-see-farther` |
| `coast` | 54/54 | — |
| `shallows` | 6/6 | — |
| `traps` | 62/66 | `nights-are-slept`, `gossip-is-aimed`, `shelter-answers-cold`, `hills-see-farther` |
| `millers` | 71/75 | `nights-are-slept`, `the-wise-avoid-baneberries`, `bands-take-sides`, `hills-see-farther` |
| `hunters` | 62/64 | `gossip-is-aimed`, `kills-are-butchered-for-bone` |
| `fishers` | 63/66 | `nights-are-slept`, `gossip-is-aimed`, `food-spoils` |
| `farmers` | 70/73 | `nights-are-slept`, `gossip-is-aimed`, `animals-are-tamed` |
| `herders` | 64/72 | `nights-are-slept`, `moods-move-choices`, `population-persists`, `walkers-do-not-grind`, `generations-turn-over`, `techs-are-refined`, `the-wise-avoid-baneberries`, `animals-are-tamed` |
| `feasts` | 75/79 | `nights-are-slept`, `techs-are-refined`, `pots-reach-a-granary`, `discovery-is-situated` |
| `stewards` | 73/77 | `nights-are-slept`, `moods-move-choices`, `discovery-is-situated`, `bands-take-sides` |
| `labour` | 59/67 | `nights-are-slept`, `moods-move-choices`, `people-survive`, `health-holds-up`, `gossip-is-aimed`, `shelter-answers-cold`, `research-is-social`, `discovery-is-situated` |
| `polity` | 79/88 | `people-act-on-what-they-know`, `nights-are-slept`, `moods-move-choices`, `gossip-is-aimed`, `projects-find-backers`, `roast-wins`, `cooking-spreads`, `pots-reach-a-granary`, `discovery-is-situated` |
| `conquest` | 86/95 | `nights-are-slept`, `moods-move-choices`, `records-are-cut`, `taxes-reach-the-temple`, `roast-wins`, `cooking-spreads`, `pots-reach-a-granary`, `discovery-is-situated`, `peoples-drift-apart` |
| `culture` | 58/65 | `nights-are-slept`, `needs-not-pinned`, `gossip-is-aimed`, `projects-find-backers`, `pictures-are-painted`, `animals-are-tamed`, `kills-are-butchered-for-bone` |
| `lean` | 57/70 | `nights-are-slept`, `moods-move-choices`, `population-persists`, `needs-not-pinned`, `gossip-is-aimed`, `projects-find-backers`, `generations-turn-over`, `camps-move-when-the-land-fails`, `knowledge-is-found`, `ideas-become-tech`, `the-tree-is-climbed`, `discovery-is-situated`, `families-exist` |
| `diggers` | 58/64 | `earthworks-are-dug`, `nights-are-slept`, `moods-move-choices`, `needs-not-pinned`, `gossip-is-aimed`, `research-is-social` |
| `orchard` | 55/61 | `nights-are-slept`, `moods-move-choices`, `people-survive`, `gossip-is-aimed`, `projects-find-backers`, `research-is-social` |

La suite unitaria completa se lanzó después del rebuild de arte con
`npm.cmd test -- --maxWorkers=1 --testTimeout=15000`. El caso de
`earthwork-checks.test.ts` excedió el límite (14.850 ms observados); después no
hubo más salida durante varios minutos y el wrapper quedó abierto sin procesos
Vitest activos. Se interrumpió esa sesión, por lo que no hay resumen ni código
de salida válido y no se declara la suite aprobada. El test focal de selección
(7/7), typecheck y `sim:check -- --scenario band` sí terminaron correctamente.
El log completo de la matriz quedó en el temporal
`%TEMP%/m15-simcheck-all-20261013-rerun.log` de esa ejecución.

### Gate 15c — pareja breve no discriminante (2026-10-13)

En el build `0.15.146-alpha`, `band` con 20 semillas y 3.000 ticks produjo
97,6% de supervivencia a `spoilRate=0` y 97,4% a `0.35`; ambos brazos tuvieron
0/20 colapsos (una muerte adulta frente a cero). Cada brazo tomó 91,8 s. Son
12,5 días, insuficientes para observar un ciclo largo de reservas, y
`sim:seeds` no imprime telemetría de pérdida real ni consumo conservado. No pasa ni falla el límite
de cuatro puntos: no mide el coste/beneficio requerido.

El escenario `salters` sí imprime pérdidas atribuibles y comidas invernales,
pero su única ejecución tiene 2.400 ticks, tasa fija 1 y bandas asimétricas;
no hay brazo de tasa cero ni control causal. El control negativo de
`salters-checks.test.ts` sí retira las recetas y preserva el conteo de comida
real mientras elimina su atribución como conserva; valida clasificación, no
beneficio autónomo. Los detalles y la salida están en
[`m15_phase15c_gate_20261013.md`](m15_phase15c_gate_20261013.md). 15c sigue
apagada; no se cambió tasa ni parámetro.

### Suite unitaria completa — actualización 2026-10-13

Una segunda ejecución completa, con `--maxWorkers=1 --testTimeout=30000 --reporter=dot`, sí terminó tras 714 s: 2.298 tests pasaron, uno falló y uno se omitió (313 archivos; 312 pasaron, uno falló). El único fallo fue `earthwork-checks.test.ts > earthworks-are-dug`; el gate observó 0/2 obras concluidas, con 22 levantamientos y ninguna obra restante. No se declara verde la suite. La investigación de causa sigue en `docs/bugs.md`; los otros dos ajustes de fixtures incluidos en esa corrida pasaron.

### Verificación final y diagnóstico de natalidad — 2026-10-14 (`0.15.148-alpha`)

Con la restricción de verificación pesada levantada por el propietario
(AGENTS.md), se repitió la pila completa sobre HEAD `16b1077`:
`typecheck` limpio; `vitest` 315 archivos, 2.307 pruebas pasadas y 1 omitida
(407 s); `sim:check:all` con los 15 escenarios de mecanismo en verde y los
generales en rojo con los checks ya conocidos (`nights-are-slept`,
`moods-move-choices`, `gossip-is-aimed`, `hills-see-farther`, etc.); `e2e`
177/182 en la primera pasada. Los 5 fallos (`globe`, `one-comarca`,
`phase31-tribegraph-zoom`, `phase40-ploughshare`, `tend-animation`) fueron
errores de escritura de capturas en Windows (`UNKNOWN: open ...png`) y pasan al
repetirlos, por lo que no son regresiones.

**Diagnóstico de `recovered` 0/N (sin cambio de parámetros).** `century`, 4
semillas: 0,081 nacimientos por mujer-año y `recovered` 0/8. El embudo de
concepción (`sim:seeds`, RECOVERY / FERTILITY) muestra, p. ej. en `alpha`, 907
oportunidades, 76 bloqueos de espaciado, 92 de pareja y solo 4 embarazos: 53
concepciones salidas de la tirada se descartan por `conception_no_roof`
(fase 18). `shareTheHearth` solo registra techo a quien está en acción `sleep`
bajo un edificio completo a medianoche; en `century` solo ~20% de los hogares
tienen casa interior, y de noche una parte grande de los adultos hace `rest`
(35–48% en `band`/`smiths`) o `idle` (19% en `craft`). `recovered` y
`nights-are-slept` comparten, por tanto, raíz: pocas casas y poco sueño a
cubierto. Es una hipótesis medida en pocas semillas, no una cohorte de 20.

**Decisión pendiente del propietario:** la puerta de techo (fase 18) es una
regla de diseño. Opciones: (a) mantenerla y subir la construcción de casas;
(b) contar también `rest` dentro de un edificio; (c) relajar la puerta. No se
eligió ninguna, para no ajustar a ciegas un mundo caótico.
