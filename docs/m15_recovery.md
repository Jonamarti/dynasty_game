# M15 fase 1c — recuperación y ablaciones

Resultados de las cohortes de 20 semillas. Los artefactos completos están en
`artifacts/m15-1c-*.txt` (carpeta local ignorada por Git).

## `lean`, 20 semillas

| Variante | Supervivencia | Colapsos | DEMOGRAPHY: muertes y causas | HOME: noche cerca / sueño; niño >12 | KIN: defensa observada |
|---|---:|---:|---|---|---:|
| M15 actual, reglas activadas | 50,6% | 4/20 | 698: starvation 533, dehydration 80, exposure 49, murder 22, old age 14 | 67,8% / 8,3%; 23,0% | 0/0 |
| Todas apagadas, medición incompleta (el movimiento infantil seguía bloqueado) | 56,0% | 0/20 | 703: starvation 237, dehydration 215, exposure 51, murder 184, old age 16 | 46,4% / 0%; 57,3% | 0/0 |
| Todas apagadas, compuerta de movimiento corregida | 68,2% | 2/20 | 495: starvation 255, dehydration 16, exposure 31, murder 178, old age 15 | 46,6% / 0%; 58,0% | 0/0 |
| Solo `reachFilter` apagado | 57,2% | 1/20 | 649: starvation 497, dehydration 83, exposure 30, murder 24, old age 15 | 68,8% / 8,4%; 22,7% | 0/0 |
| Solo `nightSleep` apagado | 53,9% | 4/20 | 716: starvation 305, dehydration 57, exposure 318, murder 22, old age 14 | 69,3% / 0%; 30,7% | 0/0 |
| Solo `homePressure` apagado | 61,7% | 5/20 | 559: starvation 435, dehydration 15, exposure 20, murder 74, old age 15 | 56,5% / 5,7%; 31,5% | 0/0 |
| `homePressure` y `reachFilter` apagados | 83,9% | 0/20 | 320: starvation 220, dehydration 12, exposure 25, murder 47, old age 16 | 55,5% / 5,5%; 41,4% | 0/0 |
| Solo `kinDefence` apagado | 50,6% | 4/20 | 698: starvation 533, dehydration 80, exposure 49, murder 22, old age 14 | idéntico al control | 0/0 |
| Fallback de comida fuera del alcance, M15 1d | 56,0% | 1/20 | 671: starvation 511, dehydration 96, exposure 25, murder 25, old age 14 | 68,4% / 8,8%; 22,7% | 0/0 |
| Suprimir `go_home` sobre la línea de trabajo (experimento revertido) | 56,8% | 2/20 | 584: starvation 504, dehydration 7, exposure 21, murder 36, old age 16 | 67,0% / 8,5%; 25,4% | 0/0 |
| Solo `infantsStill` apagado (movimiento aún bloqueado) | 53,6% | 3/20 | 675: starvation 528, dehydration 86, exposure 16, murder 31, old age 14 | 68,9% / 8,8%; 23,2% | 0/0 |
| Solo `infantsStill` apagado, compuerta completa | 34,1% | 7/20 | 702: starvation 500, dehydration 139, exposure 19, murder 28, old age 16 | 70,5% / 8,4%; niño >12: 21,8% | 0/0 |
| Solo `urgentNursing` apagado | 54,7% | 2/20 | 753: starvation 642, dehydration 37, exposure 14, murder 46, old age 14 | 64,8% / 8,5%; 28,1% | 0/0 |
| Solo `motherOnlyFeeds` apagado | 57,6% | 1/20 | 655: starvation 486, dehydration 76, exposure 41, murder 36, old age 16 | 68,9% / 8,6%; 22,6% | 0/0 |
| Solo `babyToHouse` apagado | 58,2% | 1/20 | 685: starvation 325, dehydration 62, exposure 246, murder 38, old age 14 | 64,6% / 8,7%; 28,6% | 0/0 |
| Solo `cravings` apagado | 51,1% | 2/20 | 705: starvation 578, dehydration 66, exposure 13, murder 34, old age 14 | 70,0% / 8,9%; 21,8% | 0/0 |
| Solo `beliefChoice` apagado | 56,0% | 1/20 | 671: starvation 511, dehydration 96, exposure 25, murder 25, old age 14 | 68,4% / 8,8%; 22,7% | 0/0 |

HOME recoge también distancia diurna, percentiles infantiles y acciones en los
archivos completos. KIN no tuvo ataques infantiles observados en ninguna de
estas tres cohortes; `0/0` es ausencia de muestra, no una defensa aprobada.

## `crowded`, 20 semillas

| Variante | Supervivencia | Colapsos | DEMOGRAPHY: muertes y causas | HOME: noche cerca / sueño; niño >12 | KIN |
|---|---:|---:|---|---|---:|
| Reglas activadas (fallback actual) | 99,7% | 0/20 | 34: dehydration 7, starvation 13, old age 14 | 75,6% / 11,6%; 19,8% | 0/0 |
| Todas apagadas, compuerta de movilidad corregida | 100,0% | 0/20 | 15: old age 15 | 54,8% / 0%; 38,0% | 0/0 |
| Solo `reachFilter` apagado | 99,4% | 0/20 | 43: dehydration 13, starvation 15, old age 15 | 75,0% / 12,6%; 19,7% | 0/0 |
| Solo `homePressure` apagado | 100,0% | 0/20 | 14: murder 1, old age 13 | 57,9% / 8,9%; 30,2% | 0/0 |
| Solo `nightSleep` apagado | 99,7% | 0/20 | 38: dehydration 6, starvation 17, old age 15 | 79,5% / 0%; 20,6% | 0/0 |
| Solo `infantsStill` apagado | 99,7% | 0/20 | 33: dehydration 8, starvation 10, old age 15 | 75,5% / 12,1%; 19,4% | 0/0 |
| Solo `urgentNursing` apagado | 99,3% | 0/20 | 50: dehydration 7, starvation 29, old age 14 | 75,9% / 12,7%; 19,2% | 0/0 |
| Solo `motherOnlyFeeds` apagado | 99,5% | 0/20 | 37: dehydration 7, starvation 15, old age 15 | 75,7% / 11,6%; 19,7% | 0/0 |
| Solo `babyToHouse` apagado | 99,8% | 0/20 | 33: dehydration 6, starvation 12, old age 15 | 76,0% / 12,0%; 20,3% | 0/0 |
| Solo `kinDefence` apagado | 99,7% | 0/20 | idéntico al control | idéntico al control | 0/0 |
| Solo `cravings` apagado | 99,7% | 0/20 | 39: dehydration 7, starvation 18, old age 14 | 76,8% / 11,8%; 19,1% | 0/0 |
| Solo `beliefChoice` apagado | 99,7% | 0/20 | idéntico al control | idéntico al control | 0/0 |

DEMOGRAPHY nombra las causas sin víctimas en una cohorte solo cuando su cuenta
es cero. KIN fue 0/0 en todas: el escenario no ofrece ataques infantiles con
testigo para medir la defensa.

## `century`, 20 semillas

| Variante | Supervivencia | Colapsos | DEMOGRAPHY: muertes y causas | HOME: noche cerca / sueño; niño >12 | KIN |
|---|---:|---:|---|---|---:|
| Reglas activadas (fallback actual) | 97,2% | 0/20 | 212: dehydration 83, exposure 37, murder 22, starvation 55, old age 15 | 76,6% / 10,8%; 11,0% | 0/0 |
| Todas apagadas, compuerta de movilidad corregida | 97,7% | 0/20 | 204: dehydration 15, exposure 19, murder 111, starvation 43, old age 16 | 47,0% / 0%; 49,6% | 0/0 |
| Solo `reachFilter` apagado | 97,7% | 0/20 | 196: dehydration 76, exposure 19, murder 28, starvation 59, old age 14 | 76,5% / 10,3%; 11,4% | 0/0 |
| Solo `homePressure` apagado | 97,2% | 0/20 | 179: dehydration 9, exposure 23, murder 52, starvation 78, old age 17 | 59,1% / 6,8%; 29,0% | 0/0 |
| Solo `nightSleep` apagado | 90,0% | 0/20 | 561: dehydration 50, exposure 437, murder 36, starvation 23, old age 15 | 81,6% / 0%; 16,6% | 0/0 |
| Solo `infantsStill` apagado | 81,8% | 0/20 | 332: dehydration 116, exposure 9, murder 14, starvation 177, old age 16 | 79,3% / 10,0%; 14,6% | 0/0 |
| Solo `urgentNursing` apagado | 91,6% | 0/20 | 652: dehydration 20, exposure 9, murder 22, starvation 587, old age 14 | 76,2% / 10,1%; 12,1% | 0/0 |
| Solo `motherOnlyFeeds` apagado | 97,4% | 0/20 | 219: dehydration 72, exposure 34, murder 33, starvation 66, old age 14 | 76,9% / 10,5%; 11,2% | 0/0 |
| Solo `babyToHouse` apagado | 95,4% | 0/20 | 435: dehydration 50, exposure 302, murder 41, starvation 28, old age 14 | 74,5% / 10,9%; 15,3% | 0/0 |
| Solo `kinDefence` apagado | 97,2% | 0/20 | idéntico al control | idéntico al control | 0/0 |
| Solo `cravings` apagado | 96,8% | 0/20 | 258: dehydration 75, exposure 26, murder 43, starvation 99, old age 15 | 77,6% / 10,6%; 11,0% | 0/0 |
| Solo `beliefChoice` apagado | 97,3% | 0/20 | 212: dehydration 85, exposure 35, murder 21, starvation 56, old age 15 | 76,7% / 10,8%; 10,9% | 0/0 |

El M13 all-off queda a +2,2 puntos de la base `century` (95,5%) y dentro del
margen. Sin `nightSleep`, la exposición salta de 37 a 437 muertes; sin
`urgentNursing`, el hambre pasa de 55 a 587; sin `infantsStill`, la sed sube de
83 a 116 y el hambre de 55 a 177. Sin `babyToHouse`, 302 muertes son por
exposición. Las reglas de cuidado, sueño y quietud cambian de forma material
las causas aunque la supervivencia total de algunas variantes siga sobre 95%.

## Puerta pendiente

- La regla activada queda por debajo de la puerta `lean` de 60,9%.
- La corrida previa con todo apagado dio 56,0%, pero era una ablación
  incompleta: `infantsStill=false` liberaba el pensamiento y la acción mientras
  `MovementSystem` aún detenía a los bebés. Tras hacer que el interruptor
  gobierne ambos caminos, todo apagado da 68,2%, a 2,3 puntos de la base M13 de
  65,9% y dentro del margen de cinco. El desvío medido era una regla activa sin
  interruptor, no una diferencia sin explicar entre las builds.
- El build con reglas activadas y fallback sigue en 56,0%, 4,9 puntos bajo el
  gate de 60,9%; arreglar la ablación no recuperó por sí solo la supervivencia
  normal.
- Apagar solo `reachFilter` mejora 6,6 puntos y reduce los colapsos de 4/20 a
  1/20; es una señal para repetir en `century` y `crowded`, no una explicación
  cerrada ni una calibración de parámetros.
- Apagar solo `nightSleep` reduce la supervivencia 3,3 puntos y cambia la causa
  más fuerte de muerte hacia exposición (318 frente a 49 con las reglas
  activadas). Confirma el mecanismo de frío sin explicar la brecha total.
- Apagar solo `homePressure` mejora la supervivencia 11,1 puntos y reduce las
  muertes por hambre/sed (533/80 a 435/15), aunque las violentas suben de 22 a
  74 y hay 5 colapsos frente a 4. Es consistente con tiempo de recolección
  perdido al volver al campamento, pero requiere medir acciones y repetir otros
  escenarios antes de declararlo causa.
- Apagar `homePressure` y `reachFilter` juntos da 83,9% (0/20 colapsos), un
  efecto combinado muy superior a cada ablación sola. Mecanismo candidato:
  el scorer atrae a la gente al ancla y después filtra recursos lejanos cuando
  aún no está en su umbral de hambre crítica; la combinación podría quitarle
  los recursos que tendría que recorrer para mantener su despensa. La regla de
  reach deja de aplicarse al forraje cuando el hambre ya es urgente, así que el
  detalle necesita instrumentación antes de corregirlo.
- Apagar solo `kinDefence` queda bit-idéntico al control en `lean` y también
  registra 0/0 en KIN. No hubo ataques infantiles que pudieran activar la regla.
- El fallback de alimento elevó la supervivencia 5,4 puntos, pero quedó en
  56,0%, por debajo de la puerta. Las muertes por hambre bajaron 22 (533 a
  511), mientras subieron las de sed de 80 a 96. Se activó 267.795 veces en la
  cohorte. Hay señal sobre la búsqueda, pero no basta para declarar la fase
  recuperada.
- La prueba de ceder `go_home` al superar la línea de trabajo solo elevó la
  supervivencia 0,8 puntos sobre el fallback (56,8%) y produjo 2/20 bandas
  autodestruidas más 0,522 asesinatos intrabanda por 1.000 personas-año. Se
  revirtió y no forma parte del build actual.
- Las siete ablaciones restantes en `lean` no hallaron un rescate aislado. Sin
  `infantsStill`, `urgentNursing` o `cravings`, la media fue 53,6%, 54,7% y
  51,1%, respectivamente. `motherOnlyFeeds` y `babyToHouse` dieron 57,6% y
  58,2%, aún bajo el gate; desactivar este último disparó las muertes por
  exposición de 25 a 246. `kinDefence` y `beliefChoice` quedaron bitidénticos
  al fallback (56,0%); KIN fue 0/0, sin ataques infantiles elegibles. El resto
  de columnas y semillas está en los artefactos `m15-1c-lean-no-*.txt`.
- La matriz individual completa solo se midió en `lean`. Aún faltan repetir
  las diez ablaciones a 20 semillas en `century` y `crowded`; por tanto, estas
  diferencias no identifican por sí solas la regla que hace fallar la base
  apagada ni completan la fase 1c.
- En una comparación diagnóstica separada de 5 semillas, el filtro descartó
  88.722 candidatos en el control y cero cuando `reachFilter` estaba apagado;
  este último dio 58,8% frente a 50,7%. Al apagar también `homePressure`, la
  supervivencia fue 81,4% y las oportunidades accesibles aumentaron a 649.918.
  Estas muestras cortas explican el mecanismo pero no sustituyen las cohortes
  de 20 semillas.
- La fase 1c está completa: build normal, las diez ablaciones individuales y
  all-off están medidos a 20 semillas en `lean`, `century` y `crowded`; las
  tres tablas de arriba recogen supervivencia, colapsos, DEMOGRAPHY, HOME y KIN.
- All-off está dentro del margen de la base M13 en los tres casos: `lean`
  68,2% frente a 65,9%; `century` 97,7% frente a 95,5%; `crowded` 100,0%
  frente a 100,0%. El observador DEMOGRAPHY contabiliza sus causas en las tres
  cohortes.
- La puerta 1e sigue abierta solo por la build normal en `lean`: 56,0%, 4,9
  puntos bajo el mínimo de 60,9%. `century` normal da 97,2%, sobre el mínimo
  de 90,5%. La matriz roja está clasificada en `bugs.md`.
- `homePressure=false` con las demás reglas activadas y el fallback mide
  `lean` 68,3% (0/20 colapsos), `century` 97,2% y `crowded` 100,0%. Es un
  candidato que cumple las puertas de supervivencia con estas cohortes, pero
  cambia `lean` a 24,1% de muertes adultas violentas y `century` a 45,6%; no se
  desactiva por defecto sin la decisión del propietario que pide la fase 1e.

## Clasificación de la matriz actual

`artifacts/m15-phase1e-matrix.txt` se generó con el fallback activo. `tiny`
pasa 34/34; los rojos repetidos son fallos de comportamiento medidos del
mundo: `cravings-steer-the-diet` (la cohorte lean sin antojo bajó a 51,1%, y
la medición de century documentada abajo en `bugs.md` confirma poca proteína
durante el antojo), `nights-are-slept` (8,8% de sueño en la cohorte lean ante
un umbral del 55%) y `children-keep-close` (22,7% de observaciones con más de
12 casillas entre niño y progenitor). No hay evidencia de que sean defectos
del evaluador.

Los rojos adicionales son sensibles al escenario o a oportunidades poco
frecuentes, no una regresión atribuida al fallback: `pots-reach-a-granary` y
`spatial-hash-spreads` (craft; el último es sensible al instante de muestreo y
al tamaño del mundo), `nobody-stalls-under-orders`, `peoples-drift-apart` y
`the-watched-intervene` (millers), `opinions-diverge` (coast, traps, hunters,
fishers, farmers, herders, feasts, stewards y culture), `gossip-is-aimed`
(farmers, feasts, stewards y culture), `animals-are-tamed` (farmers, herders y
culture), `the-tree-is-climbed` y `bands-dont-overbuild` (herders),
`bands-take-sides` (feasts) y `pictures-are-painted` y
`compost-answers-exhaustion` (stewards). Las mediciones previas y las
limitaciones por check están clasificadas en `docs/bugs.md`; estos rojos
siguen siendo tripwires de escenario, no una puerta de supervivencia cumplida.

## Diagnóstico M15 1d: `infantsStill` y `bands-take-sides`

La cohorte corregida para la ablación infantil (`lean`, 20 semillas) deja
34,1% de supervivencia y 7/20 colapsos, frente a 56,0% y 1/20 con todas las
reglas activadas y el fallback alimentario. `infantsStill=false` produjo 139 muertes por deshidratación
y 500 por hambre; la estimación HOME observó a 21,8% de los niños a más de 12
casillas del progenitor. El resultado anterior (53,6%) era inválido para
medir la regla: MovementSystem seguía impidiendo el movimiento. Con la compuerta
completa, el mecanismo protege a los dependientes y no es candidato a retirar.

El diagnóstico de `bands-take-sides` encuentra mecanismos para agravios y
rencillas: los delitos entre bandas, acusaciones de homicidio y demandas
rechazadas alteran `BandRelations`; el matrimonio entre bandas mejora los
términos. La cuarta vía, intrusión territorial, reduce la postura en función
de la escasez de despensa. Por tanto, no genera resentimiento territorial
autónomo en bandas bien abastecidas. Comercio usa el motor de delitos (`trade`
en `DEED_WEIGHT`), no un motor independiente; tampoco hay una vía separada de
estatus o dominación para iniciar enemistades. Las incursiones exigen una
postura ya hostil y la agravan, así que no originan por sí solas esa causa.

La cohorte `lean` de 20 semillas registró 16/20 mundos elegibles (60 días)
con spread de postura >20. El check sí detecta variación entre la pareja más
amistosa y la más hostil, pero no exige conflicto activo; un matrimonio puede
elevar el extremo amistoso. Su aprobación es indicio del rango de relaciones,
no prueba de que dos bandas bien alimentadas se enfrenten. Queda por añadir
una propuesta de incursión motivada por rivalidad/estatus en fase 8, como
indica el plan, y medirla separadamente. No se cambió el umbral.

## M15 1d: cohortes tras interrumpir verbos sociales (20 semillas)

Los artefactos de consola están en `artifacts/m15-1d-interruptions-*.txt`.
Estas corridas incluyen las interrupciones de sed, hambre, frío y peligro en
`teach`, `ask`, `discuss`, `court`, `spar`, `give`, `trade` y `steal`, más la
exención de hambre al dar comida a un dependiente infantil.

| Cohorte | Supervivencia | Colapsos | DEMOGRAPHY: muertes y causas | Hambre: infantes / niños / adultos | HOME: cerca noche / sueño / descanso; niño >12 |
|---|---:|---:|---|---|---|
| `lean`, reglas activadas | 50,1% | 2/20 | 717: starvation 570, dehydration 78, exposure 30, murder 23, old age 16 | 284 / 70 / 216 | 68,6% / 8,6% / 7,1%; 23,2% |
| `lean`, all-off | 60,8% | 1/20 | 559: starvation 339, dehydration 37, exposure 25, murder 144, old age 14 | 183 / 38 / 118 | 47,3% / 0% / 12,5%; 55,2% |
| `century`, reglas activadas | 96,2% | 0/20 | 261: starvation 104, dehydration 87, exposure 28, murder 26, old age 16 | 88 / 4 / 12 | 76,7% / 10,4% / 5,5%; 11,5% |

El gate `century` pasa su mínimo de 90,5%. `lean` normal cae 5,9 puntos
frente al fallback medido (56,0%); no alcanza el 60,9%. All-off queda 5,1
puntos por debajo de la base M13 (65,9%), una décima fuera del margen de cinco,
y suben las muertes por hambre de 255 a 339 frente al all-off corregido previo.
Aunque el cambio deja reaccionar a los personajes comprometidos, las cohortes
no demuestran un beneficio demográfico y apuntan a que una acción social de
comida/intercambio necesita decir qué necesidad está atendiendo. No se toca
ningún peso ni se cierra la puerta 1e.
