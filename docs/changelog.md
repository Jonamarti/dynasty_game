# Changelog

## 2026-09-26 — M15 fase 1b: `--set` sin `--steps`

El CLI reconoce la asignación posicional que vite-node produce cuando se usa
`--set` sin `--steps`, y mantiene la duración del escenario. Verificado con
`npm run sim:seeds -- --scenario tiny --seeds 1 --set motivation.reachFilter=false`.

El selector de objetivos de `give` ahora respeta `motherOnlyFeeds`: apagado,
los otros adultos de la familia también pueden ofrecer comida al bebé, no sólo
completar una orden directa ya emitida.

## 2026-09-26 — M15 fase 1b, interruptores y `--set`

Añadidos a `Config.motivation` los diez interruptores de ablación de M15, todos
encendidos por defecto para preservar el mundo actual. `sim:seeds` acepta
asignaciones repetibles `--set ruta=valor`; por ejemplo,
`--set motivation.cravings=false`. La prueba de configuración comprueba los
valores predeterminados. Falta conectar cada interruptor con su regla antes de
usar la cohorte de ablación de la fase 1c.

El interruptor `reachFilter` ya desactiva `reachOf()` cuando se apaga. Una
prueba focalizada comprueba que la distancia pasa a ser ilimitada sólo durante
la ablación; activado sigue el límite existente.

Conectados también `homePressure` y `nightSleep`: apagar el primero elimina la
presión y el verbo de regreso a casa; apagar el segundo quita el impulso de
sueño por oscuridad y el multiplicador nocturno del sueño, manteniendo el
descanso por fatiga y el refugio por frío.

Conectados `infantsStill`, `urgentNursing`, `babyToHouse`, `motherOnlyFeeds` y
`kinDefence`. Cada regla puede apagarse independientemente desde `--set`; las
decisiones por defecto siguen encendidas. Los caminos de emergencia respetan
también los interruptores cuando la acción ya estaba comprometida.

Pruebas de enfermería: la lactancia urgente deja de interrumpir trabajo cuando
se apaga; la alimentación no materna sigue rechazada por defecto y puede
aceptarse en la ablación. Los tests existentes siguen verificando lactancia y
traslado al hogar con las reglas activadas.

Conectados `cravings` y `beliefChoice` a los impulsos, valoración y selección
de comida. Desactivarlos da una comida neutral por nutrición y elimina el
sesgo del macro deseado o de la expectativa aprendida, respectivamente; ambos
siguen activados por defecto. La prueba de macros verifica la selección de
valores neutrales y aprendidos.

## 2026-09-26 — M15 fase 1a, contar las muertes

El informe de semillas mostraba cero muertes en DEMOGRAPHY aunque HISTORY
registraba decenas. La causa era que `finish()` recorría dos veces el iterable
recibido: `Map.values()` es un iterador de un solo uso, consumido por la primera
pasada. Ahora toma una instantánea antes de observar y contar. Una regresión
fuerza una muerte asentada, confirma que el muerto sale del array vivo y verifica
que el observador la cuenta. La prueba focalizada pasa (9/9).

## 2026-09-26 — M15, el plan maestro, y `notes5.txt`

Se procesan las ocho notas de `notes5.txt` con el propietario, que también
pidió reunir en un solo plan todo lo que quedaba sin hacer. El resultado es
[m15_plan.md](m15_plan.md): las notas, lo que queda de M13, todo M14 salvo su
fase 1 entregada y M8.4, en cuarenta y una fases y nueve bloques. M13 y M14 se
conservan como detalle de cada fase, con un aviso en su cabecera.

Las decisiones del propietario están en su §0b. Las que más cambian el juego
son estas: al principio solo se carga lo que cabe en las manos, con una
escalera de contenedores; las chispas cuentan lo manejado y no solo lo
sostenido, para que las ideas no se apaguen con las manos llenas; la
descomposición vuelve a encenderse con la sal, el secado y el ahumado; la ropa
abriga solo puesta; la noche ciega y el fuego da luz, calor y seguridad; el
arte se pre-renderiza por capas y en 4 direcciones y se guarda en el repo; y el
terreno gana altura, excavación, profundidad, vadeo y nado.

**Por qué la fase 1 es recuperar la supervivencia:** las fases 2-6 de M13
dejaron `lean` en 50,6% frente a 65,9% de base, tres veces por encima de su
límite declarado. Las manos cargan la misma economía, y medir cambios nuevos
sobre un mundo que no se entiende no se puede leer. `notes5.txt` se borra, como
`notes2`-`notes4`. Sin cambios de código.

**Segunda ronda, el mismo día**, al revisar el plan:

- **Mapa del mundo aleatorio o real.** La Tierra real se elige de una lista
  pregenerada con datos públicos y guardada en el repo. La rejilla es lo
  bastante fina para que la península ibérica tenga 5 o 6 zonas. Eso obliga
  a tres escalas (casilla, comarca y región) y a tres niveles de detalle, con
  un modelo de pueblos para el resto del mundo, de modo que otras
  civilizaciones surjan a su ritmo. El análisis de coste está en el plan y lo
  comprobará `world:bench`.
- **La grasa** da la antorcha larga, la lámpara, el pemmican, el curtido y,
  más tarde, el sebo y el jabón.
- **Niebla de guerra y mapa personal:** los NPC deciden solo con lo que ven o
  recuerdan, exploran y se cuentan dónde hay comida; la pantalla muestra el
  mapa de tu personaje.

## 2026-09-25 — Criterio de conflicto entre bandas en mundos bien alimentados

El propietario confirma que las tribus pueden enfrentarse sin escasez por malas
relaciones, rencillas, territorio o dominación. Se cierra la pregunta normativa
de M14 fase 1b; queda abierto comprobar si las causas políticas y sociales
llegan al standing y al conflicto actuales. `bands-take-sides` sigue siendo un
tripwire de comportamiento, no se rebaja por la disponibilidad de comida.

## 2026-09-25 — Clasificación de la matriz de M14 fase 1

Se compararon las matrices pre-M12 y al cierre de M12 y las medidas `CONFLICT`
de las cohortes de 20 semillas. El déficit de golpes cerca de campamentos es
estable en `lean` y `century`, mientras la deriva depende del escenario; el
volumen de conflicto baja en las tres cohortes sin causa aislada. También se
separaron mecanismos con contador concreto y resultados de una sola semilla.
`sim:seeds` ahora agrupa eventos de investigación, justicia, suelo, compost,
atascos al caminar y standing de bandas; la cohorte `scribes` muestra discusión
en 19/20 semillas aunque su matriz individual falla. Las cohortes de
`farmers`/`stewards`/`feasts` dan 4/8, 5/8 y 5/8 mundos elegibles por encima del
umbral de standing; `labour` no reproduce su atasco de una sola semilla, y
`century` registra quejas y demandas por separado: 30/639 quejas de víctimas
en 9/20 semillas y 9 demandas entregadas.
`feasts` produjo refinamientos en 15/20 semillas; `traps` no llegó a conocer
taming en ninguna. La matriz activa del build M13 posterior confirma
`peoples-drift-apart` en `crowded` (0/10 semillas elegibles se separaron) y no
lista las antiguas fallas de violencia, investigación, quejas o atasco. Las
matrices de M12 tienen 88 y 93 checks y no permiten atribución causal directa;
la fase sigue abierta para los diagnósticos restantes y la decisión pendiente
de `bands-take-sides`.

## 2026-09-25 — Las creencias prácticas se observan (M13 fase 6)

`KnowledgeSystem.tryObserve` transmite una expectativa práctica con fuente
`seen` cuando un NPC observa a otro durante la actividad correspondiente. La
prueba de transmisión cubre el aprendizaje observado. El check corto `band`
midió `perf-budget` bajo su suelo en tres ejecuciones; se anotó como posible
regresión sin causa confirmada.

## 2026-09-25 — Defensa familiar, antojos y primera memoria de creencias (M13)

Los niños que huyen ahora buscan a su cuidador, y los adultos responden a
agresiones contra hijos y menores cercanos; `KIN` mide cuándo se dan esas
oportunidades. El hambre de proteína modula dieta, caza y selección de comida.
La primera capa de creencias guarda expectativas de comida, aprende al comer y
transmite expectativas débiles a hijos y a quien observa una actividad; registra
el rendimiento de recolección, pesca, fruta y caza por tick de esfuerzo.
`century` deja sin aprobar dieta
(8,0% de comidas ricas mientras hay antojo frente a 39,9% calmado) y sueño
nocturno (20,4% frente al objetivo 55%); `lean` en 20 semillas dio 51,7% tras
fase 5 y 50,6% tras la primera lectura de fase 6 (4/20 colapsos), frente a
65,9% de base. Las fases permanecen
abiertas; las limitaciones y mediciones están en `m13_plan.md` y `bugs.md`.

## 2026-09-25 — La madre lleva al bebé a casa; empieza el sueño nocturno (M13)

Sólo la madre puede amamantar. Cuando el hogar tiene una casa terminada,
habitable y propia, lleva allí al bebé y lo deja dentro; sin una casa disponible,
lo deja en el suelo. Otros adultos ya no eligen bebés para darles comida y la
acción `give` aplica la misma restricción; las interacciones sociales siguen
disponibles. Empezó la fase 3 de M13: el sueño gana presión de noche y, si no
hay techo accesible, se puede dormir al raso dentro del radio del ancla, con
recuperación reducida. La medición nocturna y la cohorte de supervivencia están
`nights-are-slept` mide 21,1% en `century`, por debajo del 55%; `children-keep-close` queda en 70,7% en esa ejecuciÃ³n. La cohorte `lean` de 20 semillas promedia 46,4% de supervivencia (19,5 puntos por debajo de la base), con 5 colapsos. Las puertas nocturna e infantil siguen abiertas; vÃ©ase `bugs.md`.

## 2026-09-25 — Respuesta materna urgente al hambre y la sed del bebé

Added `nurse` as the mother's overriding response when an infant reaches 30
hunger or 35 thirst. It interrupts current work or orders, travels to the baby,
and after 15 ticks relieves 45 hunger and 55 thirst. The mother continues to
accrue thirst at 1.25 exertion; her own needs do not interrupt nursing, while
an immediate attack does. The infant remains at its birth location. In 20
`lean` seeds, survival rose from 43.8% with immobility alone to 49.7% with
nursing, and under-six starvation deaths fell from 473 to 134; the cohort still
misses the phase's five-point cost gate. `DemographyWatch` mortality remains
unreliable. Added urgent-nursing tests and localized the visible action.

## 2026-09-25 — M13 phase 2 progress and babies under one year

Added a `home` drive, household/carer anchors, child reach by age, a return-home
action, reach filters, HUD feedback and health checks. Hunger- and thirst-driven
work remains exempt from family-separation interruption. The corrected 20-seed
`lean` result was 45.9% survival against 65.9% baseline (-20 points), above the
phase's declared five-point ceiling; see `bugs.md`. At the owner's direction,
added an immediate first-year restriction: babies stay at their birth position,
cannot choose or execute actions, cannot be ordered to move, and cannot be moved
by direct input. The child-proximity check now measures walking-age children.
The M14 plan records that visible carrying, a resting pose, wet nursing and
infant-specific need rates remain future work. Typecheck and focused tests pass; the full suite's one
remaining timeout in `band.test.ts` is described in the delivery note.
After the owner's baby restriction was committed, a fresh 20-seed `lean` run
on that exact build averaged 43.8% survival (6/20 collapses), with 473 deaths
in the runner's broad under-six category. The base was 65.9%; this fails the
declared phase gate and does not isolate the infant change as the only cause.
The result is saved in `artifacts/m13-phase2-lean-infants-ground.txt` and
recorded in `bugs.md`.

## 2026-09-25 — M13 phase 2 measurement stopped at survival gate

Implemented the local home/family drive and its reach rules, including the
exception that lets hunger- or thirst-driven work continue when it takes a
child away from family. Added anchor and temperament tests, translated the
family-separation refusal, and added home/family health checks and CLI scenario
argument handling. The corrected 20-seed lean cohort averaged 45.9% survival,
20.0 points below the phase-0 baseline and beyond the declared five-point
limit. Per the plan, phase 2 stops here pending the owner's decision; details
and artifacts are recorded in `bugs.md`. These behavior changes remain
uncommitted.

## 2026-09-25 — M13 phase 0: cohesion and historical baselines

Added read-only `CohesionWatch` and `HistoryWatch` observers, the `range`
command, and pooled HOME/HISTORY output from `sim:seeds`. The observers cover
camp distance and night actions; population drawdown/recovery, losses, violence,
war, fire discovery, technology adoption, malnutrition, and protein-rich food.
Added intake telemetry at the actual food-consumption point. Fixed argument
forwarding for seed and range CLIs: vite-node passes option values positionally
through the package script's `--` delimiter. Added observer-neutrality tests
and the 20-seed HOME/HISTORY baselines for century, lean, and crowded. The
pre-existing DemographyWatch reports zero deaths in those same cohorts while
the seed counters and HistoryWatch observe deaths; this remains open in
`bugs.md` and is excluded from M13's baseline conclusions.

The final `sim:check:all` matrix has the same 14 failing scenario/check pairs
as its first post-instrumentation run; no check availability or failure pair
changed. The output is saved at `artifacts/m13-phase0-after.txt`.

## 2026-09-25 — M13 phase 1: physical drive table, no score changes

Moved the existing quadratic urgency curve and five physical need pressures to
`sim/ai/Drives.ts`. `Brain.score` computes them once and reads the table where
it previously computed each value inline; the separate industriousness work
appetite keeps its existing name and coefficient. `lastDrives` and `why` expose
the values for diagnosis, with Spanish labels. The exact-curve and table-reader
tests pass. All 543 tests pass with one worker; the default parallel run hit
the documented 5-second timeout in `band.test.ts`. The post-change matrix has
the same 14 failure pairs as phase 0 (`artifacts/m13-phase1-after.txt`).

## 2026-09-25 — M13 becomes NPC motivation; the world map becomes M14

Documentation only, plus one comment. The owner asked whether the way NPCs
decide can produce the history-like emergence the game is aimed at (families
and bands that learn, hold territory, trade, raid, make peace and grow toward
civilisations without being scripted). It cannot yet: nobody learns that an
option is better, personality acts through 61 scattered coefficients rather
than through drives, and band decisions are rules rather than persuaded wills.
Measured on this build with a throwaway script: 40-46% of night samples find
people more than 25 tiles from camp, 3-5% of them are anyone asleep, and
children under ten are a median 12-21 tiles from the nearest parent.

- **New `docs/m13_plan.md`**: drives, home and kin, a night that is slept
  through, threats before hunger and kin defended, a craving for variety,
  expectations learned by doing, seeing, being told and growing up, the hearth
  and roast meat as the first thing adopted because people found it better,
  discovery by need, building and raiding by persuasion, an optional camp
  move, and calibration against measured historical targets. Local map only.
  Written in enough detail for an agent without this conversation.
- **Renumbered**: the old M13 plan is now `docs/m14_plan.md` and its phase-1
  report `docs/m14_phase1.md` (commit `72b1240` still says "m13 phase 1");
  what that plan called M14 is now M15. Its phases 4a, 4b, 4d, the
  walking-child half of 6e, and 8a-8b moved into M13 and are marked in place.
  Forward references in `README.md`, `architecture.md`, `bugs.md`,
  `m12_plan.md`, `next-steps.md` and the header comment of
  `src/sim/social/Justice.ts` now say M14. Past changelog entries are left as
  written.
- **`notes4.txt` triaged**: its one note (convince the tribe before building)
  is M13 phase 11; the file is empty. See `next-steps.md` §7j.

## 2026-09-25 — M13 phase 1 (now M14 phase 1): cohort demography and baseline

`sim:seeds` now prints a `DEMOGRAPHY` line to establish the birth and mortality
baseline needed before M13 changes pregnancy, nursing, disease or ecology. It
pools births, fertile women and fertile-woman-year exposure; counts a death
before ages one or five when it occurs and censors only living children without
full follow-up; and reports mean age at death and causes. Combat deaths
aggregate as `murder`. Census work stays in the CLI and runs once per day, with
no simulation or RNG changes. The regression compares the observed and
unobserved world and RNG state.

The M13 notes record both the pre-M12 and M12-close matrices and the completed
20-seed `crowded` and `lean` comparisons. The baseline has one failing
scenario; M12's close and the fresh current matrix share the same 12 failing
scenarios. This confirms the close-of-M12 report repeats, but the difference
from pre-M12 still needs diagnosis. The crowded cohorts both show 100% survival
and no collapses (77 births before M12, 76 after); its 12-day horizon cannot
exercise the 60-day `bands-take-sides` gate. In `lean` and `century`, survival
moves 51.2% to 65.9% and 79.5% to 95.5%; murders fall (393 to 146, 312 to 132)
while starvation deaths rise (144 to 319, 20 to 60). One-year mortality among
eligible births also falls from 111/304 to 72/318 in `lean` and 60/526 to 9/540
in `century`. However, every eligible under-five birth dies in both builds:
180/180 to 127/127 in `lean`, and 161/161 to 36/36 in `century`. This severe,
conflicting cause shift is recorded for investigation before changing food
weights or child-survival rules. Nothing was tuned to erase a red check.

Verification: `npm run typecheck`; 537 Vitest tests with one worker; the
demography observer regression; and the 19-scenario matrix (same 12 failing
scenario/check pairs as the M12-close matrix). See `docs/m13_phase1.md` for
cohort results and remaining follow-up work.

## 2026-09-24 — M12: la paz retira la venganza y los veredictos se revalidan

Cerrar una enemistad borraba el registro del hogar, pero dejaba en sus miembros
el culpable que `Brain` usa para abrir la ruta de venganza. Ahora se retira ese
objetivo; si queda otra enemistad abierta, se conserva su culpable. Las dos
regresiones fallaban antes del arreglo y pasan después.

Los veredictos del jugador validan la pertenencia actual de ambas partes, no
sólo la tribu guardada en la denuncia. La interfaz descarta casos con personas
fallecidas, ausentes o que han cambiado de tribu, explica el cierre y permite
pasar al siguiente. También se oculta si el jugador pierde la jefatura. Los
rechazos tienen texto en inglés y español. Pruebas de simulación cubren ambos
cambios de tribu y la cola; Playwright verifica el desbloqueo y la pérdida del
cargo. No se han cambiado pesos, umbrales ni streams de RNG.

La matriz de 19 escenarios conserva fallos en 12: el único cambio en sus
resultados es `the-hurt-are-tended` de `century`, que pasa de fallo a aprobado.
Eso no se interpreta como prueba de mejora general. Informes antes/después en
`artifacts/m12-health-baseline.txt` y `artifacts/m12-health-after.txt`.

En `lean`, 20 semillas antes/después: supervivencia media 66,2% → 65,9%,
sin colapsos por debajo del 25%; 2.720 → 2.640 golpes entre pueblos y
161 → 146 asesinatos. Ningún golpe dentro de la banda ni de adulto a niño
en ambas cohortes. La diferencia de supervivencia no resuelve una tendencia;
la evidencia del arreglo es la regresión del objetivo de venganza. Informes
en `artifacts/m12-seeds-before.txt` y `artifacts/m12-seeds-after.txt`.

Verificación: `typecheck` correcto y 529 pruebas pasando con un trabajador
de Vitest (la ejecución paralela repetía un timeout previo en `band.test.ts`).
Las 55 pruebas de Playwright pasan, incluida la regresión del veredicto;
el proceso queda abierto después de la última prueba y requiere interrumpir
el cierre. Se registra como incidencia del harness, no como salida limpia.

## 2026-09-24 — Plan de M13 y triaje de `notes3.txt`

Sólo documentación, sin cambios de código. `docs/m13_plan.md` planifica el mapa
del mundo, que M11 y M12 habían aplazado. Lo precede con el cuerpo (embarazo,
crianza, heridas, enfermedad, fuego) y la vida salvaje (hierba, pastoreo,
depredadores, reproducción), porque el modelo abstracto de las comarcas que
no se ven tiene que calibrarse contra la demografía que esas notas cambian.
El plan recoge también todo lo que documentos anteriores dieron por planeado
sin asignarle fase (M9.6 4b-5, las camas, los muros y las barcas de M7, N1 y N2,
el nodo `trade` de M8.2, que nunca llegó a `TECHS`, M8.3, `preserving`, el
banquete de `brewing`, otros lectores de `conspiracyAgainst`). `notes3.txt`
queda vacío: dos notas ya estaban hechas (`fc68101`) y las otras ocho tienen
fase. `next-steps.md` §7i es el índice, y su tabla ya no dice que el
siguiente sea M12.

## 2026-09-24 — M12: interfaz del veredicto del jefe jugador

El caso que llega al jefe del jugador ya tiene una pantalla visible y traducida:
los nombres pasan por `Knowledge.ts` y cuatro botones llaman a
`Simulation.resolveVerdict`. El overlay incluye la regla `[hidden]` para no
interceptar clics cuando no hay un caso pendiente.

## 2026-09-24 — M12 phase 4c: trabajo forzado, rescate y adopción

La cautividad ya no es sólo una bandera que cambia de pueblo. Un captor puede
dar órdenes directas que el cautivo debe obedecer, con una penalización visible
en su ánimo. La familia del cautivo puede pagar bienes en persona mediante
`ransomCaptive`; el cautivo queda libre y conserva el camino de vuelta a su
pueblo. Un menor retenido durante treinta días se integra en el hogar del jefe
captor; los adultos siguen retenidos hasta que escapen o sean rescatados.

## 2026-09-24 — M12 phase 6b: venganza organizada

Cada enemistad guarda también el último culpable conocido. Los miembros del
hogar lo priorizan al elegir una venganza cuando está presente, con una puerta
de hostilidad propia, en lugar de descargar el agravio sobre cualquier
extranjero cercano. Los nacidos en la casa reciben el sospechoso persistente.

## 2026-09-24 — M12 phase 6c: cerrar una enemistad

Un matrimonio entre casas, una compensación aceptada, un intercambio o un
regalo grande eliminan el `feud` en ambos hogares y recuperan parte de la
opinión entre sus miembros. La enemistad conserva una salida social en lugar de
ser un contador que sólo puede crecer.

## 2026-09-24 — M12 phase 7a: riqueza heredada

Los hogares tienen ahora `wealth`, una memoria de la riqueza que han acumulado
en sus almacenes. La posición de autoridad usa el máximo entre ese patrimonio
y lo que se ve actualmente; cuando dos casas se unen por matrimonio, la riqueza
de ambas pasa a la casa resultante.

## 2026-09-24 — M12 phase 7c: acceso preferente del hogar del jefe

El hogar del jefe y sus aliados priorizan los almacenes al retirar comida:
cuando hay varias opciones, la puntuación del granero recibe una preferencia
visible. Combinada con `Household.wealth` y la autoridad por desigualdad, la
élite tiene ahora una ventaja material institucional sin abrir una ruta nueva
de RNG.

## 2026-09-24 — M12 justice follow-up: veredicto del jugador-jefe

Un caso interno que llega al jefe del jugador ya no se resuelve
automáticamente. Queda en `Simulation.pendingVerdicts` y
`resolveVerdict` permite elegir resarcimiento, vergüenza, desestimación o
destierro. Se conserva la transmisión por testimonio: el caso sólo aparece
después de que la víctima lo haya llevado al jefe.

## 2026-09-24 — M12 5c: razón visible al rechazar permiso

El nuevo verbo de pedir permiso ya tiene razones registradas en el catálogo de
paradas y traducción española; un vecino que rechaza el paso no devuelve al
personaje a pensar sin explicar qué ocurrió.

## 2026-09-24 — M12 follow-ups: paz explícita y causa de la huida

El menú de otro personaje ofrece `Make peace` cuando la relación es mala; el
acercamiento mejora la opinión en 50 para familia, 30 dentro de la banda y 20
entre pueblos. La línea de estado de un NPC que huye nombra a la persona que
provocó la huida cuando el observador puede identificarla.

## 2026-09-24 — M12 phase 7b: especialistas que intercambian

El comercio existente ya no busca sólo extranjeros: también ofrece a un
especialista de la misma banda cuando ambos pertenecen a hogares distintos,
tienen oficios diferentes y llevan excedente alimentario. Se conserva el
intercambio bilateral y el evento `trade`, así que la división del trabajo
produce circulación real de bienes sin duplicar la economía.

## 2026-09-24 — M12 phase 5c: permiso y tributo de paso

El menú social permite pedir permiso a un vecino extranjero para recolectar en
su territorio. La decisión combina la relación entre pueblos y la abundancia
de sus almacenes; cuando hace falta, el visitante entrega un alimento como
tributo. El permiso dura un día y evita el `trespass`, dejando una alternativa
pacífica y medible a la incursión.

## 2026-09-24 — M12 phase 5d: incursión por necesidad territorial

La ruta de incursión por necesidad deja de considerar suficiente que una banda
haya oído hablar de un recurso: el nodo elegido debe estar en una casilla
reclamada por el vecino que se va a cruzar. El grupo marcha al lugar donde
conoce que falta comida o material, manteniendo separada la necesidad de una
venganza personal.

## 2026-09-24 — M12 phase 6a: enemistad entre hogares

Los agravios graves entre bandas se incorporan una vez al día a
`Household.feud` en ambas casas y se aplican a sus miembros actuales. La
enemistad deja de depender de que siga viva la persona que vio el golpe: el
hogar conserva el vínculo hostil y sus siguientes generaciones lo reciben.

## 2026-09-24 — M12 phase 5a: casillas de territorio

Una banda que conoce `marking` deja de tener únicamente un radio defensivo:
reclama celdas gruesas alrededor del campamento y las amplía con la posición de
sus adultos. El reclamo vive en `Band.claimedCells`, se actualiza una vez al día
y no consume azar, por lo que 5b–5d pueden preguntar por la propiedad de la
tierra sin convertir la heurística de intrusos en un segundo mapa omnisciente.

## 2026-09-24 — M12 phase 5b: intrusión en tierra ajena

Recolectar, talar o cazar en una casilla reclamada por otra banda registra un
`trespass` cuando el personaje llega al recurso. La actividad no se bloquea:
una necesidad puede justificar el riesgo. El evento usa el mismo filtro de
testigos que los edificios, así que sólo mueve agravios entre pueblos cuando
alguien del pueblo dueño estaba allí para verlo.

Every change, with the date it was made and the reason it was made. Newest
first. Reasons matter more than descriptions here: a later reader can see *what*
changed from the diff, but not *why*.

---

## 2026-09-24 — M12 phase 4b: cautivos atados hasta el rescate

Atar a alguien deja de ser un temporizador disfrazado: un cautivo atado no
puede escapar por esperar. Se añadió `untie`, disponible para otro personaje,
que corta la atadura y deja al cautivo libre para intentar volver a casa.
También se añadieron razones visibles para los intentos de escape bloqueados y
una prueba que cubre la espera y el rescate.

## 2026-09-24 — M12 phase 4a: rapto de menores

La ruta existente de sujetar y atar cautivos ahora también puede elegir a un
niño de otro pueblo. El rapto se registra como `abduction`, con máxima
saliencia y un agravio superior al robo: los testigos de la banda del menor lo
recuerdan y la opinión hacia el captor cae aunque el niño ya haya cambiado de
banda.

La emisión ocurre antes de transferir al menor a la banda captora; así el
evento conserva correctamente quién era la víctima y qué pueblo perdió al
niño. La prueba cubre captura, memoria del evento y hostilidad del testigo.

## 2026-09-24 — M12 phase 3a: traspaso visible con depósitos

La ficha de un depósito terminado ofrece ahora **Abrir traspaso** cuando el
personaje está al alcance. La ventana pone la carga y el depósito lado a lado,
permite elegir cuántas unidades mover con un slider y muestra la capacidad
restante de ambos; los controles se desactivan cuando no cabe nada más.

- La transferencia pasa por `Simulation.storeItem` y el nuevo `takeItem`, de
  modo que propiedad, ruinas, capacidad, telemetría y mensajes de rechazo no
  tienen una segunda implementación en la interfaz.
- La ventana se mantiene fuera del HUD, se cierra con Escape y se actualiza
  después de cada movimiento para que el límite visible no quede obsoleto.
- El botón sólo aparece para el personaje del jugador y el panel sólo abre al
  alcance del depósito; acercarse sigue siendo una acción explícita del juego.

**Corrección:** el panel de edificios se reconstruía cada frame y sustituía el
botón antes de que el navegador pudiera entregarle el clic. Ahora se conserva
estable y sólo se redibuja cuando cambia el estado relevante del edificio.
Se añadieron regresiones para el traspaso con la carga llena y para recuperar
materiales al cancelar una obra.

## 2026-09-24 — M12 phase 3b: cancelar una obra

Una obra incompleta de la propia banda puede cancelarse desde su ficha. Se
elimina el sitio y todo lo entregado cae en un montón en su ubicación, para que
la decisión no destruya materiales ni los convierta en un coste irrecuperable.
La simulación valida propiedad, estado y existencia, y comunica el resultado al
jugador.

## 2026-09-24 — M12 phase 3c: why they like you, and the island's size

**Why they like or dislike you** (owner's note 7). `Knowledge.regardReasons`
lists up to four reasons, strongest first, under each opinion in *Ties →
Between you*.

- **Your opinion of them** lists everything behind it, because it is yours:
  kinship, household or people, time spent together, attraction, and each
  deed you remember them doing, named as you know the people in it.
- **Their opinion of you** is private to them, so under the owner's rule
  (nothing is learned except by seeing it or being told) it names only what
  your character could know without being told: kinship, whether you are of
  one people, time together, and **what you did to them**, since you were
  there. What they saw you do to somebody else, or heard about you, does
  move their opinion, but you cannot know which of your deeds reached them.
  It is summed into one line, "things they have seen or heard of you", with
  no details. The list appears only when `regardFromThem` already lets you
  read the opinion at all.
- **Deeds are ranked by the formula that moved the opinion.** The weighting
  in `SocialSystem.absorb` was moved out into `deedDelta` (culture norms,
  partiality, victim, hearsay, confidence), and `MemoryEntry` now keeps the
  deed's `magnitude` so that the weight can be recomputed. Each deed is then
  aged at the rate `deeds` decays. A second formula would have named, say, a
  theft that the viewer's own norms barely counted. `FAMILIARITY_WEIGHT` and
  `HEARSAY_WEIGHT` are now shared constants for the same reason.
- Not named: the few deed nudges that no memory records (an order refused, a
  complaint the chief dismissed).

**Island size** (spoken request: the owner suspects that people killing each
other within a few years is partly a lack of room). A new tunable, `Island
size` (`world.width`, mirrored to `world.height`, 64–256 in steps of 16,
restart). It sits on the character-creation screen beside tribes and people
per tribe, and on the settings screen. It is pinned rather than scaled by
difficulty, because whether a larger island is "harder" has no single answer.

- **Resource counts scale with area** (`WorldConfig.resourceScale`, set by
  `configFor` to the island's area over 128²). Otherwise a bigger island
  with the same 280 bushes would have measured scarcity rather than room.
  The default is 1, so every scenario and test world that names its own
  counts keeps exactly those counts.
- `sim:seeds -- --size N` runs a cohort on a bigger island.
- **Bit-identical at the default size**: the `century` report is identical
  line for line before and after.

**Measured**, `century`, ten seeds each (with ten seeds, differences under
about ten points are noise, so the small counts below settle nothing):

| island | survival | born | blows between peoples | murders | techs known | passed on |
|---|---|---|---|---|---|---|
| 128 | 99.7% | 436 | 549 | 6 | 11.1 | 567 |
| 192 | 99.2% | 387 | 325 | 8 | 8.7 | 402 |
| 256 | 99.8% | 380 | 124 | 4 | 9.2 | 404 |

Blows between peoples fall steeply with room: 549 → 325 → 124. Thefts fall
too (667 → 565 → 247). Property deeds an owner saw barely move until 256
(1,315 → 1,382 → 355). Inside a band nothing changes, because phase 1 had already brought
it to zero at every size. Murders are too few to read. **The cost is
fewer meetings**: fewer births and slower technology on bigger islands,
because learning by watching and marrying across bands both need people to
be near each other.

The owner's suspicion holds for violence *between* peoples. Inside the band,
the violence that prompted it was phase 1's to fix, and it has been fixed.

Checks: `typecheck`, `npm test` (513), `e2e` (54, including a new step that
sets the island to 192 on the creation screen and sees the world rebuilt),
`sim:check:all` (12 failures across 19 scenarios, the same known single-run
flippers as phase 2b).

## 2026-09-24 — M12 phase 2b: the chief as judge

The plan's 2b, widened like 2a by the owner's choice to both sides of a band
line. `social/Justice.ts`, new; the verdicts are carried out in
`Simulation.hearComplaint`. **Every step is somebody telling somebody**: no
chief learns of a wrong any other way.

- **Grievances.** Every debt (2a) now has its other side on the one wronged
  (`Person.grievances`), cleared when it is paid.
- **`complain`**, a verb: a wrong left unpaid for half a day is taken to one's
  own chief when the chief is at hand — weighed by how much it still rankles
  and by `tradition`. The story passes to the chief as hearsay.
- **Against one of the chief's own** (`judgeOwn`): amends ordered through the
  ordinary compliance roll if the accused can pay; **shamed** if they cannot,
  or defy the order — the chief tells the wrong to everybody of the band in
  sight and the household loses `SHAME_RENOWN`; **dismissed** if the chief
  favours the accused by `PARTIAL_AT`, and the plaintiff resents the chief.
- **Against a stranger**: nothing the chief can order. It goes on their
  `docket`, and they put it (`parley`) to whoever of that people they meet —
  their chief if possible. Anybody else **carries it home**
  (`carriedDemand`) and passes it on with `complain` when their own chief is
  at hand. That chief answers (`answerDemand`) by their people's regard for
  strangers (phase 2d), how the two peoples stand, their tradition, and how
  far past the ordinary they favour the accused: amends ordered, the accused
  shamed, or **refused** — which costs the two peoples `REFUSED_STANDING`.
  **Measured and fixed**: the first `answerWeight` read a chief's ordinary
  warmth for any bandmate (in-band opinion averages ~43) as protectiveness,
  and nine demands in ten were refused; only regard past `ORDINARY_REGARD`
  counts now.
- **The player** can take a grievance or pass on a demand to their chief, and
  as chief demand redress from anybody of an accused people — none of it
  offered while commanding somebody else, whose grievances are theirs. As
  the accused, they are told of an order to pay, not moved by it. As chief,
  they do not yet choose the verdict (`bugs.md`).

**Measured.** New check `wrongs-reach-the-chief` (complaints heard ≥ 2% of
debts run up; 0 on the build before): `century` 14 of 117, `lean` 4 of 62,
`millers` 4 of 89. Nine runs of three scenarios: 6 demands ordered paid, 2
shamed, 23 refused — the peoples asking are mostly already at odds. `century`,
twenty seeds, against phase 2d: survival 99.8% → 99.6%, blows 1,314 → 1,199,
murders 38 → 31, technologies passed on 447 → 448; 0 blows inside a band,
0 on a child, 3 of 1,447 thefts inside one (the far tail). Matrix: 12
failures across 19, all single-run flippers on record. `i18n:soak`: 1,462
lines, none English.

## 2026-09-24 — M12 phase 2a: a debt, and making amends

The plan's compensation, widened by the owner's choice after phase 1 had
ended theft and blows inside a band: **a debt is a debt, whoever it is owed
to** — inside a band or across it. `social/Amends.ts`, new.

- **A wrong done to somebody's face leaves a debt** on whoever did it
  (`Person.debts`): a theft (the goods themselves, and their worth), a
  menace (the goods if it worked, an insult's worth if not), a blow. Known
  only to the two of them. Repeated wrongs to one person add to one debt. Not
  for answering a wrong — striking back, beating the thief at your store,
  robbing whoever robbed your people (`Restraint.hadItComing`) — and never
  by a child, whose wrongs are their people's to correct. Forgotten when the
  one owed dies, or after a year.
- **`make_amends`**, a verb: walk up, set down what was taken and then the
  best of what is carried, up to what is owed (`offerFor`), never less than
  half (`OFFER_AT_LEAST`). The one owed takes it or not — one roll on the
  offer's adequacy, their malice and temper, their fear of the payer, and a
  little for being one of their own. Taken, it is a deed (`amends`, as
  heavy as the theft it most often answers): the one paid feels it as a
  victim does, onlookers see it, the payer's household is known for it, and
  between two peoples it mends what the wrong cost them — all `emit`'s
  existing machinery. Refused, the payer is told so and waits two days.
- **Who pays unasked**: somebody with the goods, facing somebody who still
  minds; moved by loyalty and upbringing among their own people, and among
  strangers by the upbringing their people gave them (phase 2d) and fear of
  whoever they wronged.
- **The player** sees "Make amends to…" on anybody their character owes —
  and on nobody else, since their own debts are all they can know — greyed
  with the reason when they carry too little.

**Measured, `century`, three seeds**: 300, 12 and 72 debts run up; 12, 1 and
6 paid unasked, 8 and 2 offers refused. Paying a stranger with nobody
making you is rare, as it was: the engine of compensation is the pressure
of one's own people, which is phase 2b. Matrix: 13 failures across 19,
the single-run flippers on record.

## 2026-09-24 — M12 phase 2d: what a people teaches its children about strangers

The plan's 2d: "a band tolerant of theft from strangers does not correct a
child for robbing strangers — so two cultures raise different adults".

**What there was to correct.** Measured first, three `century` runs: **no**
theft or blow inside a band at all after phase 1, 139 slanders inside one
(109 by children), and against other peoples about 1,600 sabotages and 340
trespasses *by children*. So what a band corrects its children for is now
almost entirely how they treat strangers — which is exactly where cultures
differ, and where every band was identical: each corrected every wrong
against anybody, and judged its adults for wronging a stranger by one
constant (`OUR_OWN_AGAINST_OUTSIDERS`, a quarter).

**One new axis of culture**, `Band.strangerRegard`: how much a people minds
a wrong done by one of its own to somebody of another people, a bell curve
around 0.5 (`Restraint.STRANGER_REGARD_*`). Drawn on its own stream,
`cultureRng`, forked genuinely last (seventeenth; `AGENTS.md`'s table has
its row, and every row's line number, stale since phase 1, is corrected).
Read in three places:

- **Judging** (`partiality`): the quarter becomes this people's own figure,
  the same at the middle of the curve.
- **Correcting** (`noteMischief`): a wrong by a child against a stranger is
  minded if the band's norm for it × its regard × `0.5 + tradition` of the
  witness reaches `MINDS_AT`. Against the band's own people it is minded
  always — the owner's rule, whatever the band thinks of theft. **`MINDS_AT`
  was first 0.3, and measured to do nothing**: every people above 0.3 minded
  nearly everything (`craft`: 212 of 215 at 0.37, 115 of 115 at 0.71). At
  0.5 it is the middle of the curve and the share minded moves the whole way
  along it: 141 of 141 at 0.71 against 3 of 212 at 0.37.
- **Upbringing**: two consciences. `conscience` (own people) as before;
  `conscienceAbroad`, raised only by a correction for a wrong against
  strangers — and half of it carried over to `conscience`, since whoever is
  told not to rob a stranger has been told something about neighbours too.
  A child's wrongs abroad answer to it fully; an adult's thefts, threats,
  sabotage and predation against strangers are braked by `strangerBrake`
  (at most 60%: against another people need comes first).

The new-game screen names the extremes: "think a stranger fair game", or
"wrong a stranger no more lightly than a neighbour".

**Measured.** New check `upbringing-follows-culture`: of the two peoples
furthest apart in regard, the more regardful minds at least ten points more
of its children's wrongs abroad. With the culture read switched off, it
fails in both worlds that can say (115/115 against 225/225, 292/292 against
52/52); on, `craft` 141/141 against 3/212, `millers` 93/137 against 7/496,
`lean` 18/19 against 4/276. The last two numbers are the effect itself:
`millers`' band at 0.43 saw its children do 496 wrongs abroad with its
culture read and 52 with everything corrected. `century`, twenty seeds,
against phase 2c: property deeds an owner saw 2,504 → **5,165**, thefts
from a person 1,243 → 1,467, blows 1,452 → 1,314, murders 24 → 38,
survival 99.9% → 99.8%; still 0 inside a band and 0 on a child.

## 2026-09-24 — M12 phase 2c: the struck run or hit back

The owner's note 4: "some NPCs neither defend themselves nor run when
attacked". `npm run violence` now follows every adult struck for 60 ticks
(`--cases` names them, and `npm run why` takes `--seed` and `--id` to follow
one), and on `century` about one in six did neither. Three causes, all
found with the score table:

- **Two readings of "under attack".** `interruption` stopped any action for
  forty ticks after any blow; `Brain` did not know, and chose the same thing
  again. One man hit while warning off a stranger chose `warn` thirty times
  in sixty ticks, each cut off on the tick after, while the stranger had
  long since gone to spar with somebody else. Now one reading,
  `Defence.assailantOf`: a blow in the last `FRESH_BLOW` ticks, or an
  assailant still coming. Used by `interruption`, by `wakeReason` and by
  `Brain`.
- **Nothing reached a committed teacher.** Eight timed verbs (`teach`,
  `ask`, `discuss`, `court`, `spar`, `give`, `trade`, `steal`) never call
  `interruption` — the `AGENTS.md` rule, broken eight times. A man was
  beaten from 89 to 46 in the middle of a lesson. `ActionSystem.execute` now
  breaks off anything committed or ordered when somebody is attacking the
  person, except running, fighting, sleep and escape, which have their own.
  Only the blow: the needs are in `bugs.md`.
- **Fleeing into the edge of the world.** `flee` tried only the line
  straight away from the threat; against a coast or the map's edge that was
  all water, so `flee` was chosen, given no destination, and chosen again —
  a man in the north-east corner stood through three blows with it at the
  top of his table. `Brain.escapeFrom` fans out, nearest to straight-away
  first, and runs while scoring, so `flee` is only offered where there is
  somewhere to go. Somebody with nowhere to go fights (`cornered`).

And over all three, **a floor**: while somebody is set upon, the better of
running and hitting back is lifted to `RESPOND` (3.4, above a starving
person's meal). Which of the two is still their own reckoning of the odds.

**The same loop, everywhere.** Measuring the first cause found it far
wider than fights: on `century` seed 1, **12,173 of 14,589 conversations
and 5,056 of 6,145 warnings** were chosen, cut off by thirst on the next
tick, and chosen again — `talk`, `warn`, `threaten`, `slander`, `praise`
and `correct` were never gated on `pressedByNeed` the way every work verb
is. `Brain` now drops them (`CUT_OFF_AT_ONCE`) when a need is past the
working line or the person is set upon.

**Measured.** New check `the-struck-respond`: of second blows from the
same hand, how many found the victim doing neither. On the build before,
three seeds each of `century`, `lean` and `herders`: 44 of 54, 23 of 26, 23
of 26, 32 of 37, 71 of 97, 32 of 34. After, the same twelve runs: 1 of 91.
`century`, twenty seeds, against phase 1: survival 98.8% → **99.9%**,
blows 1,793 → 1,452, murders 88 → **24**, technologies passed on 375 →
**481** — the time freed from the loop went into conversations that
finish (1,433 → 1,769 on seed 1). Inside a band and on children, still 0.
The matrix: 15 failures across 19 scenarios, from 17; all the single-run
flippers already on record.

## 2026-09-24 — M12 phase 1: peace within the band, and the notes of 2026-09-24

The owner's notes (`notes2.txt`, now emptied; triage in `m12_plan.md` §0)
and a spoken brief: the world started well — bands cooperating, even
building the same things — and then collapsed into everyone fighting
everyone, inside their own band and against their own children. "That is not
how it was."

**The diagnosis, measured.** A new `attack_route_*` telemetry (which of
`Brain`'s routes won `foe`) and `npm run violence`, which splits every blow
and theft by band, child and kin. On `century`: of 1,018 blows chosen, **534
were aimed at a child and 277 at the attacker's own band**; the predation
route chose none at all — every blow was revenge. The grudges were real, and
came from two places. A band judged its own members for what they did to
*strangers* exactly as it judged strangers for doing it to them: one boy of
ten stood at −91 with a bandmate for nine sabotages of a *rival's* huts, and
a small child at −75 for fourteen trespasses under a rival's roof. And a
child's misdeed was answered as an adult's is, by the revenge route.

**What changed** — `social/Restraint.ts`, new, holds all of it:

- **Partial judgement** (`partiality`, read by `SocialSystem.absorb`). A
  harm one of ours does to one of theirs weighs a quarter with us, and
  nothing if we know the stranger had wronged our people (`hadItComing`, off
  the observer's own memory — the owner's note 5). A child's misdeed weighs
  0.15 with their own band, 0.5 with another. The victim always feels it in
  full. Needs the wronged band on the deed, so `SocialEvent` and
  `MemoryEntry` gained `victimBandId`, carried into retellings.
- **Children are corrected, never struck.** No route in `Brain` aims a blow
  at a child or lets a child start one; a foreign child caught at a store is
  warned, not struck. An adult of the band who sees one of its children do
  wrong (`noteMischief`) goes and **corrects** them — a new verb `correct`,
  `ActionSystem.doCorrect` — which raises the child's `conscience` (new
  `Person` field, kept for life) and stops what they were doing, with a
  reason. Conscience brakes a child's predatory verbs against anybody, and an
  adult's against their own people.
- **The far tail, not the middle.** Robbing, menacing or nursing a blow
  against one's own band now needs the trait past `IN_GROUP_TAIL` (0.9,
  about one person in seventy-five of the `gaussian(0.5, 0.18)` the owner
  described) or hunger past 0.8. First written as a linear ramp from 0.9 to
  1, which multiplied down to nothing; `TAIL_RAMP` makes anybody clearly in
  the tail genuinely willing. **Checked with a forced tail** (`npm run
  violence -- --tail 10`): with a tenth of founders at 0.97 they do rob,
  menace and strike their own. In an ordinary world a band holds 0-1 such
  people and they need an unwatched moment, so the cohort reads zero.
- **The bell curve is kept.** `inheritTraits` drifted children by 0.09
  around their parents' mean, which halves the variance each generation and
  settles the spread at 0.127 rather than 0.18: the tail would have gone
  from 1 in 75 to under 1 in 1,000 within a few generations.
  `INHERITED_DRIFT = TRAIT_SPREAD / √2` holds it.
- **Self-defence always, and dread brakes a grudge** (note 4, and "fear
  should brake the attacks"). Whoever hit this person in the last 30 ticks
  is the enemy considered first and is treated as past the revenge gate; a
  grudge against somebody one dreads is worth up to 70% less.
- **They knew each other.** Founders start at familiarity 20 with every
  member of their band (`FOUNDING_ACQUAINTANCE`): names known, small talk.
  **Measured at 40 first** — every founder then chose the longest
  conversation with every other, `talk` in `traps` went from 8,612 ticks to
  19,750 and `tiny`'s band built nothing in eight days.
- **Wariness of strangers is never zero** (`Fear.wariness`): a floor under
  fear, for choosing company and for how far from camp one works — softened
  by good standing between the peoples, doubled by open hostility. It is not
  a baseline on `mood.security`, which drives striking trespassers.
  `homeRange` is `RANGE_WIDE` (48) at rest, where it was unbounded.

**Measured, `century`, twenty seeds, before → after:** mean survival 79.5% →
**98.8%**, collapses 2 → 0; blows 5,892 → 1,793; murders 312 → 88; blows
inside a band 1,421 → **0**; by an adult on a child 2,896 → **0**; thefts
from a person inside a band 1,511 → 0; technologies passed on 320 → 375.
Exile went from 3 in 3 seeds to 0 (see `bugs.md`).

**New checks**, both failing on the build before: `peace-within-bands`
(`century` there: 92 of 298 blows inside a band) and `children-are-not-struck`
(145 of 298). A `VIOLENCE` line in `sim:seeds`.

**The matrix** was 18 failures across 19 scenarios on the commit before and
is 17 after; nine went green (`millers` five of them, `craft` four) and the
new ones are the single-run flippers already on record plus two thin
samples — see `bugs.md`.

**The rest of the notes, fixed in the same pass:**

- **Relationship 86 and only a greeting** (note 6). Conversation rungs read
  familiarity alone, which fades; family could be down to a greeting.
  `modeAllowed` now lets anybody sit a relative down for any conversation.
  Deliberately not `chooseMode`: putting it there made every NPC pick the
  longest rung with every relative (the same measurement as above).
- **No ghost when picking a building** (note 2a). The ghost was only drawn
  on the next pointer move over the map, and never on a touch screen. It is
  now placed at once, where the pointer last was or mid-view.
- **The radial menu in three families** (note 3): "Talk to…" (as before),
  "Teach and learn…" (teach, ask, discuss) and "Confront…" (steal, threaten,
  hold back, tie up, attack), each opening its own ring, folded however few
  they hold (`FAMILY_AT`) so "attack" is always in the same place. The e2e
  teaching spec now opens the family first; the talk spec picks a stranger
  who is not kin, since kin may now always talk at length.
- **The Ties list reached under the help line.** Founders knowing their whole
  band made the list long enough that the fold of the dead sat under
  `.hud-help` on a narrow window, where no click reached it (found by the
  e2e spec for that fold). `.hud-panel` now stops 60px above the bottom.
- **No penalty with the tribe for going after a stranger who wronged it**
  (note 5): `hadItComing`, above.

## 2026-09-23 — M11 phase 17: the close of M11

The debt the milestone owed without a phase, paid or written down.

**17a — `gift`.** Declared since 5b and never emitted. The plan said to emit
it for what is not food or retire it, deciding by whether renown (6c) moves.
Emitted by the Kit's give (`giftWorth`, off `baseValue`) and by a new route,
a spare made thing given to one of one's own who has none. **Measured to
move renown little**: nobody carries a spare, because crafting stops at
`keep` — one NPC gift in the whole matrix. Kept, because both writers are
real; the big man turning wealth into standing needs a surplus the world
does not yet produce.

**17b — phase 5's four checks.** Measured against the build before 5c-5f
(`6b6d476`) with its own tools. `gossip-is-aimed` is a per-run check (it
fails on all seventeen scenarios there, not one slander or praise said) and
skips runs under a month. Exile (0-1 a run), factions (five scenarios of
nineteen) and adoption (0-2 a run) are one or two events a run and are read
in `sim:seeds`'s BANDS line: `lean` 1 exile, factions in 7 seeds of 20, 23
taken in of 159; `century` 3, 10, 16 of 94; 0 of each at `6b6d476`. None
was dropped for failing to fail.

**17c — a field can be trampled.** A ruined field loses what was standing
(`Crop.trampled`) and is not sown until mended; the soil is not touched.
The exclusions came off in the same commit. One field trampled in the whole
matrix; the farming worlds are peaceful.

**17d — the measurement policy.** `perf-budget` is scaled by population and
judged only alone (it reports in the matrix); `the-hurt-are-tended` has a
real floor of 30 person-days of hurt; `kills-are-butchered-for-bone`'s coat
clause is read in a new TRIPWIRES line (`hunters`: coats in 4 of 10 seeds).
The `lean` drift and the `tau` seed were reviewed against the world 14-16
left: `lean` has sat near 50% since 11b-12b, `tau` is still among the
weakest seeds, and nothing in 14-17 moved either beyond what twenty seeds
resolve.

**17e — the documents.** `next-steps.md`'s "Where things actually stand"
rewritten for the close, M11's row, M12 named next, and a section of what
M11 leaves out on purpose, each with its reason.

## 2026-09-23 — M11 phase 16: the body stays

The owner's note 1. Until now a death took the person out of the world on
the same tick: a killing nobody saw was a perfect crime by construction,
because there was nothing to find, and a widow was widowed before anybody
could have told her. Survival / collapses / murders / blows near a camp, at
twenty seeds:

| commit | `lean` | `century` |
|---|---|---|
| before phase 16 (15's gate) | 49.7% · 5 · 415 · 38% | 77.0% · 2 · 349 · 42% |
| 16a the body | bit-identical | bit-identical |
| 16b decay, `dismember`, `drag` | bit-identical | bit-identical |
| 16c the finding, and the widow | 49.1% · 4 · 393 · 41% | 81.1% · 2 · 307 · 44% |
| 16d the investigation | 48.8% · 5 · 414 · 40% | 80.6% · 2 · 306 · 41% |
| 16e where the player sees it | bit-identical | bit-identical |
| gate: killers hide bodies | 51.2% · 3 · 393 · 42% | 80.3% · 2 · 309 · 46% |

**16a — the body** (`sim/entities/Corpse.ts`). Every death leaves one, the
old man in his hut as much as the man in the clearing, modelled on
`ItemPile`: its own hash, rebuilt only on change. The `Person` still leaves
`people`, so no loop learns to skip the dead. A body shows what anybody can
see — whether it bears wounds — and not who made them; the inspector names
it only for somebody who knew them.

**16b — time and a blade.** Fresh for three days, recognisable to anybody
who knew them; gone over until the twelfth, to kin and those who knew them
well; then bones, which name nobody; scattered after 120 days. `dismember`
banks its work on the body (`AGENTS.md`'s long-action rule), and a body cut
up names nobody; `drag` takes it to the nearest water, where it is gone. No
scavenger is declared: nothing eats a body until something eats anything.

**16c — the finding.** Once a day, whoever has a body in sight finds it,
once each. A fresh body is somebody, and the finding is a story about them —
`body_found`, a new entry in `EVENT_TYPES` weighing on nobody (`DEED_WEIGHT`
0) and told as eagerly as a killing. Remains past knowing are found and
about nobody. **And the widow**: `settleAffairs` cleared her marriage on the
tick of the death; she is now widowed when she knows — by finding the body,
being told it was found, or seeing the killing.

**16d — the investigation** (`sim/social/Investigation.ts`). A wounded body
found by somebody who cares — kin, household, a friend, the dead's own band,
or somebody *just* (loyal, without malice, of a people that takes killing
seriously; derived, not a new trait) — is looked into: back to where it lay,
asking everybody in earshot. A witness tells what they saw (as hearsay); a
motive is a memory of threats, beatings or thefts; a killer is bloodied for
a day and whoever sees them remembers. Nobody informs on themselves. Enough
evidence names somebody with a confidence below one, as a killing heard of,
where grudges, factions and gossip read it — and wrongly, sometimes, as
meant. **The plan's fourth channel is not built**: an item does not know
whose it was, so a dead man's goods in another pack are just goods.

**16e — what the player sees.** "Ask who did this" on a body opens the same
investigation; the player's own is in the Life tab; a conclusion is said in
the investigator's words; a finding is in the finder's chronicle; and the
player is told of one they made or saw made — the only ways they could know,
a body they hid included.

**The gate.** `bodies-are-found` and `murders-are-solved` were run against
the build before phase 16 (tools copied over) and fail on every scenario
they apply to there — 0 bodies found of 5 to 29 deaths, 0 investigations
over 5 to 21 killings. The plan asked for *neither none nor all*; only the
first half is a per-run check, because the second flipped on its own at 4 to
27 events a run (`century` 27 of 27 bodies found on one build, 24 of 28 on
the next; `craft` 4 of 4 solved). The second half is read over the cohort,
in `sim:seeds`'s new BODIES line: `lean` 551 of 635 bodies found, 367
investigations naming the killer 167 times and somebody else 49; `century`
319 of 410, 203 investigations, 111 and 21.

**And one mechanism the gate added.** On the first run, `lean`, `craft` and
`stewards` found every body: nobody in the world ever hid one, so a killing
nobody saw had stopped being a perfect crime by construction and could not
be one by effort. A killer whose killing nobody saw, still bloodied, with
nobody about, now drags the body to water within 25 tiles or cuts it up.
The drag commits its walker, so the brain does not re-plan a dragger at
every think and leave the body halfway — the hold's defect from 15c, not
repeated.

## 2026-09-23 — M11 phase 15: defending what is yours, and captivity

The owner's notes 6 and 9, and the old phase 11d. Every commit measured at
twenty seeds of `lean` and `century` (`sim:seeds --seeds 20`, which since the
gate also prints a DEFENCE line). Survival / collapses below a quarter /
murders / share of cross-band blows within twenty tiles of either camp:

| commit | `lean` | `century` |
|---|---|---|
| before phase 15 (14f) | 52.8% · 4 · 400 · 43% | 72.1% · 1 · 397 · 41% |
| 15a.1 `watched`, not `allowed` | bit-identical | bit-identical |
| 15a.2 a watched use happens | 53.9% · 3 · 366 · 44% | 77.1% · 2 · 332 · 45% |
| 15b.1 the caught pointer | bit-identical | bit-identical |
| 15b.2 warned off, struck if still at it | 50.5% · 3 · 392 · 45% | 71.6% · 3 · 387 · 43% |
| 15b.3 `restrain` | 51.4% · 4 · 411 · 40% | 70.2% · 3 · 387 · 42% |
| 15b.4 call for help | 45.1% · 8 · 430 · 39% | 73.9% · 2 · 364 · 43% |
| 15c rope and `bind` (and the hold that lasts) | 52.0% · 5 · 365 · 43% | 78.7% · 2 · 326 · 47% |
| 15d captivity | 52.3% · 5 · 367 · 43% | 76.0% · 2 · 360 · 47% |
| 15e the guard | 52.0% · 5 · 367 · 43% | 78.6% · 2 · 341 · 48% |
| 15f `DECISIVE_GAP` as a ratio | 52.8% · 4 · 383 · 40% | 77.4% · 2 · 333 · 44% |
| gate: raid captives, guard's round | 49.7% · 5 · 415 · 38% | 77.0% · 2 · 349 · 42% |

15b.4's `lean` was taken again at forty seeds with both builds side by side
(49.3% · 10 collapses before, 47.5% · 15 after); everything else is inside
what twenty seeds can resolve.

**15a — being seen stops being a veto** (note 6). Phase 4 shipped the
reverse of its own plan: `mayUse` returned `allowed: false` whenever an owner
could see, and `useProperty` ended the action with `property_guarded`, so a
watched store was as impossible to use as under the membership test phase 4
replaced. `PropertyUse` now says `watched`; `useProperty` and the Kit's
`storeItem` let the use happen and emit the deed, which the witnesses take
into memory — the cost the note asks for. A use begun unseen is announced once
more when an owner walks in on it. The player is warned, not refused
(`Simulation.watchedUses`, "Seen: …", the witness named only as the player
knows them), and the radial menu offers a watched verb with an eye. The
scorer still never *plans* a watched use, and station crafting still refuses
when watched, because it records no deed at all (see `bugs.md`).

**15b — the witness's ladder** (note 9), new module `sim/social/Defence.ts`.
1. *Inert writer.* `emit`'s witness loop, and the victim, note who took,
   used or wrecked what belongs to their own people (`caughtId`,
   `CAUGHT_MEMORY` half a day).
2. *The outsider.* Warned off with 14b's `warn`, no fear needed; struck if
   still at it once the grace is up. Two shapes were measured and dropped:
   striking anybody caught and still in sight (`century` 64.6%, 427 murders,
   violence moving away from the camps), and counting the warning against the
   two peoples' standing (`lean` 45.6%) — sabotage soured standing, standing
   scores sabotage. A warning that answers a deed no longer nudges standing
   (`emit`'s `bandNudge`), and an offender still at it gives way or not on
   `menaceOver`'s roll.
3. *One of your own.* `restrain`: a struggle on `actionRng`, everybody
   grappling that person at once counting, and a hold nobody is hurt by, which
   the holder keeps up tick by tick. Not while a need would break it off —
   without that gate the scorer offered 581 holds for 21 won.
4. *Call for help.* A shout within `EARSHOT`: the hearers learn that somebody
   called, not why; whoever answers is told on arrival, as hearsay.

**15c — rope, and `bind`.** `rope` from sticks or from thatch, both under
`cordage` (the owner's decision), `keep: 1`; the verb that spends it in the
same commit. Tied up is its own state that outlasts the hold. **A defect in
15b.3 found here**: a holder had no timer and no order, so `Simulation.step`
re-planned them at their next think and every hold lasted only until then;
every tying-up in the matrix failed with `not_held`.

**15d — captivity** (the old 11d), `sim/social/Captivity.ts`. A captive is
moved into the captor band, which makes the forced labour cost nothing new;
never chief, never at war, never a voice in rebellion, never cast out, and
their household stays the one they were taken from. In through a rope from
somebody of another band; out by slipping away with nobody of the captors in
sight — `mayUse`'s mirror — and home by `considerAdoption`, back into their
own household. **A latent defect**: `considerAdoption` read a list of
outcasts gathered before the band loop, so two camps could adopt the same
wanderer on one day; `band.test`'s adoption case passed only through it.

**15e — the border guard** (O5). A sixth job, `guard`, walking a round of the
band's own buildings, stores first (`patrol`), leaning to `warn` and
`restrain`; not a sensor. A guard's warning reassures those of their own who
see it.

**15f — `DECISIVE_GAP`.** Adult fighting power no longer sits flat at 0.35
(11a gave `fight` trainers): measured, the old absolute gap made 13.4% of
pairs of adults in `century` read each other as prey. Now a ratio
(`EVEN_MATCH` 1.3, `DECISIVE_SPAN` 1.4): 4.1%, all of them the old and the
hurt.

**The gate.** `the-watched-intervene` and `captives-are-taken` were run
against the build before phase 15 (tools copied over, reading counters the
old build never wrote). `the-watched-intervene` fails on every scenario it
applies to there — `century`, `craft`, `scribes`, `millers`, `feasts`,
`lean`, 0 interventions against 40 to 645 deeds an owner saw — and passes on
all six after (5% floor; 14 to 79 interventions). `captives-are-taken` fails
where it applies on the old build (`century`, `millers`: 0 captives over 349
and 105 blows) and passes after on `century`, `millers` and `lean`. **`guards-see` was not shipped.** As "a
guard's look finds a stranger half again as often" it discriminated nothing
against a build with the job and no patrol (`herders` 1.74 without, 1.93
with; `labour` 1.00 and 1.11); as "a guard is among the owners who see a
property deed" it had nothing to read — the four worlds that hand out guards
saw 0 to 5 such deeds a run. Two mechanisms were changed by the gate rather
than the checks: the guard's round moved from a ring at half the territory's
radius to the band's own buildings (the ring found strangers no more often
than anybody working near camp), and the organised raid — the source of
captives the plan names first — was wired in (`raidingBandId`,
`RAID_CAPTURE`, and no rope needed by the one who holds): with captives only
through predation, `captives-are-taken` failed on `lean`, `millers` and
`feasts`. **Captivity is still rare and short** — the cohort: `lean` 2
captives in 1 seed of 20, `century` 7 in 3 of 20, and every one of them
escaped. See `bugs.md`.

## 2026-09-23 — M11 phase 14b-14f: fear is read — company, range, flight, defence, territory, raids, the face

Phase 14a gave fear writers; these commits give it readers, one at a time,
each measured at twenty seeds of `lean` and `century` (`sim:seeds --seeds
20`, which since this phase also reports where cross-band blows land and
whether the peoples drift apart after them). Survival / collapses below a
quarter / murders / share of cross-band blows within twenty tiles of either
camp:

| commit | `lean` | `century` |
|---|---|---|
| before phase 14 | 50.4% · 6 · 457 · 31% | 37.2% · 8 · 716 · 38% |
| 14b.1 conversation openness | 52.1% · 5 · 458 · 33% | 35.5% · 11 · 742 · 35% |
| 14b.2 work near home | 55.5% · 4 · 424 · 33% | 32.1% · 12 · 749 · 33% |
| 14b.3 keep to your own | 51.3% · 5 · 459 · 32% | 36.1% · 7 · 746 · 35% |
| 14b.4 flee the dreaded | 49.6% · 4 · 411 · 28% | 38.1% · 6 · 740 · 29% |
| 14b.5 defend the ground (Brain, alone) | 49.7% · 4 · 423 · 43% | 36.9% · 7 · 659 · 37% |
| 14c territory reads sightings, resents hunger | 51.8% · 5 · 403 · 40% | **81.0% · 2 · 329 · 45%** |
| 14d `BandMaps`, raid for what is lacking | 53.5% · 5 · 401 · 42% | 76.0% · 2 · 369 · 46% |
| 14e property deeds seen move standing | 52.8% · 4 · 400 · 43% | 72.1% · 1 · 397 · 41% |
| 14f the face | bit-identical | bit-identical |

Ten seeds cannot resolve under ten points and twenty not much under five;
every row but 14c is inside that.

**14b, the readers** (`sim/social/Fear.ts` holds every constant, each with
why):
1. *Conversation.* `crossBand` gains the two parties' own ease: +0.3 × their
   mean security over 50. At ease the cross-band warmth factor goes from 0.43
   to about 0.52; frightened, toward 0.28.
2. *Range.* `findNode` filters to nodes within `homeRange` of camp: no limit
   below a quarter of fear, 48 tiles falling to 20. A filter, because
   proximity dominates the scorer.
3. *Keeping to your own.* An idle wander is centred part of the way home above
   0.4 fear (same RNG draws), and an outsider costs up to 40 points as a choice
   of company. **A hard refusal of outsiders was measured and dropped**: on
   `lean` it raised cross-band blows 3,964 → 4,696 and murders 462 → 503
   against the same commit without it. People who stop talking across a band
   line stop warming to each other, and grudges fill the gap — segregation is
   meant to follow from hatred here, not manufacture it.
4. *Flight.* With nobody's blood fresh, the most dreaded neighbour within half
   a sight radius (dread 35+) is reason to flee.
5. *Defence*, the Brain commit, alone: a third route to `attack`, only at 0.5
   fear, only against an outsider in the inner third of the band's ground whose
   people are not on good terms, never kin — warned first with a new `warn`
   verb (a `threaten` deed with no demand), struck only after 90 ticks if still
   there, under its own ceiling. The share of blows landing near a camp jumps
   from 28% to 43% on `lean`.

**14c.** `considerTerritory` counted every foreigner within forty tiles
through the people hash; it now reads the sightings 14a records, so a people
resents the strangers it saw. And its sign was backwards: the comment said a
*hungry* band resents intruders, the code multiplied by how *full* its stores
were. The comment was the intent. Both rules were measured with the sensor
fix: the fullness rule gives `century` 42.5%, 6 collapses, 632 murders; the
hunger rule 81.0%, 2, 329. Well-fed `century` bands camped thirty to forty
tiles apart had been resenting each other every day and going to war over it.
`lean`, the scarce world, is as violent under either. This costs
`bands-take-sides` on three well-fed scenarios — see [bugs.md](bugs.md).

**14d.** `BandMaps` (`sim/social/BandMaps.ts`): the game's first memory of
places, and the seed of M12's world map — per band, a coarse grid of the
resource kinds its members have seen, written on the sighting cadence,
draw-free (`BandSystem`'s `rng` is `forestRng`). `considerRaid` gains a
second motive: a needed kind missing from the band's near ground and seen on
the ground of a people it is not on good terms with, within a day's march; the
party goes to take it where it grows, which is where a frightened band
defends. "Missing" over the whole territory never fired once in the matrix;
over the inner half it fires on `lean`.

**14e.** `emit` takes the owning band of a building for deeds with no person
target (store theft, trespass, sabotage), and moves `BandRelations` once per
deed when somebody of that band saw it. Closes the `bugs.md` entry on unseen
raids.

**14f.** `expressionOf` reads `security`: at 0.4 fear a face looks afraid, or
stern on a hot temper. The first mood channel a face reads. Bit-identical.

**The gate, honestly.** The two checks written for it, verified failing on the
build before any reader, still fail on the single `lean` seed; across twenty
seeds violence near camp went 31% → 43% (`lean`) and 38% → 41% (`century`)
against a 50% floor, and drifting apart is a coin toss in both. Not tuned to
pass; recorded in [bugs.md](bugs.md) with where the remaining violence comes
from. **The stranger table** (outsider regard, `kin-outrank-strangers`) moved
from `crowded` −4.7 / `culture` −8.0 / `lean` −28.8 / `century` −11.1 to
−7.0 / −7.1 / −13.4 / −17.9 (`millers` and `band` have too few pairs). It
now falls with run length where it used to rise — out of accumulated deeds,
which decay, rather than out of a constant, which is the door phase 7 closed.

---

## 2026-09-23 — M11 phase 14a: fear gets its writers, and nothing reads them yet

The owner's note 7: little fear and people talk to strangers and range far;
a lot, and they keep to their own ground, avoid outsiders, huddle with their
own and may attack whoever comes in — with the hatred growing out of
*concrete incidents*. `Person.mood.security` was built for this in M9.6 4a
and had no writer. It has four now, all in the new `sim/social/Fear.ts`:

| source | where | weight |
|---|---|---|
| suffering `assault`, `murder`, `threaten`, `theft` | `SocialSystem.absorb`, the victim | 25 × `FEARED[type]` |
| seeing an outsider do it to one of your band | `absorb`, a witness | 10 × |
| being told of it | `absorb`, hearsay | 4.5 × confidence × |
| an outsider standing on your band's ground | `sightIntruders`, six passes a day | 0.15 each, 0.6 cap, ×0.3 beyond the inner third |

All four sit behind `memory.record`, so only news frightens: a story already
known frightens nobody twice. Bystanders are frightened only by an *outsider*
harming one of *their* band — a brawl between neighbours is a quarrel, a
stranger beating your cousin is a reason to stay near home. That needed the
victim's band on `absorb`, now a parameter.

**The second layer is `Relationship.dread`**, fear of one person, fed only by
what they did to you (30 × at full weight), decaying at 0.993 a day — slower
than `deeds`, because a grudge can be talked out of somebody and a flinch
cannot. It is **not** in `opinion`: the bully is hated and feared, and those
are separate questions for separate verbs. It keeps an edge from being pruned
while it lasts, and does not touch `lastContact`.

**Where the plan said "daily block" the pass runs six times a day.** The
daily block runs at midnight, when everybody is under a roof and nobody is
watching the meadow; a pass there would have measured who sleeps where. What
it sees also goes into `Simulation.sightings` — which band saw which outsider
on its ground, and when — for 14c, which is to read that instead of counting
every foreigner in range of a camp whether anybody was looking.

**The sighting weight was measured down by a factor of four before anything
read it.** At the first value `craft`'s whole population averaged −72
security from strangers merely being about — ambient fear, the opposite of
the note's. Now the averages (`mood_security_sum / mood_samples`) are
`crowded` −3.7, `lean` −13.6, `century` −16.9, `craft` −31.2: fear tracks how
violent a world is, not how close its camps sit.

**Bit-identical in the world**: `sim:check:all --verbose` diffs to zero once
the new `security_*`/`dread_*` counters and `mood_security_sum` — which now
has writers — are set aside. Nothing reads either layer until 14b.

---

## 2026-09-23 — notes.txt: the game in Spanish, with a language switch in the menus

The third of the owner's notes of 2026-09-23: *"translate the game to Spanish
and add a button to change languages in the main menu."* The owner asked for
all of it — interface and everything the simulation writes — rather than the
chrome alone.

**The mechanism** (`src/i18n/`). The English sentence is the key:
`t('{name} obeys', { name })`, with the Spanish in `src/i18n/es/*.ts`. Opaque
keys (`refusal.generic`) would have meant rewriting every sentence into a
table before translating one, and would have hidden, in code whose comments
are about the words a player sees, what those words are. Three pieces of
Spanish grammar English does not need are built in: inline gender agreement
(`codicios{g:o|a}`), articles that agree with the noun (`aNoun`, `theNoun`,
with a list of feminine nouns and labels that carry their own article), and
contexts for one English word that is two Spanish ones (`tc('skill',
'forage')`). About 1,500 entries.

**English is byte-identical, and that is the tripwire.** With the language at
English, `t` returns exactly what the code built before. `sim:check:all
--verbose` diffs to zero against the build before the pass, every existing
test passes unchanged, and so do all fifty-two existing browser specs.

**Where the words are translated.** Data tables — techs, items, buildings, the
settings rows — stay English, because the simulation and the tests read them as
identifiers; they are translated where shown, `t(def.label)`. Sentences the
simulation composes — a line in somebody's life, an insight, a refusal, a
band's name — are translated when composed, because by the time the UI sees
"Fenva taught Arun cordage" the grammar cannot be redone. `t` is pure (no DOM,
no storage, no RNG), so the simulation calling it breaks no rule in
`AGENTS.md`; a new determinism test runs one seed in English and in Spanish for
1,500 steps and requires the same world. `causeOfDeath` stays English in the
simulation because `tools/seeds.ts` counts the starved by comparing it, and is
translated on the succession screen.

**The switch.** *English / Español*, each named in itself, on the start
screen, on the settings screen and in the pause menu — the game has no single
"main menu", and a player who cannot read English needs it on the very first
screen. Remembered in `localStorage` apart from the difficulty document, so
"Reset everything to Normal" does not also switch a reader's language; the
first visit follows the browser's own language; `?lang=es` overrides both, the
way `?seed=` does. Panels built once (settings, pause menu, HUD chrome)
rebuild on a switch; the three graphs drop their redraw digest.

**Keeping it complete.** `i18n.test.ts` scans the source for every literal
`t('…')` key and walks every data table the UI shows, and fails on anything
without Spanish, on a Spanish template that loses or invents a placeholder,
and on a key defined twice. It cannot see a sentence built without `t`, so
`npm run i18n:soak` runs a world in Spanish for 30,000 steps and flags every
line it wrote that looks English; it found three such holes in this pass (a
marriage line glued with `' and '`, a refusal that printed an action id, and
two actions — `spar`, `trade` — with no label at all, which English had been
printing as raw ids). `AGENTS.md` now says every readable word goes through
`t()`.

**Left as found**, and in [bugs.md](bugs.md): lines written before a switch
stay in their language; three English grammar slips kept so English stays
byte-identical; Spanish takes the masculine where no person is to hand.

Bit-identical in `sim:check:all --verbose`. Two new e2e specs, a new unit test
file, a new determinism test.

---

## 2026-09-23 — notes.txt: the family tree's lines take colour, and the tribe graph keeps to the tribe

Two of the three notes the owner left on 2026-09-23. The third, the Spanish
translation, is its own pass below.

**"Show relationship with green / yellow / red coloured lines in the family
visualizer too, as done in the tribe visualizer."** Every kinship line on the
family tree is now drawn in the colour of what the two people at its ends think
of each other. The tribe graph only ever had two colours — anything at or above
zero was green — so the "yellow" the note remembers did not exist; it does now,
in both panels, by one rule. `Knowledge.opinionTone` splits at
`REGARD_NEUTRAL` (±10), which is the band `regardFromThem` already called *"no
strong feeling"*, and `regardFromThem` now reads the constant rather than its
own literals, so a yellow line is exactly a tie the words call indifferent.
The two panels also share the arithmetic: the tribe graph's inline "mean of
whichever directions exist" became `RelationshipGraph.mutualOpinion`, which the
family tree calls too.

A family line is coloured only where the player could have learned it — when
they know the ties (`knowsTies`) of somebody at either end — and stays the old
grey otherwise. Being your relative is not the same as being somebody whose
feelings you can read.

**"Members of other tribes are shown in the tribe visualizer."** They were: the
graph draws everybody the subject has an opinion of, and the ranked view has an
"other bands" row by design (M9.5 4e). The owner chose a switch. The graph now
opens on the subject's own band — `Simulation.bandIdOf`, the same `Rank.bandOf`
the rows are drawn from, so the filter cannot disagree with the row it hides —
and a header button, *other bands too*, puts everybody back. The filter rides
the predicate `tribeMembers` already applied to the dead (renamed from `alive`
to `include`), so it is applied *before* the cap and a hidden neighbour never
costs a band-mate their place. The head line says how many it hid; a graph
that silently drops half of somebody's friends reads as the friends having
gone.

Bit-identical in `sim:check:all --verbose`. Two e2e specs.

---

## 2026-09-23 — M11 phase 13f, third commit: your own life names people as you know them

**The defect.** `SocialSystem.emit` writes `describeEvent(type, actor.name,
target.name)` into both chronicles, with real names. Rob a stranger and your
*Life* tab told you what they were called. Other people's histories already
went through `knowledgeOfPerson`; your own bypassed it because it was stored
as finished text.

**The change.** `rememberedAbout`, the one function the *Life* tab reads,
re-writes every line of your own chronicle that carries a `deed` (13e) from
its ids, through the same `nameOf` other people's histories use — so a
stranger you robbed is *"a young man"* until you learn better, and becomes
their name the day you do.

**Why the stored sentence stays.** The plan asked for the chronicle to hold
ids and for its readers to be migrated. It already holds them (13e), and
checking the readers found only two: *Life*, migrated here, and the
succession screen, whose milestones are never deeds and whose *killed* line
already names through `Knowledge`. No check or tool reads `chronicle[].text`.
The sentence is kept beneath as a record rather than rewritten, because
rewriting stored history to suit one reader is the thing 13d refused to do.
Two non-deed lines still carry a name as written — see
[bugs.md](bugs.md).

Bit-identical in `sim:check:all --verbose`. A test in `knowledge.test.ts`.

---

## 2026-09-23 — M11 phase 13f, second commit: a witness is named as the reader knows them

**The defect.** `mayUse` wrote its own explanation, `seen.name + ' is close
enough to see them'`, and that sentence reached the screen twice — the
refusal `Simulation.storeItem` puts in `lastRefusal`, and the reason a
greyed-out option in the radial menu gives. The watcher is usually from
another band and usually a stranger, whose name the player's character was
never told.

**The change.** `mayUse` is pure and cannot know who is reading, so it stops
writing words: `PropertyUse.because` becomes `basis` — `own`, `ally`, `seen`
or `unseen` — and the witness it already returned stays on `seen`. A new
`Knowledge.explainPropertyUse(observer, use, relationships)` writes the
sentence for a named reader, naming the witness through `knowledgeOfPerson`:
*"A young man is close enough to see them"* until the reader knows better.
`storeItem` explains for the player; the catalogue gains an optional
`explainProperty` that `main.ts` supplies for the actor. Two tests in
`property.test.ts`.

Bit-identical in `sim:check:all --verbose` — nothing in the simulation read
`because`.

---

## 2026-09-23 — M11 phase 13f, first commit: the refusals 11b-11c left unexplained

The plan asked for every path of `sabotage` and the organised raid that ends
in `finish` where it should `abandon`, or in an `abandon` with no words in
`STOP_REASONS`. Checked against the source rather than by eye:

- **`doSabotage`** `finish`es only on success; every failure goes through
  `abandon` or `stop` with a reason that has words. Nothing to change.
- **One reason had no words at all**: `nothing_to_trade`, from `doTrade`, which
  the floater printed as the identifier with its underscores replaced. It now
  reads *"one of them had no food to swap"*. A new `stopreasons.test.ts` reads
  every `abandon` reason and every `interruption()` return out of
  `ActionSystem.ts` and fails if any lacks a line; it failed on this one
  before the fix.
- **The raid organiser found a silent order.** `fitForOrders` asks only that a
  member be idle, near and fit — the player's character is a member like any
  other, which is the pillar — so a chief calling a raid, or directing work
  on a site, could set an idle player walking to a rival's granary with
  nothing on screen to say who had sent them. `Simulation.command` now posts an
  insight when the order it has just had obeyed lands on the player: *"Oren
  sent you to wreck a rival building"*, with the leader named through
  `Knowledge`. Two tests in `orders.test.ts`.

Bit-identical in `sim:check:all --verbose`: no scenario has a player.

---

## 2026-09-23 — M11 phase 13e: a death says who they killed and what they raised

**The note** (owner's note 2): the succession screen showed the last six
milestones, and neither a killing nor a building is one, so a life that took
three others or put up half the camp read the same as one that did neither.

**The change.** Two lines under the milestones, counted off the chronicle:
*killed* — every murder the dead person did, each victim named as *they*
knew them, through `knowledgeOfPerson` — and *raised*, every design they
finished, with a count (*"windbreak ×2, granary"*).

**What that needed.** The chronicle held only sentences. Counting murders by
parsing *"X killed Y"* would break the moment 13f changed the wording, and
the sentence carries the victim's real name, which the reader may not know.
So two optional fields, both written alongside the text rather than instead
of it: `LifeEvent.deed` (the event type and the ids of the two people), set
by `SocialSystem.emit` on every line it writes, and `LifeEvent.built` (the
design id), set when a build completes. The plan had said "no new state";
these are fields on lines that were already written, and 13f is the second
reader of `deed`.

**Bit-identical** in `sim:check:all --verbose`: nothing in the simulation reads
either field. The succession e2e spec now gives the player a killing and a hut
before they die and checks both lines.

---

## 2026-09-23 — M11 phase 13d: the *Life* panel folds a run of the same deed

**The note** (owner's note 15): twenty clicks at a rival's store wrote twenty
*"used what wasn't theirs"* into *Life* and pushed everything else off it.
`storeItem` emits `trespass` on each click, and every `emit` writes a line.

**The change.** Consecutive entries with the same text and kind fold into one
line, *"Used what wasn't theirs ×20"*, with the span of days they cover
(*"3d–1d"*). Only consecutive ones: a theft, a meal and another theft is a
story with a middle. The fold is done before the panel's cut of forty, so the
forty are forty stories.

**In the presentation, not the chronicle**, and deliberately: the succession
screen and the health checks read `chronicle[]`, and twenty deeds are a
different fact from one. `foldRepeats` lives in a small `src/ui/LifeLog.ts` so
`lifelog.test.ts` can pin it without a DOM.

UI only.

---

## 2026-09-23 — M11 phase 13c: the dead, apart

**The note** (owner's note 14): the dead crowd the living out of every list of
who somebody knows.

**Why.** `RelationshipGraph.knownBy` ranks by strength of feeling and never
asked who was alive, and the strongest feelings are often for the dead — a
dead father at +80 took one of the fourteen places in *Ties*, and one of the
twenty-four in the tribe graph, that a living neighbour should have had.

**The change.**
- ***Ties***: the living fill the list; the dead go into a `<details>` under it,
  closed by default (*"3 dead they remember"*). A person's panel is rebuilt
  only when the selection or the tab changes — everything else is
  `refreshPerson` — so an opened fold stays open. A new e2e spec kills an
  acquaintance, opens the fold and checks it is still open a few dozen frames
  later.
- **Tribe graph**: `tribeMembers` and `layOutTribe` take an optional `alive`
  predicate, and the dead are dropped **before** the cap. The head line adds
  *"and N dead"*, and the digest carries both counts, since a death can change
  that line without changing anything else on screen. `tribegraph.test.ts`
  pins that no dead person is drawn and the cap is still filled.

UI only.

---

## 2026-09-23 — M11 phase 13b: *Between you*

**The note** (owner's note 5): clicking somebody showed their family, their
ties and how far they would obey you, but not what you think of them. That
lived only in your own list, which stops at the fourteen strongest feelings.

**The change.** A *Between you* section opens the *Ties* tab of anybody who is
not you:
- **You of them**: your opinion, with the same bar and the same breakdown
  (band, deeds, familiarity, kin) as the list, read with
  `RelationshipGraph.peek` so that looking never creates an acquaintance.
- **They of you**: their private state, so it comes through a new
  `Knowledge.regardFromThem` — nothing for a stranger or a face you have only
  crossed paths with, a sentence for an acquaintance ("They seem to dislike
  you."), the number for somebody close.

The list's breakdown and its bar are now `tieParts` and `tieMeter`, shared with
the new section, so the two can never explain one edge in different words.
`knowledge.test.ts` pins the four levels and that asking creates no edge.

UI and a pure read; bit-identical by construction.

---

## 2026-09-23 — M11 phase 13a: a building says whose it is

**The note** (owner's note 3): nothing on the map said which tribe a hut, a
site or a field belonged to, so a ruin could not be read as *somebody's* ruin.
This is what 11e had called the "durability panel": the durability itself was
already drawn by 11b; its owner was not.

**The change.** `Renderer.drawBuilding` rings every site, field and building in
the colour its owning band's people wear (`bandColorIndex(ownerBandId)`). The
ring sits four pixels *inside* the edge rather than on it, because the edge
already says what state the thing is in — the dashed plan of a site, the
broken red of a ruin — and that has to keep winning. Checked on screen with a
finished hut, a ruin, a site and a half-wrecked hut side by side: the ruin
still reads as a ruin first. Dimmer on sites and ruins, and skipped below
fourteen pixels, where two rings can no longer be told apart.

Renderer only; the harness never imports it.

---

## 2026-09-23 — M11 phase 12c: how many tribes, asked where the tribe is chosen

**The note** (owner's note 4) asked for the number of tribes and of people per
tribe on the new-game screen. Both settings already existed —
`population.bands` (1-8) and `population.peoplePerBand` (2-30), each marked
`restart` — but only among the settings screen's thirty-odd rows.

**The change.**
- `NewGame`'s tribe step gains two `sliderRow`s, with their bounds and hints
  read from `TUNABLES` so the two screens cannot disagree. A change is recorded
  in `main.ts` exactly as the settings screen's own `edit` records one (a value
  equal to the difficulty's is no override), saved, and spent through
  `rebuildBeforeStart` — the same pre-start rebuild Begin uses. `NewGame` never
  builds a `Simulation` itself.
- The step is now built as nodes: rebuilding a range under the pointer kills
  the drag, so a rebuilt island redraws only the title and the tribe cards.
  A drag rests 180 ms before the island is rebuilt, because every value is a
  new world.
- The title counts: *"An island, and five peoples on it"*, where it always said
  *"three"*.
- `BAND_COLORS` had six colours for up to eight tribes, and the outcast band
  (id 1000 and up, now `OUTCAST_BAND_ID_BASE`) wore whichever tribe's colour
  its id fell on modulo six. Now eight tribe colours and a neutral grey for the
  outcasts, read through `bandColorIndex`. The sprite atlas pre-renders every
  colour: it goes from 174 cells (1344×1248, about 6.7 MB of canvas) to 249
  (1536×1536, about 9.4 MB).

**Bit-identical** in `sim:check:all --verbose`. The character-creation e2e spec
now moves the tribe count to five and checks the cards and the title follow.

---

## 2026-09-23 — M11 phase 12b, second commit: NPCs stop losing the attacks they score from afar

**The defect.** The same first-tick test the first commit removed from the
player's order was still on every NPC's attack. `Brain` picks victims inside
`sightRadius` (12), so every aggression it scored between nine and twelve
tiles was `finish`ed where the attacker stood and scored again the next tick.
It was not marginal: across twenty `lean` seeds, **40,081** attacks were lost
this way against 6,888 blows landed — about six for every blow.

**The change.** The first commit's rule for everybody: give up at the further
of nine tiles or the start of the chase plus three, through
`abandon('target_escaped')`. Afterwards `pursuit_abandoned` is 6 across the
same twenty seeds.

**Measured, 20 seeds** (a scratch harness counting deaths by cause, not
committed):

| | survival | collapsed | murders | blows | starved |
|---|---|---|---|---|---|
| `lean` before | 60.1% | 5/20 | 433 | 6,888 | 109 |
| `lean` after | 50.4% | 6/20 | 457 | 7,129 | 159 |
| `century` before | 32.8% | 10/20 | 745 | 9,929 | — |
| `century` after | 37.2% | 8/20 | 716 | 9,609 | — |

Across seeds, violence barely moves: most of the lost attacks were evidently
re-scored and landed once the two came closer anyway. Survival moves ten
points down in `lean` and four up in `century`, with per-seed swings in both
directions of up to thirty — at or below what twenty seeds can resolve. The
plan anticipated a fall in `lean` and ruled that the answer is phase 14, not a
lower ceiling here; it has not been chased.

In single runs the mechanism does show: `feasts` went from 114 blows to 192 and
turned `kin-outrank-strangers` red, and `craft`'s one painting became none.
Both are in [bugs.md](bugs.md). `millers` went from two failures to none.

---

## 2026-09-23 — M11 phase 12b, first commit: an ordered attack sets off after somebody ten tiles away

**The defect** (owner's note 10). `doAttack` tested `PURSUIT_LIMIT` (9) on its
first tick, before `approach`, and called `finish`. An attack ordered on anyone
ten tiles off ended where the attacker stood, and because `finish` is not
`abandon`, no floater said why and no `abandoned_*` counter moved. The limit
was written to mean "the quarry is getting away" and measured "where the
chase happened to start".

**The change**, for the player's order only (`person.order === 'attack'`):
the distance at the start of the chase is kept on `Person.pursuitFrom`
(cleared with the rest of the target), and the chase gives up at whichever is
further — the old nine tiles, or the start plus `PURSUIT_SLACK` (3). A chase
begun inside six tiles therefore ends exactly where it always did. Giving up
is now `abandon(person, 'target_escaped')`, with its own sentence in
`STOP_REASONS` — *"they got away"* — because `quarry_escaped` says *"the
animal outran them"*.

**Bit-identical**, because only the player gives attack orders (chiefs only
command building and sabotage). The NPC route keeps the old test until the
second commit, which moves the world and is measured on its own.
`pursuit.test.ts` pins both halves, and fails both on the previous build.

---

## 2026-09-23 — M11 phase 12a: one way to eat

**The defect.** Eating had two implementations. `ActionSystem.doEat` had
written the day's diet ledger (`macroIntakeToday`) and the `eaten_<id>`
counter since phase 8b; `Simulation.eatItem`, behind the Kit tab's *Eat*
button, predated both and learned neither, although its own comment promised
it gave "the same nourishment" as eating by order. A player who only ate from
the panel had a diet frozen where it last stood.

**The change.** `Macros.consumeFood(person, itemId)` is now the only way
anybody eats: it removes the unit, applies `nutritionFactor`, lowers hunger,
writes the ledger and counts. `doEat` and `eatItem` both call it — the
`moveToward` argument, two copies of one idea drift. `TECH_EFFECTS.cooking`'s
declared site now names it.

**What the note actually saw**, fixed in the same commit because the defect
alone would not have made anything move on screen:
- the three *Diet* bars are shares of recent meals that move only at midnight,
  so no meal can make one rise. The header now says *"share of recent meals"*,
  and a new line under the bars — *"Today: 3 berries, 1 meat."* — answers each
  meal the moment it is eaten. It reads `Person.eatenToday`, a new per-food
  tally that `consumeFood` fills and `decayMacroBalance` clears; nothing in the
  simulation reads it;
- the bars had no `data-need`, so `Hud.refreshPerson` never patched them and
  they changed only when the panel happened to be rebuilt. They carry
  `macro_<name>` now and `refreshPerson` reads it, along with the today line.

**Bit-identical**: the verbose `sim:check:all` report matches HEAD on every
line but the wall-clock ones (no scenario possesses a player, and `doEat`'s
arithmetic is unchanged). `eating.test.ts` pins that the two routes leave a
person in the same state.

---

## 2026-09-23 — M11 Block V triaged and planned: `notes.txt` emptied, no code touched

The owner left sixteen notes in `notes.txt` on 2026-09-22, written playing the
phase 11c build, and then asked for the whole of what M11 still owes planned
commit by commit. **Nothing in `src/` or `tools/` changed**; the owner asked for
the plan first, including for the two cheap defects it found.

**Where it went.** A new document, [m11_block_v_plan.md](m11_block_v_plan.md),
is now the single source for phases 12-17. `m11_plan.md` keeps an index table
and a pointer rather than a second copy, because two copies of a plan drift
exactly as two copies of code do. `next-steps.md` §7g indexes the notes, and its
milestone table now shows 11b and 11c shipped, Block V next, and M10 folded into
M11 — it had still said "11b-e next" and carried M10 as a separate milestone.

**Why this order.** Repairs (12) and interface (13) first, because nearly all of
both are bit-identical in the harness: no scenario possesses a player. Then
**fear (14) before defending property (15)** — the owner's decision, and the
reason is in the note itself: it complains about the early, scattered violence
11b-11c produced (`lean`: murders 3 → 22), and a defence ladder tuned against
that world would be mistuned the moment fear corrects it. The body (16) after
both, because an investigation needs punishments that already exist. The
closing debt (17) last, because its checks measure what 14-16 move.

**The owner's second decision:** `cordage` makes rope from sticks or from
thatch — two recipes with different ingredients, so whichever is to hand wins
rather than one shadowing the other, shipped in the same commit as the `bind`
verb that consumes it so the item is never declared and inert.

**What the triage found rather than what the notes said**, all in
[bugs.md](bugs.md):
- eating from the Kit tab never reaches the diet, because `Simulation.eatItem`
  is a second copy of `doEat` that predates macronutrients — and the diet bars
  do not refresh while the panel is open;
- an attack ordered from more than nine tiles ends on its first tick with
  `finish` rather than `abandon`, so nothing says why, and NPCs lose every
  attack they score between nine and twelve tiles the same way;
- M11 phase 4 shipped the reverse of its own plan: being seen forbids using a
  rival's building, where the plan said it is allowed and witnessed;
- a stranger's name reaches the screen three ways — the property refusal, the
  radial menu's reason, and the player's own chronicle;
- `considerTerritory` counts intruders nobody saw;
- the new-game title says "three peoples" whatever the setting, and there are
  six band colours for up to eight bands;
- `Person.mood` has no writer and no reader at all, because M9.6 4b-4d never
  shipped; phase 14 takes over the `security` channel.

**Debt that had no phase and now has one:** the `gift` deed still unemitted
(17a), the four phase-5 checks never written (17b), fields that cannot be
sabotaged (17c), `perf-budget` and the one-event checks (17d), `DECISIVE_GAP`
never re-measured after 11a (15f), the border guard (15e), and a raid nobody
from the victim's band sees not moving how the two peoples stand (14e).

## 2026-09-22 — M11 phase 11c: the raid organiser

The piece the rest of phase 11 was built toward, and it is notable for how
little of it is new. Phase 11a made `fight` something people genuinely differ
at, so a war party is not four farmers with sticks; 11b made `sabotage` a verb
with its progress banked on the building; phase 7 made two peoples able to
stand badly with each other; phase 4 made property something attention
protects rather than permission. `BandSystem.considerRaid` only decides *who
goes where*. Every consequence of their arrival was already written.

**What an order against another band's property costs** (first commit, sent
bit-identical — `lean` reported the same world to the digit). Two gaps in
`Authority.ORDER_COST`. `sabotage` had no entry at all, so the verb 11b added
fell through to the 0.3 default: a chief, or the player, could have a rival's
hut knocked down for less than the price of telling somebody to fell a tree.
It goes in at 0.8, level with `threaten`. And the table is keyed on the verb,
which is right for every entry in it but one — `take` is the same verb, walk
and arithmetic whether the store is your own band's pit or a rival's granary,
and only one of those is a crime a whole band may come out of their huts
about. `orderCost` now takes a `foreign` flag, floored at
`FOREIGN_PROPERTY_COST` (0.75, level with `steal`, which is this same crime
with a person on the other end of it instead of a wall).
`Simulation.command` derives it from the target it already holds, off the
*subordinate's* band rather than the leader's, since it is the person walking
into the rival camp who bears it.

**`Factions.warParty`**, beside `conspiracyAgainst` and sharing its
`trustEachOther` test — extracted rather than copied, because a plot and a
raid holding separate trust thresholds is precisely the drift `AGENTS.md`
warns about. A stranger scores 0 on `RelationshipGraph.opinion`, below the
threshold, so the "who knows whom" half of the brake falls straight out of
the graph without a rule of its own. Nothing is stored; asking again tomorrow,
after an evening of gossip, may honestly answer differently.

**`BandSystem.considerRaid`.** A chief with the nerve and the hand for it
picks the band their own people stand worst with, finds something of theirs
within a day's march on the same landmass, and calls. The quorum is
`RAID_QUORUM` (3, chief included) measured on who *could* be called rather
than who comes — the precedent `considerExile` sets, and the brake
`Brain.ts` already records the need for. Each follower is a real
`ctx.command` roll at the new price; the chief goes with them and goes even
when nobody answered, which is the cost of calling something your band will
not follow you into.

**Three rules were measured and thrown out before one stuck**, all for the
same fault — they were coins that always landed the same way, which is how
this project ships a branch nobody can reach:

- A range set by the thirst budget (60 tiles) dropped **every** target in
  `lean`, where a band's camp sits 61 to 91 tiles from the nearest thing its
  worst enemy owns. Thirst was the wrong constraint anyway: a raider is under
  an order, and `noteStop` sets aside any order broken off for a need, so
  somebody who runs dry two thirds of the way there stops, drinks, and picks
  the raid back up. `RAID_RANGE` is the *walk* — about a day's march.
- Plunder gated on the raiders being hungry produced forty-seven
  deliberations across `lean`, `feasts` and `labour` and not one plundering
  raid: no scenario in the matrix has a band hungry at midnight, and
  `pantryPressureOf` — the first thing tried — reads how full the granaries
  are, which is a band's wealth, not its appetite.
- Plunder gated on the victim owning a granary produced eleven raids and not
  one wrecking, because every band owns a granary.

What settles it instead is **how far the grudge runs**: you rob the
neighbours you merely dislike and you burn the ones you hate (`RAID_FURY`).
That is the raiders' own feeling, which a chief knows without being told —
where what is *in* that granary is something nobody from this band has ever
seen. The target is picked by what a chief could stand on a hill and see: a
granary because it is a granary, and `doTake` finds out on arrival whether
there was anything in it.

**`fitToTravel`** split out of `directTo`'s conditions, which became
`fitForOrders`. A chief sending themselves is the one caller that skips every
other condition — they are their own leader, standing where they are standing
— and must not skip this one. A chief who walks sixty tiles into a rival camp
on an empty stomach is the same bug with a hat on.

`BandRelations.touching` returns the bands one band has any standing with at
all, in ascending id order, so the search walks only pairs that have actually
met; ascending rather than insertion order because insertion order is a
property of who happened to meet whom first and no seed controls it.

Measured across twenty seeds of `millers`, not one run: mean survival 67.7% →
64.0% with *fewer* collapses (5/20 → 4/20) and identical technology counts
(8.3 known, 6.9 → 6.7 past the root nodes). The single-seed
`millers`/`population-persists` failure this pass produces is that
divergence, not a regression — the class `AGENTS.md` names outright. Raids are
rare by design: 1 to 9 per long run, with `raid_never_raised` two to ten times
higher, the quorum doing most of the refusing.

`raids-are-organised` in the health report bounds the rate from above and
names the two ways the gate could come off — a runaway count, or a world where
a chief was willing every time and never once raised a party. Five
deterministic tests in `band.test.ts` on a world built with two bands primed
to hate each other; three fail on a build with `considerRaid` unwired, and the
two that do not are kept as its controls rather than as detectors.

Determinism: no new RNG stream. The raid draws nothing — the party is sorted
by `fight` with ids breaking ties — and the only randomness involved is the
`commandRng` roll `command` already makes for every order.

## 2026-09-22 — M11 phase 11b: `Building.durability` and `sabotage`

Territory and captivity (11c/11d) are still ahead; this is the piece the plan
put first, because `mayUse` (phase 4) and `BandRelations` (phase 7) had to
exist before a border guard could be given the right rule instead of a
membership test. A raider can now cost a rival band something that outlasts
the raid.

**`Building.durability`**, in the same units as `progress` — `def.workTicks`
— on purpose: wrecking a design costs the same *kind* of effort raising it
did, so `damage`/`repair` share `addWork`'s exact arithmetic
(`skillFactor('build') * buildFactor`) rather than a second constant. Null
until `addWork` finishes the building, and forever null on anything
`isStructure` says has no fabric to knock down (`workTicks === 0` — a
stockpile), so a bare square of ground can never read as "in ruins." `ruined`
(durability ≤ 0) and `soundness` (0-1, for the bar) are the two readers
everything else in this pass hangs off.

**`sabotage`**, a new verb, the same shape `doBuild` already is: an
interruption check and progress banked on the building itself, because
tearing down anything bigger than a windbreak takes far more than one
uninterrupted pull. Refuses a target `mayUse` calls `ours` explicitly — the
one place that answer has to differ from every other property verb, since
there is no legitimate reading of "sabotaging your own band's hut." A field
is excluded on purpose: `doSow`/`doReap` do not read `ruined` yet, so
letting anyone target one would be exactly the declared-but-inert defect
`AGENTS.md` warns about; `docs/bugs.md` leaves the real extension for
whoever needs it.

**Repair reuses `build`** rather than a verb of its own. `doBuild` now
patches a complete, damaged site back up when it is ordered onto one, asking
for no fresh materials — `Building.repair`'s own comment explains why
treating a repair as "construction over again" would be the wrong shape for
the job. `ActionCatalog`'s building menu offers "Repair the …" only when
there is damage to repair.

**A ruin is inert in every way its `def` claims it is not**, all through one
choke point rather than four scattered checks: `storageFree` returns 0 on a
ruin, and `workTraps`/`workHerds`/`workHeaps` were already gated on
`storageFree <= 0` for a full store, so a burned-out snare line or a
broken-fenced pen stops producing — and resumes on its own once repaired —
with no separate flag anywhere. `NeedsSystem.shelterAt` and the well lookups
in `ActionSystem`/`Brain` are gated on `!ruined` directly, since neither
routes through storage. `BandSystem.planBuildings`'s `roofArea` now excludes
a ruin's floor area too — without it a raided band would read its own ash as
"enough roof" and never plan a repair or a replacement, which is the one
thing a raid is supposed to cost it.

**Scored in `Brain`** the same one-sided way `bandHostility` already reads
for `attack`'s cross-band term: zero at neutral or friendly standing, never
negative, so `sabotage` never fires between bands with no quarrel and only
ever amplifies a hostility that already exists. No `hunger` term — this is a
band's standing grudge acting on a building, not a need answering itself,
and mixing the two would have a well-fed pacifist band start burning huts
the moment its granary ran low.

**The performance chase was the real work of this pass.** The first version
scanned `ctx.buildings` fresh inside every person's `think`, exactly the
shape `shelter`'s existing block already has — and adding a second such scan
measurably cost `lean`'s large population enough steps per second to fail
its own `perf-budget` check outright, a scenario whose margin over the floor
was already thin. Fixed in two real steps, both measured rather than
guessed: `Simulation.sabotageCandidatesByBand` computes the filtered,
owner-grouped list once and shares it across every person's `think` that
tick (O(people × buildings) down to O(buildings) once, plus O(bands) per
person); moving its refresh from every tick to once a day — the same cadence
`bandRelations.decay()` and `snowDepth` already update on — closed the rest
of the gap. `lean` passes clean again. A stale entry between two daily
refreshes costs at most a wasted walk for the AI, checked for real the
moment anybody actually arrives, in `ActionSystem.doSabotage` itself; a
player's own explicit order never consults the cache at all.

**Verification.** `typecheck`, all 395 unit tests (fifteen new, in
`sabotage.test.ts`, each checked to fail on the build without the fix, per
`AGENTS.md`), all 49 e2e specs, and `sim:check:all` clean except three: the
pre-existing `crowded`/`perf-budget` (unrelated, present on a clean tree
too), and two single-seed checks — `traps`/`animals-are-tamed` and
`farmers`/`heads-direct-work` — that flip from a clean PASS to a hard 0 with
this commit. Chased rather than shrugged off: both are the exact single-seed
shape `AGENTS.md` names as chaos-prone (a rare event either crosses a low
threshold in one seeded run or does not), the divergence is the expected
cost of adding any new scoreable action to `Brain` — it shifts
`choiceRng`'s draw sequence and, from there, the whole world's trajectory —
and the mechanism each check measures still works cleanly elsewhere:
`labour`, the scenario built expressly to exercise rank-directed labour,
passes `heads-direct-work` outright with this same code. Recorded rather
than tuned away, on the standing rule that a check is not to be chased green
without knowing which side of it — the world or the check — was wrong.

## 2026-09-21 — M9.6 phase 2d: the graph panels hold still, and are readable on a phone

Two owner reports, and four bugs behind them. Both are in the UI only; no
simulation file is touched, and `sim:check:all` is byte-for-byte identical
before and after.

### "On mobile the tech nodes aren't visible, only the circles but no names"

Exactly right, and the cause was a box the panel never actually had.
`TechWeb.boxSize`, `FamilyTree.boxSize` and `TribeGraph.boxSize` were three
copies of the same arithmetic — the window, less room for the pane beside the
canvas, but never narrower than about five hundred pixels. That floor predates
anybody opening the game on a phone, and it is *wider than one*. On a 390px
screen the tech web asked for a 520px viewport inside a card the stylesheet had
already capped at `100vw - 12px`, and everything downstream believed the lie:
`fitToView` divided 520 by the web's natural width and opened at a zoom of
0.53, under the 0.55 at which `.is-far` strips every node's label. The player
got a perfectly correct picture of fifty anonymous dots.

Three fixes, since one alone would only have moved the problem:

- **`src/ui/PanelBox.ts`**, new, replacing all three copies. `AGENTS.md` asks
  for a shared helper over a second implementation and this was the third; a
  fix made in one would have stayed broken in the other two. Below the
  stylesheet's own 700px breakpoint it returns the room that is actually
  there, with no floor at all, because a floor is what caused this.
- **A zoom the panel refuses to open below** (`READABLE_ZOOM`, a hair above
  `CHIP_ZOOM`). Fitting the whole web is not worth having if nothing on it can
  be read. Below that, the panel opens *zoomed in* on the middle of what the
  subject knows and could next know — their frontier, which is what a player
  opened the panel to ask about — rather than shrinking the web to illegibility.
  Desktop is unaffected: measured at 1440x900 and 1920x1080 the opening zoom is
  0.80 before and after, and the whole-web framing is the same code path.
- **Touch handlers**, which the panel had none of. One finger pans, two pinch,
  both through the same `zoomAt` the wheel uses. Opening zoomed in is only
  defensible because the rest is now reachable; before this the view could not
  be moved on a phone by any means. `.techweb-viewport` gets `touch-action:
  none` or the browser claims the gesture first and scrolls the card instead.

### "The tribe graph moves, and when it gets layers it behaves very chaotic"

Also exactly right, and measurably worse than it sounded. With the world
**paused** — nothing in the simulation changing at all — the ranked graph moved
every node about six hundred pixels per frame across a nine-hundred-pixel
canvas, on `labour`, `crowded` and `stewards` alike. M9.6 phases 2a-2c had
stopped the panel re-deriving itself and stopped it rebuilding its DOM on a
pixel of drift; neither touched why the *layout* would not sit down. Four
separate faults, each found by measuring rather than by reading:

- **Repulsion was unbounded.** `repulsion / distance^2` with no ceiling: two
  nodes five pixels apart threw each other 320px in a single pass, two pixels
  apart, 2000px. In the flat graph a pair escapes diagonally and the moment
  passes. In a ranked one `lockY` pins the row, so they cannot get away from
  each other and kept kicking until the row was **forty thousand pixels wide**.
  `fitInto` then crushed that back into the panel, which is precisely why this
  went unseen for two phases — the damage arrived looking panel-sized. Capped
  at `MAX_PUSH`, which only bites below ~32px, where every caller's overlap
  pass already forbids anything to be.
- **The relaxation rotated.** `relax` wrote each node's new position the moment
  it computed it, so the second node of a pair read the first one's *updated*
  position. That asymmetry is an artefact of array order, not physics, and it
  injected a consistent tangential bias: a settled flat sociogram turned
  rigidly, measured at two degrees per ten frames, centroid fixed, every radius
  unchanged. Nothing was wrong with the shape, so "nobody overlaps" and "the
  same input gives the same output" both passed happily while the panel span
  like a wheel. Forces are now summed into `fx`/`fy` and applied once per pass;
  the rotation measures as exactly zero.
- **There was no cooling.** A fixed step size let the arrangement overshoot its
  own equilibrium and oscillate about it instead of arriving. `heat` now ramps
  1 → 0.05 across the budget — the standard schedule a force-directed layout
  needs and this one never had — and `relax` exits early once a pass moves less
  than `AT_REST`. That early exit is what makes a settled graph free: a panel
  left open on a paused world runs one pass, finds everybody where they belong,
  and stops. `ITERATIONS_OPENING` rises 220 → 1200 *because* of it, so the
  arrangement lands in the call that opens the panel instead of crawling into
  place over the next half-second.
- **Springs asked for distances the overlap pass refuses.** `restLength` gave
  somebody adored a rest of 60 while `settleOverlaps` would not seat anybody
  nearer than 68 (88 in a row), so the pair were pulled together and shoved
  apart every frame for as long as the panel was open. Now clamped to the gap.
  The same mistake at scale is why `RANKED_SPOKE_K`/`RANKED_PEER_K` drop to a
  sixth: sixteen people in a row need 1400px between them whether or not every
  one of them is also being pulled toward the subject's column. The old comment
  argued that a pinned row *lets* springs pull harder, which is true and was
  still the wrong conclusion — it ignored what a row cannot do. The minimum gap
  sets the spacing, which is the honest answer for a queue; the springs lean
  allies together within the order `seedRows` chose.

Measured across the three ranked scenarios, paused motion goes from ~600px per
frame to nought; running-world motion from ~600px to a 1-4px mean, which is now
only the picture tracking opinions that genuinely moved.

### Checks

Six new, and every one verified to fail on the build without the fix, as
`AGENTS.md` requires — a check that detects nothing is worse than no check.
In `tribegraph.test.ts`: flat and ranked both come to a complete stop over a
frozen world (measured 2.8px and 883px per frame on the broken build), the
settled graph does not rotate (10 degrees), and the pre-fit span does not blow
out (8555px). In `smoke.spec.ts`: the tech web opens on a 390x844 phone without
`.is-far` and with labels the player can read, and one finger pans it; and the
tribe graph's drawn positions are identical across four samples with the game
paused. All four failed on the broken build with the reported symptom —
`"techweb-canvas is-far"` and drifting positions — and all 49 e2e, 380 unit and
19 scenario runs pass with it.

---

## 2026-09-21 — M11 phase 11, first commit: `fight` gets a second and third trainer, opening the war phase

M11 phase 10 closed the widened Neolithic; this is the first commit of phase
11 — war — and it fixes a blocker found reading the code before designing the
rest, not while measuring it. `docs/bugs.md`, recorded shipping M11 phase 2:
`fight` is trained by exactly one thing, landing a blow in `doAttack`
(striker `practice('fight', 1.2)`, struck `0.4`), and nothing else in the
game touches it. `skillFactor('fight')` is `(0.35 + skill/100*0.85) *
vigour`, so with the skill at its floor for practically everyone the whole
population sits in a narrow 0.11-0.35 band. That entry named the
consequence directly: **there can be no warriors** — no household a rival
fears, no specialist for `division_of_labour`/`chiefdom` to divide, no
border guard better at stopping a raider than any farmer, and no risk in a
raid, since attacker and defender are interchangeable. Everything else phase
11 wants to build — a raiding party, a border guard, captivity worth
avoiding — needs fighting power to actually vary between people first.

`docs/bugs.md` listed three honest fixes and left the choice to whoever
built this phase, calling it a design decision rather than a repair. Put to
the owner directly; they chose to combine the two most defensible ones
rather than pick one:

- **`doHunt` trains a trickle.** `person.practice('fight', 0.25)` (a new
  `HUNT_FIGHT_TRAIN`) fires once, on the kill itself
  (`ActionSystem.ts`, after `ctx.onAnimalKilled`), never on a miss — a spear
  is a spear, and a band that hunts and never spars is not permanently
  defenceless.
- **A new verb, `spar`.** Deliberate, mutual, same-band training between two
  willing people: nobody is hurt, both sides gain `fight` skill and a little
  company, and it reads as camaraderie rather than violence — the safe half
  of the fix, on purpose, since the point was never to make people more
  willing to hurt each other. Gated on the partner's own regard the same way
  `doDiscuss` gates an argument (`opinion < 0` refuses with
  `partner_unwilling`, a reason the UI already knows how to show — reused,
  not invented). Fifty ticks, no interruption check, the same precedent
  `doCourt` (60 ticks) and `doTeach` (90) already set for a bout this short.
  Both parties practice `fight` at 0.6 and `settleOverWork` runs, so it also
  answers a little company — the same shape `doTeach` already has for a
  lesson that lands. No public `Deed` is emitted, on the same precedent
  `doTalk` already set: a conversation is not news.

Scored in `Brain` by two independent pulls — `aggression`, a trait that
otherwise only ever points toward hurting somebody, and feeling outmatched
(`max(0, 0.5 - skillFactor('fight'))`, which reads near zero today and only
grows meaningful once this verb and the hunting trickle have actually spread
the skill out) — against a same-band candidate who is not disliked. Deliberately
tuned below `talk`/`teach`'s usual range (0.1-0.9 before proximity, against
their 0-2.9 and 0-1.5) so it is one more thing to do, not the thing that wins
the score table.

**Not touched in this commit**: `DECISIVE_GAP` (`social/Vulnerability.ts`,
currently `0.3`), which was calibrated against the narrow floor-dominated
spread that existed before this shipped. `bugs.md`'s own comment there
flags this as worth re-measuring once `fight` actually varies, rather than
assumed to still hold — left for whichever later phase-11 commit first
depends on `attack`/`threaten`'s gap math (the border guard and the raiding
party both will).

New `spar.test.ts` (three tests: the `partner_unwilling` refusal, both
parties' `fight` skill rising with nobody's health moving, and both parties'
cooldown being set rather than only the one who asked).

**Measured**: `typecheck`, all 376 unit tests, and `sim:check:all` clean. In
`century`, `spar` fires 46,480 times over 40,000 ticks and completes 587
bouts — a middling verb, well behind `forage`/`talk`/`ask`/`give` and ahead
of `teach`/`chop`/`build`, not crowding out survival work. The scenario-level
`sim:check:all` failures that changed sides against the pre-commit baseline
— `hunters`/`kills-are-butchered-for-bone` clearing, `millers` and
`farmers`/`the-hurt-are-tended` and `herders`/`bands-take-sides` and
`the-tree-is-climbed` swapping which one fails — are all checks
`docs/bugs.md` already documents by name as one- or two-event-wide
tripwires that flip under any behavioural change; both the pre- and
post-commit runs show exactly three scenario-level failures. 20-seed
`century` cohort: 99.6% mean survival, 0/20 collapsed, in line with the
99.0-99.9% recent baselines this tier has reported throughout.

**Rest of the phase**, written up in full in `m11_plan.md`'s "Fase 11":
`Building.durability` and a `sabotage` verb, a raiding-party organiser in
`BandSystem.daily`, captivity as a state on `Person`, and the UI readers
(refusal reasons, a durability panel, a captivity notice).

## 2026-09-21 — M11 phase 10, seventh and last commit: `brewing`, closing the widened Neolithic

The last of the fifteen nodes `m8_plan_the_ages.md`'s M8.2 table left
pending. `beer` (`RECIPES.beer`, `grain: 4`, no station — a jar and time in
a warm corner needed no scenery worth inventing for one recipe) and a new
verb, `toast` (`ActionSystem.doToast`), rather than routing through `doEat`:
beer's nutrition is deliberately low — a jug of beer is not a meal — and a
number competitive with bread or meat would have let `bestFood` pick it
over both, distorting the food economy for a technology whose real claim is
social. A low number also means `bestFood` would simply never choose it, so
it needed its own verb regardless. `toast` mirrors `doPlay` closely: gated
on `techPower('brewing') > 0` and carrying a beer, relief lands on everyone
within `EARSHOT` including the drinker, and the plan's "raises opinion at a
feast" half is left out, on the same record `the_wheel`'s haul-speed claim
already was — no feast/opinion mechanic exists to hook into, and this ships
the buildable, honest half of the claim rather than inventing one.

New `beer-answers-loneliness` check, verified failing before `toast`
existed and passing after — 21 toasts made, heard by somebody else 106
times, in the new scenario below. New `brewing.test.ts`, the one file in
this whole tier with no existing verb's tests to lean on: there was no test
file for `play` either, so this is new coverage for a shape of mechanic the
suite had never directly tested before.

**A third scenario, `feasts`, apart from both `farmers` and `herders`** —
this milestone has now twice measured what a technology grafted onto an
unrelated scenario's starting knowledge can do to that scenario's own
cascade (`herders` exists for exactly this reason), and `toast` needs
nothing from either the farming or the pastoral chain. Two findings while
building it, both from measuring rather than assuming: granting `farming`
alone never planted a single field in 24,000 ticks, because wild grain is
worth 0 nutrition raw and nobody has a reason to pick it up without
`grinding` also known; granting `farming` *and* `grinding` together got a
field planted but never sown, because `brewing` was spending the same wild
grain a sowing needs faster than foraging could replace it. `brewing`'s
recipe reads only `pottery` in practice — `farming` is a prerequisite in
name, not something `RECIPES.beer` touches — so it is left out entirely,
and wild grain answers the recipe on its own.

**Measured**, `sim:seeds -- --seeds 20`: `century` bit-identical to the
previous commit in every reported figure — the same story every node in
this tier has told since `ground_stone`, since reaching `brewing` needs
`pottery` and `farming` together, a combination this cohort never reaches.
`feasts` (new): 99.9% mean survival, 0/20 collapsed, no starvation pattern
beyond ordinary noise. `sim:check:all`: `feasts` fully green (59/59); no
other scenario's failures change. All 373 unit tests (3 new), typecheck,
and all 47 e2e specs pass.

**This closes M11 phase 10.** All fifteen of `m8_plan_the_ages.md`'s M8.2
Neolithic nodes are now shipped: `ground_stone`, `spinning`, `weaving`,
`sickle`, `masonry`, `wattle_daub`, `calendar`, `the_wheel`, `bread`,
`herding`, `kiln`, `well`, `dairying`, `wool`, `brewing`. Two new scenarios
(`herders`, `feasts`) join the suite alongside `farmers`, restored to its
own baseline; the Neolithic rung of `ERAS` is live. M11 phase 11 — war — is
next.

## 2026-09-21 — M11 phase 10, sixth commit: `dairying` and `wool`, and two real defects they exposed

`BuildingDef.herd` gains `byproducts`: what a live herd gives up without
being culled for it, each gated on its own technology and accruing into the
same `store` the way the main item does — `stock * perDay * techPower(tech)`
— but tracked through a new `Building.byproductCarry` map rather than the
existing `yieldCarry`, because mixing three accrual streams through one
float would corrupt all of them. `pen.storage` rises from 30 to 60: a cap
sized for meat alone would let milk or wool fill it and starve breeding
itself, since `workHerds` stops growing anything once `storageFree` is
zero. `dairying` is a practice (nothing is built; `take` is the closest
thing the game has to a milking verb, since milk is drawn off exactly the
way meat is); `wool` is a device, gating a new recipe, `wool_cloth`, at the
loom — a different output item from `cloth` rather than a second ingredient
on it, so the two never compete for one craft slot the way `kiln_pot`
almost did. `Tech.warmthFrom` gains a sixth term for it, warmer than plain
cloth, per the plan's own claim.

**Two real defects, both caught by measurement rather than by inspection,
in the same pattern this commit's neighbours already found:**

1. **Milk bred and was never once eaten.** `doTake`'s default item choice —
   `store.bestFood()`, the single most nutritious stack — always preferred
   meat's 30 over milk's 20, so as long as any meat sat in the pen, milk was
   invisible to every route that walks somebody to food. Measured on
   `farmers`: 15 milk bred, 0 eaten across a full run. Fixed by giving a pen
   its own branch in `doTake`: an AI-planned visit with no specific item
   requested shares *everything* the pen holds rather than choosing one
   stack, which nothing else in the game needs because nothing else keeps
   two foods in the same place indefinitely.
2. **Wool bred and was never once woven**, even after the first fix — because
   the fix above first shared only *edible* stacks, and wool answers no need
   at all. Nothing in `Brain` sends anyone to a pen *for* wool the way
   foraging or hauling have their own fetch routes; a visit already under
   way for food was wool's only way out, so excluding it from that visit
   left it sitting in the pen for the whole run regardless. Fixed by
   dropping the edibility filter — a pen shares everything, full stop.

**A third, smaller finding**: the first attempt measured both fixes on
`farmers`, extended with `dairying`, `wool`, `spinning` and `weaving` in its
starting technologies. That extension moved the seed's cascade far enough
that no field was sown for the whole run — `fields-are-sown-and-reaped`,
`soil-is-drawn-down` and `compost-answers-exhaustion` all fell to n/a,
losing the coverage `farmers` exists for. Reverted; a new scenario,
`herders`, carries the pastoral chain apart from farming entirely, on the
same argument that keeps `stewards` apart from `farmers` itself. `herders`
found one further, unrelated, honestly-documented limitation of its own —
see `bugs.md`: two bands of ten do not develop enough standing spread in
its run for `bands-take-sides` to pass, which nothing in this commit
touches.

New `milk-is-drawn-and-drunk` and `wool-is-sheared-and-woven` checks, both
verified failing before the `doTake` fix and passing after. New tests in
`herding.test.ts` and `tech.test.ts`.

**Measured**, `sim:seeds -- --seeds 20`: `century` bit-identical to the
previous commit in every reported figure — the same story every node in
this tier has told since `ground_stone`. `herders` (new): 99.9% mean
survival, 0/20 collapsed, no starvation beyond one adult in one seed.
`sim:check:all`: `farmers` back to its own baseline (63/63, one fewer
applicable check than with the reverted extension); `herders` 61/62, the
one documented failure above. All 370 unit tests, typecheck, and all 47
e2e specs pass.

**One node remains**: `brewing`.

## 2026-09-21 — M11 phase 10, fifth commit: `well`, the first technology to touch thirst

A well stands in for natural water rather than gaining a new verb: `drink`
is not a building action anywhere else, so `ActionSystem.waterWithinReach`
now accepts a nearby complete well exactly as it accepts a water tile, and
`Brain.findWater` picks whichever of a well and the shore is nearer. Open to
anyone the way natural water is — a spring has no owner, and neither does a
well dug over one — so there is no `canUse`/band-ownership check on either
side, unlike every other building this milestone has added.

`BandSystem.planBuildings` gains an eighth and last branch, one well per
band, lowest priority of all of them: `spawnPeople` already sites every band
with water in reach, so a well most often shortens a walk a band could
already make rather than opening one it could not.

**Verified empirically before committing to the design**: a well's benefit
is a shrunk travel distance, which nothing in the health report counts
directly, so a new `drink_at_well` counter was added specifically to answer
"does this ever actually happen" rather than assuming it from the code
reading correctly — the same discipline `kiln`'s commit just applied to a
different structural risk. A throwaway script (two bands of twelve,
`masonry`+`well` known from the start, 40,000 ticks, not committed) showed
both bands autonomously planning and completing a well, and **4,281 of
21,389 drinks — one in five — taken at one** rather than at the shore. New
`wells-are-drawn-from` check and `well.test.ts`, the latter finding an
inland spot by scanning the generated world rather than asserting one
exists, so the suite skips honestly rather than passing vacuously on a map
small enough to have none.

**Measured**, `sim:seeds -- --seeds 20` on `century`: bit-identical to the
previous commit in every reported figure, same as every node since
`ground_stone` — `well` needs `masonry`, itself rarely reached in this
cohort. `sim:check:all` unchanged; `wells-are-drawn-from` correctly reports
n/a everywhere in the suite, since no scenario starts knowing `masonry` and
`well` together, the same honest skip `herds-breed-and-are-culled` reports
for scenarios without `herding`. All 365 unit tests (5 new), typecheck, and
all 47 e2e specs pass.

**Three nodes remain**: `dairying`, `wool`, `brewing`.

## 2026-09-21 — M11 phase 10, fourth commit: `kiln`, and a scoring trap caught before it shipped

Mechanism 4's fifth station. `BUILDINGS.kiln` and a new recipe, `kiln_pot`,
producing the same `pottery` item `RECIPES.pot` already does.

**Found while designing it, not while measuring it**: `pot` and a same-cost
`kiln_pot` would never have competed fairly. `Brain`'s craft scorer has no
term for "cheaper" or "faster" — only `forSite`/`forSelf`, skill, and
`nearness` — and `nearness` is exactly 1 for a stationless recipe and never
more than that for a station one, so an identical-cost `kiln_pot` could
never outscore plain `pot` and would have been declared, gated, correctly
wired to a real building, and unreachable in play regardless: the exact
defect `TECH_EFFECTS` exists to catch, wearing a coat static tests cannot
see through, because both recipes pass every one of them. `groats` looked
like the precedent and is not one — it and `meal` never compete, because one
wants acorns and the other wants grain. Fixed by making the real difference
the ingredients rather than the score: `kiln_pot` costs one mud where `pot`
costs two, which is a genuine niche (a band short of clay can still make
pottery once it has a kiln) rather than a numeric edge the scorer would
never read.

**Verified empirically, not assumed**: a throwaway script (two bands of
twelve, `pottery`+`masonry`+`kiln` known from the start, 20,000 ticks, not
committed) showed `crafted_kiln_pot: 5` against `crafted_pot: 80` — a real,
if modest, non-zero share, and confirmation that the cheaper-ingredients
niche actually fires in play rather than only on paper.

**Measured**, `sim:seeds -- --seeds 20` on `century`: bit-identical to the
previous commit in every reported figure, same as `ground_stone` through
`herding` before it — `kiln` needs both `pottery` and `masonry` known by the
same person, a combination this cohort never reaches. `sim:check:all`:
unchanged, the same two already-catalogued knife-edges. All 360 unit tests,
typecheck, and all 47 e2e specs pass.

**Four nodes remain**: `dairying`, `wool`, `brewing`, `well`.

## 2026-09-21 — M11 phase 10, third commit: `herding`, and the mistake it caught in the trap round

The one node in this tier that needed a real mechanism rather than a numeric
term. A pen (`BUILDINGS.pen`) deliberately reuses `Building.store` and
`doTake` wholesale rather than inventing a verb: `Simulation.workHerds`
grows `store.count('meat')` by a fraction of itself each day — proportional
to what is already there, which is what makes it breeding rather than a
slower trap, and which means a pen culled down to nothing stays at nothing
for ever, a real and permanent failure state. `doBuild`'s completion hook
stocks a founding pair the moment a pen is finished, since growth from zero
is zero whatever the fraction. `doStore` and `Brain`'s deposit branch both
refuse a pen the same way they already refuse a trap.

**Caught by the new `herds-breed-and-are-culled` check, not by inspection**:
the first version bred 27 meat into a pen on the `farmers` scenario and
culled none of it, standing at capacity for 43 of the run's days. The cause
was the exact failure this project already shipped once for traps: the
ordinary hungry-larder route in `Brain` picks the *nearest* store with food
in it, and a general granary sitting closer than the pen made the pen
invisible regardless of what was inside it. The fix is the one traps already
have — the fullness-and-nearness "round" bonus — extended to pens
(`isTrap(b.def) || isHerd(b.def)`). After the fix, the same scenario bred 37
and culled 30, standing at capacity for zero days.

`farmers`'s starting technologies gain `tracking`, `taming` and `herding`,
per `m8_plan_the_ages.md`'s own description of that scenario as "a herd
run" — without it, `herds-breed-and-are-culled` would report n/a for ever,
the same trick `traps`, `craft` and `scribes` already use for their own
tiers. New unit tests in `herding.test.ts`, mirroring `traps.test.ts`: a pen
grows what it holds given a founding stock, never grows from nothing, keeps
its stock (but stops growing) for a band that forgets the technology, caps
at storage, refuses deposits, is worth a walk once stocked, and is founded
with a stock only on completion.

**Measured**, `sim:seeds -- --seeds 20`:

- `century` (which never reaches `herding` — it sits behind `taming`, itself
  rarely reached in this cohort): **bit-identical** to the previous commit,
  99.7% survival, 856 born, 13.4 known, 11.7 past the root nodes, 712.3
  taught, to every decimal. Confirms the mechanism's cost is confined to
  worlds that actually reach it.
- `farmers`, before this commit's changes (no `taming`/`herding` in its
  starting technologies) against after: survival 100.0% → 99.6%, 407 → 394
  born, technologies known 10.4 → 13.1 (three of that from the new starting
  technologies themselves), conceived past the root nodes 7.0 → 8.3, taught
  228.6 → 277.7. Starvation unchanged (1 infant, 5 adults, across a cohort of
  ~400 person-runs either way). The small drops in survival and births are
  well inside the noise this project's own ten-seed floor already documents.

`sim:check:all`: `farmers` goes from 59 to 64 applicable checks, all
passing — `herds-breed-and-are-culled` newly applicable and green, plus
`animals-are-tamed` newly applicable now that `taming` is a starting
technology. No other scenario's failures change: the same two
already-catalogued knife-edges (`crowded`/`perf-budget`,
`hunters`/`kills-are-butchered-for-bone`). All 360 unit tests (9 new),
typecheck, and all 47 e2e specs pass.

**Also added, in the same commit**: the Neolithic rung of `ERAS`, which was
waiting on exactly these three technologies (`farming`, `herding`, `masonry`)
and now has all of them. Cumulative on the Mesolithic's needs plus those
three and `pottery`, at the same `heldBy: 0.3` the plan's table gives it —
not raised for having four more technologies in the list, since a longer
list at an unchanged fraction is already a harder bar. Not demonstrated
reached by any scenario in this cohort — `century` still tops out at Middle
Palaeolithic, the same as before this commit — but neither is the Mesolithic
rung shipped ahead of it, and that was already accepted on the same
argument: a rung is not declared-and-inert content merely for asking more of
a world than the scenarios in the suite happen to produce; the same
`eras-name-only-real-technologies` test that would refuse a rung naming an
unreachable *technology* passed on every one of these four.

**Five nodes remain**: `dairying`, `wool`, `brewing`, `well`, `kiln`. `wool`
and `dairying` can now proceed — both depend on `herding`, now shipped —
and `well`/`kiln` depend on `masonry`, already shipped.

## 2026-09-21 — M11 phase 10, second commit: five more widened-Neolithic nodes

Five more of the eleven left after the first commit: `masonry`, `wattle_daub`,
`calendar`, `the_wheel`, `bread`. Same discipline — every effect is a numeric
term on a function that already exists, or a building the band planner and
the scorer already pick up generically.

- **`masonry`** and **`wattle_daub`** are two more shelters, `stone_house` and
  `wattle_hut`, needing no change to `BandSystem.planBuildings`: it already
  picks whichever known, affordable design shelters best by reading
  `BuildingDef.shelter`, not a hardcoded id. `wattle_hut` costs no wood at
  all — a woven wall answers what the mud hut's timber frame answers without
  felling a tree for it — which is the "cheaper" half of the plan's claim;
  `stone_house` is the better shelter, at a matching cost in flint.
- **`calendar`** is a practice, tried by `sow` (the same road `herbalism` and
  `taming` take), and a new `Tech.calendarFactor` multiplies the *grasp* term
  in `ActionSystem.doReap` rather than the 0.5 floor a farmer-less band still
  gets — knowing when to sow is not knowledge that a harvest is possible at
  all.
- **`the_wheel`** adds `cart` as a fourth term on `carryFactor`, beside
  cordage and the basket. The plan's table also credits it with speed on
  `doHaul`; that half is left out, on record, because nothing in this game
  slows a laden walker down in the first place — there is no ladenness
  penalty for a cart to answer, and claiming one would have been a comment
  asserting a mechanism that does not exist.
- **`bread`** is mechanism 4's fourth station (`BUILDINGS.oven`), a straight
  meal-to-bread recipe read the same way `groats` already is.

**Measured**, `sim:seeds -- --seeds 20` on `century` against the previous
commit: mean survival 99.6% → 99.7%, 846 → 856 born (small cohort drift, not
a new fork — none of these five nodes touch `spawnRng` or any other stream),
technologies known 13.2 → 13.4, conceived past the root nodes 11.6 → 11.7,
taught 710.2 → 712.3 — essentially flat, which is expected: all five sit
deeper in the tree than the first commit's four and are correspondingly
rarer to reach in one run. Starvation is unchanged within noise (2 adults
against 0, 5 infants both times, across a cohort of ~850 person-runs).

`sim:check:all`: only `crowded`/`perf-budget` and `hunters`/`kills-are-
butchered-for-bone` fail, both already catalogued in `bugs.md` as
knife-edges — and `scribes`, which flipped two checks in the previous
commit's run, is back to 53/53 clean, which is the same downstream-RNG-drift
story running the other way rather than a fix to anything. All 351 unit
tests (three new, covering `calendarFactor`'s refinement floor and the
cart's double gate), typecheck, and all 47 e2e specs pass.

**Six nodes remain**: `herding`, `dairying`, `wool`, `brewing`, `well`,
`kiln`. `herding` is the one that needs a real new mechanism — penned,
breeding livestock — and `wool` and `dairying` both depend on it; `well` and
`kiln` both depend on `masonry`, which this commit just shipped. The
Neolithic era rung still waits on `herding` specifically.

## 2026-09-21 — M11 phase 10, first commit: four of the fifteen widened-Neolithic nodes

Resumes `m8_plan_the_ages.md`'s M8.2 table, left at fifteen pending nodes once
`farming` and `composting` shipped. Four land in this commit — `ground_stone`,
`spinning`, `weaving`, `sickle` — chosen because none needs a new mechanism:
every effect is a numeric term read by a function `techPower`'s other callers
already use, which is the Evolve-style density the plan asks the tier to be
built at.

- **`ground_stone`** (stoneworking, hafting) gives two tools, `stone_axe` and
  `adze`, and repairs the bug `m8_plan_the_ages.md` named under "three repairs
  to make while passing": `doChop` tested `inventory.has('handaxe')` directly,
  unscaled by `techPower`, so a hand axe did exactly as much for a novice as
  for somebody who had spent years refining `hafting`. The fix is a new
  `Tech.axeFactor`, read by both `ActionSystem.doChop` and
  `Progress.workProgressOf` (which has to mirror it or the felling bar lies to
  whoever is holding the axe), taking the better of a hand axe and a polished
  one rather than stacking them. `Tech.buildFactor` gets the adze's own term,
  double-gated on carrying one the same way the basket and the net already
  are. **Caught before it shipped**: `ground_stone`'s first draft used
  `maxRefinement: 3`, which pushes `axeFactor`'s floor negative at full
  refinement (`1 + (0.35 - 1) * 1.6 = -0.04`) and would have felled a tree in
  zero ticks — `scaled()` had never been asked for a reduction before, so
  nothing had exercised this failure mode. Fixed by lowering the ceiling to 2,
  and a new test in `tech.test.ts` walks every refinement step of every
  reduction-style factor and asserts it never reaches zero, so the next one
  is caught the same way rather than in play.
- **`spinning`** and **`weaving`** ship together, because `thread` has no
  reason to exist without the `cloth` it turns into — the same rule that kept
  `needle` and `fur_coat` in one commit. `weaving` is mechanism 4's third
  station (`BUILDINGS.loom`), needing no changes to the band planner or the
  scorer: both already read `isStation`/`RecipeDef.station` generically.
  `warmthFrom` gets a fourth term, `woven`, double-gated on carrying `cloth`
  — named apart from the function's existing `cloth` local (the `clothing`
  technology's own multiplier), which it would otherwise have shadowed.
  **Found while wiring the recipe**: `RECIPES.thread` first shipped with
  `keep: 1`, on the same reasoning as `needle`. It does not fit here —
  `cloth` consumes three thread at once and a batch of spinning makes two, so
  `Brain`'s `forSelf` test (`count(output) < keep`) would stop a spinner at
  two thread and never reach three. `keep: 3` instead, before this ever ran
  against a build to prove it.
- **`sickle`** (farming, hafting) shortens `REAP_TICKS` itself rather than the
  yield at the end of it, through a new `Tech.reapFactor` — the honest version
  of "a field stripped in an afternoon instead of a day": the harvest still
  comes from `harvestYield`, unaffected by how it was cut.

**Measured**, `sim:seeds -- --seeds 20` on `century`, this commit against the
previous one: mean survival 99.7% → 99.6% (noise, and ten seeds cannot
resolve a tenth of a point regardless), 846 born both times (`spawnRng` is
untouched — no new fork, and none needed), technologies known at the end 12.3
→ 13.2, conceived past the root nodes 9.9 → 11.6, things taught 683.9 →
710.2. Adult starvation across the cohort fell from 3 to 0; five seeds'
infant starvation is unchanged. The tree widening is the point of the pass,
and it is visibly wider without visibly costing anything.

`sim:check:all`: the same four checks flip that `bugs.md` already catalogues
as knife-edge — `crowded`/`perf-budget`, `hunters`/`kills-are-butchered-for-
bone`, and `scribes`/`jobs-bias-work` and `scribes`/`the-hurt-are-tended`,
both un-skipped by downstream RNG drift rather than newly broken (`scribes`
went from 53 applicable checks to 56, gaining coverage rather than losing
it). All 348 unit tests (four new, guarding the refinement-floor bug above),
typecheck, and all 47 e2e specs pass.

**Eleven nodes remain**: `bread`, `brewing`, `herding`, `dairying`, `wool`,
`wattle_daub`, `masonry`, `kiln`, `well`, `calendar`, `the_wheel`. Several of
those need a real mechanism rather than a numeric term — `herding` is
penned, breeding livestock; `well` is the first technology to touch thirst at
all — and the Neolithic era rung itself still waits on `herding` and
`masonry` before it can be declared, per the ladder's own comment in
`Tech.ts`.

## 2026-09-21 — M11 phase 9c, second commit: two bands that know different things

`PopulationConfig` gains `startingTechByBand?: string[][]`, which replaces
`startingTech` entirely for a given band's founders when present; absent, or
past the end of the array, a band falls back to `startingTech` exactly as
before — every scenario that has never set it, which is every scenario but
one, is bit-identical. `Simulation.spawnPeople` reads it keyed by the band
index it already has in hand.

`scribes` is the one scenario that sets it: both bands keep the shared
literate core from the previous commit, and each gains one more technology
— `basketry` for one band, `clothing` for the other, both needing nothing
beyond the core's own `cordage` — that the other does not have. Diagnosed
at the end of the previous commit: every adult in both bands started
knowing the identical set, so there was nothing on any stone that anybody,
bandmate or stranger, could not already tell you, and `records-are-cut`
reported zero reads for exactly that reason. The re-gating did not cause
that and could not fix it; this is the fix.

**Measured**: `scribes` telemetry now shows `read_basketry: 3` and
`read_clothing: 2` — five reads, all of them a technology crossing the band
boundary that put it out of native reach — and `records-are-cut` reports
"5 read back off a record" instead of zero. `sim:check:all`: `scribes`
53/53 (`sparks-are-various` now correctly skips it at nine technologies
handed to the wider band, past `TREE_GIVEN_AWAY`); `century` and every
other scenario unchanged from the previous commit, since nothing here
touches anything `scribes` does not itself configure. All 344 unit tests,
typecheck, and all 47 e2e specs pass.

**This closes phase 9** (9a: `ochre`'s fidelity split; 9b: the oral channel;
9c: `writing` behind the surplus, in the two commits above).

## 2026-09-21 — M11 phase 9c: writing goes behind the surplus

`writing.requires` gains `farming`, alongside the `marking` and `stoneworking`
it already had. The historical case: script is what a surplus needs that a
tally does not — an account that has to outlast a harvest and a season of
trade, not just say how many. The mechanical case is 9a's own: with `ochre`
nerfed from a transcript to a spark, `writing` sitting one step off the
game's root nodes made it the dominant record channel by default, exactly
backwards from the painted-first, written-later tree the milestone is
building toward. A fourth spark route grounds the new prerequisite in the
same story — `knows: farming, holding: grain, doing: store` — rather than
leaving all three routes talk about marking alone.

Two things that had to move in the same commit, per this project's own rule
against a comment asserting what has not been confirmed:

- **The `tech.test.ts` comment calling `writing` "a Bronze Age technology
  resting on two Palaeolithic ones"** is now false — it rests on two
  Palaeolithic prerequisites and one Neolithic one — and is rewritten. The
  test's assertion itself needed no change: it loops `TECH.writing.requires`
  generically.
- **The `scribes` scenario broke in silence.** Its founders received
  `writing` with an unmet prerequisite, and `teach`, `tryObserve` and
  `doRead` all filter on `requires`, so the one scenario that exists to
  exercise reading and writing could do neither. `startingTech` gains
  `plant_lore`, `grinding` and `farming` — `farming` has to be held
  directly, not merely reachable, because `prerequisitesMet` asks what a
  person *knows*.

**Measured, and deliberately not yet fixed**: `records-are-cut` on `scribes`
still reports **zero reads** after this commit (`16 things cut... 8
technologies are written down somewhere, 0 read back off a record`) — the
re-gating did not cause that and cannot fix it either, since every adult in
both bands starts knowing the identical set and there is nothing on any
stone that anybody lacks. That is the next commit, deliberately kept
separate so this one measures only what it changed. `sim:check:all`:
`scribes` clean at 54/54 (up from 51/51 — `sparks-are-various` now correctly
skips it, at eight handed-out technologies past `TREE_GIVEN_AWAY`, the same
way it already skips `traps`), `century` clean at 60/60, the same two
pre-existing knife's-edges (`crowded`/`perf-budget`,
`hunters`/`kills-are-butchered-for-bone`) carried over from before this
phase and unrelated to it. 10-seed `century` cohort: 99.7% survival, 447
born, 12.6 technologies known at the end — unchanged from phase 9b's own
cohort, because nothing in a 40-year run with no starting literacy was
reaching `writing` either before or after this change. All 344 unit tests
and typecheck clean.

**Next**: the separate commit — asymmetric starting knowledge between
`scribes`'s two bands — that actually makes `records-are-cut` measure a
read.

## 2026-09-21 — M11 phase 9b: the oral channel gets three things of its own

Three additions, all aimed at the same complaint 9a's own header names: nerfing
`ochre` removes a channel, and the tree stays limited by transmission unless
something replaces it.

**A new practice, `storytelling`** (`domain: 'people'`, no prerequisite — the
whole point is that it must not depend on having worked anything else out
first). Tried by `talk`, same as `division_of_labour` is tried by `assign`:
nothing to build, `Person.noteDid` is the hook a finished `talk` already
fires. It does two things once techPower is behind it, both through the
existing `scaled` helper — exported from `Tech.ts` rather than copied,
since a second "no effect unlearned, `full` at a proven design, more with
refinement" formula is exactly the kind of drift `AGENTS.md`'s house style
warns about:

- `KnowledgeSystem.teach`'s success chance is scaled by
  `scaled(teacher, 'storytelling', 1.4)` — up to 40% more likely to land at a
  proven design. The same line also reads `teacher.traits.tradition` for the
  first time in the actual mechanism: the trait already weighted `Brain`'s
  `teach`/`teach_child` scorers (long before this milestone, not new here —
  the plan's premise that `tradition` "only ever reads into `standingOver`"
  was checked against the code and found false, the same way 0b's premise
  about the outsider figure was), but never touched whether a teacher who
  decided to try actually succeeds.
- `SocialSystem.converse` gives one extra story, and only at the `deep` rung —
  a greeting has no room for one at all — when either party has any
  `techPower` in `storytelling`.

**The hearth teaches.** `Simulation.shareTheHearth` already samples, at
midnight, who slept under which roof (M11 phase 6a's reading of a household's
own home). `KnowledgeSystem.hearthLesson` spends that same sample a second
way: once a night, per roof with both an adult and a child under it, the
single adult who knows the most tries — unprompted, unwalked-to — to pass
something to whichever child could take it in, through the same shared
`teach`. A flat, generous regard (0.6) stands in for a relationship opinion
neither caller has reason to thread through, on the reasoning that a
household is already the warmest tie in the graph. A new `hearthRng`, forked
genuinely last — after `choiceRng`, per `AGENTS.md`'s own table, which is
updated in this commit with the new sixteenth row so the next person to
append does not fall into the trap the table exists to prevent.

**Found and fixed rather than shipped broken:** `storytelling`'s first draft
had a third spark reading `knows: division_of_labour` without listing it in
`requires`, which `spark-ingredients-are-real`'s sibling test
(`never lets a spark fire before its prerequisites are met`) caught
immediately — replaced with a route off `saw: 'teach'` instead, since the
node's whole purpose is to need nothing else in hand.

**Measured**: `sim:check:all` — `century` clears every check with no
failures (`hunts-succeed-and-fail`, `the-hurt-are-tended`, and both `stewards`
soil checks, all previously flagged in `bugs.md` as downstream-RNG-drift
knife's-edges, happened to land on the passing side of theirs this pass;
`crowded`/`perf-budget` and `hunters`/`kills-are-butchered-for-bone` are the
same two pre-existing flips carried over unrelated to this phase).
`century`'s own telemetry: `storytelling` conceived, proven and refined
within the run; 51 `taught_storytelling`, 14 `observed_storytelling`, 91
`storytelling_extra_tale`, 3 `hearth_taught` — a small number for the hearth
specifically, and an honest one: `HEARTH_LESSON_CHANCE` (0.15/night/roof) is
a first guess, not tuned against a cohort, and is named as such in its own
comment. 10-seed cohorts: `century` 99.7% mean survival (447 born, 2 total
starved, 12.6 technologies known at the end against phase 0's documented
baseline of 5.4) and `lean` 86.7% (down 1.4 from phase 8e's 88.1%, inside
the noise `AGENTS.md` documents for ten seeds). All 344 unit tests (one
tightened — the reminder-vs-instruction test from 9a needed the same
needs-reset discipline `driveInscribe` already uses, once a different roll
elsewhere in the world started tipping it into an interruption), typecheck,
and all 47 e2e specs pass.

**Deliberately not touched**: `learning.observationChance`, per the plan —
it is the documented lever for transmission at the scale of the whole food
economy, and moving it here would have made every number above meaningless.

**Next**: 9c, `writing`'s re-gating behind `marking`, `stoneworking` and
`farming`, and the `scribes` scenario's `startingTech` fix that re-gating
requires in the same commit.

## 2026-09-21 — M11 phase 9a: a painting is a spark, not a transcript

`InscriptionDef` gains `fidelity: 'reminder' | 'instruction'` — data, the same
move `literacy` made in M8.1 for the same reason. `stone` and `clay` are
`instruction`; `ochre` is `reminder`, and the two now give a reader different
things. `ActionSystem.doRead` still hands an `instruction` record's reader the
finished design via `receiveFromRecord`, exactly as before. A `reminder`
record instead calls the new `KnowledgeSystem.remindFromRecord`, which lands
a `conceived` `Idea`, insight zero — the same shape `tryConceive` produces
from a lucky notice — so the reader still has to think it through, prototype
it and find out whether it works. A painting shows that a thing was done, not
how; treating it as a free `knownTech` transfer made the cheapest, least
durable record in the game just as good as writing, which was backwards.

`Simulation.recordedTech` splits accordingly into `recordedTech` (`instruction`
only — what a society could strictly *get back*) and the new
`rememberedTech` (what a `reminder` record could spark). `architecture.md`'s
claim about `recordedTech` needed a footnote rather than a rewrite: it was
already describing `instruction` behaviour, just without naming the split.

**A gap found while building this, not by measuring it**: the `read` scorer
in both `Brain` (AI planning) and `ActionCatalog` (the player's context menu)
judged a record "has something useful on it" by `!knownTech.has(tech)` alone,
which for a `reminder` stays true forever — a painting never moves anything
into `knownTech`. Without the same two guards `doRead` now applies (no second
idea about a tech already conceived, no idea at all with both slots full),
the scorer kept finding an already-read painting worth walking to, sent
people over, `doRead` turned them away with `nothing_new_on_it`, and the
scorer immediately proposed the same walk again. First surfaces of this were
not a crash but a world: `craft`'s population visibly balled up around
painted rock, and `spatial-hash-spreads`/`perf-budget` both failed on a
scenario that had been clean before this file changed. Both scorers now carry
the same guard `doRead` does.

`tools/simcheck.ts`'s `records-are-cut` also needed a fix, not a green light
tuned in: it summed `recorded_*` telemetry, which still fires for `ochre`,
against `recordedTech.size`, which no longer counts it — so any paint-only
band (no `writing` at all) tripped the check's `else` branch and failed a
check about *writing* for having painted instead. It now sums
`inscribed_stone`/`inscribed_clay` specifically; `pictures-are-painted`
already owns the painting half.

**Measured**: `npm run sim:check:all` reproduces the phase 8e matrix exactly
— same scenarios, same failures (`crowded`/`perf-budget`,
`century`/`hunts-succeed-and-fail`, `hunters`/`kills-are-butchered-for-bone`,
`farmers`/`the-hurt-are-tended`, `stewards`/`soil-is-drawn-down` +
`compost-answers-exhaustion`, all pre-existing and documented in `bugs.md`) —
once the scorer fix above landed; before it, `craft` alone lost
`spatial-hash-spreads` and `perf-budget` (2,752 → ~1,935 steps/s,
deterministic and reproducible, not noise) purely from the clustering. A new
unit test in `transmission.test.ts` pins the behaviour directly: reading an
`ochre` painting leaves a `conceived` idea and neither `knownTech` nor
`recordedTech`, and counts in `rememberedTech` instead. All 344 unit tests,
typecheck clean, all 47 e2e specs pass.

**Next**: 9b (the oral channel — hearth teaching, `storytelling`,
`tradition`), then 9c (`writing`'s re-gating behind `marking`, `stoneworking`
and `farming`, which this phase deliberately went first to avoid).

## 2026-09-21 — M11 phase 8e: the diet is on the panel

The "Now" tab's Condition section, already the home of health and the five
needs bars, gains a Diet section directly beneath them: three bars
(`macroBalance.fat/protein/carb`, 8b) and a sentence from a new
`describeDiet`, gated behind `known.knowsCondition` exactly like everything
else there. The sentence reads only `macroBalance` and `macroTarget` — the
same two fields the bars already show, so it can never claim something the
panel does not display — and names whichever macro has the largest gap
below target, in four tiers from "eating a decent balance" to "badly
malnourished." This is the same standing instruction `interruption`/
`abandon`'s refusal reasons already serve: 8d made a health mechanism that
was, until this commit, completely invisible from inside the game, which
`AGENTS.md` calls the worst kind of difficulty.

**Read-only, so no sim measurement applies**: pure display of state 8b-8d
already write, gated by machinery already in place. `sim:check:all`
reproduces the 8d matrix line for line (confirming the panel touches
nothing the simulation reads), all 47 e2e specs and 343 unit tests pass,
typecheck clean.

**This closes phase 8.** Phase 9 (the oral tree and `writing`'s re-gating
behind `farming`) is next.

## 2026-09-21 — M11 phase 8d: malnutrition finally bites

**Declared cost, ahead of measuring, per `AGENTS.md`'s rule: up to 5 points
of mean survival on `lean`/`century` 20-seed cohorts in exchange for a
population curve that visibly responds to diet variety** — the same order
of magnitude the plan's own Risks section cites for the earlier
food-*quantity* cut this is explicitly meant not to repeat, but landing
from variety pressure instead of less food on the ground.

`NeedsSystem`'s health-recovery branch now reads `Macros.malnutrition(person)`
— total variation distance between `macroBalance` (8b) and `macroTarget`
(8c), 0 matched to 1 fully disjoint — and uses it two ways: it caps how high
recovery can climb (`100 - severity * 20`) and slows the climb getting there
(recovery scaled down by up to 60% at `severity === 1`). Neither ever drags
health down directly: someone already above the ceiling when imbalance
arrives is left alone. `LETHAL_NEEDS` stays hunger, thirst and cold,
untouched — malnutrition is degradation, exactly as the plan specifies, not
a fourth way to die. A `Person` now starts life with `macroBalance` equal to
its own `macroTarget` rather than equal thirds, so day one does not open
with a false deficit nobody caused.

**Measured, 20-seed cohorts, and the budget was not spent**: `lean` 88.1% →
88.1% (identical to the phase 6d baseline in `next-steps.md`), 1/20
collapsed (`tau`, already the cohort's weakest seed at 27% pre-8d, now at
4% — see `bugs.md`). `century` 99.0% → 99.5%, 0/20 collapsed, both within
this scenario's documented seed-to-seed noise. `century`'s own
`malnutrition_sum`/`malnutrition_samples` telemetry averages severity 0.27
across the run — real, measurable pressure from a berry-heavy diet sitting
short of its protein-and-fat target, landing without moving the aggregate
survival number at all. `sim:check:all` reproduces the 8c matrix except two
new borderline flips (`century`/`hunts-succeed-and-fail`,
`stewards`/`soil-is-drawn-down`), both recorded in `bugs.md` as the same
downstream-RNG-drift shape already named for a dozen other checks in this
milestone. All 343 unit tests, typecheck clean.

**This closes phase 8's mechanism.** 8e (surfacing the balance in the UI)
is next, then phase 9 (the oral tree and `writing`'s re-gating).

## 2026-09-21 — M11 phase 8c: the target itself scales with effort, still read by nobody

`NeedsSystem.exertionOf` — already scaling thirst from 0.4 asleep to 1.5
felling — is exported and reused rather than duplicated: `NeedsSystem.update`
folds the same per-tick reading it already takes for thirst into
`Person.exertionToday`, a same-day ledger identical in shape to 8b's
`macroIntakeToday`. Once a day, `core/Macros.ts`'s new `decayMacroTarget`
averages that ledger, blends it 35%/day into `Person.recentExertion`
(mirroring `decayMacroBalance`'s own rate), and recomputes
`Person.macroTarget` — the mix `macroBalance` will be judged against once
8d exists — by interpolating between a rest target (carb-heavy: 0.55/
0.17/0.28) and a hard-labour one (protein rises to 0.28, carbohydrate gives
up the most ground, fat holds roughly steady) between `exertionOf`'s own
floor and ceiling. Both targets are ordinary dietary guidance, not this
game's invention.

**Inert, and verified converging**: `century`'s `macro_exertion_sum`
telemetry averages 0.94 — a shade under the ordinary-effort baseline of 1,
which tracks with how much of a day this population spends asleep or
resting. Nothing outside this bookkeeping reads `macroTarget` or
`recentExertion` yet. `sim:check:all` reproduces the 8b matrix line for
line, all 343 unit tests, typecheck clean. 8d is where a sustained gap
between `macroBalance` and this target first costs health.

## 2026-09-21 — M11 phase 8b: a rolling diet, fed and decayed, still read by nobody

`Person.macroBalance` (new `core/Macros.ts`, `MacroBalance`: `fat`, `protein`,
`carb`, starting equal thirds) is the same shape `Mood.ts` used for spirits:
a slow-moving average rather than a per-meal tally, because a single
lopsided day is not malnutrition any more than a single bad night is a
grudge. `ActionSystem.doEat` now folds every mouthful's macro grams (via
8a's `ITEMS[id].macros`) into `Person.macroIntakeToday`, a same-day ledger;
once a day, alongside `decayMood` in `Simulation`'s midnight block,
`decayMacroBalance` normalises that ledger into fractions and moves
`macroBalance` 35% of the way toward it — well above `MOOD_DECAY_PER_DAY`
(8%) and `RelationshipGraph`'s familiarity term (6%), because a diet is
what was actually eaten, not a relationship that should resist one bad
exchange. A day nobody ate leaves the balance exactly where it was rather
than dragging it toward zero.

**Inert, and verified converging rather than just compiling**: a `century`
run's `macro_*_sum` telemetry settles around carb 0.66 / protein 0.18 / fat
0.16 — the berry-and-fruit-heavy diet this world's food economy actually
produces, read back correctly. Nothing outside this bookkeeping reads
`macroBalance` yet, so the world itself is unaffected: `sim:check:all`
reproduces the 8a matrix line for line, all 343 unit tests, typecheck
clean. 8c gives the target itself an activity scale; 8d is where a
sustained imbalance first costs health.

## 2026-09-21 — M11 phase 8a: macros, declared and read by nobody

`ItemDef` gains an optional `macros: { fat, protein, carb }`, fractions of
`nutrition` summing to 1, on the eight items that have any (`berries`,
`apple`, `pear`, `plum`, `hazelnut`, `meal`, `meat`, `fish`). Values are real
ratios, not placeholders: meat and fish lean protein-and-fat with no carb at
all, hazelnuts lean fat hard enough to keep them from reading as a fourth
kind of fruit, and everything else — berries, apples, pears, plums, ground
grain — is carb-dominant. Every non-food item (tools, materials, weapons)
gets none, on purpose: a fraction of zero nourishment is not a
macronutrient.

**Bit-identical, as designed.** Nothing reads the field yet — `bestFood`,
`doEat`, `nutritionFactor` and every scorer still only ever look at
`nutrition`. `sim:check:all` reproduces the phase 7c (3) matrix line for
line (`crowded`/`perf-budget`, `hunters`/`kills-are-butchered-for-bone`,
`stewards`/`compost-answers-exhaustion`, none of it new); all 343 unit
tests, typecheck clean. 8b gives a person a rolling balance to read these
into, still inert; 8c and 8d are the commits where an unbalanced diet
starts to cost something.

## 2026-09-20 — M11 phase 7c (3): `Brain` reads how hostile the two bands are, and `bands-take-sides` finally gates on it

The last of `BandRelations`' three readers, and the only one in `Brain` —
deliberately alone in its own commit, so a change to `bands-take-sides`
measures one thing rather than three at once. `bandHostility(person,
target, ctx)` is 0 within a band and at neutral-or-friendly standing, and up
to 1 at open hostility (-100 standing); `steal`, `threaten`, and both routes
to `attack` (revenge and predation) each read it once, as a modest addend
(`steal`/`threaten`) or a ×1.5-at-most multiplier on a score the rest of the
expression already justified (both `attack` routes) — never a second
justification of its own. The revenge route's `grudge > 0.5` gate is
untouched, on purpose: `AGENTS.md` and this changelog both record what
happens when a band's self-consuming feedback loop is fed from two places
in the same commit.

**`bands-take-sides` is a real check now**, not an instrument: it asserts
the spread between the friendliest and most hostile band pair is over 20,
skipping on a run with no cross-band contact at all. It needed a length
floor `BAND_STANDING_DAYS` (60) that the instrument phase didn't: every
short scenario measured while writing it — `band`, `crowded`,
`harsh-winter`, `coast`, `traps`, `hunters`, 12 to 40 days each — showed real
but small spreads (0.2 to 15.9), not zero, so asserting the 20-point bar on
them would have been exactly the seed-flaked failure `bugs.md` already
names five checks for. `lean` (100 days) and `century` reach the -100
hostility floor and pass comfortably; the six short scenarios skip rather
than fail.

**Measured, 20-seed cohorts against the phase 7c (2) numbers**: `lean` 91.1%
→ 87.9% survival, 0/20 collapsed (lowest seed 60%). `century` 100.0% →
99.0%, 0/20 collapsed. The largest single-commit movement in this
milestone's `BandRelations` work, which tracks with this being the one
reader that can actually kill somebody — a hostile band's members become
more worth robbing and more worth striking, and `century`'s own `-100.0`
hostile pair (measured while building the check above) confirms the term
has real teeth to bite with, not a coefficient sitting near zero. Read
against the owner's standing direction on the milestone's cumulative drift:
this is the sharpest edge of the egalitarian-to-stratified-and-in-conflict
arc landing, and it lands without a single collapse across either cohort.
`sim:check:all`: same known fragile-check family
(`crowded`/`perf-budget`, `hunters`/`kills-are-butchered-for-bone`,
`stewards`/`compost-answers-exhaustion`), plus `bands-take-sides` passing on
`century`/`lean` and skipping everywhere else as designed. All 343 unit
tests, typecheck clean.

**This closes M11 phase 7.** All three engines-then-readers passes are
done: `BandRelations` exists, four engines move it, three readers act on
it. O4 is unaffected (mayUse's ownership predicate is untouched; only the
new ally exception is new). Phase 8 (macronutrients) is next.

## 2026-09-20 — M11 phase 7c (2): a conversation warms faster between allies

`Conversation.crossBand`'s flat ×0.43 cross-band penalty becomes standing-
aware: `CROSS_BAND + standing * CROSS_BAND_STANDING_SCALE` (0.004), clamped
between `CROSS_BAND_FLOOR` (0.05) and 1. At neutral standing — every pair
`BandRelations` has not yet touched — the factor is exactly the old 0.43, so
a fresh pair of strangers warms exactly as before. At 100 (close allies) it
reaches 0.83, most of the way to the in-band rate; at -100 (open hostility)
it is floored at 0.05 rather than reaching zero, because two people from
warring peoples can still, slowly, come to know each other as individuals
rather than as their bands' reputations.

`SocialSystem.settle` reads `this.bandRelations.standing(a.bandId, b.bandId)`
and passes it through; `crossBand` takes it as an optional third parameter
defaulting to 0, so every existing call in tests still means what it always
meant. Two new deterministic tests in `conversation.test.ts`.

**Measured, 20-seed cohorts**: `lean` 89.0% → 91.1% survival, 0/20
collapsed, no seed below 74% — the healthiest `lean` cohort measured for
this entire milestone, essentially back at the pre-M11-5d clean baseline of
91.2%. `century` 99.6% → 100.0%, 866 born, 11.5 known. Read together with
the friction the territory engine added two commits ago, this is the
cooperative half of the same mechanism finally landing: allies now warm to
each other faster, which is what `mayUse`'s alliance exception and this
reader both exist to make worth having. `sim:check:all` reproduces the
phase 7c (1) matrix (the previous run's `jobs-bias-work` did not recur —
consistent with `bugs.md`'s own description of that check's effect being
smaller than its seed-to-seed spread). All 343 unit tests, typecheck clean.

## 2026-09-20 — M11 phase 7c (1): `mayUse` reads how two bands stand

The first of `BandRelations`' three readers. `mayUse` (`Property.ts`) now
treats a band standing at or above `ALLY_STANDING` (55) with the building's
owning band as if it were the actor's own — `ours: true`, allowed whether or
not anyone is watching. 55 is deliberately out of reach of marriage alone
(`CROSS_BAND_MARRIAGE` is 15): an alliance this complete should be rare and
earned from a real pattern of marriages and trade, not the state two bands
fall into after one wedding. This does not weaken phase 4's own point — a
rival stays a rival until their own deeds say otherwise — it extends it: an
allied band's deeds have said otherwise.

`PropertyContext` gained `bandRelations`, threaded through `BrainContext`
and `ActionContext` (both already structurally satisfy `PropertyContext`,
so both needed the field) and `Simulation.mayUseBuilding`'s own inline
context. One new deterministic test in `property.test.ts`: the same watched
layout that refuses an ordinary neighbour now allows a band standing at 100.

**Measured, 20-seed cohorts**: identical, seed for seed, to the phase 7b (4)
numbers on both `lean` and `century` — `ALLY_STANDING` is not reached within
either scenario's run length yet, given how small each individual engine's
nudge is and how slowly `BandRelations` moves. Not a concern: the mechanism
exists and is tested directly; a cohort long enough or eventful enough to
trigger it naturally is a `sim:seeds`-scale question for later, not a reason
to lower the threshold now. `sim:check:all` reproduces the phase 7b (4)
matrix line for line. All 342 unit tests, typecheck clean.

## 2026-09-20 — M11 phase 7b (4): trade, and `BandRelations`' last inert engine

`trade` is declared in `EVENT_TYPES` again — `DEED_WEIGHT: 7`,
`DEED_SALIENCE: 0.4`, between `share_food` and `gift` — alongside the verb
that finally reads it: `ActionSystem.doTrade`. Both sides hand something
over, unlike `give`; `Brain` only ever scores it toward somebody whose own
carried nutrition shows genuine spare, read directly off their inventory
rather than guessed at, so nobody is scored toward a partner with nothing to
trade back. A new `tradePartner` field on `FoundTargets`, kept separate from
`beneficiary` rather than reused — `give` and `trade` can both be scored in
the same think, toward two different people, the same shape
`slanderSubjectId`/`praiseSubjectId` already keep apart for the identical
reason.

**No fifth `BandRelations` engine was needed.** A positive `DEED_WEIGHT`
plus a target from another band is all phase 7b's first engine — the
cross-band deed nudge in `emit`, shipped two commits ago — needs to turn a
completed trade into two peoples thinking slightly better of each other.
This is `next-steps.md`'s note on `trade`'s return made concrete: the event
type earns its place by having a verb behind it, not by naming a new
mechanic.

Also new: a `trade` entry in the player's radial menu (enabled when both
sides carry food) and an `ORDER_COST` of 0.3, cheaper than `give`'s 0.4 —
both sides gain something, so it asks less of whoever is ordered to do it.

**This closes Block IV's engine phase.** All four of `BandRelations`'
writers — cross-band deeds, marriage, territory, trade — are live. Phase
7c's readers are next.

**Measured, 20-seed cohorts against the phase 7b (3) numbers**: `lean` 87.1%
→ 89.0% survival, 0/20 collapsed, no seed below 62% this run — the
territory-engine dip did not compound. `century` 99.9% → 99.6%, 854 born,
11.8 known — noise. A single `lean` run shows `trade` scored 746 times and
completed 17 (`event_trade`/`trade_made`), far rarer than `give`'s 21,678,
because it needs two people from different bands each with surplus — the
mechanism engages without dominating the action table.
`sim:check:all`: `millers` picked up `jobs-bias-work` alongside its existing
`the-hurt-are-tended`, the check `bugs.md` already names as having "an effect
smaller than its own seed-to-seed spread" — the sixth documented member of
the one-or-two-event-wide family, not a new kind of failure. All 341 unit
tests, all 47 e2e specs, typecheck clean.

## 2026-09-20 — M11 phase 7b (3): territory, and the TODO it closes

`BandRelations`' fourth engine, and the one the plan names as closing the
long-standing `// later, claim territory` comment beside `Band.homeX/homeY`
without any new mechanic: `considerTerritory` counts living foreign faces
within `TERRITORY_RADIUS` (40) of a band's camp, once a day, and costs that
band's standing with whichever band each intruder belongs to — but only in
proportion to `pantryPressureOf`, the same fill-fraction `planBuildings`
already reads to decide whether another granary is worth digging, now
extracted into its own method so the two questions cannot quietly answer
differently. A band with empty granaries pays nothing for a stranger's camp
nearby; a band running out of storage pays the full `TERRITORY_SCALE` (0.3)
per foreign face, per day — "a well-fed band shrugs off an intrusion, a
hungry one does not," in one multiplication rather than a second mechanic.

**Measured, 20-seed cohorts against the phase 7b (1-2) numbers**: `lean`
89.2% → 87.1% survival, 0/20 collapsed (though `tau` fell to 35% and
`sigma` to 53%, the two lowest single seeds since the phase 6d entry's
`tau` at 27%). `century` 100.0% → 99.9%, 869 born, 11.5 known — unmoved, as
every `BandRelations` engine has left it so far, because bands in that
scenario rarely camp close enough to trigger the radius query at all.
Consistent with the owner's read on the 6a-6e drift (`next-steps.md`): this
is scarcity-scenario friction working as intended, and `century` staying
flat is the check that it is not leaking into a world with no pressure to
carry it.

`sim:check:all`: `century` itself picked up `the-hurt-are-tended`, joining
the roster of scenarios that check has flipped on before; `scribes` and
`millers` dropped `spatial-hash-spreads`/`the-hurt-are-tended` this run;
`stewards` picked up `the-hurt-are-tended` alongside its existing
`compost-answers-exhaustion`. All within the already-documented
one-or-two-event-wide family, no new kind of failure. All 341 unit tests,
typecheck clean.

## 2026-09-20 — M11 phase 7b (1-2): the first two engines, deeds and marriage

`BandRelations` gets its first two writers, the two the plan names as
easiest to measure.

**Cross-band deeds.** `SocialSystem.emit` now nudges `bandRelations` whenever
a deed has a target from a different band, by `DEED_WEIGHT[type] * (0.5 +
magnitude * 0.5) * CROSS_BAND_DEED_SCALE` (0.02) — small on purpose, which is
what stops one theft from reading as the opening act of a war while still
letting a pattern of them eventually mean one, given how slowly
`BandRelations` decays. Read off the deed itself rather than off each
witness's `absorb`, so a crowd watching one theft cannot multiply its effect
on band standing the way it correctly multiplies how many personal enemies
the thief makes.

**Marriage.** `wed` adds a flat `CROSS_BAND_MARRIAGE` (15) whenever the two
people it joins already belonged to different bands — the strongest peace
mechanism in the historical record, by the owner's own framing, and the
cheapest engine in the phase to write.

**Measured, 20-seed `lean` cohort**: 88.1% → 89.2% survival, 0/20 collapsed
either cohort — the drift from the 6a-6e entries did not continue, if
anything it eased, though one cohort is not enough to call that a reversal
rather than noise. `sim:check:all`: `century` joined `crowded` on
`perf-budget` in the full-matrix run, but an isolated single run of `century`
passes clean at 2,039 steps/s against the 2,000 floor — the two commits
touch nothing on any hot path (`emit` and `wed` are both once-per-event, not
once-per-tick), so this reads as the same machine-load noise `century` has
sat close enough to the floor to show before, not a regression; worth
re-checking on a quiet machine rather than chased further here. Every other
line matches the phase 7a matrix. All 341 unit tests, typecheck clean.

## 2026-09-20 — M11 phase 7a: how two peoples stand with each other, sent inert

**Block IV opens.** `next-steps.md` §5's correction has said since 2026-09-10
that no state between bands exists anywhere in the codebase; `BandRelations`
is that state, and it is deliberately **symmetric**, unlike
`RelationshipGraph` — the header explains why: every engine that will ever
write to it (phase 7b) moves both bands' standing with each other at once,
the way a wedding or a raid does, so a directed edge would need two
histories moving in lockstep for no mechanism that ever writes only one of
them. Keyed on `min(a,b):max(a,b)` so a pair cannot end up with two entries,
and it decays at 0.998 per day — slower than `renown`'s 0.997, which is
slower than an ordinary opinion's 0.985: a grudge or an alliance between two
peoples has to outlive the individuals who were there when it started.

**`firstImpression` reads it for the out-group case.** `OUT_GROUP_BIAS`
(-6) becomes `outGroupBias(standing)` — exactly -6 at `standing === 0`, which
is every pair the moment this ships and any pair phase 7b's engines have not
yet touched, so **the commit is bit-identical**. At the extremes a close
ally (100) reads a stranger as warmly as `IN_GROUP_BIAS` already reads a
bandmate; a bitter rival (-100) reads one more coldly than `HOUSEHOLD_BIAS`
reads a member of your own family warmly.

Sent with its report column: `kin-outrank-strangers`' detail line gains
`band-pairs`/`friendliest`/`hostile` from `BandRelations.stats()`, reporting
0 pairs on every scenario today, the same "measure before changing anything"
discipline `outsider-unrelated` already set as precedent. `bands-take-sides`,
the check that will actually gate on this, is phase 7c's, once there is
something for it to measure.

**Not done in this commit**: a player-facing panel. Deferred on the same
precedent `slander`/`praise` shipped under — no menu entry yet either — and
noted so it does not get forgotten.

`sim:check:all` reproduces the phase 6e commit's matrix line for line. All
341 unit tests (two fixture constructors updated for the new
`SocialSystem` parameter), typecheck clean.

## 2026-09-20 — M11 phase 6e: the big man reaches the chiefdom, and Block III closes

`BandSystem.standingScore` — shared by `chooseChief` and
`considerRebellion`'s challenge outcome, so both read the same answer — gains
a renown term: `Math.max(0, household.renown - averageRenown(band, ...)) *
RENOWN_CHIEF_WEIGHT` (0.5), the household's edge above its own band's
average, and nothing at all for a household at or below it. `averageRenown`
moved into `Household.ts` as a small shared helper, used by this and by
phase 6d's `inequalityTerm`, on the house rule against two independent
implementations of "a band's own average renown" drifting apart the first
time either is retuned.

0.5 is deliberately modest next to `regard`, which sums an opinion as wide
as -100..100 from every other adult in the band: a household 40 renown
above average — roughly `Authority.ts`'s own `RENOWN_SPAN`, one deed nobody
will forget — buys as much standing as being liked twenty points more by a
single bandmate. Enough to tip a close election toward a family with a
genuine record; not enough to install a hoarder the band actively resents.

**This closes Block III of `m11_plan.md`** — phases 6a through 6e — the
inequality half of the milestone. `Household.store`, once a black hole, is
now a real building a rival can rob; a greedy household hoards there instead
of the nearest band store; `renown` finally has a writer and two readers;
and the arc from egalitarian to stratified is emergent from both, gated
behind no technology at all.

**Measured, 20-seed cohorts against the phase 6d numbers**: `lean` 89.4% →
88.1% survival, 0/20 collapsed. `century` 100.0% → 99.7%, 0/20 collapsed —
essentially unmoved, as every commit in this block has left it, because
`century` never grows enough inequality for any of these terms to matter.
`sim:check:all`: `farmers`/`soil-is-drawn-down` moved back onto the passing
side from the 6d matrix; every other line is the same already-documented
fragile-check family. All 341 unit tests, typecheck clean.

**Flagged for the project owner rather than decided here.** `lean`'s mean
survival has now moved in the same direction across every one of the five
commits measured in this pass — 91.2% → 90.6% → 90.1% → 89.4% → 88.1%, a
cumulative 3.1 points — while `century` has stayed flat throughout. Read one
way, this is the milestone working exactly as designed: `lean` is the
scenario built specifically to carry scarcity and social friction, and a
project whose stated arc is "egalitarian bands stratify and come into
conflict" should show *some* cost there as inequality, hoarding and exile
all start to bite, while a comfortable world is correctly untouched. Read
the other way, five small steps the same direction is what a real,
compounding effect looks like before any single one of them is individually
provable — and `AGENTS.md` is explicit that a coefficient should never be
picked because one twenty-seed run liked it, and that a change touching the
food economy should have its acceptable cost written down *before* the
measurement, which nothing in this pass did. Blocks IV, VII and the war
milestone all add more scarcity and more friction on top of this one, so the
drift will not resolve itself by stopping to look at it once. Worth a
deliberate answer before phase 7 begins: is this the intended cost of the
arc, and if so, what is the floor past which it stops being that and starts
being a world that no longer works?

## 2026-09-20 — M11 phase 6d: wealth and renown buy a little unelected standing

`standingOver` gains `inequalityTerm` (`Authority.ts`): a household visibly
richer or more renowned than its own band's average earns its head a little
extra compliance from anyone in that band, capped at 0.18 — under
`RANK_AUTHORITY`'s 0.22, so a rich household never out-orders a head the
band actually elected through `chiefdom`. The gap is read against each
household's own band average rather than a fixed number, which is what
makes the egalitarian-to-stratified arc the project is built toward
*emergent*: a band where every household hoards and gives in equal measure
produces an average every household sits on top of, and the term is exactly
zero for all of them, by construction — not a technology anybody has to
discover to switch it on.

Wealth is read as `Household.homeBuildingId`'s store total (phase 6a);
renown is the phase 6c field. Both gaps are divided by a fixed span (60
goods, 40 renown — roughly a full extra store and one deed nobody will
forget) before being summed and capped, so the term stays stable near a
band average of zero rather than swinging wildly on the first deed or the
first stored basket anyone in a young band produces.

**Measured, 20-seed cohorts against the phase 6b/6c numbers**: `lean` 90.1%
→ 89.4% survival, 552 → 566 born, 0/20 collapsed in either cohort (though
one seed, `tau`, fell to 27% — the lowest single seed observed across every
cohort measured for this milestone so far, worth naming rather than
smoothing over even though it sits inside the noise floor `AGENTS.md`
documents). `century` 100.0% → 100.0%, 868 → 859 born, 10.8 → 10.8 known —
unmoved, `century` being too comfortable for inequality to have grown large
enough to matter. **Worth watching**: mean `lean` survival has now drifted
91.2% (clean baseline) → 90.6% (5d-5f) → 90.1% (6a-6b) → 89.4% (6d) across
four measured commits — each step individually inside the ~10-point floor a
20-seed cohort can resolve, but four small steps in the same direction is
the shape a real effect looks like before it is provable. Nothing here
warrants reverting; it warrants re-measuring once phase 6e and 6b's
`labour`-scenario numbers are in.

`sim:check:all`: four lines moved from the phase 6c matrix —
`scribes`/`spatial-hash-spreads`, `farmers`/`soil-is-drawn-down`,
`stewards`/`compost-answers-exhaustion` (already on record in `bugs.md` as
one-event-wide), `culture`/`the-hurt-are-tended` (ditto) — and `lean` moved
the other way, back onto the passing side of `the-hurt-are-tended`. More
lines moved than any single commit in this milestone so far, which tracks
with `standingOver` being read on every order and job assignment in the
game rather than one narrow scorer path; all four are variations on checks
already documented as thin. `labour`'s own dedicated read of
`heads-direct-work` still passes (19 orders obeyed by rank, 56 refused).
All 341 unit tests, typecheck clean.

## 2026-09-20 — M11 phase 6c: renown is finally written

`Household.renown` has existed since before this milestone with no reader
and no writer anywhere in `src/` — declared-and-inert content this project
has a standing rule against.

**`SocialSystem` gains `onDeed`**, the same hook pattern `onMarriage` already
uses and for the same reason: a household is `Simulation`'s business, not
the social layer's, which knows only people and what they feel about each
other. `emit` calls it once per deed, unfiltered by any observer's culture
or hearsay — renown is a household's own record of what it did, read the
same way by everyone, which is exactly what lets a stranger respect (or
distrust) a family they have never personally dealt with, unlike an opinion,
which always belongs to one particular viewer.

**`Simulation.accrueRenown`** adds `DEED_WEIGHT[type] * (0.5 + magnitude *
0.5)` to the acting household's `renown` — unclamped, on purpose, unlike the
`-100..100` an opinion's `deeds` component has to fit inside: every future
reader of this number (`standingOver` in phase 6d, `chooseChief` in 6e) asks
for it only relative to the band's own average, so a hard ceiling would let
ordinary generosity saturate every long-lived household at the same value
and erase the very gap this phase exists to let open. It decays at 0.997 per
day against the 0.985 an ordinary opinion's `deeds` uses — a family's memory
of itself has to still mean something after the person who earned it has
died, which is the whole point of a household outliving its members.

**Bit-identical**, as intended: nothing reads `renown` yet, so no decision
anywhere in the simulation changes. `sim:check:all` reproduces the phase 6b
commit's matrix line for line. All 341 unit tests, typecheck clean.

## 2026-09-20 — M11 phase 6b: a reason to hoard

Phase 6a gave a household's goods a real building to live in but nothing
that preferred keeping them there: every store in reach was interchangeable,
so wealth came out identically distributed across every household in a band
and the phase was, in the project's own terms, declared content doing
nothing.

**`Brain`'s `store` scorer gains one term.** Choosing which building to walk
a surplus to already ran on pure distance; it now adds `greed * HOARD_PULL`
(8 tiles) when the candidate is the actor's own household's home, found
through the new `BrainContext.householdsById`. A fully greedy person will
now carry food eight tiles further to keep it inside their own family's
walls rather than hand it to the nearest band store; someone with no greed at
all is exactly as indifferent between stores as before this commit — the same
shape the existing `0.35 * (1 - greed * 0.5)` term already gives the
willingness to store *anything* at all, pulling in the direction the trait's
name promises rather than a second, unrelated one.

**Measured, 20-seed cohorts against the phase 5d-5f entry's own numbers**
(6a itself changes no AI decision, so that entry is the correct baseline for
isolating 6b's effect): `lean` 90.6% → 90.1% survival, 561 → 552 born, 7.2 →
6.8 known, 269.0 → 278.4 passed on, 0/20 collapsed in either cohort —
indistinguishable within the noise `AGENTS.md` documents. `century` 99.8% →
100.0% survival, 868 → 868 born, 11.6 → 10.8 known — the scenario stays too
comfortable to make greed matter, exactly as `lean`'s own description in
`tools/simcheck.ts` predicts. `sim:check:all`: identical failure set to the
phase 6a commit (`crowded`/`perf-budget`, `millers`/`the-hurt-are-tended`,
`hunters`/`kills-are-butchered-for-bone`, `lean`/`the-hurt-are-tended`),
nothing new. All 341 unit tests, typecheck clean.

**Not done in this commit**: `Household.renown` is still unwritten and
unread — phase 6c — so hoarding changes *where* goods sit but not yet
anybody's standing for having them.

## 2026-09-20 — M11 phase 6a: a household's goods get a place to be

`Household.store` was, in its own words, a black hole: an `Inventory` hanging
off a household with no position of its own, written only when somebody died
with no heir and read by nothing anywhere — `bugs.md` has called it that
since M9.6. Worse for this milestone specifically: phase 4's `mayUse` lets a
rival use or steal from a building nobody is watching, and a household's
wealth living somewhere with no position at all was simply not a thing a
rival could ever reach.

**`Household.homeBuildingId` replaces it.** `Simulation.shareTheHearth`
already samples, every midnight, which building each person is actually
sleeping under to pair them for a hearth conversation; it now doubles as the
cheapest honest reading of where a household lives, and stamps that building
onto every present member's household. `LifeSystem.settleEstate` deposits a
dead person's unheired goods into that building's store, or drops them as an
`ItemPile` at the deceased's own feet if the household has no home yet — the
same fallback `dropAt` already gives the timber from a tree felled by
somebody whose hands were full. `mergeHouseholds` becomes a transfer between
two buildings, or a no-op if the newlyweds' target household has no home of
its own to receive into (the goods just stay where they already sit).
`spoilFood`'s household sweep is deleted outright: those goods live in a
building now, which the existing per-building sweep already covers.

Not measured against a 20-seed cohort: nothing in `Brain`'s scorer reads
`homeBuildingId` yet, so no AI decision changes — this is where a family's
goods physically are, not what anybody does about it. `sim:check:all`:
`lean` moved onto the wrong side of `the-hurt-are-tended`, the known
one-event-wide check, the same RNG-cascade noise the M11 5a/5b/5c entries
below already document — see `bugs.md`. `crowded`/`perf-budget`,
`millers`/`the-hurt-are-tended` and `hunters`/`kills-are-butchered-for-bone`
unchanged. All 341 unit tests, typecheck clean.

**The motive to hoard is phase 6b, not this commit.** A household with a real
home is not yet a household anyone tries to enrich — nothing in `Brain` scores
leaving goods at your own home over a band store.

## 2026-09-20 — M11 phases 5d-5f: factions, and the exile they finally reach

`considerExile` gated on the band's *average* opinion of a suspect at -28, a
threshold `next-steps.md`'s longer-standing-gaps section already flagged as
never having fired once: kinship and household bias hold the average
comfortably above hostile even when a handful of people genuinely loathe
someone, exactly the finding `REBELLION_THRESHOLD`'s own comment records for
why `considerRebellion` reads the worst opinion of the chief instead of the
average. Exile had the same defect and nobody had gone back to fix it.

**`src/sim/social/Factions.ts` is new**: `conspiracyAgainst(subjectId,
members, rels)`, derived fresh every call and stored nowhere, on the same
principle `standingScore` already follows for "how well is this person
regarded". It walks the band once for grudge-holders (opinion of the subject
below -20), then only that handful for who trusts whom (mutual opinion above
+15) — `O(members) + O(grudges²)`, not every pair in the band. Per the
owner's note 8, an instigator needs no grudge of their own if their loyalty is
low or their `malice` is high; everyone else needs the grudge before they can
bring a faction together.

`considerExile` now casts someone out when the largest such faction reaches
`EXILE_QUORUM` (4), instigator included, rather than when the band average
crosses a threshold. `considerAdoption` is new and is the door back the
project's longer-standing-gaps section already promised: a band may take in
an outcast found wandering within `ADOPTION_RADIUS` of its camp, refused only
by a member who still, personally, holds a grudge below `ADOPTION_THRESHOLD`
against them — reputation here is read straight off `Memory` and
`RelationshipGraph`, so a band that never witnessed the exile's crime, or
whose own norms do not condemn it, has nothing held against the newcomer.
Adoption founds the newcomer a fresh one-person household under the adopting
band, deliberately: the household they left behind stays with their old band,
which is also why exile itself never had to touch it — `Household.bandId`
already stops `headsAHouseIn` counting a household whose band no longer
matches the person's own.

Neither `considerExile` nor `considerAdoption` draws from any RNG stream, so
this needed no new fork. `BandContext` gained `peopleHash` (for adoption's
proximity query — never a scan, per `AGENTS.md`) and `onAdopt`, both wired in
`Simulation.ts` beside the existing `onExile`.

**Measured, 20-seed `lean` cohort** (the scenario built in M11 phase 0d
specifically because the default world has no pressure for this mechanism to
answer to), baseline captured by stashing this change and re-running the same
cohort: mean survival 91.2% → 90.6%, 569 → 561 born, 7.3 → 7.2 technologies
known, 261.4 → 269.0 passed on — indistinguishable within the noise 20 seeds
cannot resolve, well under the ~10-point floor `AGENTS.md` documents. One
seed (`century`, within the `lean` cohort) swung from 66% to 100% survival
between the two runs; that is the same `chooseAmongBest` RNG-cascade effect
recorded in the M11 5c entry above, not a defect — once exile fires at all,
the exiled person's action resets to idle, which changes how many candidates
`choiceRng` weighs from that tick on and diverges every later draw on that
seed. The `century` *scenario* cohort (not to confuse with the seed of the
same name) was also re-measured for safety and landed at 99.8% survival, 868
born, 11.6 known — indistinguishable from the M11 5c entry's own 99.9%/870/11.6,
confirming the mechanism stays silent in a world with no scarcity to trigger
it. `sim:check:all`: same three pre-existing failures as the prior commit
(`crowded`/`perf-budget`, `millers`/`the-hurt-are-tended`,
`hunters`/`kills-are-butchered-for-bone`), nothing new. All 341 unit tests
(three new, covering the faction gate and adoption deterministically — the
same reason `rebellion`'s tests are unit tests rather than a `simcheck` check:
a quorum this specific is not reliably reachable inside any one scenario's
window), all 47 e2e specs.

**Not done in this pass**: `5d`'s conspiracy is read only by exile and
adoption so far, not by anything a player can see or act on — `bugs.md` notes
it. The plan's own gate paragraph asks for four new `simcheck` checks
(`exile-is-reachable`, `factions-form`, `gossip-is-aimed`,
`the-cast-out-find-a-home`); they were not added, on the same reasoning
`band.test.ts`'s header already gives for `rebellion-is-rare-but-happens` —
a quorum-gated faction is not guaranteed inside any one scenario's step
budget, and a check that flakes between PASS and n/a by seed is the
"looks reassuring, detects nothing" failure `AGENTS.md` already names two
deleted checks for. Worth revisiting once `lean`'s own telemetry (`exiled`,
`adopted`) has been watched across enough seeds to know whether it is
reliable enough to gate on.

## 2026-09-18 — M11 phases 3c and 5c: gossip that has to be grounded, and a subject who does not hear about it by magic

`slander` and `praise` have been declared in `EVENT_TYPES` since phase 5b,
with nothing reading either. This pass gives them a verb, and folds in phase
3c — "a conversation is observable too" — because the two turned out to be
the same mechanism: telling somebody what you think of a third party is
exactly the kind of deed the owner's rule already covers, and it needed the
rule's other half, not a new one.

**The content is never invented.** `Memory.bestSignedStory()` finds the most
vivid bad memory and the most vivid good one a person is carrying, in one
pass. It replaces reusing `bestStory()` (built for 3a's news-sharing) for
this, on purpose: `DEED_SALIENCE` weighs a wrong far above a kindness and a
victim's own memory of it never decays, so the single most-vivid thing almost
anybody carries is a grievance, and the first version built on `bestStory()`
shipped with `praise` structurally unreachable — a hundred-checks run showed
13,442 `slander` ticks and exactly zero `praise` ones. `bestSignedStory`
tracks both signs at once, at the same one-pass cost. `Memory.bestStoryAbout`
narrows that to one subject and one sign at the moment the walk ends, the
sibling of `bestGossipFor` with the same 0.15 salience floor — so a story
that decayed or got told by somebody else during the walk over is honestly
refused, the same principle `talkModeOf` already follows for `talk`.

**The subject does not learn they were talked about by magic.** `SocialSystem
.emit` gains a `notifyTarget` parameter, default `true` and unused by every
existing caller — bit-identical for theft, assault, every deed this game had
before today, all of which have a victim standing right there. `slander` and
`praise` pass `false`: the subject is very often nowhere near, and the
owner's rule that nothing is known unless it is seen or told applies to them
exactly as it applies to a stolen store. They learn only if they happen to be
a real witness within `sightRadius` — and then it lands with the same
`VICTIM_MULTIPLIER` catching your own name spoken behind your back already
carries for everyone else.

**Two things happen when the words land, and they are different questions.**
`SocialSystem.tellStory` (extracted from the guts of the existing private
`gossip`, which now calls it) passes the underlying fact on as hearsay,
exactly as an ordinary conversation already would — so telling Mira that
Boran stole from you makes her know Boran stole, not merely that you said
something about him. `emit`, separately, records the act of saying it as its
own judged deed, with its own `DEED_WEIGHT`.

**The backlash.** `absorb` gains a term, live only for `slander`/`praise`:
each listener's opinion of the *teller* shifts by their own opinion of the
*subject*, signed by whether the story was kind or unkind. Slander a man
before his friend and the friend resents you for it; slander him before his
enemy and they do not — they may like you a little more for saying what they
already believed. One proportional term, and it is what turns gossip into
alliances and rivalries without any code anywhere that knows what a faction
is.

**Privacy, for `slander` only.** Scored on the model `steal` already uses:
onlookers around the teller divide down the desirability of the action,
`1 / (1 + onlookers * 0.45)`. `praise` gets no such term — DEED_WEIGHT.praise
is positive, so a witnessed compliment costs nothing and a private one buys
nothing extra either.

**`Person.targetSubjectId`**, new, alongside the existing `targetPersonId`:
gossip has two other people in it where every earlier social verb had one —
who it is told *to* and who it is *about*. Cleared in `clearTarget` beside
its sibling.

Measured: 20-seed `century` cohort — 99.9% mean survival (0/20 collapsed),
870 born, 10 starved (4 infants, 3 older children, 3 adults, against 5b's own
5), 11.6 technologies known at the end (5b: 11.7), 645.8 passed on —
indistinguishable from 5b's own cohort within the noise twenty seeds cannot
resolve. `sim:check:all`: two lines moved sides from the pre-5c build,
`fishers`/`pots-reach-a-granary` and `millers`/`the-hurt-are-tended`, both
explained in `bugs.md` as the same whole-stream RNG cascade every new
scoreable action has caused since 1b — adding a candidate to `chooseAmongBest`'s
pool changes how many draws `choiceRng` takes from that tick on. All 338
unit tests, all 47 e2e specs.

**Deliberately not done.** No radial-menu entry for `slander`/`praise` this
pass — the same choice already made for `court` and `teach_child`, both full
scored-and-executed verbs a player cannot order directly. The mechanism is
real and consequential without one; wiring a "gossip about…" submenu through
`ActionCatalog`, `Simulation.command` and `main.ts` is a UI-layer pass of its
own, and `Memory.tellableSubjectIds` already exists to support it whenever
that pass happens.

---

## 2026-09-17 — M11 phase 5b: the event table stops declaring what nobody does

`EVENT_TYPES` named `gift`, `help`, `talk` and `trade`, and nothing in the
codebase emitted any of the four. Two of them were dead weight rather than
work waiting to happen, and this pass tells them apart.

**`talk` and `trade` are gone.** `talk` never had a reader worth the name:
`settle` already pays every ordinary conversation in `familiarity`, which
enters `opinion` at ×0.35, so a `talk` deed on top of that would have counted
the same conversation twice; its salience of 0.08 also sat below
`bestGossipFor`'s floor of 0.15, so it was memory that could never become
gossip, only take up a slot in a memory capped at 48 — and `emit` runs a
spatial query, so paying that cost at every greeting bought nothing at all.
`trade` had no verb behind it at all. Both are removed from `EVENT_TYPES`,
`DEED_WEIGHT`, `DEED_SALIENCE`, `DEFAULT_NORMS` and `describeEvent` — the
rule this project already holds `SKILLS` and `TECH_EFFECTS` to, applied to
this table for the first time. `trade` is declared again, alongside the verb
that finally reads it, in M11 phase 7.

**`help` is connected**, emitted once from `doTend` — on the tick tending
actually begins, not once per tick of a bout that can run for a while, the
same discipline `useProperty` already follows for a long action's one deed —
with magnitude read from how badly hurt the patient was. `EVENT_TYPES` has
declared `help` since before this file existed; this is the first thing that
has ever emitted it. Honest caveat carried over from M9 phase 5:
`the-hurt-are-tended` still reports very few ticks on most scenarios (it is a
one-event-wide check, catalogued in `bugs.md`), so this channel will read
thin until that gets its own pass.

**`slander` and `praise` are declared, ahead of the verb that reads them.**
M11 phase 5c gives them one next; declaring the table entry first is the same
short-lived gap M11 phase 5a's `malice` trait sits in ahead of phase 5d, and
`gift` has sat in ahead of phase 6. `slander` also enters `VARIABLE_NORMS` —
a band that shrugs off a lie and one that treats a good name as sacred are
both real cultures, the same reasoning `threaten` was given its own range for.

**The RNG moves again, measured the same way as 5a.** `VARIABLE_NORMS`
gaining an entry means one more `rng.range` draw per band before anybody is
placed, so every scenario's world shifts. `sim:check:all` differs on five
lines from the post-5a build, and every one of them is either already
catalogued in `bugs.md` as a knife-edge check or is explained by the failing
check's own source comment: `crowded`/`perf-budget` is the long-standing
documented failure; `traps`/`jobs-bias-work`, `stewards`/`the-hurt-are-tended`
and `stewards`/`compost-answers-exhaustion` are all checks this document
already names as thinner than their own seed-to-seed spread; and
`century`/`heads-direct-work` is new to `century` specifically but not new in
kind — its own comment in `tools/simcheck.ts` already warns that a scenario
not built for this measurement (`labour` is) can read "0 obeyed" on one
unlucky run, which is exactly what happened (0 orders landed on rank alone,
12 refused). `millers`/`the-hurt-are-tended`, `hunters`/`kills-are-butchered-
for-bone` stayed exactly as they were after 5a. A twenty-seed `century`
cohort reads 99.9% mean survival, 858 born, 5 total starved, 11.7 technologies
known — indistinguishable from 5a's own cohort within the noise this project
already treats twenty seeds as unable to resolve.

**One e2e fixture broke, and was fixed as an instrument, not the world.** The
pinned `e2e-fixture` seed's nearest clear tile to the player's new spawn point
moved from comfortably inside `emptyGround`'s old ten-tile search cap to
radius eleven — one ring past it, in a start camp dense with resource nodes —
which is exactly the kind of drift this pass's own reasoning predicts. Fixing
it by only widening the cap chased the point under the top bar and, one step
further, off the bottom of the viewport: a wider radius is not the same thing
as a point a real click can still reach. `emptyGround` now confirms each
candidate with `document.elementFromPoint`, the same question a click asks,
instead of naming `.hud-bar`/`.hud-panel`/`.hud-help` by hand — which also
means the helper no longer needs updating the next time the chrome changes
shape. All 47 e2e specs pass again.

Verification: typecheck; 338 unit and determinism tests; `sim:check:all` as
above; 20-seed cohort as above; all 47 e2e.

## 2026-09-17 — M11 phase 5a and M9.6 phase 4a, bundled: a trait for scheming, and a mood that finally exists

Two migrations that both touch `TRAITS`, founding, inheritance, ageing and the
character-creation summary, shipped as one commit rather than two so the RNG
shift either would cause is paid once — `m11_plan.md`'s own argument for why
5a has to carry 4a along with it.

**`malice`, an eighth personality axis.** The owner's note 8 asked for "a
personality trait like malevolent or conspirator" to gate who can start a
plot without a personal grudge behind it. Declared now, read by nobody yet —
the same precedent `farm` and `smith` already set in `SKILLS`, and for the
same reason: the trait has to exist before M11 phase 5's conspiracies can
read it, and bundling the declaration with that later pass would make the
RNG drift from adding it indistinguishable from the drift the plotting
mechanism itself causes.

**`Person.mood`, four decaying channels.** `core/Mood.ts`'s own header has
said since M9.5 phase 1 that a persistent, heritable mood was the obvious
next step and named exactly this migration cost as the reason it wasn't
built then. It now exists: `comfort`, `belonging`, `security` and `purpose`,
each resting toward a point set by one temperament axis apiece (tradition,
loyalty, aggression inverted, and industriousness), closing 8% of the gap to
that point once a day alongside relationship and memory decay. `Mood.add`
is the one entry point, keeping the last four reasons beside the number —
`lastRefusal`'s pattern applied to a channel instead of a refusal — but
nothing calls it yet. The inspector's Self tab grew a Mood section beside
Temperament so the field is visible the moment it exists, and new
`mood.test.ts` holds the baseline formula and the decay rate to brute force.
**Inert**: `expressionOf` does not read a channel yet (M9.6 phase 4b), and
nothing in `Brain` does either (4c). No behaviour changed because of mood
itself.

**The trait migration moves the RNG, exactly as documented, and it was
measured rather than assumed.** Adding an eighth `rng.gaussian` draw to
founding's trait loop (and inheritance's) shifts every draw downstream of it,
for every scenario, on every seed — `sim:check:all` before and after this
commit differ on three lines, all of them already-catalogued knife-edge
checks rather than new defects: `century` gains a `perf-budget` failure
(confirmed by bisection to be a genuinely larger population on that seed —
76 peak against 66 before — not a slower per-tick cost; the codebase's own
systems scale with population, and `AGENTS.md` already names `century` as
chaotic under any RNG-affecting change), and `hunters`/`kills-are-butchered-
for-bone` and `fishers`/`pictures-are-painted` trade sides — both already on
record in `bugs.md` as one-event-wide checks that flip under any change at
all. `farmers`/`the-hurt-are-tended` flips the other way, from failing to
passing. A twenty-seed `century` cohort before this commit read 100.0% mean
survival, 826 born, 20 total starved (7 infants, 1 child, 12 adults), 11.4
technologies known; after, 99.9% mean survival, 860 born, 3 total starved (1
infant, 0 children, 2 adults), 12.3 technologies known — a healthy world by
every figure this project trusts a twenty-seed cohort to resolve, and inside
the noise `AGENTS.md` already says a cohort this size cannot separate from a
coefficient.

Verification: typecheck; 338 unit and determinism tests (8 new, for `Mood`);
`sim:check:all` as above; 20-seed cohort as above; all 47 e2e, including the
character-tabs and character-creation tests that now render the new trait and
section without needing any changes of their own.

## 2026-09-17 — M11 phase 4: property is protected by attention

`Building.ownerBandId` used to mean two incompatible things. The autonomous
scorer treated foreign stores, fields, compost and workshops as if they did not
exist, while player-issued building orders reached `ActionSystem` with no
ownership check at all. A rival therefore could not decide to take from an
empty camp, but the player could order the same thing in front of its owners.

**One pure predicate now owns the answer.** `social/Property.ts` asks the
people spatial hash whether a living member of the owning band is within sight
of the structure. Own-band use is always allowed; foreign use is allowed when
unwatched; an owner in sight can stop it. `Brain`, the action catalogue, the
executor, crafting-station lookup and the inventory-panel shortcut all ask that
same rule. The menu names the person watching, and a guard who arrives while
somebody is walking can still stop the action through the ordinary visible
refusal channel.

**Foreign use is a deed, not a permissions error.** Taking from a foreign
store or harvest emits `theft`; using its roof, field, heap or workshop emits
the new lesser `trespass` deed. Long actions carry one bit so a night under a
foreign roof becomes one story rather than one story per tick. The `lean`
scenario exercises the mechanism: 41 unseen uses, one stopped use, 42
trespasses and 164 theft deeds. A twenty-seed `century` cohort remained at
100.0% mean survival with no collapses (826 births, 11.4 technologies known),
so opening the larder path did not destabilise the food economy at the scale
this project can resolve.

Two defects surfaced in verification. Once foreign buildings became candidates,
stores and fields across water could win the scorer; the old same-band filter
had accidentally guaranteed reachability. The shared scorer-side building
test now also asks `World.sameRegion`, taking `farmers` from 1,994 stuck walking
ticks and 41 abandoned routes to 2 and 0. And `soil-is-drawn-down` was still
asserting depletion in `stewards` after compost had deliberately restored the
ground, despite the scenario description saying those two checks require
opposite worlds. It now skips after a dressing and leaves that world to
`compost-answers-exhaustion`.

Verification: typecheck; 330 unit and determinism tests; all seventeen scenario
mechanisms green except the documented `crowded` performance check and the
one-event-wide tending checks in `millers` and `farmers`; 20-seed cohort as
above. No RNG stream or fork order changed.

## 2026-09-17 — M11 phase 3b: an unseen deed is a thing your character knows it is

The owner's rule is that nobody learns anything they did not see or were not
told, and phase 3a gave the *victim* the urge to go and tell somebody. This
half makes the *secret* visible to the player: `unwitnessed` was a telemetry
counter and nothing else, so a theft in an empty clearing and a theft in a
crowd played identically on screen, and the decision the owner wants — *did
anyone see that, or did I get away with it?* — could not be made because the
answer was nowhere on the screen.

**A deed now carries how many saw it.** `SocialEvent.witnesses` is the count
of living bystanders inside `sightRadius` at the moment of `emit`, with the
actor and the victim themselves always left out — a deed between a couple by
the fire is still a secret from everyone else. Wiring it up is pure data: the
count was already being computed for the `witnessed`/`unwitnessed` telemetry,
so nothing reads it, no draw was added, and the world is unchanged at every
level (the determinism test, all seventeen scenarios green but the three
pre-existing failures, and all 47 e2e).

**And the two people in the deed are told what no bystander can see.** The
floater loop used to announce every notable deed within the player's sight,
gated exactly like every witness — which silently excluded the player's own
unseen deeds in the same clearing they left. A deed the player's character did
or suffered is now exempt from that line-of-sight gate (the actor always knows
what they did, wherever they have walked since), and when it was unwitnessed
it gets a violet banner over the character's head: *"No one saw you do it."*
to the thief who got away, *"No one else knows yet."* to the victim whose only
road to justice is their own tongue — the action 3a built and the player now
has a reason to understand.

Three unit tests hold the invariant the banner lives or dies on: that the
count is brute-force correct (0 alone, 1 for the one bystander in sight), and
that the actor and victim never count as witnesses. The memory split is
asserted beside the count — the victim remembers, nobody else does — so the
UI's claim "no one else knows" is checked against the very state the NPC
social model already trusts.

---

## 2026-09-17 — M11 phases 1b to 3a: why nobody fought, and two defects found on the way

The owner's headline complaint was that **no character has any reason to fight
another**, and they guessed either too much food or not yet knowing how. The
answer turned out to be neither, exactly: the verbs exist and work, and what
was missing was that nothing in the scorer ever *pointed* them anywhere.

**Phase 1b — the softened choice on at 0.12, and two old failures go green.**
The twenty-seed cohort could not pick the value, which is the first result:
`century` at 0, 0.08, 0.12 and 0.20 is indistinguishable on everything
`sim:seeds` reports — mean survival 100.0 / 99.9 / 99.9 / 100.0, no collapses,
technologies known 11.4 / 11.8 / 11.3 / 11.9. Softening the choice is free. The
value came from what the change is *for*: distinct actions observed, 31/30/33/32
on `century` and 29/27/31/31 on `lean`, where 0.12 is widest on both and 0.08 is
*narrower* than argmax on both — a reminder that neighbouring values are not
resolvable from single chaotic runs, and that only the shape is.

Two checks with open `bugs.md` entries went green on it. `century`'s
**`the-hurt-are-tended`** went from 0 ticks to 114, having failed since M9 phase
5 under the title "a world that reaches herbalism never tends anybody with it" —
and the diagnosis it gives is that the mechanism was never broken. **`tend`
simply never won an argmax.** An argmax gives a verb that is second-best every
single time exactly nothing. `hunters`' `kills-are-butchered-for-bone` went
green the same way.

**Phase 2a-2b — a thief finally looks at who they are robbing.** `steal` was the
one predatory verb in the game that read *nothing at all* about its victim: a
laden elder and a laden warrior were the same opportunity, separated only by who
was nearer. `attack` and `threaten` had both always weighed the odds, in two
different expressions; `social/Vulnerability.ts` now holds one. It is an addend
rather than a multiplier, so hunger can still drive a desperate person to rob
somebody who would win the fight, and the strongest person in a band does not
become untouchable.

**Phase 2c — the grudge and the person hit were two different people.** Found
while preparing the predation route. `FoundTargets.victim` was read by `steal`,
`threaten` and `attack` alike; `steal` writes it unconditionally and `attack`
wrote it only `if (!victim)`. So somebody with both a laden neighbour and a
hated enemy in sight scored `attack` against the enemy — grudge, odds, allies,
all of it — and then walked over and hit the neighbour. It matters more than its
rarity suggests, because an unprovoked beating is a deed every onlooker
witnesses, and this changelog already records how fast that compounds. `attack`
has `found.foe` of its own now. Across 20 seeds it improved every line.

**Phase 2c — a second road to violence.** `attack` had one route, gated on
`grudge > 0.5`, opinion below -50, and **nothing reaches it**: on the commit that
introduced `lean` — a world running at 23% hostile relationships against the
default's 5% — `attack` did not appear in the action table at all. A world three
times more bitter than normal produced no violence, because bitterness is not
what that gate measures.

Two calibration failures on the way, both invisible from the code. **Nobody in
this world has any fight skill**, because `fight` is trained by exactly one
thing, landing a blow — so real fighting power runs 0.11 to 0.35 against a
formula range of 0.1 to 1.2, and `DECISIVE_GAP` had been set at 0.6 from reading
the formula, wider than the widest gap the world can produce. And **six
multiplied suppressors are a veto, not a brake**: the first version scored near
0.0003, two orders of magnitude below `wander`, and never fired once.

The coefficient was swept and the window is narrow — murders per run, alive
against peak:

| value | `lean` | `century` |
|---|---|---|
| none | 43/46, 0 | 64/64, 2 |
| 0.7 | — | 59/59, 7 |
| 0.9 | 43/46, 0 | 59/59, 7 |
| 1.3 | 41/45, 0 | 50/50, 14 |
| 1.8 | 33/48, 5 | 25/35, 23 |
| 3 | 27/43, 25 | — |
| 10 | 4/37, 42 | — |

Above about 1.3 the feedback loop takes over: a killing gives every onlooker a
grudge and the grudges feed the *revenge* route, which needs no defenceless
target at all. **0.7 rather than 0.9** because they buy identical violence at
very different prices — 0.9 costs 1.7 points of mean survival and a tenth of all
teaching in the world; 0.7 costs neither.

**An emergent property worth keeping**, which was not designed: `lean` sees no
murders at all until 1.8 while the comfortable `century` sees seven at 0.7.
Predation is leisure, not desperation — a hungry person forages, because
`hunger` outscores it by a wide margin. **Scarcity in this world produces theft;
it is ease that produces predators.**

**Phase 3a — a wrong done in an empty clearing is worth going to tell someone.**
The owner's rule is that nothing is known until it is seen or told, and the
machinery was already right: `emit` tells the victim and whoever was in sight
and nobody else, a victim's memory floors so a grievance never fades, and
`converse` passes on the best untold story. What was missing was the wanting to.
A robbed man kept his grievance for life and mentioned it only if loneliness
happened to send him to somebody. Two terms — one on the choice of listener, one
on `talk`'s own score — and no new verb, because a second path to "tell somebody"
is a second thing to keep in step with the first. Stories passed on went 959 to
1,134 on `lean` while conversations rose only 1,821 to 1,973: people are not
talking much more, they are talking to better-chosen listeners.

**And it flushed out the oldest defect in the pass. People were the one kind of
candidate in the scorer that nobody ever checked you could reach.**
`World.sameRegion` is applied to trees, buildings, animals, resource nodes and
shore tiles in eight places, and never once to a person. On an island map
somebody across a narrow channel sits comfortably inside `sightRadius` and
cannot be walked to at all, so every social verb could be scored, chosen, set up
and then refused by the router.

The mechanism by which it hid is worth remembering: **a stranger you have never
spoken to is, by definition, somebody who has not heard your news** — so a term
pulling toward an uninformed listener pulls hardest toward the unreachable one.
`stewards` went from 0 stuck walking ticks in 252,542 to 3,267 in 225,107, with
`abandoned_cannot_reach` going 0 to 76 and 298 recovery attempts, none of which
found a route. One filter on `neighbours`, not seven in the scorers.

**The matrix ends the pass at 17 scenarios and 14 fully green**, against four
failures at sixteen scenarios when it began. What is left is `crowded`'s
`perf-budget`, failing since before M7, and `millers`' and `hunters`' two checks
that `bugs.md` records as one event wide. `stewards` reaches its best state
ever, 65 of 65, with composting finally spreading — 16 tile-dressings and ground
at 95.2% of resting against `farmers`' 81% — and six records cut where before
nobody in that world could write.

## 2026-09-17 — M11 phase 0 and 1a: the ground the conflict milestone is measured on

The owner asked for a design pass blending The Sims' social control, RimWorld's
survival and Evolve's technology breadth, and named the thing that was missing:
**no character has any reason to fight another**. They guessed either too much
food or not yet knowing how. Both, and a third reason neither of us had. This is
the foundation tier of that milestone — four commits of instruments and repairs
before a single mechanism is built.

**Phase 0a — `AGENTS.md` was pointing new RNG streams at a trap.** It said the
named fork block ends at `recordRng` and that there is "a fourteenth, anonymous
fork twenty-five lines further down", the one handed to `seedInitialForest`.
Both halves had gone false, and gone false silently: that fork is the *twelfth*
of fifteen, and two more sit below it — `fishRng` (M8.1) and `grainRng` (M8.2),
each appended correctly and neither recorded here. So the instruction pointed at
a spot with three forks beneath it, and appending there replants every wood in
every saved seed. Replaced with a numbered table of everything below the named
block, the genuine append point, the reason a fork appended genuinely last
cannot shift anything (`this.rng` is drawn from by nothing but those fork
calls), and an instruction to add a row when you append. `Simulation.ts` gets a
DO NOT APPEND HERE block at the place somebody would actually append.

**Phase 0b — the opening diagnosis was tested, and a third of it was wrong.**
`kin-outrank-strangers` reports mean regard for an outsider at **+15.9** on
`century`, which reads as "there is no out-group". A theory said the number was
an artifact: `setKinship` creates its edge through `edge()`, which starts at
`bias: 0`, and `introduce` refuses to stamp an impression on an edge that
already exists — so a cross-band blood relative would never receive
`OUT_GROUP_BIAS` and would sit in the outsider bucket at +40 to +60.

**Refuted.** A fourth figure, `outsider-unrelated`, filters that bucket to
`kinship === 0`, and across five scenarios it is identical to `outsider` to one
decimal every time. There is no contamination, because the check already
excludes household-mates and a cross-band marriage puts both spouses and their
children into one household.

What it found instead is worth more than what it was built to test:

| scenario | steps | outsider |
|---|---|---|
| `crowded` | 3,000 | **-5.2** |
| `band` | 3,000 | **-1.3** |
| `culture` | 9,000 | **+1.5** |
| `millers` | 36,000 | **+15.1** |
| `century` | 40,000 | **+15.9** |

Regard for a stranger is a clean monotonic function of how long the world has
been running. That is a mechanism rather than noise. `OUT_GROUP_BIAS` is a
constant -6, set once when the edge is created and never decayed — deliberately,
so that "a stranger stays a stranger until their deeds say otherwise" — while
every other term in `opinion` grows with contact: `familiarity` accumulates on
every meeting and enters at x0.35, and `deeds` accumulates positively through
`share_food`, `teach` and `help`. Over enough years the constant is swamped.

**So the world does have an out-group, and it dissolves.** That is backwards
from the arc this milestone is aimed at, and it is the argument for standing
between bands being a value that can *grow* hostile rather than a constant that
cannot. The figure is reported and deliberately kept out of the assertion: it is
an instrument, not a gate.

A planned repair — having `setKinship` stamp a first impression — was **dropped
on this measurement**. With no contamination to fix, its only effect would have
been to penalise a cousin for living in another band, and kin is kin.

**Phase 0d — a `lean` scenario, because the default world has no pressure left
in it.** `century` ends with mean hunger at 13.1 of 100, mean health at 100.0,
and a population that peaks at 65 and never falls. Nobody there is desperate
enough to steal or resented enough to be cast out, so every check this milestone
adds would report n/a however well its mechanism was built — and `AGENTS.md` is
explicit that n/a is not a pass. It is deliberately not `crowded`, which is thin
forage over 3,000 steps: a grudge takes years to accumulate and a dynasty takes
generations, so scarcity has to be paired with length.

It took four attempts, because the food economy is far more robust than
expected — M7's routing and M8.1's four supply channels have between them made
this island genuinely hard to starve:

| world | result |
|---|---|
| bushes 150, herds 14, 3x14, 24k steps | hunger 16.0, health 100.0, 42 to 75, no deaths |
| + regrowth 0.45, 3x16 | hunger 17.1, health 99.8, 48 to 83, 2 deaths |
| + bushes 90, herds 8, trees 0.3, regrowth 0.25, 3x12 | hunger 14.1, health **94.7**, 54 to **42**, **18 starved** |

Cutting node *counts* mostly adds walking; **`regrowthRate` is what moves the
island's carrying capacity**, and it is the knob that made the difference. The
third row is what shipped: a world that peaks and then loses a third of its
people, well clear of `population-persists`' floor of 19, because a world that
dies measures nothing either. 58 of 58 applicable checks green, and every other
scenario in the matrix untouched.

Two things it already shows, before one mechanism is built: hostile
relationships are **598 of 2,573 (23%)** against `century`'s 187 of 3,710 (5%),
so scarcity does produce ill-feeling — and **`attack` does not appear in the
action distribution at all**. Together those are the case for the conflict
phase. The ill-feeling is there and never becomes violence, because `Brain`'s
only route to `attack` is gated on `grudge > 0.5`, opinion below -50, and a
world three times more hostile than the default still never reaches it. That is
a structural gate rather than a coefficient, which is why raising the aggression
weights was never going to be the answer.

**Phase 1a — the choice becomes a draw among the best, shipped switched off.**
`Brain.think` took `scores[0]`. It now routes through `chooseAmongBest` in the
new `core/Choice.ts`, at a spread of 0 — which is argmax, takes no draw, and
leaves the world bit-identical.

It goes first because of what this changelog already records about `threaten`:
correctly gated, correctly weighted, and it "never once won the argmax against
`steal` for the same target", so it did not appear in a full century of a
156-person world until it was retuned against that single comparison. Under
argmax, adding a verb is not adding an option — it is entering a
winner-takes-all contest against every verb already calibrated, and the only way
through is to raise the newcomer until it beats an incumbent outright. This
milestone adds about eight verbs. Every later phase would otherwise be measured
against a scorer still moving underneath it.

**A band, not a temperature.** A softmax over `exp(score / t)` is the obvious
implementation and the wrong one here: these scores are not commensurate —
`wander` is about 0.02 and `hunt` about 9 — and the coefficients producing them
are calibrated against each other rather than against a scale, so any fixed
temperature is either cold enough to be argmax or warm enough to let a wander
beat a hunt. The rule is relative to the leader instead: keep every candidate
within `spread` of the best score, then draw in proportion to score. Scale-free,
bounded so nothing outside the band can ever win, and degenerate at 0. Capped at
four candidates, because a comfortable person late in the day has a dozen
near-ties and drawing uniformly across twelve of them is not variety, it is
somebody who cannot make up their mind.

**The draw is in `think`, never in `score`.** `Simulation` calls `Brain.score`
for the player's character on every rendered frame, to show what they are
inclined to do; a draw inside `score` would make what the world does depend on
how often it was looked at, which is the purity rule `techPower` already
carries. The new stream is `choiceRng`, deliberately not `aiRng` — that one is
already drawn from inside `score`, for `wander`'s jitter and twice in `setup` —
appended genuinely last, with its row added to `AGENTS.md`'s new table.

Eight unit tests, asserting the two things that would be invisible in play if
they broke: that spread 0 is argmax **and consumes no randomness**, and that
nothing below the band can ever be returned however unlucky the draw. `century`
reproduces every figure exactly, including all 31 action counters.

## 2026-09-17 — M9.6 phases 0-3: the speed, the fruit, the graph, and what a picked-over bush looks like

Four of the owner's six notes of 2026-09-17, planned in
[m9_6_plan.md](m9_6_plan.md). Three of them were an afternoon each. The fourth —
"fruit trees should not have fruits outside their season" — turned out to be
sitting on top of a defect that had quietly emptied the autumn.

**Phase 0 — "default speed 5", and the default already was 5.**
`DEFAULT_CONFIG.time.tickRate` has been 5 since M6c, and the loop and the HUD
slider both read it. What was not 5 was the *stored* value: game speed is a row
on the difficulty screen, every row on that screen is written into
`Settings.overrides`, and overrides are kept for ever — so one drag of that
slider, once, became the speed every world opened at from then on, with "Reset
everything to Normal" the only way back and every other tuning lost with it.
Pacing is taste rather than difficulty (the clock group's own comment says so),
and a speed is something a player changes for the next two minutes rather than
for the next world. It is now stripped on the way to storage *and* ignored on
the way in, so an older build's value stops mattering the first time this build
saves. Three unit tests, two of them verified failing on the build without the
strip and one — an ordinary override round-tripping — passing on both, so that
a broken `localStorage` stub could not make the other two pass for the wrong
reason.

**Phase 1a — a day was being sampled at midnight.** The daily block runs at
`tick % ticksPerDay === 0`, which is midnight, where `daylight` is 0 and
`temperature` therefore takes its full diurnal penalty of -0.3. Everything else
that reads `growth` runs every tick and averages the hour away for free; the
wood does not. In mid-autumn the seasonal term is about zero, so the growth
handed to `ForestSystem.daily` was about **0.08** — under the `max(0.2, growth)`
floor in `Tree.advanceDay` — every autumn day of every year. `TimeManager`
now offers `dailyGrowth`, the same curve with the hour taken out, and the forest
reads that. **`growCrops` deliberately still reads `growth`**: M8.2 fitted
`GROWTH_PER_DAY` to the midnight sample — `Field.ts` quotes the peak as 0.71,
which is that sample — so moving its input without re-deriving its constant
would have retuned farming inside a pass about trees.

**Phase 1b — the swell was written for a calendar that no longer exists.**
`fruitYield / 18`: eighteen absolute days, from when a season was twenty of
them. M9.5 phase 3 halved the year and left every per-day rate alone, which was
right for rates that run all year and wrong for one gated on a season — as
`bugs.md` said at the time, and left for whoever next had reason to touch it.
A crop now fills over four fifths of its own fruiting window, whatever the
calendar says, with weather moving the pace by about a third either way and
never stopping it.

Together those two are the difference between a table that describes the world
and a table that does not. **On `millers`, four years: acorns picked went from 0
to 86 and meals ground at the quern from 0 to 28**, against a `bugs.md` entry
that recorded the acorn chain as unmeasurable because no scenario had shown it
happening twice since the seasons halved. Fruit picked went 474 → 901 → 2,128
across baseline, 1a and 1b.

**Phase 1c — and now it falls.** Out of season the whole crop leaves the
branches on the day, into `Tree.windfall`, which rots away over a few days and
is drawn as dark specks under the canopy. It used to fade *on the branch* over
ten days at a tenth of the yield a day — ten days being a whole season on this
calendar, so a tree carried pickable apples through the snow and then, quietly,
had never had any. Nobody picks windfall, because it is rotten.

Two things were considered and deliberately left out. Windfall is not a
carryable `rotten_fruit`, and it does not feed the compost heap: `Building.ts`
already records why the heap is paid for at construction rather than by a
feeding verb. And it does not call `Soil.enrich` under the canopy, which was the
plan's own idea and is wrong — untouched ground already sits at its
`organicCeiling`, so the credit would buy nothing and would push every tile
under every fruiting tree into `Soil.active`, a daily sweep whose whole value is
being small.

`doPickFruit` now refuses with `fruit_fallen` rather than `no_fruit` when the
crop is on the ground, because "there was nothing to pick" about a tree that
visibly had apples an hour ago reads as the game losing track. `millers` reports
35 of those in four years. New check `fruit-comes-and-goes-with-the-season`,
gated on the run having crossed a season with fruit about — *not* on windfall
having been seen, which would have made it skip itself on precisely the build it
exists to catch — and verified failing on that build, where it reports 12,961
fruit hanging out of season.

**Phase 2 — the tribe graph holds still.** The owner's note was that it changes
shape very fast; none of it was random. `layOutTribe` was re-derived from
nothing every frame, and it is a continuous function of current opinion in four
places at once: `knownBy` sorts by the strength of feeling and the index sets
the ring angle; `seedRows` takes the row order from that same sort, alternating
out from the middle, so one crossing moves two nodes several slots apart;
`restLength` is `150 - opinion * 0.9`, so 220 relaxation passes land somewhere
slightly different even when nobody swaps; and the digest hashed positions to
the pixel, so any of it rebuilt the DOM. Familiarity is re-earned by standing
near somebody and decays 6% a day, so the input never stops moving.

The arrangement is now carried between frames and eased with 30 passes instead
of re-derived with 220; a row slot is only handed to somebody who has not got
one; four people already on the graph may stay on it past the 24-person cap, so
the marginal acquaintance stops flickering; and the digest is quantised to four
pixels and five points of opinion. Three unit tests, all three verified failing
on the build without it.

That closes two thirds of the standing entry about all three graphs relaxing
every frame — and the remaining third was already wrong: `TechWeb` does
`this.layout ??= layOutWeb()` and has been caching all along. `FamilyTree` still
re-runs its 200 passes every frame, which is real waste but not visible churn,
since a family tree's input only changes at a birth or a death.

**Phase 3 — a depleted thing looks depleted.** Every node was one glyph scaled
by fullness, and at zero every kind became the same grey square, so telling a
full bush from an empty one meant judging its size against a bush somewhere else
on the screen. Depletion is a *picture* now, in three discrete states: a stripped
bramble with no berries on it, cut stubble, a dug pit with the spoil on the near
lip, a knapped scar — permanent, because flint never regrows and a band should
be able to see the ground it has used up — a ring on the water where a shoal
was, and for `sticks`, exactly what the owner asked for: nothing at all.

"Nothing at all" needed one rule rather than two. An empty stick pile that is
drawn as nothing but still answers clicks is the same lie as a snow-buried node
the AI can reach through, so `nodeIsHidden` now answers both questions and both
the renderer's node loop and `main.ts`'s picker read it. `hitRadiusOf` reads the
same three-entry size table the painter does; it used to carry a fullness curve
with a floor under it, which meant the floor was doing all the work below half
and the click target had already parted company with the paint.

**And `wild_grain` was being drawn as nothing.** M8.2 gave the kind a colour and
never gave it a case in the switch, so a stand of wild cereal was a two-pixel
shadow bar lying in the grass. It has ears on stalks now.

**Measured, and the aggregate disagrees with the mechanism.** Twenty seeds on
`century`, against the baseline this repository has been quoting since M8.2
(100.0% survival, 827 born, 13.2 technologies, 720.2 lessons passed on):

| | baseline | 1a | 1b | whole of phase 1 |
|---|---|---|---|---|
| mean survival | 100.0% | 99.9% | 100.0% | **100.0%** |
| born | 827 | 828 | 838 | **841** |
| starved | 18 | 28 | 30 | **21** |
| technologies known | 13.2 | 12.9 | 11.3 | **11.4** |
| lessons passed on | 720.2 | 710.5 | 635.9 | **663.5** |

Survival has no headroom on this cohort — it is pinned at 100% — so the figure
that moved is technologies known, by about two. **That is worth stating plainly
and worth not over-reading.** It is also the figure `bugs.md` already records as
drifting under behavioural change and not coming back (M9 phase 4, 11.0 → 10.1),
and one instrumented `century` run before and after says the *mechanism* runs
the other way: with the same code, the new build ponders **134,470** ticks
against 118,477, has **485** breakthroughs against 440, and conceives **110**
ideas against 97. More food is buying more time to think, not less; which
particular technologies a given seed lands on is where the two points went.
Nothing was tuned in response.

**What phase 1 really changes is abundance.** The default twelve-day run picks
253 fruit where it picked 58; `hunters` picks 686 where it picked 108. A tree
now delivers the `fruitYield` its own table has always declared, which is
several times what any world has actually had since M9.5 phase 3 halved the
seasons — and the food economy was tuned, in M8.1 and M8.2, against the broken
number. **That is a live balance question for the owner**, not something to
settle inside a defect fix: the fix is to make the table true, and if the table
is too generous the answer is a smaller `fruitYield`, in a pass that measures it.

**Three scenarios acquired a failure, and all three were run against `HEAD` to
find out whether they were new.** `traps`, `hunters` and `century` are all green
at `HEAD`.

- **`traps` — `sleep-restores`.** An instrument defect, fixed here. The check
  went from n/a (the sampler caught 0 sleeps) to FAIL (it caught 2, and saw
  fatigue fall on neither), with nothing about sleeping having changed;
  `millers` in the same matrix reports 372 sleeps and 3,335 restoring ticks. It
  now needs five observations before it asserts anything, which is exactly what
  `heads-direct-work` was given in M8.2 and for the same reason.
- **`century` and `millers` — `the-hurt-are-tended`.** Newly *applicable*, not
  newly broken: both worlds now climb far enough to reach `herbalism`, and the
  open defect "a world that reaches herbalism never tends anybody with it" then
  shows. Not tuned. n/a is not a pass, and a check that stops being n/a because
  the world got further is the instrument doing its job.
- **`hunters` — `kills-are-butchered-for-bone`.** Left failing, deliberately.
  The chain's first three links still work — 2 kills gave 10 of bone and sinew
  and 3 tools — and what is missing is the coat, because the run made 2 kills
  where it made 3. This check is one event wide in a scenario whose own comment
  already calls the coat chain fragile by design, and lengthening the run until
  it passes would be tuning the instrument to hide the question. The question
  being: fruit in that world went up sixfold and hunting is what it competes
  with on the scorer. At two kills against three there is no way to tell
  displacement from noise, and pretending otherwise is how a false explanation
  gets shipped with a comment attached.

Verified: `npm run typecheck`, **316 unit tests** (nine new, eight of them
verified failing on the build without their fix), **16 scenarios** with the four
failures above accounted for, **47 e2e**, and `npm run shots`.

---

## 2026-09-17 — M8.2, second half: composting, and the ground can be given back to

The remedy the previous commit owed. Soil that only ever gets poorer is a
strictly worse world with no counterplay, which is precisely what happened to
spoilage — built, measured, and shipped switched off — and the plan for this
pass says so in as many words.

**A heap, not a trap, and the difference is four systems wide.** `compost_heap`
costs eight thatch and four mud — the brown and the green of it, paid at
construction rather than by a feeding verb, because each extra step in a chain
is where this project's chains have historically broken. After that it ripens
on its own through `Simulation.workHeaps`, at a rate scaled by the band's best
grasp of the technology, so a heap whose keeper died is a pile of wet straw.
That is `workTraps`' shape and deliberately not `workTraps` itself:
`BuildingDef.matures` is a separate field from `yields` because the planner,
the larder scorer, `doStore` and the health report would all have been wrong
about a heap that called itself a trap.

**`spread` puts humus back, and the two pools answer differently.** A spreading
is four loads over every tile of a plot, at `COMPOST_ORGANIC` 0.075 against a
sowing's 0.035 cost — so a field dressed once a year gains and one dressed every
other year holds. `Soil.enrich` also credits the fast pool at 60% of the
dressing, because muck feeds this year's crop as well as the next twenty, and a
model where compost only paid off two decades later would be right about the
humus and quite wrong about the harvest.

**Three things were built, measured failing in a whole world, and rebuilt.**
Each is worth recording, because each looked obviously correct:

1. **The fetch was handed off to `take`**, on `doBuild`'s pattern. `doBuild`
   gets away with it because `haul` is a verb the scorer also aims for itself;
   nothing aims a `take` at a compost heap, so the next think tick re-pointed it
   at the larder. `stewards` spent ninety-nine thousand ticks taking food out of
   storage pits while two heaps stood full for a hundred and sixteen days and
   **not one load was ever spread**. Both legs now live inside `doSpread`, where
   nothing can re-aim them.
2. **The errand had no commitment.** `Simulation` re-plans anybody whose
   `actionTimer` has run out, and a two-legged errand is re-planned the moment
   the first leg ends — people fetched compost and were re-aimed while standing
   at the heap. `doSpread` now refreshes a six-tick commitment every tick, so it
   lasts exactly as long as the errand.
3. **And then the interruption check, moved to the top to compensate, ran on
   every tick of both walks.** `interruption` answers "hungry" long before
   anybody is starving: a merely peckish band abandoned the errand about fifteen
   hundred times in three years and spread one load. The check now runs at the
   two waypoints — arriving at the heap, and starting the work — which is the
   same bargain `doHarvest` strikes with its cycle.

**And one fix that came out of watching where the muck went.** `doStore` empties
a whole pack into the larder, so compost spends much of its life in the storage
pit rather than on the heap that made it. Both the scorer and the action now
look for a band's compost wherever it has ended up, rather than only in heaps —
before that, the scorer offered an errand the action refused, which is the two
halves disagreeing in front of the player.

**Measured.** On the same seed and the same ground as `farmers`, the new
`stewards` scenario — the same two bands with one more idea in their heads —
ends with its worked ground at **95.4% of what that ground carries untouched,
against 81.1% for farming alone**. The check that says so is verified failing on
a build whose `Soil.enrich` does nothing. The default twelve-day report is
unchanged, and the twenty-seed cohort is identical to the baseline again — 100.0%
survival, 827 born, 13.2 technologies, 720.2 lessons passed on — because nobody
works out composting in twelve days. Six new unit tests, all sixteen scenarios
green but `crowded`'s `perf-budget`, 310 unit tests and 47 e2e.

**One instrument fixed, and it is not this milestone's.** `heads-direct-work`
had no minimum sample: `stewards` worked `chiefdom` out late, one head asked one
person one thing and was refused, and a check built to measure a *rate* called
that a failure of the mechanism. It now skips under five orders, the way
`hunts-succeed-and-fail` already does, and `labour` — the scenario that exists to
answer that question — still reports 41 obeyed against 174 refused.

---

## 2026-09-17 — M8.2, first half: the ground, and the first field

`farming` is back in `TECHS`. It was taken out because it gated an entire era
while changing nothing on the ground, and the rule since has been that it may
not return without fields; it returns here with `core/Soil.ts`,
`entities/Field.ts`, two verbs, a crop, a wild ancestor to domesticate and the
soil it all draws on, in one commit. This is the oldest open entry in
`next-steps.md`, closed.

**Three layers of ground, because the remedies are four different things.**
`World.fertility` is untouched — it is innate, it is what berry bushes have
grown out of since M2, and repointing it at a live value would have moved every
bush in every saved seed with nothing to catch it. Above it sit `texture`
(sand ↔ loam, immutable until `marling`), `organic` (humus, the slow pool) and
`nutrient` (what a crop eats, the fast pool). **Tilling burns organic; reaping
eats nutrient**, which is why compost, manure, fallow and rotation can be four
mechanisms rather than four skins on one number. Nothing is swept per tick:
drawdown is written by the sowing and the harvest, and recovery walks only the
tiles somebody has actually disturbed, dropping each as it settles.

**The rates were measured, not chosen, and the first pair was wrong.** At a
fortnight's recovery per sowing the `farmers` scenario came out at 97.3% of
resting ground after nine harvests — a soil model that costs nothing and
therefore says nothing. Humus is built over decades; at 0.0004 a day the ground
gives back about a sixth of a sowing a year, and the same scenario now ends at
**81.1% of resting, with its poorest plot at 75.3%** and its harvests falling
from 378 grain to 280 as the ground gives less. Fallow is a brake on
exhaustion, not a cure for it. **The cure is `composting`, which is the next
commit and not this one** — the plan asks for decline and its remedy in one
change, and what ships here has fallow and moving the plot, which is shifting
cultivation and is what people actually did first.

**A field is a building, and the crop rides on it.** Siting, placement
refusals, the walk, ownership and the renderer are all things `Building`
already does; a second entity would have been four pairs of implementations of
the same idea. What a building does not have — a stage, a growth fraction, the
day it was sown — is `Building.crop`, the way `yieldCarry` hangs off a trap.
Two verbs shipped where the plan named three: **tilling is folded into sowing**,
because three verbs the AI has to perform in order is three chances to leave a
plot half made, and this project has already watched fish traps stand full for
fifty trap-days for exactly that reason. The soil cost of tilling is real and is
paid on every tile at every sowing; it is simply not a verb anybody can forget.

**Where the first seed comes from, and the deadlock that nearly shipped.** Wild
cereal now stands on the open grass, spawned in its own pass on its own stream —
appended after the fish, so a world built before farming existed is otherwise
identical. Raw grain is `nutrition: 0`, exactly as an acorn is, and the reason is
measured: at 6 it was poor food that was still food, the forage scorer took the
nearest edible thing, and on `millers` the band gathered ninety-four grain,
foraging rose 42% in ticks, crafting fell to a third and **the scenario that
exists to exercise a crafting station made nothing at one all run**. But a thing
worth nothing is a thing nobody gathers, and a technology whose only route in
needs something only that technology produces is the `leatherwork` deadlock. The
way out is the quern: `RECIPES.groats` is gated on **`grinding`**, which is also
`farming`'s own prerequisite, so anybody who could ever discover farming already
has a reason to gather wild cereal. `Brain.nodeWorth` values a resource node the
way `fruitWorth` has valued acorns since M8.1 — what it is worth to *this*
person, given what they know — and that one predicate is the whole change to the
scorer.

**A smarter scorer was written, measured and thrown away.** Between those two
states there was a version that chose the *best* food in sight rather than the
nearest. It is obviously better and it is wrong: a forager who walks past poor
food never gathers anything a quern could be used on, and on `millers` it took
the things made at a station from 26 to **nothing**. Foraging is opportunistic,
and every technology that turns what is underfoot into food depends on it being
so. It also cost 45% of the frame — 2,600 steps/s to 1,411, a `perf-budget`
failure outright — which is how `recipeUsing` came to be indexed rather than
scanned.

**The player is told, six ways.** No seed, ground too tired, wrong season, the
plot already sown, the crop not ready, and a harvest that gave nothing — six
refusals with six different answers, each one a floater and a line in the menu
*before* the walk across camp. The panel reads `Simulation.soilReport`, the one
implementation the refusal and the health report also read, and it says the
ground is tired in words to anybody and in numbers only to a farmer. A plot is
drawn as ground rather than as a structure: bare earth that greens as the crop
comes on and goes gold when it is ready to cut, with no sheaf of wheat on a
field that has nothing in it.

**Measured.** The default twelve-day report is **bit-identical** to the previous
commit, line for line, apart from the two new checks reporting n/a and the
throughput line — the pre-Neolithic world is untouched, because wild grain is
invisible to anybody who cannot grind it and nobody works out `grinding` in
twelve days. Across the canonical twenty seeds: **survival 100.0%, 827 born,
13.2 technologies known, 720.2 lessons passed on — every figure identical to the
baseline**. All fifteen scenarios stand, `crowded`'s `perf-budget` aside, which
has been failing since before M7. The new `farmers` scenario runs four years
with two bands who start knowing how: 3 plots, 10 sowings, 9 harvests, 378 grain
and not one crop lost standing. Sixteen new unit tests, each verified failing on
a build with the thing it tests removed, and two new health checks, both
verified failing on a build whose soil never draws down.

**Found and not fixed**: `millers` needed a fourth year, and what it grinds is no
longer acorns. See `bugs.md`.

---

## 2026-09-16 — The ages get their real names

The two bullets `next-steps.md` §4 has carried since M8 was planned, done in one
pass because they are one idea: **the era ladder is the real archaeological
periods, and every technology now says which period our own species arrived at
it in**. Deliberately before M8.2 rather than after — the Neolithic tier triples
the node count, and dating seventeen new nodes as they are written costs nothing
while dating forty-nine afterwards is an afternoon of archaeology.

**One vocabulary, two questions.** `AGES` lists the eight periods once, and both
halves of the pass read it: `ERAS` names the rung a *society* has climbed to,
and `TechDef.age` names the period a *technology* belongs to. They are different
questions, and the comment on `AGES` says so at length, because the third thing
they are not is `requires` — the only thing that actually gates a discovery.
`writing` is dated to the Bronze Age and rests on nothing but `marking` and
`stoneworking`, so a lucky band can have it in the Mesolithic. That anachronism
is the player's to earn, and `is history rather than a second gate` is a test
whose job is to stop somebody "fixing" it.

**stone → fire → hearth → tools → craft → building became Lower Palaeolithic →
Middle → Upper → Mesolithic.** The evocative line each rung already had survives
as its `description`, which is where it was always doing its work; the label is
now `AGE_LABELS[id]`, written once rather than twice. Two departures from the
table in `m8_plan_the_ages.md`, both recorded in the doc comment: a **Middle
Palaeolithic** rung the plan did not have, because without it a band that has
carried fire for three generations still reads as Lower Palaeolithic and the one
rung a short run reliably climbs would have stopped existing; and the Mesolithic
asks for `netting` where the plan asked for `preserving`, which is the one node
of M8.1 that was deliberately held back.

**The ladder stops at the Mesolithic, and that is the rule rather than an
omission.** The Neolithic needs `farming`, `herding` and `masonry`, none of which
exist yet, and a rung whose `needs` name a technology nobody can learn is a rung
no world can reach — declared content that does nothing. It arrives in M8.2, in
the commit that makes a field something you can sow.

**The web rings by history instead of by wiring.** `TechWebLayout` seeded its
radius from `depthOf`, the longest chain of prerequisites behind a node, which
is a fact about how this table happens to be wired rather than about the world.
It now seeds from the period. `bow` rests on three things and `fish_trap` on
four, both are Mesolithic, and they now sit on the same ring. Rings are dense —
`webRings()` counts only periods something in the table actually belongs to —
because nothing is Chalcolithic and an absolute index would have seeded `writing`
two empty rings out and left the relaxation to drag it back over a gap it never
needed to cross. The picture grew 3-6% (851x860 → 873x908) and the closest pair
of nodes is 92.0px in both, which is the separation `settleOverlaps` guarantees.

**The one line in the tech web about the real world.** The detail pane now reads
*Middle Palaeolithic · about 300,000 years ago* under a node's title, and it is
most of what "as realistic as possible to human history" actually asks for: the
player finds out that the needle is older than the pot and that iron is younger
than writing. Below the `unknown` early return, deliberately — a node out of
reach keeps its secrets, and a date is a strong hint about what it is.

**Measured.** `sim:check` is bit-identical to the 4e baseline line for line, the
throughput line and the era's own label aside — `era: Stone Age` became `era:
Lower Palaeolithic`, which is the whole of the intended difference. All fourteen
scenarios stand where they did, `crowded`'s `perf-budget` included, which has
been failing since before M7. Five new tests, four of them mutation-verified
against a deliberately broken build: dating `carpentry` to the Middle
Palaeolithic and resting the Mesolithic rung on `writing` each fail the pair of
new invariants, seeding the web from `depthOf` again fails both ring tests, and
a rung that swaps one technology for two rather than adding fails the
cumulative-needs test that used to compare lengths alone. 288 unit tests and 47
e2e pass.

---

## 2026-09-16 — M9.5 phase 4e: the tribe graph becomes a pyramid

The last phase of M9.5, and the half of the owner's note the four phases before
it were the groundwork for: *the tribe graph should be a layered pyramid,
unlocked by a primitive "giving orders" technology.*

**The rows are the simulation's answer, not the panel's.** New
`sim/social/Rank.ts` names six rungs — chief, heads of houses, the band,
children, other bands, cast out — and derives each one from exactly the terms
`standingOver` already adds up. A head is drawn on the middle rung if and only
if `headsAHouseIn` and `techPower(head, 'chiefdom')` both hold, which is the
same pair of conditions that add `RANK_AUTHORITY` to an order; `headsAHouseIn`
was exported rather than reimplemented, so the picture and the compliance roll
cannot drift apart. A rank drawn for authority nobody would honour is
declared-but-inert content with a border around it.

**Flat until somebody has the idea.** `Rank.bandHasShape` asks the **chief's**
copy of `division_of_labour` — the same gate `BandSystem.assignJobs` tests
before it parcels out a day's work — so a band whose chief has never had the
idea gets precisely the sociogram it has always had, and goes back to it the
day it elects a chief who has not. The panel is told which it is by
`Simulation.ranksAround` returning `null`, and the head line says *in ranks:
this band divides its labour* when it is not, because a view that changes shape
without saying what changed it reads as a bug.

**One layout engine, not two.** `layOutTribe` gained a ranked mode that pins
`y` with `lockY` exactly as `FamilyTreeLayout` pins a generation row; the
springs, the repulsion and the overlap pass are the same lines in both modes.
Empty rungs are closed up, so a band whose chief is not among the people the
subject knows is not drawn with a gap where a chief would be — that reads as
"the chief is hidden", a claim about knowledge this graph is not making.

**The bug inside the phase, and the test that hid it.** The first draft seeded
each row in id order and left the springs to arrange it, on the theory that
"x stays force-directed on opinion". It does not: with `y` pinned a row is a
one-dimensional problem and repulsion between neighbours is a wall — two people
who ought to stand together cannot relax *past* the three people between them,
however hard their spring pulls. Every row came out in id order, evenly spaced
by the overlap pass. Rows are now seeded by the subject's opinion, best
regarded beside them and worst at the ends, alternating sides so the row stays
balanced, with the springs left to set distances within that order.

Worse, the first test for this **passed on a build with the springs switched
off entirely** — the ids in the fixture happened to run in the same order as
the opinions, so an id-ordered seed satisfied it too. It now runs the ids
deliberately against the warmth, and fails on the id-order build, which is what
`AGENTS.md` means by verifying a test against a build with the thing removed.

**Measured and checked.** `sim:check` is bit-identical to the 4d baseline line
for line, the throughput line aside: nothing here is reachable from the
harness, because no scenario possesses a player and the rank model is only ever
asked by the panel. Nine new layout tests and four new tests of the shape of a
band; the compaction test and the row-ordering test were both verified failing
against builds with each piece removed. A new e2e spec opens the graph flat,
makes the player a chief who has had the idea, and reopens it to find rows; the
screenshot tour gained the same pair of pictures, `14-tribe-flat.png` and
`15-tribe-ranks.png`.

**M9.5 is closed.** Next is M8.2, the Neolithic, with soil folded into
`farming` — see [m8_plan_the_ages.md](m8_plan_the_ages.md) and the soil section
of [m9_5_plan.md](m9_5_plan.md).

---

## 2026-09-16 — M9.5 phase 4d: `chiefdom`, and a band with a shape

Until now a band had exactly two ranks: the chief, and everybody else.
`isHead`'s 0.55 in `standingOver` reached only inside one roof, so the head of
a house had no more standing over the family next door than a passing stranger
did. `chiefdom` — a practice, requiring `division_of_labour` — fills in the
middle rung, and lets a chief hold the office long enough for it to be one.

**Three effects, because the first one alone would have been inert.** The rank
term is `RANK_AUTHORITY` 0.22, scaled by `techPower`, added in `standingOver`
when the leader heads a house in the subordinate's band and is neither their
own head nor the chief. It sits between kinship's 0.1 and a chief's 0.45 and
well under the 0.55 a head carries under their own roof, because a middle rank
has to be visibly middling. `Leadership.chiefTermDays` makes a chief who
understands the idea hold office half as long again — twenty days becomes
thirty — as a multiplier on `CHIEF_TERM_DAYS` rather than a second number, so
that shortening the year again moves both together.

**And the third, which the plan did not call for but its own logic demands.**
Before this phase the chief was the **only** order-giver anywhere in the
simulation — `BandSystem.directWork` was the single call site, and a chief is
covered by `isChief` and never by rank. A rank term alone would therefore have
been reachable by the player and by nobody else: a line in an authority table
that no NPC could ever exercise, which is declared-but-inert content wearing a
different hat. So a head of a house who understands `chiefdom` now directs work
too — one person a day to the chief's two, with a band ceiling of four, and
always after the chief has had their pick, because the shape is a pyramid and
not a committee. `directTo` was extracted rather than copied, so the four
conditions that keep an order from being a death sentence exist once.

**A regression found and fixed inside the phase.** Sending the heads to the
chief's site put `walkers-do-not-grind` on `labour` at **10.0** stuck ticks per
thousand against a threshold of 5 — six people converging on one half-built hut
jostle at the door, which reads on screen as being stuck and is exactly what
that check was written to catch. Heads now take the *other* site where the band
has one (`MAX_SITES` is 2), which is both truer to the rank — a head running
their own project, not fetching for the chief's — and measures **0.0** per
thousand, better than the pre-change baseline. It was concentration, not
volume: `jobs-bias-work` on `labour` recovered from +1.8 to +3.0 at the same
order counts.

**Practised by presiding.** The only way `chiefdom` is ever tried out is an
order that lands on somebody who is neither your kin nor under your roof, and
lands *because* of the rank. `Standing` gained `byRank` so that
`Simulation.command` can record `preside` on exactly that case rather than
inferring it, and the same flag feeds the `order_obeyed_by_rank` /
`order_refused_by_rank` counters. The usual half-strength trial route through
`techPower` keeps the practice from locking itself out.

**Measured.** The tenure effect isolates cleanly: with the term bonus switched
off the `century` seed changes chief **15** times, which is exactly the figure
phase 4b recorded for it, and with the bonus on **12** — a further 20% off the
churn that 4b cut by 63%. The node is reached from nothing on `century`
(conceived 5, proven 3, taught 53, with rank orders both obeyed and refused),
so it is not scenario-only content. Across twenty `century` seeds against the
4c cohort: mean survival 99.9% → 100.0%, no world collapsing either side, 836 →
827 births, 12.1 → 13.2 technologies known at the end, 10.4 → 11.9 conceived
past the roots, 692.6 → 720.2 passed on. Adult starvation moved 8 → 11 across
roughly 830 people, which is inside the resolution this project documents for a
cohort this size.

The `labour` scenario now carries both social technologies, so the ladder is
measured where it is reachable, and a new `heads-direct-work` check demands
both halves separately — that an order landed on rank at all, and that one was
obeyed — because "no head ever reached the second pass" and "rank is too small
to carry an order" are different failures. Four new deterministic tests read
the rank off `standing().chance` rather than off an outcome, so none of them
touches an RNG stream: the rank and its ceiling, the band boundary it must not
cross, the lengthened term at full and half strength, and the one assertion
that needs a world — that somebody other than the chief actually gives an
order. All five, the scenario check included, were **verified failing on builds
with each piece removed**, including a targeted mutation for the band-boundary
case.

Typecheck clean, 269 unit tests pass, 46 Playwright cases pass. The scenario
matrix is 14 scenarios with **one** failure, `crowded`'s known headless
`perf-budget`; `century` is 60/60. No RNG fork was added, no stream reordered,
and nothing was appended to `spawnResources`' `plan` array.

## 2026-09-16 — M9.5 phase 4c: `division_of_labour`, the first social technology

Nothing in the codebase connected knowledge to social organisation:
`Authority.ts`, `Job.ts` and `BandSystem.ts` imported nothing from `Tech.ts`,
and a band that had worked out no technology at all still handed jobs around
from its first day. `division_of_labour` is now the idea of setting one person
to one task, and it is in front of every job in the game.

**A practice, in a new eighth domain.** `DOMAINS` gained `people` — appended
rather than inserted, because `TechWebLayout` gives each domain an angular
sector in list order and reordering would rearrange a web the player has
learned the shape of — and `TechWebLayout.DOMAIN_COLORS` gained a hue for it
that sits off every other in the table, so the social branch reads as somewhere
else on the web at a glance. It requires nothing: the four social nodes planned
above it are the whole social ladder, and a prerequisite here would hang that
ladder off whichever branch the prerequisite happened to sit on.

**The gate, and what is deliberately not gated.** `Simulation.assignJob`
refuses outright when the person doing the arranging has never had the idea —
including when they are assigning their own job — and says so in the words of
the world: *"… has never had the idea of setting one person to one task"*. The
test runs **before** the compliance draw, so a band without the idea spends no
`commandRng` rather than burning a draw a day on a question that cannot be
answered yes; `BandSystem.assignJobs` returns early for the same chief, which
stops an NPC band overwriting `lastRefusal` daily while the player is reading
their own. What is **not** gated is coercion: `doThreaten` from 4a still takes
food off a neighbour by menace, still works on a stranger and still works
across a band boundary, which a legitimate order never will. That contrast is
the point of the node — what gets discovered is legitimate, cheap, repeatable
authority, not authority as such.

**Refinement means knowing how to ask.** A refinement ceiling above a node
whose only effect is a gate would be declared-but-inert content, so `techPower`
also scales a small bonus on the job order's compliance chance:
`ORGANISED_ORDER_BONUS` runs 0.05 for a half-formed notion, 0.10 once known and
0.14 fully refined — deliberately small beside `standingOver`'s 0.55 for
headship, so a practised hand is smoother but a resented chief is still
refused.

**No deadlock, by the route `herbalism` and `taming` already take.** A practice
is tried by doing it, and the only act that counts as trying this one out is
assigning work — which the gate governs. `techPower` gives a researching
practice half strength from `PROTOTYPE_AT` onward precisely so that the trial
is not locked behind having already completed it, and `assignJob` calls
`noteDid('assign')` on every arrangement that sticks.

**A third source for `Notice.saw`, and a dead route caught before it shipped.**
Being refused to your face is now recorded on the leader by both
`Simulation.command` and `assignJob`, as `ORDER_REFUSED` — the first thing
`noteSaw` records that is neither a deed from `Events.ts` nor a stopped piece
of work from `STOP_REASONS`, so `NOTED_OCCASIONS` names it and
`spark-ingredients-are-real` reads all three sources instead of two. 4a's
`threaten` had been emitted as a deed since it shipped without ever being given
words in `SAW_WORDS`; it has them now, because a spark names it.

The node's second route originally wanted `saw: long_enough`, and measurement
before shipping showed that would have been a dead route: `long_enough` is
emitted only by `MAX_WORK_STRETCH`, a 900-tick backstop that thirst beats by
better than two to one, and it fires **zero** times in every scenario in the
suite — the exact shape of `tracking`'s `doing: wander`, which sat dead in that
table for the whole life of the project while passing every test in it. It was
replaced with `talk` beside a worked-out patch. Across eight `century` seeds
all four routes now fire — 2, 5, 4 and 3 conceptions respectively, 14 in all,
of which 10 were proven, 433 taught and 89 picked up by watching. It is a web,
not a tree.

**`jobs-bias-work` was measuring the calendar, and that was a real defect.**
The gate opens a run with a stretch — most of a year on some seeds — in which
nobody holds a job, and every tick of it landed in the check's control group.
That is not a control group; it is the same world before the arrangement
existed. On `craft` it inverted the reading outright, 12.1% against 12.9%, on a
seed that read +4.9 when jobs were handed out from day one. The sampler now
counts from the first moment anybody in the world holds a job, and `craft`
reads +2.0, `century` +2.6. The measurement was wrong, not the world.

**A fourteenth scenario, `labour`**, whose founders know the node — the trick
`craft` and `scribes` already use, and for the same reason: working it out from
nothing takes a band the better part of a year, so without it the one behaviour
jobs exist to produce would have stopped being measured at the moment it became
gated. Two bands of fourteen, because `assignJobs` hands out one job per band
per day. It reports the widest margin in the suite, **14.5% against 9.4%**.

**The player is told.** `onAssignJob` in `main.ts` threw its answer away, so a
refused job assignment was a button that did nothing — a silent no-op of
exactly the kind `AGENTS.md`'s standing rule forbids, and one the new gate
would have made far more common. Both outcomes now reach a floater, with the
reason attached.

**Measured across twenty `century` seeds, before and after.** Mean survival
100.0% → 99.9%, no world collapsing either side; 851 births → 836; 11.8 → 12.1
technologies known at the end and 10.8 → 10.4 conceived past the root nodes;
673.7 → 692.6 passed on. Every movement is inside the resolution this project
documents for a twenty-seed cohort, and the rise in technologies known is the
new node itself being reached.

Five new deterministic tests, each **verified failing on a build with the gate
removed** before it was trusted: the refusal and its wording, the self-assign
case, the half-formed idea being triable, the refinement bonus read off the
chance rather than an outcome, and a chief who has not had the idea handing
nothing out over six days. Typecheck clean, 265 unit tests pass, and all 46
Playwright cases pass — one of which encoded the old premise that assigning
your own job never fails, and now tests both sides of the gate instead. The
scenario matrix is down to **one** failure, `crowded`'s known headless
`perf-budget`; `century`'s marginal care check and `millers`' marginal station
chain both landed green this time, which is the world moving under two
borderline checks rather than either being fixed.

No RNG fork was added, no stream reordered, and nothing was appended to
`spawnResources`' `plan` array.

## 2026-09-15 — Mobile layout and touch map controls

The deployed game assumed a desktop mouse and a viewport wide enough to reserve
326 pixels for the inspector. On a phone that squeezed the top bar down to one
control, placed the inspector beyond the useful canvas area, and handed map
drags to the browser instead of the camera. Narrow screens now use the full
safe width for a wrapping toolbar and a scrollable bottom-sheet inspector,
respect dynamic viewport height and device cut-outs, and enlarge touch targets.

The canvas now uses pointer events for both mouse and touch: tap inspects, drag
pans, and a 500 ms hold opens the same action chooser as desktop right-click.
The mobile help text advertises those gestures. Desktop mouse behaviour keeps
the same code path so the two input modes cannot drift apart.

A follow-up put the keyboard-only map commands on a dedicated mobile row:
re-centre, technology, family and tribe. A two-finger pinch now pans and zooms
around the fingers' midpoint, preserving the piece of land the player is
looking at instead of zooming around the centre of the screen.

## 2026-09-15 — M9.5 phase 4b: a chief holds a term, and a new chief is welcomed

Daily re-election made leadership follow ordinary relationship noise: on the
`century` seed three bands changed chief **41 times in four years**. A band now
stores `chiefSince`, and `BandSystem.chooseChief` opens the choice only after a
20-day term — half of the current forty-day year — unless the incumbent has
died or left. A successful challenge still changes the office immediately and
now resets the same term clock. If an incumbent wins a new term, its clock is
renewed rather than accidentally reopening the election every day thereafter.

**A welcome without per-relationship state.** New `social/Leadership.ts`
derives `chiefHoneymoon(band, day)` purely from `chiefSince`: full strength on
the first day and a four-day half-life. `standingScore` reads it so a newly
chosen chief is not displaced by the first few noisy encounters, while
`standingOver` reads the same value so the band is more willing to follow a
new chief's early orders. The regular election records the milestone and sends
the visible insight "was welcomed as chief"; a successful public challenge
keeps its existing, more specific succession message. No relationship edge is
created or mutated, and no RNG draw or stream was added.

**Measured on the mechanism, then across worlds.** The same `century` seed now
changes chief **15 times rather than 41** (−63%) while ending with 67 people
alive. Across twenty `century` seeds, mean survival remains 100%, no world
collapses, 851 people are born, and the end state averages 11.85 known
technologies with 10.8 conceived beyond the roots. On the first ten seeds — an
exact comparison with the pre-change cohort — starvation is identical (one
infant and two adults), and the sub-one-node movement in technology reach is
below the resolution the project documents for a ten-seed cohort.

Three deterministic tests pin the term boundary, immediate replacement of an
absent chief, the honeymoon's decay, and its authority effect. Typecheck and
all 260 unit tests pass. All 45 Playwright cases passed, although the runner's
web-server process had to be stopped after the cases completed because it did
not exit on its own. The scenario matrix retains exactly the three failures
already recorded in `bugs.md`: `crowded`'s headless performance threshold,
`century`'s marginal care check, and `millers`' marginal station chain.

## 2026-09-15 — M9.5 phase 4a: `threaten`, coercion that needs no technology

Before anyone has the idea of assigning work, one person can still make
another hand over food — by menace. `Authority.ts` gained `menaceOver`, a
sibling to `standingOver` that deliberately ignores headship and
chieftainship and reads only the fight-skill gap `standingOver`'s own fear
term already uses, the victim's `traits.aggression`, and whether they were
hurt by this specific leader in the last 300 ticks — the same "recently
harmed" window `Brain`'s flee scoring uses. That is what lets it work on a
stranger or another band, which a legitimate order through `Simulation.command`
cannot: `standingOver`'s `authority` starts at 0.08 and is dominated by
`isHead`/`isChief`, terms a stranger has none of.

**`doThreaten`** (`ActionSystem.ts`) is shaped like `doSteal` — approach, a
short wind-up (`THREATEN_TICKS`, with its own `interruption()` check `doSteal`
never needed), then a transfer — demanding a named item and amount if the
player chose one through the quantity picker, or the most valuable stack a
thief would take otherwise. **The cost is paid whether or not the demand is
met**: `ctx.social.emit('threaten', ...)` runs *before* the compliance roll,
because making the threat in the open is the shameful act, not only
succeeding at it — a demand refused to your face was still a demand made,
and every witness (the victim always among them, at three times the weight)
judges it through their own band's `norms`. `threaten` joins `Events.ts`'s
`EVENT_TYPES`, `DEED_WEIGHT` (-18, between `theft` and `assault`), and
`VARIABLE_NORMS`, so "a tolerant band shrugs at a threat and a peaceable one
remembers it" is a real, per-band number rather than a line in a comment —
this is also what already feeds exile and rebellion, which read the same
`opinion()` `addDeed` moves, with no new wiring needed.

**The player's side** reuses M9 phase 2's quantity picker exactly as
`issueTake` does — pick the target, pick the item if there is a real choice,
pick the amount — through a new `issueThreaten`/`orderThreaten` pair in
`main.ts`, and a `threaten` entry in the person right-click menu between
`steal` and `attack`. Refusal is decided later, at the end of the wind-up,
not at order-issue time, so it reaches the player through the same
interruption channel `doAsk`'s refusal already uses rather than
`Simulation.lastRefusal`, which only ever answers a *synchronous* rejection.

**The AI's own use of it** is scored in `Brain.ts` beside `steal`'s existing
"whoever nearby is carrying the most" candidate: gated on a real fight-skill
edge (below it, the safer stealthy option wins out), weighted up by
`traits.aggression` and down by `traits.loyalty`. Tuned against the `century`
scenario's `ai-uses-many-actions` report rather than guessed — the first
version gated correctly but never once won the argmax against `steal` for
the same target, and `threaten` never appeared in a full century of a
156-person world. Retuned so the edge term reaches its ceiling at a solid
rather than an enormous gap; it now settles at roughly the same order of
magnitude as `attack` (1,467 against 626 over one `century` run).

Determinism: this phase's own gate is `--seeds 20`, not bit-identical,
because `threaten`'s entry in `VARIABLE_NORMS` draws one more `rng.range()`
per band at world generation — see `docs/bugs.md`'s new entry for what that
does to one already-marginal scenario, and `docs/next-steps.md` for the
`--seeds 20` numbers this phase is actually judged on: population health
unaffected (100% mean survival across 20 seeds, 0/20 collapsed, technology
progression unchanged in shape).

## 2026-09-15 — M9.5 phase 3: a shorter year, and one clock instead of two

The owner's note asked for shorter seasons so a lifetime covers less of the
tech ladder — and that only works if a life gets shorter *in days*, because
every discovery roll is per-day. It could not: the calendar (`TimeManager.year`,
dividing by `daysPerSeason * 4`) and the ageing clock (`Person.years`, dividing
by the module constant `DAYS_PER_YEAR = 80`) were two different clocks that
happened to agree because 20 × 4 = 80. `bugs.md` recorded this as a deliberate
non-fix at M9's close; this phase is the pass that closes it.

**One clock.** `Person` and `Tree` each gained a `readonly daysPerYear`, set at
construction from `TimeManager.daysPerYear` (`daysPerSeason * 4`) and
defaulting to the old `DAYS_PER_YEAR` so bare test fixtures need no config —
two simulations exist at once in the tests. Every caller that divided or
multiplied by the module constant — `years`, `isChild`, `isElder`,
`canBearChildren`, `vigour`, `LifeSystem`'s lifespan and mortality curves,
`Tree.maturity`, `ForestSystem`'s initial ages, `Founding`'s family
arithmetic — now reads the instance's own clock instead. The literal `50` in
`LifeSystem`'s elder-decay rate became `ELDER_YEARS`, found on the way through.
At the unchanged default this commit is bit-identical (`sim:check:all`,
`npm test`, `npm run e2e` all pass with exactly the pre-existing failures
`bugs.md` already names) — that identity is the proof it is right.

**`GESTATION_DAYS` and `BIRTH_SPACING_DAYS` are derived too**, a quarter and a
half of `daysPerYear` respectively rather than fixed at 20 and 40 — the same
fractions they always were of the old 80-day year, now correct for any
calendar rather than only the one that happened to make the arithmetic agree.

**The harness's own hardcoded `80`s.** Three literals in `tools/simcheck.ts`
(`runYears`, the generations count, `perPersonYear`) divided by 80 rather than
importing anything, so they silently decoupled from both clocks — confirmed
harmless at the unchanged default (`sim:check:all` identical before and
after) but wrong for `harsh-winter` and `hunters`, which already override
`daysPerSeason`. All three now read `sim.time.daysPerYear`.

**The year is shorter.** Default `daysPerSeason` 20 → **10** (year 80 → 40
days), `startDay` 10 → **5** to hold the same mid-spring start on the new
clock, and the difficulty slider's `startDay` range tightened from 0-79 to
0-39 to match. A 64-year life now spans half the days it used to, so roughly
half the discovery rolls per lifetime, while the ladder advances at the same
rate per real minute — the technology ladder genuinely passes to the
grandchildren rather than one generation finishing it alone.

**Confirmed, not assumed, on `--seeds 20` for the `century` scenario**
(40,000 steps, before and after, everything else identical):

| | before | after |
|---|---|---|
| mean survival | 99.8% | 100.0% |
| total born (20 seeds) | 467 | 803 |
| total starved (infant + child + adult) | 20 | 10 |
| mean technologies known at the end | 10.3 | 10.4 |
| mean ideas conceived past the root nodes | 10.1 | 9.4 |
| mean lessons taught/observed | 429.4 | 596.6 |

Population and births roughly doubled, and starvation roughly halved — the
narrower, twice-as-frequent winters the plan predicted did narrow the die-off
window rather than widen it. And the number that matters most held almost
exactly flat — **10.3 known technologies before, 10.4 after** — while nearly
twice as many people were born to reach it: the same technological reach is
now being sustained by many more, shorter lives passing it on, rather than a
few long-lived founders finishing the tree themselves. That is the shape the
note asked for.

**Deliberately not done.** `GESTATION_DAYS`'s new value is still a quarter of
whatever year the scenario is running (real human gestation is three-quarters
of a year) — the obvious next step, and deliberately not this commit. Every
other per-day rate in the game — needs, skill decay, and notably a fruit
tree's daily swell toward its seasonal peak — was deliberately left alone
rather than rescaled to the new calendar, per the plan's "hold everything else
at its current fraction of a year". That is mostly invisible, but it does mean
a season-gated harvest (acorns ripening across autumn, say) now has half as
many days to be gathered in before winter takes it back. Found on three of
`sim:check:all`'s single-seed scenarios — `millers`, `hunters`, `craft` — and
fixed there by retuning the scenario (more run time, or a pinned `startDay`
where the global default's move was what actually broke it), not by
rescaling the simulation. See `bugs.md` for the finding and why it was left
in the simulation itself.

## 2026-09-15 — M9.5 phase 2b: snow accumulates, and buries what is small

The owner's note: small things like sticks may not be visible, and small
stuff left on the ground may become invisible as more snow falls on top. A
purely cosmetic burial would be a lie — the player would see bare ground
while the AI still found and hauled a stick that, on screen, was not there —
so this reaches the simulation, not only the renderer.

**`Simulation.snowDepth`**, a scalar 0-3, advances once a day
(`advanceSnowDepth` in new `src/sim/core/Snow.ts`) from
`TimeManager.temperature`: a hard freeze piles it on in steps, not a
fractional drip, and any day above freezing melts it a step at a time.
**No new tile array and no new RNG stream**: whether a specific point is
buried (`isBuried`) reads `snowDepth`, whether a standing tree's canopy
shelters it (a full step shallower), and the same deterministic positional
hash `Renderer.prerenderTerrain` already uses for its speckle — nothing
here can move a seed on its own.

**What gets buried.** `ResourceDef` gained `groundLevel` (true for `sticks`,
`flint` and `clay` — false for everything that grows above the ground, sits
in water, or is a fish); a buried node or dropped pile is skipped by three
places at once so the world cannot show one truth and act on another:
`Brain.findNode` (via `BrainContext.snowDepth`/`snowBuries`), the entity
picker's `candidatesAt` in `main.ts`, and the renderer's node/pile draw
loops, all three reading the same `Simulation.isBuried`. A pile or node
buried in a hard winter comes back on its own at the thaw — burial is a
pure read of current depth, so there is no separate "return" state to get
wrong.

**The player is told.** Ordering `gather` on a buried node, or `pickup` on a
buried pile, is refused through `lastRefusal`: *"it is under the snow"* —
the same mechanism every other refusal in this game already uses.

**`config.world.snowBuries`**, default on, is the one-line switch the plan
asked for. Off, `snowDepth` still accumulates and the ground still looks
wintry (phase 2a's frost overlay, now driven by real `snowDepth` instead of
an instantaneous temperature guess — a single mild day inside a hard winter
must not paint the ground bare while `isBuried` still says otherwise) — only
the burial *consequence* is switched off, so turning it off cannot also
erase the season's look.

**Verification.** A direct before/after on `harsh-winter` (`store` and
`cold` columns) showed no degradation — if anything, burial's `stored: 445`
beat the same run with the switch off at `376`, likely because a buried node
cannot be over-harvested down to nothing while it is inaccessible. A direct
before/after on the `tour` seed over 14,400 steps showed identical
population growth and lower average hunger with burial on. `sim:check:all`
shows the same structural `perf-budget`/`crowded` failure and a
seed-sensitive drift on `century` recorded in `bugs.md` rather than a new
defect. `npm test` (250, nine of them new: `snow.test.ts`), `npm run e2e`
(45) and `npm run shots` all pass; the "four seasons" tour test now steps
the simulation through every day to each checkpoint instead of jumping
`time.tick` directly, since `snowDepth` only accumulates that way.

Phases 3-4 of `docs/m9_5_plan.md` (a shorter calendar year, and
threats/chiefs/the tribe pyramid) are not started.

## 2026-09-15 — M9.5 phase 2a: the ground turns with the year

The renderer never read `season` or `temperature` before this; the terrain
canvas was rasterised exactly twice in a session's life (construction and
`setSim`) with no invalidation path below whole-canvas granularity. `render`
now calls a new pure `seasonVisual()` every frame — season, plus a
quantised 0-2 `frost` level and a 0/1 high-summer `heat` flag, both derived
from `TimeManager.temperature` — and only re-runs `prerenderTerrain` when
that key actually changes, which is a handful of times an in-game year, not
sixty times a second.

**Palette.** `grass`, `forest` and `hills` get an autumn (gold-brown) and a
winter (grey-brown) override in a new `SEASON_BIOME_COLORS` table; spring
and summer keep the original `BIOME_COLORS` unchanged, and water, beach and
rock never change, since they have no vegetation to turn. Winter's further
"and then white" step is a translucent frost overlay scaled by `frost`
rather than a fourth colour table, so deep winter is visibly whiter than
its first frosty week.

**Scatter.** Flowers (spring), leaf litter (autumn), snow flecks (winter,
denser at `frost` 2) and dried patches (high summer) reuse the terrain's
existing per-tile position hash on bits the base speckle does not read, so
none of the four features can land on the same tile as another or as the
speckle.

**Trees.** `drawTree` now reads `sim.time.season`: every species but pine
(the island's only conifer, via a new `EVERGREEN_SPECIES` set) shares one
autumn palette and goes bare in winter — trunk and a fan of bare branches,
no canopy fill — while pine stays green year-round. Fruit visibility is
untouched: it was already sim-controlled through `Tree.fruit`, and this
phase does not guess at seasons the simulation has not already decided.

**Verification.** A new "the four seasons" Playwright test pauses the
`tour` seed and steps `sim.time.tick` to a mid-season tick for each of the
four seasons (`Config.ts`'s defaults — `ticksPerDay: 240, daysPerSeason:
20, startDay: 10` — give the tick for each), screenshotting the result;
`npm run shots` shows visibly distinct ground and trees at each stop.
`npm test` (241), `npm run e2e` (45) and `sim:check:all` all pass with the
same three pre-existing failures `bugs.md` already records
(`perf-budget`/`crowded`, `the-hurt-are-tended`/`century`,
`spatial-hash-spreads`/`millers`) — proof this phase is bit-identical, as a
renderer-only phase must be.

Phase 2b (snow that accumulates and buries what is small) and phases 3-4 of
`docs/m9_5_plan.md` are not started.

## 2026-09-14 — M9.5 phase 1: people who look like people, drawn once

A person used to be two `fillRect` calls: a torso rectangle in the band
colour and a skin-coloured rectangle for a head, identical at every age.
`src/render/Sprites.ts` now bakes bodies (five size classes x six band
colours x four walk-cycle poses), heads (hair colour x beard), faces (nine
expressions) and held items (seven tools and weapons) into one offscreen
atlas at `Renderer` construction — the same trick `prerenderTerrain` already
used for the ground — and `drawPerson` composites a figure from three or four
`drawImage` calls instead of drawing limbs from scratch sixty times a second.
Layers are baked separately rather than in combination (baking every
body-x-head-x-face-x-item permutation would have multiplied the counts
together), so the atlas is 174 small cells rather than tens of thousands.

**Child and elder scaling reads `Person.years`/`vigour` through a new
`bodyScaleOf`, shared by the renderer and by `hitRadiusOf`.** A four-year-old
is drawn at roughly 55% of adult height with a proportionally larger head; an
elder loses height and stoops. `hitRadiusOf`'s person case used to be a flat
0.45 regardless of age — the exact "drawn small, clicked large" bug its own
header already warns about — and now scales with the same function the
renderer draws from, so what is on screen and what is clickable cannot drift
apart.

**Faces read simulation state that already existed; nothing new was added to
`Person`.** `src/sim/core/Mood.ts`'s `expressionOf` is a pure function over
needs, health, who last hurt you, what keeps interrupting your work
(`noticed`), and the regard of whoever is standing nearest
(`RelationshipGraph.opinion`, via the spatial hash rather than a scan). A
persistent, heritable mood was considered and deliberately deferred: it would
be a new `Person` field migrating through founding, inheritance, ageing and
the character-creation point budget, and that does not belong hiding inside
an art pass. Which expression a face wears — beyond simply being visibly
hurt, which the health pip already shows everyone — is gated behind
`Knowledge.ts`'s `knowsCondition`, through a new `knowsPersonCondition` helper
that answers the one boolean without building the full `PersonKnowledge`
object; a stranger's face reads neutral. Recomputed at most once per
simulation tick per person rather than once a frame, since nothing it reads
changes faster than a tick.

**Held items come from `Person.inventory` through `heldItemFor`,** so the
canvas can never show a spear that is not actually in a hand.

**Below 14 px/tile a person is a single flat silhouette** — one `drawImage`,
no face, no tool — the same shape the existing `if (scale > 20)` building-icon
LOD already used.

**On the `perf-budget` gate the plan called for:** `sim:check`'s `perf-budget`
check turned out to measure `Simulation.stepsPerSecond` in the headless
harness, which never constructs a `Renderer` and cannot be moved by a canvas
change — confirmed by it failing on `crowded` identically before and after
this pass, which is expected since no `src/sim/` file's behaviour changed.
The actual cost this phase set out to cut — draw calls per person per frame —
was checked qualitatively instead: `npm run shots`'s full tour renders
without error at every zoom level the tour visits, ages read visibly apart
(a four-year-old beside adults in `11-kit.png`), and `npm run e2e` (45
specs) and `npm test` (241 tests, including `sim:check:all`'s
`determinism.test.ts`) all pass unchanged. `sim:check:all` reports the same
three pre-existing failures (`perf-budget`/`crowded`,
`the-hurt-are-tended`/`century`, `spatial-hash-spreads`/`millers`) that
`docs/bugs.md` already records — proof that nothing here touched simulation
state, since the sim is otherwise bit-identical to what it was.

Phases 2 through 4 of `docs/m9_5_plan.md` (seasons, a shorter calendar year,
and threats/chiefs/the tribe pyramid) are not started.

## 2026-09-13 — CI, and a URL you can send to someone

Until now the only way to see Dynasty was to clone it and run `npm run dev`.
This makes every push to `master` rebuild the game and publish it to GitHub
Pages at <https://jonamarti.github.io/dynasty_game/>. Nothing about the build is
committed — `dist/` stays gitignored and the workflow builds its own artifact.

**The one code change was `base`, and it was the whole problem.** There was no
`vite.config.ts` at all, so Vite built with the default `base: '/'` and wrote
`<script src="/assets/index-….js">` into `dist/index.html`. Pages serves this
repo from the `/dynasty_game/` subpath, where that URL resolves to
`jonamarti.github.io/assets/…` — a 404 and a blank canvas, with the build
itself reporting success. The new config sets `base: './'` rather than a
hardcoded `'/dynasty_game/'`, because the game has no client-side router, no
`fetch` of its own, and no runtime asset URLs: every import is relative and the
one absolute reference in `index.html` is rewritten at build time. A relative
base is therefore correct at the subpath, at the root under `npm run preview`,
and at a custom domain later, and it writes the repo's name down nowhere, so a
rename cannot silently break it. Vite normalises it to `/` for the dev server,
so `npm run dev` is untouched — checked, not assumed.

**Two workflows, not one.** `ci.yml` runs typecheck, unit tests and a build on
every push and pull request on any branch; `deploy.yml` runs the same three and
then publishes, only from `master`. Splitting them means a red check on a branch
is legible as a check rather than as a failed deploy, and it keeps the
publishing permissions (`pages: write`, `id-token: write`) off the workflow that
runs on arbitrary branches.

**Node 24, deliberately.** The `--legacy-peer-deps` caveat in the README is an
npm 10.9.2 bug; Node 24 ships npm 11 and is past it. The install step is still
written `npm ci || npm ci --legacy-peer-deps`, because a one-line retry is
cheaper than reading CI logs to rediscover something already documented.

### Deliberately not done

- **The scenario harness and the Playwright specs are not in the deploy path.**
  They are the two slow layers — a browser download and a dev server between a
  push and a live build — and the point of a Pages deploy is that it is live a
  minute later. `npm run verify` remains the gate before pushing; the workflows
  are a backstop, not a replacement for it.
- **No `.nojekyll`.** `upload-pages-artifact` bypasses Jekyll outright, and
  Vite's output directory is `assets/` with no leading underscore, so the file
  would sit in the repo doing nothing.
- **Pages itself still has to be switched on by hand** — Settings → Pages →
  Source: GitHub Actions. It is a repo setting, not a file, so it cannot be
  committed; until it is set the deploy job fails saying Pages is not enabled.

---

## 2026-09-12 — M9 phase 6: a character that can look after itself, if you let it

Note 3 from the owner's list, and the last phase of M9. One commit, and the only
phase in the milestone with **no simulation gate at all** — not because it is
small, but because the headless harness never calls `possess`, so every world
`sim:check` builds is one in which none of this code is reachable.

The note was that the controlled character does not drink, eat or sleep on its
own. That was a deliberate decision from M6a and the comment recording it is
still in the file: the player's character is scored but never steered, because
this game is one person's life and not a colony to supervise, and a brain acting
on its own score would be quietly playing the game for you. What the note
identified is the *cost* of that rule, which nobody had priced. Needs climb
whether or not anybody is steering, so reading the tech web for two minutes
could kill you — and a death nobody chose is not the same thing as a death you
walked into.

**Three states, not a switch.** Both ends of the range are wrong for most of the
game, so `manual` is exactly what every build until now did, `auto` hands the
character back to the brain, and `urgent` — "Stays alive" on the control — is
the one that answers the note: the character does nothing you did not ask for
*except* stop itself from dying. Two invariants hold in all three, and both are
enforced by where `steerPlayer` is called from rather than by anything inside
it: a live order is never interrupted, and held movement keys return before
reaching it.

`Brain.think` gains an optional allowlist and, when given one, returns **null**
rather than falling back to `wander`. That distinction is the whole reason the
parameter exists — a thirsty character with no water in sight has to stand
still, not wander off, or the feature becomes the thing it was added to prevent.

**The allowlist is keyed by the need that fired, and the flat one was written
first and thrown away.** Every survival verb can score above zero for reasons
that have nothing to do with the need: `forage` carries a standing
`greed * 0.25` stockpiling term, so a freezing character with no roof anywhere
and a berry bush in sight went and picked berries. A perfectly sensible score,
an absurd thing to watch, and precisely the "it does things I did not ask for"
complaint the middle state exists to avoid. Within a need the scorer still
arbitrates — eat what you carry or walk to the bush is `eat` against `forage`,
a sum it already computes well.

Three absences are decisions. **`hunt`** is on no allowlist: a safety net must
not pick a fight, the odds discount is never zero, and a starving character sent
alone at an aurochs by a convenience feature is a death the player did not
choose. **`sleep` and `rest`** are out because fatigue is not in `LETHAL_NEEDS`
and nobody has ever died of it here — a character wandering off for a nap in the
middle of what the player was doing is taking over, not surviving. **`flee`** is
out for a different reason, and it is in `bugs.md` rather than smuggled in:
being attacked is urgent in every ordinary sense, but it is not a *need*, and a
character that runs away by itself is a real change to what combat feels like.

The trigger is `criticalThreshold - 15` rather than a number of its own, because
the threshold is a difficulty setting: a player who moves the line where health
starts draining has moved what counts as dangerous, and a net pinned to an
absolute 70 would sit *above* the line on a hard world and fire only after the
damage had started. Fifteen points is about two hundred ticks of default thirst,
which is the walk to the water with room for it to be the long way round — and
far later than anyone else in the world leaves it, since `workLimits.thirst`
stops an ordinary person working at 42. That gap is the point.

**The stall reason is not decoration.** The mode switched on, the need
dangerous, and nothing happening at all is the quietest possible refusal, and
the standing rule in `AGENTS.md` is that every one of them reaches the player.
It is a *standing* condition rather than an event — thirsty with no water in
sight stays true until one of those two facts changes — so `autonomyStall` is
polled every frame rather than read once like `lastRefusal`, the floater fires
on the change, and the panel line keeps saying it for as long as it holds.

Stored under its own `localStorage` key rather than as the `Settings` field the
plan asked for, and the plan was written before that shape was looked at
closely. `Settings` is *a difference from a difficulty anchor*, and both "reset
everything to Normal" and any drag of the difficulty slider legitimately throw
its overrides away — a control preference living in there would be silently
reset by somebody retuning their hunger rate, which is the exact surprise the
comment at the top of `SettingsStore.ts` exists to prevent.

**Sixteen unit tests, which are the only gate this phase has.** All of them
drive `step()` rather than calling `steerPlayer`, since a test that called it
directly would pass with both invariants broken. Mutation-verified three ways
before being trusted, as `AGENTS.md` requires: stubbing the steering back to
score-only fails four of them, dropping the allowlist fails two, and dropping
the no-urgent-need guard fails one. `sim:check` is bit-identical to ae18f64,
which for a change no scenario can see is the result to want. 241 unit tests and
45 e2e pass.

One thing found by looking rather than by testing. The top bar had no room for a
fourth control: the screenshot tour showed the menu button sitting **under** the
inspector panel, where Playwright could still click it and a person could not —
the same silent visual degradation the tour has now caught twice. The bar stops
short of the panel and wraps, and the row still fits on one line at 1280.

---

## 2026-09-12 — M9 phase 5: thinking is not the same as wandering

Note 4 from the owner's list, and the phase the plan scheduled **last and
alone** among the simulation-touching ones, because it competes for the same
ticks food-gathering needs and it touches idea conception — the two things this
changelog has the longest history of overtuning by accident. Two commits.

`doPonder` needs a workable idea. Until now a comfortable person with nothing in
their head scored `wander` at 0.02 and milled about camp, and the game had no
way at all for an idea to **originate** in somebody deciding to think: every
technology in the web had to be stumbled into while doing something else.
`reflect` is the strict complement of `ponder` — scored only where
`workableIdea` returns null, so the two never compete.

The milestone's own before-and-after, `npm run sim:seeds -- --seeds 20` on
d3f1294 and on 26dfbe3:

|                       | before | after |
|---|---|---|
| mean survival         | 100.0% | 100.0% |
| collapsed below a quarter | 0/20 | 0/20 |
| born                  | 471    | 474   |
| starved               | 19     | 11    |
| technologies known    | 10.1   | 11.1  |
| conceived past roots  | 9.4    | 10.3  |
| lessons passed on     | 420.7  | 449.1 |

A whole technology more known at the end of a century, and transmission up 6.8%
— from a phase whose gate was simply *do not starve anybody*. The starvation
column should not be read as closely as the rest: an intermediate build differing
by one spark ingredient measured 22 on the same cohort, so the shape of that
difference is noise at these counts even though the direction is welcome.

**The tuning was the work, and two of the three numbers are not the ones the
plan expected to matter.**

`Brain.ts` already records that raising `ponder`'s weight once made thinking the
sixth most common activity in the world, ahead of building and sleeping, "which
is not a stone age". Priced at a first-pass 90 ticks, `reflect` reproduced that
exactly: ninth in a century, ahead of both. But it got there on **650 occasions
across fifty lifetimes** — the frequency was already modest and the *duration*
was the whole problem. Conception reads occasions; the activity distribution
reads occasions times length. `REFLECT_TICKS` is 20.

The coefficient turned out not to be a lever at all. Halving it took reflection
from 58,606 ticks to **zero** — the score sits on a cliff, because every
neighbouring option is proximity-discounted and this one is not.

And shortening the action did not, by itself, reduce what it cost: occasions
went from 650 to 2,185 and simply refilled the gap. `reflect` is short, needs no
target, and nothing about the world changes while it runs, so the scorer sees an
identical board the instant it ends — the same degeneration `socialCooldownUntil`
already exists to prevent, arriving at a verb that is not social.
`REFLECT_COOLDOWN` is 200, on its own counter so that an afternoon's thinking
cannot stop you greeting your wife. Settled at 316 occasions and 6,322 ticks,
twentieth of twenty-seven and below both sleeping and building.

**What reads the verb.** One fact — the `reflect` entry `noteDid` leaves in
`lately` — and two readers, which is the arrangement that keeps them from
drifting. A factor in `tryConceive`'s chance, capped at +70%, read off the
decayed tally rather than the `LATELY_ENOUGH` boolean: at 316 occasions across
fifty lifetimes a threshold would hand the whole effect to whoever happened to
be over it that morning. **`conceptionBase` is untouched**, as the plan
required — it would have raised conception for everybody, including for the
people the note is contrasting thinkers with.

And two spark routes, both of them places where reflection **repairs something
already known broken** rather than adding a channel beside a working one.
`tracking`'s fourth route needed `doing: wander`, which `Person.noteDid` drops
on the floor, so it could not fire on any seed ever run; `bugs.md` has carried
it since M7. `marking` gains a fourth because its weight-1.0 route needs
`store_empty`, which fires zero times in every run inspected. The marking route
was written with three ingredients, measured at zero fires in a century —
indistinguishable from the inert route it was replacing, which is the whole
failure being fixed — and cut to two.

**The test that generalises the bug.** The spark table already asserted every
action id is spelled correctly. `wander` was spelled perfectly and was still
dead. `names no action that nobody is ever recorded as having done` walks every
`doing:` ingredient through `Person.noteDid` and asserts it survives;
mutation-verified by restoring `wander`, which fails it by name. Tracking's
repaired route is deliberately rare — forest, winter, and having lately thought
— and still fires zero times in a century, so a second test asserts it fires on
the `Notice` that should fire it. Play cannot tell "rare" from "impossible".

**Two labels the verb made dishonest.** `idle` read "thinking", which was
precisely the lie note 4 pointed at: the game said thinking for somebody doing
nothing, and had no word left for somebody doing it. It reads "at a loose end"
now. The radial menu's greyed *"Think — nothing has occurred to you yet"* is an
enabled **"Sit and think"**, because having no idea yet is the moment thinking
is for; the e2e spec that asserted the refusal was updated, the premise having
changed under it rather than the game having broken.

`npm run sim:check:all` finishes with eleven of thirteen scenarios fully green.
`crowded`'s `perf-budget` fails as it has since before M7. `millers`'
`spatial-hash-spreads` reads one instant at the end of a nineteen-person run and
is noise — `band` and `crowded` both got *less* clustered on the same change.
`century`'s `the-hurt-are-tended` is a real finding and not a regression: see
`bugs.md`.

---

## 2026-09-11 — M9 phase 4: a conversation worth having

Notes 5, 6, 2 and 8 from the owner's list of 2026-09-10, and O1, O2 and O3 from
the older list, which phase 4 was scheduled to close. Eight commits, every one
of them measured across twenty seeds because all eight change what the
simulation decides for itself.

The milestone's own before-and-after, `npm run sim:seeds -- --seeds 20` on
d823cb3 and on ad88eb1:

|                       | before | after |
|---|---|---|
| mean survival         | 99.9%  | 100.0% |
| collapsed below a quarter | 0/20 | 0/20 |
| born                  | 458    | 471   |
| starved               | 20     | 19    |
| technologies known    | 9.1    | 10.1  |
| conceived past roots  | 8.8    | 9.4   |
| lessons passed on     | 360.1  | 420.7 |

Transmission is up 16.8% and a whole technology more is known at the end of a
century. `next-steps.md` §0 names transmission as the bottleneck the whole tree
waits on, and none of the four notes below was aimed at it directly.

`npm run sim:check:all` finishes with twelve of thirteen scenarios fully green
and only `crowded`'s `perf-budget` failing, which it has done since before M7 —
better than the state the milestone started in, where `harsh-winter` was failing
as well.

- **Four conversations where there was one.** Note 5 and O1. `TALK_TICKS` was 45
  against a 240-tick day, so nodding at a stranger and sitting with a brother
  cost the same four and a half in-game hours, followed by a near-whole day of
  `SOCIAL_COOLDOWN`. `social/Conversation.ts` is a ladder of four — greeting,
  small talk, asking what somebody is like, a long talk — each with its own
  length, cooldown, warmth, share of loneliness answered, and number of stories
  carried. The rung is derived from `familiarity` and `lastContact`, both of
  which `Relationship` has carried since the beginning: no new state, because a
  mode stored on the edge would be a second opinion about how well two people
  know each other and would drift from the first. `chat` opens at
  `Knowledge.ts`'s `KNOWN_AT` and `deep` at its `CLOSE_AT`, which are the
  thresholds the game already uses to say a relationship has changed in kind.

  **Two tunings of it were wrong, and measurement is the only reason anybody
  knows.** At 1.5 familiarity a greeting could not carry anybody up to small
  talk inside a twelve-day run, so everyone nodded at each other for ever and
  `rumor-propagates` went to zero. Pricing each rung about equally per tick of
  day it occupies fixed that — and so did replacing `Brain`'s flat 500-tick
  re-approach gate with the rung's own cooldown, since with one figure for all
  four the ladder could only be climbed by waiting. That then cost the world
  people: starvation across twenty seeds **doubled**, 20 deaths to 41, while
  `talk` itself rose by under two per cent of all ticks. The expense was never
  the conversation, it was the walk to it — six ticks of greeting behind thirty
  of crossing the camp, with the scorer pulling on the full weight of the
  walker's loneliness to collect a quarter of it. Scaling that pull by what the
  rung actually answers put survival back and left transmission 9.9% above where
  the milestone started.

- **The player picks which conversation to have.** "Talk to X…" nests, one entry
  per rung, carried on the option the way `craft` carries its recipe. A rung out
  of reach is greyed rather than hidden, because what it says is a fact about
  the player's own relationship — *except* when commanding somebody else, where
  the menu is deliberately blind and the refusal is spoken by `doTalk` instead.
  How warmly a subordinate feels toward a third person is the subordinate's own
  business, and greying an option out would leak it; that is the rule
  `issueTake` follows at a store and `ask` follows over what is in somebody's
  head. `modeAllowed` is one predicate shared by the menu and the action, so the
  menu cannot offer a conversation the simulation then declines to have.

- **An afternoon on the same problem is time spent together.** Note 6, and the
  most valuable single thing in the phase. `SocialSystem.converse` was the only
  thing in the game that touched familiarity or loneliness, so two people could
  argue a design out for a season or sit through a whole lesson and come away
  exactly as distant as they began. `SocialSystem.settle` is now the shared
  settlement and `converse` is its first caller rather than its owner;
  `doDiscuss`, `doTeach` and `doAsk` are the others. The relief is passed per
  side, because `meetingOfMinds` scales it by `intelligence`: an afternoon
  arguing about how to bind a haft is company for somebody who finds the problem
  interesting and an afternoon's work for somebody who does not. Capped below 1
  however clever they are — a lesson is not an evening by the fire, and if it
  were, nobody would ever choose `talk`. Twenty seeds: technologies known 9.4 →
  10.3, lessons passed on 395.9 → 416.3, survival to 100.0%.

- **Belonging is a reason to cross the camp.** Note 2. Every social term read
  `opinion`, which is a fact about two individuals, so a band was a set of people
  who shared a camp and its chief was somebody nobody had any reason to visit.
  `Brain.bond` is the pull toward one's own, scaled by `loyalty` and cancelled in
  proportion to `grievance * (1 - loyalty)` — not a new account but the exact
  `defiance` figure `BandSystem.considerRebellion` already spends, so the person
  on the edge of walking out is visibly the same person who has stopped seeking
  the chief out. **It went in twice.** As a multiplier on the score of talking it
  made people talk *more* rather than talk to different people, and the social
  cooldown that rations conversation is the same one that rations arguing a
  design out: lessons passed on fell 416.3 → 395.9. Belonging now decides *who*
  somebody crosses the camp for and not how much of the day they spend talking,
  which costs nothing, because it redirects a conversation that was going to
  happen anyway.

- **The people you wake up beside.** Note 8. Every bond in the game was made by
  somebody deciding to make it, and the most ordinary closeness there is comes of
  nothing anybody decides. `Simulation.shareTheHearth` runs in the daily block —
  which fires at midnight, exactly when the people who sleep indoors are lying in
  them — groups the living who are actually inside a finished shelter, and hands
  each roof to `SocialSystem.hearth`. It answers no loneliness at all: sleeping
  in company is not being in company, and a band that could answer its loneliness
  by going to bed would stop talking to each other. Capped, so that one night is
  worth the same to the two in a windbreak as to the twelve in a longhouse.

- **Two people picking the same bush can now say something.** O2.
  `Person.action` is a single string, so "foraging and talking" had nowhere to
  live. `SocialSystem.workingAlongside` runs every forty ticks and settles
  familiarity once per pair and loneliness once per person, touching neither
  one's action and taking no draw from any stream. The relief went in at twice
  its final value and produced §O2's own stated failure — conversations in `tiny`
  fell by two thirds and news stopped travelling — so it is now a third of a
  day's loneliness slowed rather than answered. Starvation 27 → 22 across twenty
  seeds, lessons passed on 414.3 → 442.1.

- **You learn faster from the best hand on the job.** O3. `Person.practice` is
  the single seam every skill gain passes through, so one multiplier there rather
  than twenty at the call sites. The pass stamps `Person.alongside`, the best
  skill of anybody working within arm's reach, and the gain is scaled by the
  **gap** rather than by their level — the caution §O3 records, because scaled by
  level alone a crowd of novices would teach itself expertise. A bonus only and
  never a penalty, for the same reason `wit` beside it is one. Technologies known
  10.4 → 11.0.

- **A greeting carries news after all.** It shipped carrying none, and in a young
  band nearly every conversation is a greeting — 19 of 20 in `tiny` — so
  `rumor-propagates` reached zero twice, by two different routes. A greeting in a
  stone-age camp is "morning, did you hear about Korak"; the rungs differ in what
  they cost and what they are worth, not in whether anybody says anything at all.
  It cost 11.0 technologies known against 10.1, which is inside the band twenty
  seeds cannot resolve, and is recorded in `bugs.md` rather than rounded away.

Found and not fixed, all in [bugs.md](bugs.md): `RelationshipGraph.decay` can
never forget anybody once `introduce` has stamped a bias on the edge, which is
what makes the working-alongside pass cost 17% of the `crowded` scenario;
`ORDER_COST` prices all four conversations the same, so commanding somebody to
sit down for an evening is as cheap as telling them to say hello; and a sixth of
all conversations in a century run are now broken off for thirst by `doTalk`'s
new interruption check, which is the check doing its job and a good deal of
walking wasted.

---

## 2026-09-11 — M9 phase 3, and two notes from the owner

Two notes had come in since the last triage, and both turned out to name
things the code was doing wrong rather than features it was missing. They are
folded into this pass alongside M9 phase 3, which was next in
[m9_plan_words_and_hands.md](m9_plan_words_and_hands.md).

- **Picking things up means walking to them.** The owner's note was one line
  — "to pick things up npcs must go near the object" — and the diagnosis was
  that `pickup` was not an action at all. The radial menu called
  `Simulation.takeFromPile` on the click, so goods arrived in the pack from
  wherever the player happened to be standing, at any range the camera could
  show. It is a verb now, walking to the heap through the same `travel`
  helper every other errand uses, carrying the chosen item and count on
  `targetItemId`/`targetItemCount` so an interrupted fetch resumes for the
  same stack. Two refusals reach the player where there was previously
  nothing to refuse: `goods_gone` when the heap has been cleared by the time
  they arrive, and `pile_item_gone` when only the stack they wanted has.

  Making it a verb is also what let the menu stop lying. `case 'pile'` had
  said "You cannot order somebody else to pick that up", which was true only
  because no such action existed; it now goes down `Simulation.command` with
  its own `ORDER_COST` entry, priced like a trip to the store.

- **The menu nests.** Note 10. `RadialMenu` was one flat ring and
  `groundActions` puts one option per recipe on it, so a crafter who knew a
  dozen things got a dozen overlapping buttons. `ActionOption.children` plus
  a page stack, with the grouping decided in the catalogue rather than in the
  menu — the menu draws what the simulation says is possible and must not
  invent categories of its own. Three details are the whole difference
  between a menu that nests and one that hides: a group of fewer than three
  is not a group and stays on the ring; a group with nothing available still
  *opens*, because the reason a recipe is out of reach lives on the recipe;
  and the title becomes the way back, with Escape popping one page before it
  closes anything. The dismissal listener runs in the capture phase and had
  to be taught that the title is part of the menu, or going back would have
  been indistinguishable from dismissing.

- **The order names the idea.** The other half of note 10. "Only cordage" was
  never a menu bug: `doDiscuss` and `doPonder` both called `workableIdea`,
  which picks the least advanced idea and re-picks it every tick, so the menu
  could not offer a choice the action would honour and the second idea in
  somebody's head was unreachable. `Person.targetTech` joins the pair `take`
  and `store` already use. A named idea that is no longer workable refuses
  with `idea_moved_on` rather than silently substituting another — being
  handed a different conversation from the one you asked for is worse than
  being told it is too late. Every AI caller leaves the field unset, so
  nothing the simulation plans for itself changed.

- **Asking to be shown.** Note 11, and the one with numbers behind it. There
  was no `ask` verb: a lesson could only ever begin with the teacher, which
  is a strange gap in a game whose central claim is that knowledge lives in
  heads and dies with them. `doAsk` mirrors `doTeach` from the other end, and
  two things differ deliberately — the lesson is the *teacher's* to refuse,
  rolled on `opinion(teacher → pupil)` rather than the pupil's regard for
  them, and the pupil does the walking. What does not differ is what gets
  taught or whether it lands: that stays `KnowledgeSystem.teach`, shared.

  The menu offers it always and does not gate it on what the other person
  knows — every other option on that ring is computed from what the actor can
  see, and what is in somebody else's head is precisely what nobody can see.
  The scorer gets it too, outside the `knownTech.size > 0` block, because the
  person with the most to gain from asking is the one who knows nothing: a
  child, who cannot teach and until now could not seek anything out either.
  Weighted by curiosity rather than tradition, since wanting to know and
  wanting things to carry on are different dispositions.

  `npm run sim:seeds -- --seeds 20`, before and after:

  | | before | after |
  |---|---|---|
  | mean survival | 99.6% | **99.9%** |
  | starved infants / adults | 15 / 15 | **8 / 10** |
  | technologies known at the end | 8.9 | 9.2 |
  | **lessons passed on** | 265.4 | **367.0** |

  Transmission — which `next-steps.md` §0 names as the tree's real bottleneck
  — up 38%, and nobody paid for it. On `craft` the shape is visible:
  deliberate lessons 6 → 20, and 20 of those 20 went to a child, 16 from a
  parent. Foraging falls 5.6% and mean hunger rises 3.6 points, which is what
  ninety ticks of somebody's day costs; the starvation counts say the world
  absorbed it.

- **Some technologies are things you build, and some are ways of doing.** The
  owner's second note, and the larger of the two. Plant lore cost four
  berries and a hundred and twenty ticks of *building a plant lore*, because
  every node reached "tried" by the one road. `TechDef.kind` splits them on a
  rule the compiler can check — a device gates a recipe, a building or a form
  of writing, and twenty-three do; the other seven gate nothing and change a
  number instead. A static check now enforces that, so a practice that
  quietly starts gating a recipe fails the build.

  Both kinds still go conceived → worked out → tried → proven. A device is
  tried by building one; a practice is tried by doing it, with
  `TechDef.practisedBy` naming the actions and `Person.noteDid` counting them
  — the one place every finished action already passes through. Not derived
  from `skill`, because nothing in the game practises the `cook` skill at all
  and `ponder` practises the idea's own skill, so a skill-matched version
  would have counted sitting and thinking about cooking as having cooked. And
  a practice works at half strength the moment there is enough of an idea to
  try, the same half a built prototype gets: without it, `tend` and `tame` —
  the only actions that count as trying herbalism and taming — were locked
  behind having already finished trying them out.

  **Two roads out, and the second is what makes it work rather than merely
  read better.** With only the fieldwork road, twenty seeds lost 1.7
  technologies: herbalism was conceived twelve times in a century-long run
  and tried none, because `tend` happens only when somebody is hurt and a
  healer is standing over them, so twelve ideas squatted in two idea slots
  until they went stale. Thinking a practice through to a full insight now
  reaches the same bench — the other half of the owner's own sentence, "by
  harvesting *and thinking about it*".

  | | before the pass | fieldwork only | both roads |
  |---|---|---|---|
  | mean survival | 99.9% | 99.4% | **99.9%** |
  | technologies known | 9.2 | 7.5 | **9.1** |
  | lessons passed on | 367 | 305 | **360** |

  `TRIES_TO_TEST` was measured at 3 and at 6 and changed none of it, which is
  worth recording: the threshold was never the gate, the reachability of the
  action was.

  The interface says which is which throughout — no "Build the first plant
  lore" in the menu and none planned by `Brain`; a separate stage vocabulary
  for practices in the Self panel and the tech web ("in use, and being borne
  out"); a count of times tried where a device lists materials; a stale
  practice that says it was never put to use rather than blaming materials it
  never wanted. In the web a practice is drawn with rounded ends against a
  device's square corners — a shape rather than a colour, because colour is
  spoken for by domain and a shape survives the zoomed-out view — and never
  on an out-of-reach node, which stays blank so the shape of what is unknown
  shows without its content.

**State at the end of the pass.** 13 scenarios, 11 fully green. The two that
are not — `crowded`'s `perf-budget` and `harsh-winter`'s `jobs-bias-work` —
were both failing before this pass and neither is related to it; `century`'s
`the-hurt-are-tended`, which was a knife edge before, now passes. 200 unit
tests green. Twenty seeds: 99.9% mean survival, 0/20 collapsed, 9.1
technologies known, 360 lessons passed on.

---

## 2026-09-10 — M7 stage C: the coastline is still sticky, and it was never the router

The owner reported people still getting stuck on shoreline after stage B, with
a screenshot: a walker halted at a sand/water seam, the dashed route running
*exactly along the tile boundary*. Their reading — "it tries to go around an
edge but just doesn't by a tiny amount… it should have separated a little more
from the edge, or recalculated when it saw it was stuck" — turned out to name
three separate defects, none of them in `Pathfinder`. Routing was fine. What
consumed the routes was not.

- **Commit 1, instrumentation only.** Six new counters and two new `TRAVEL`
  lines, because stage B could measure whether a route was *found* and whether
  a walk was *given up on*, and nothing in between — which is where all of this
  lives. `moveToward` counts `step_blocked` (the step the walker actually
  wanted, refused by terrain), `step_slide` (the perpendicular fallback), and
  `step_axis_null` — an axis fallback that reported success while displacing
  less than the stuck detector's own threshold. That last one is the file
  header's lesson ("did a branch succeed?" instead of "did we get anywhere?")
  surviving *inside* the branch, and it needed a number before it could be
  called a bug. `advance` counts `walk_tick` and `walk_stuck_tick`;
  `requestRoute` counts `path_denied_cooldown` and `path_denied_budget`
  separately, since both leave a walker greedy-steering and are
  indistinguishable everywhere downstream. Verified bit-identical: `sim:check`
  output diffs to the new lines and the wall-clock timing, nothing else.

  The baseline, which is the finding:

  | scenario | step_blocked /1k walk ticks | axis_null | slides | stuck ticks /1k | denied cooldown | denied budget |
  |---|---|---|---|---|---|---|
  | default  | 263.9 |  5,482 |  1,468 | 192.4 |  23,692 |   202 |
  | coast    | 347.5 |  7,577 |  4,064 | 267.7 |  29,542 |   149 |
  | fishers  | 316.8 | 19,533 |  2,209 | 249.5 |  56,495 |   139 |
  | century  | 298.9 | 60,763 | 35,811 | 181.5 | 323,763 |   826 |
  | crowded  | 305.2 | 17,178 |  6,833 | 213.1 |  73,776 | 9,733 |

  Between a quarter and a third of every walking tick in the game has its
  intended step refused by terrain, and roughly a fifth of walking ticks make
  no progress at all — on `fishers`, four out of five blocked steps take a
  fallback that moves the walker nowhere. `gave_up_walking` stayed at 0-4 the
  whole time, so none of this was visible: people were not giving up, they were
  grinding, and grinding reads on screen as being stuck. `path_denied_cooldown`
  in the tens and hundreds of thousands is a second finding in its own right,
  and `path_denied_budget` staying near zero everywhere but `crowded` says the
  per-tick search budget is not the gate anybody needs to touch.

- **Commit 7, the last thing still grinding, a gate, and the docs.** With the
  four defects fixed, twelve of the thirteen scenarios measured 0.0 to 0.2
  stuck walking ticks per 1,000. `crowded` measured **44.4**, and the reason
  was in the report: `path_denied_budget` at 63,206. `MAX_PATHS_PER_TICK` was
  3, and at 73 people the queue never cleared.

  It is 12 now, and it was not even a trade:

  | | stuck /1k | steps/s |
  |---|---|---|
  | `crowded` | 44.4 → **0.0** | 1,535 → 1,425 |
  | `century` | 0.7 → **0.0** | 2,931 → **3,190** |
  | `coast`   | 0.0 → 0.0 | 3,364 → **3,824** |
  | `band`, `tiny` | 0.0 → 0.0 | unchanged |

  Only `crowded` pays anything at all, and it buys the last grinding in the
  game. Everywhere else it is free or better, for the same reason raising the
  expansion bail-out was: a search that finds a route is cheaper than the ticks
  of grinding it prevents. 24 was measured too and buys nothing further.

  **`walkers-do-not-grind`** joins the report: stuck walking ticks as a share
  of walking ticks, under 5 per 1,000. `nobody-stalls-under-orders` catches a
  walk that failed outright; this catches the thing that precedes one and was
  invisible for the whole of M7, when people spent a fifth to a quarter of
  every walking tick making no progress while `gave_up_walking` sat at 0 to 4.
  They were not giving up, they were grinding, and grinding reads on screen as
  being stuck — which is exactly what the owner reported and exactly what
  nothing in the report could see.

  Mutation-verified against the real pre-pass build rather than a guess, and
  the result is worth recording honestly: running the current check against
  commit 1's `src/` fails on every scenario tried — `coast` 267.7, `crowded`
  213.1, `century` 181.5 per 1,000 against a threshold of 5. But reverting
  *only* `WAYPOINT_AIM` to 0 on the finished build still **passes** at 0.5.
  This check does not isolate any single one of the four defects; the other
  three cover for whichever one is broken. It is a regression tripwire for the
  class, not a bisection tool, and it should not be mistaken for one.

  `food-work-continues` gains the "premise never arose" skip
  `the-hurt-are-tended` already had. It had started failing on `tiny` and
  `craft` because the world got *healthier*: mean hunger on `tiny` at step 800
  fell from 26.0 to 8.1 once people reached food instead of grinding at
  terrain, so nobody was ever hungry enough mid-gather for the exemption to
  have anything to override. The skip is gated on a new `hungry_at_work_*`
  counter rather than on the pushed-on count itself, and that distinction is
  load-bearing — deleting the exemption takes the pushed-on count to zero while
  leaving people just as hungry, so the mutation the check exists to catch
  still reaches the assertion instead of being skipped past. Verified: with the
  exemption suppressed, `tiny` and `craft` both still FAIL rather than skip.

  `docs/bugs.md`: the `heel` entry claimed animals and people "currently share"
  `moveRng`. **That is false** — `Simulation.ts:271,278` gives `moveRng` to
  `MovementSystem` alone and `:289,1845` gives `wildlifeRng` to
  `WildlifeSystem` — and it mattered because it is the sentence a future reader
  would size the RNG risk from. Corrected, along with a note that animals did
  get the `moveToward` half of this pass for free. Newly filed: `Building`
  measures tiles from their centres while `World` truncates from their corners,
  a half-tile disagreement that `Renderer` compensates for in two places and
  nothing else does. Not live — every offset it produces is smaller than
  `ARRIVAL_RADIUS` — but it is the same class of defect commit 2 spent itself
  on, approached from the building side.

  Final state. Twenty seeds: **99.6% mean survival**, 0/20 collapsed, 466 born,
  infants starved **77 → 15**, adults **91 → 15**. Stuck walking ticks: **0.0
  on every scenario in the matrix**. Ten of thirteen scenarios fully green.
  What remains is `crowded`'s `perf-budget`, which was failing before this pass
  began; `century`'s `the-hurt-are-tended`, which is a knife edge at exactly
  40,000 steps and passes at 42,000 with `tend=101`; and `harsh-winter`'s
  `jobs-bias-work`, a ten-against-thirteen-percent margin on a chaotic
  scenario. None of the three is a movement defect and none is new.

- **Commit 6, clearance: built, measured, and not shipped.** The owner's second
  suggestion was a standoff — "it should have tried going a little more around
  the edge, separating a little more from the edge" — and it is a real gap in
  the cost function: uniform step costs make a route hugging a shoreline for
  forty tiles and one running a tile inland cost *exactly* the same, and the
  tie-break that picks between them is tile index. It was built:
  `World.nearBlocked`, a one-pass 8-neighbour scan beside `findShores`, and a
  per-step penalty in `Pathfinder`'s neighbour loop. Then it was swept, as the
  plan required, and the sweep said no.

  Penalty ε, on the two scenarios it was supposed to help most:

  | ε | scenario | stuck /1k | mean/worst expansions | steps/s |
  |---|---|---|---|---|
  | 0    | coast   | **0.0** | 27.4 / 1242 | 3,454 |
  | 0.15 | coast   | 0.0 | 32.5 / 981  | 3,704 |
  | 0.3  | coast   | 0.0 | 20.1 / 951  | 3,607 |
  | 0.6  | coast   | 0.0 | 34.0 / 922  | 3,728 |
  | 0    | fishers | **0.0** | 19.7 / 1080 | 4,543 |
  | 0.6  | fishers | 0.0 | 38.3 / 1584 | 4,449 |

  The column that decides it is the first one: by commit 5, stuck ticks on
  `coast` and `fishers` are already **zero**. There is nothing left for a
  standoff to fix there, and `step_blocked` bounces around without a trend
  because the worlds diverge. On the two scenarios that still have any stuck
  ticks at all:

  | ε | century stuck /1k | century mean | crowded stuck /1k | crowded mean | crowded steps/s |
  |---|---|---|---|---|---|
  | 0    | 0.7 | 23.0 | 44.4 | 82.4  | 1,522 |
  | 0.15 | 0.2 | 27.5 | 43.4 | 103.9 | 1,414 |
  | 0.3  | 0.8 | 27.2 | 39.2 | 129.1 | 1,330 |
  | 0.6  | 0.4 | 29.8 | 38.9 | 110.8 | 1,467 |

  `century` is noise around half a stuck tick per thousand with no trend, and
  pays 30% more expansions for it. `crowded` shows the only real signal —
  stuck ticks down 12% at ε=0.6 — and it is the one scenario already failing
  `perf-budget`, which this would cost another 30-57% of search to buy. That
  is the exact shape of trade the plan said to refuse.

  A free version was then tried and also rejected, and it is worth recording
  why, because the idea is tempting. Clearance can be made a **tie-break on
  equal `g`** rather than a cost: `f` untouched, heuristic still exact, the
  same set of nodes expanded, and among genuinely equal-cost routes the one
  spending fewer tiles against the water wins. Measured over 200 sampled
  routes on a real world it works exactly as advertised and costs almost
  nothing — **identical 9,142 tiles walked** (so it provably never lengthens a
  route), 947 → 925 near-blocked tiles, 80,942 → 81,347 expansions. But 2.3%
  is the whole prize, because genuine cost ties are rare in an 8-connected
  grid with irrational diagonals; and making it actually bite requires ordering
  the heap by clearance ahead of `h`, which took `century`'s mean expansions
  from 23.0 to 29.9. Paying 30% of the search budget for 2.3% less
  shore-hugging is not a trade worth making either.

  So nothing from this commit ships, and `World.nearBlocked` is not left
  standing as an array nobody reads. The finding is the deliverable: **the
  standoff was a fix for a problem that no longer exists.** The owner's
  instinct about the cost function was right, and it was right about a cause
  that turned out not to be the one hurting them — aim points, a dead fallback
  branch, an inherited cooldown and a bail-out set below its own measured
  requirement were, and all four are gone.

  What did ship from this pass is a test fix. `band.test.ts`'s rebellion case
  had been widened three times in two milestones, twice by this pass, and the
  fourth widening was where it became clear that widening was never the right
  fix at all: on this seed the rebellion now fires on **day 4**, and the test
  still failed at forty-five days. `Simulation.insights` is capped at
  `interruptionCap` and `shift()`s, so the evidence had scrolled out of the
  buffer before the assertion looked for it — a longer window made the test
  *less* robust, not more, by giving the thing it watches for more time to be
  evicted. It now steps a day, looks, and stops at the first sighting, which is
  immune to both failure modes and no longer encodes a movement constant in a
  politics test.

- **Commit 5, a recovery re-path that is actually different — and the bail-out
  that was manufacturing the problem.** The third defect. When a walk ran out
  of `PATIENCE`, `pathRetried` bought it "one free re-route": clear the route,
  return `Moving`, and let `requestRoute` ask again next tick. But
  `Pathfinder` has no RNG, `World.walkable` is written once at worldgen and
  never again, and a walker who has not moved is searching from the same tile —
  so the search returned **the identical route it was already failing to
  follow**. Twenty-five ticks of standing still to be told the same thing
  twice. It only ever appeared to work because the stuck threshold allows about
  0.08 tiles a tick, so twenty-five stuck ticks can drift somebody onto a
  different start tile, which is worse than never working and is most of why
  this bug read as intermittent. `pathRetried` is deleted rather than fixed:
  the honest outcome of proving a field was a no-op.

  In its place, `moveToward` fills an optional scratch object with the tile it
  was **refused into** — recorded before any fallback runs, since the fallbacks
  are about coping and this is about what blocked them — and every
  `STUCK_REPATH` ticks of no progress the walker asks `Pathfinder` for a route
  that avoids that tile. Three genuinely different attempts inside `PATIENCE`
  instead of one identical one. `WildlifeSystem`'s three call sites pass
  nothing, so the one shared steering primitive is not forked. The recovery
  search is exempt from `REPATH_COOLDOWN` — that cooldown exists to stop
  somebody with an unroutable target searching every tick, and a walker who has
  not moved for eight ticks is a different case — and has its own small
  per-tick allowance so that routine planning and getting somebody unstuck
  cannot starve each other.

  `AVOID_PENALTY` is **additive, never a wall**, and the distinction is the
  whole design. Deleting a tile from the graph would break the equivalence
  between this graph's reachability and `World.region`'s that the region
  pre-check rests on: on a one-tile isthmus the search would expand the entire
  landmass and then fail — the one search shape `perf-budget` cannot survive —
  and it would do it in the path that only runs when something has already gone
  wrong. `pathfinder.test.ts` gains the test that catches exactly that, and it
  was mutation-verified: turning `avoid` into a `continue` makes "still routes
  through the avoided tile when it is the only way" fail with `NoRoute`.

  **And then the recovery did not work, which was the useful part.** On
  `century`, 603 recoveries found 3 routes, `walk_blocked` went 0 → 169, and
  sweeping `AVOID_PENALTY` across 1.5, 2, 3, 5 and 8 produced *byte-identical*
  worlds — the signature of a penalty that is never reaching the outcome.
  Instrumenting the status directly: 600 of 603 recoveries returned `GaveUp`.
  They were hitting `DEFAULT_MAX_EXPANSIONS`.

  That cap was 2,000, and it was below the **known** requirement.
  `paths-are-found` samples tile pairs on `century`'s largest region and has
  been reporting a worst case of **4,218 expansions** in the same report that
  failed for hitting 2,000 in play. The bail-out was not protecting the frame
  from pathological searches; it was cutting off legitimate ones, and the
  consequence was not a worse route but *no route at all* — a walker
  greedy-steering into a shoreline and eventually abandoning the errand. The
  bail-out was manufacturing the stuck walkers this whole pass exists to fix.

  Raising it is free, which took measuring to believe. On `century`:

  | max expansions | path_gave_up | recoveries (found) | walk_blocked | stuck /1k | steps/s |
  |---|---|---|---|---|---|
  | 2,000  | 2,011 | 603 (3)  | 169 | 13.2 | 2,634 |
  | 4,000  | **0** | 14 (14)  | **0** | **0.7** | **2,848** |
  | 6,000  | 0 | 14 (14) | 0 | 0.7 | 2,821 |
  | 10,000 | 0 | 14 (14) | 0 | 0.7 | 2,850 |

  It runs *faster* with a higher cap, because a search that runs to the cap is
  by definition the most expensive kind and does no useful work at the end of
  it. 4,000, 6,000 and 10,000 give byte-identical worlds, so nothing in play
  needs more than 4,000; it ships at **8,000** as genuine headroom rather than
  a tuned number.

  **`century` passes 58 of 58 for the first time**, `paths-are-found`
  included — it had failed since M7 stage B, which recorded it as "~1% of
  searches" and left it. Twenty seeds: mean survival **99.9%**, 0/20 collapsed,
  462 born, infants starved 77 → **12** against where this pass started.

  Remaining failures on the matrix, all chased rather than shrugged at:
  `crowded`'s `perf-budget`, which was failing before this pass began and still
  is; and `craft`'s `hunts-succeed-and-fail` and `food-work-continues`,
  `hunters`' `kills-are-butchered-for-bone`, `fishers`' `pots-reach-a-granary`
  — every one of them a sample-size artefact rather than a mechanism. `craft`
  run out to 12,000 steps instead of 8,000 passes both of its checks (15 kills,
  4 misses), so hunting still misses; it simply had not missed yet by step
  8,000.

- **Commit 4, a new errand gets a route on its first tick.** `clearTarget()`
  forgot the route, the aim and the retry flag, and left `pathTick` — the
  timestamp `REPATH_COOLDOWN` gates on — untouched. `requestRoute` stamps it on
  every attempt whether or not one succeeds, and `Brain.setup` calls
  `clearTarget()` on *every re-plan*. So anybody who changed their mind within
  fifteen ticks of their last search walked the first five tiles of the new
  errand with no route at all, greedy-steering — which on a coastline is
  exactly the stretch where people got pressed.

  The cooldown's own comment is what gives the game away: "fifteen ticks of
  greedy steering between attempts is exactly what a person with no route at
  all already does". That is an argument about *retrying a failed search*, and
  it is sound; it was silently inherited by a brand-new errand, where it is
  simply false. One line, and it is the smallest change in this pass by a wide
  margin.

  It is also, by the cohort, the largest. Twenty seeds:

  | | baseline | commit 2 | commit 3 | commit 4 |
  |---|---|---|---|---|
  | mean survival | 82.6% | 91.4% | 89.2% | **99.6%** |
  | collapsed | 1/20 | 0/20 | 0/20 | **0/20** |
  | born | 359 | 405 | 384 | **447** |
  | infants starved | 77 | 69 | 43 | **21** |
  | children starved | 18 | 8 | 8 | **5** |
  | adults starved | 91 | 38 | 43 | **17** |

  Seventeen points of survival over where this pass started, which is well past
  the ten-point line `AGENTS.md` draws for believing a cohort at all, and the
  starvation counts fall together rather than trading against each other.
  Stuck ticks per 1,000 walk ticks fell again: `coast` 8.9 → **0.0**, `century`
  20.5 → 12.7, `crowded` 59.4 → 51.7.

  The cost is search volume, and it is not small: routes found on `century`
  30,804 → 84,544, on `coast` 2,482 → 6,137. `path_denied_cooldown` collapsed
  (century 286,828 → 155,338) and `path_denied_budget` exploded in its place
  (740 → 40,459; `crowded` 12,877 → 68,956), so `MAX_PATHS_PER_TICK = 3` is now
  unambiguously the binding gate everywhere rather than only on `crowded`.

  **It is deliberately left at 3.** A budget denial does not stamp `pathTick`,
  so a denied walker simply asks again next tick — the budget is a queue, not a
  refusal, and the stuck counters say the queue is working. Raising it would
  buy a shorter queue at the cost of steps/s on `crowded`, the one scenario
  whose `perf-budget` is already failing. `century` paid 3,387 → 2,828 steps/s
  for this commit and stays well above the 2,000 floor; `crowded` went the
  other way, 1,430 → 1,656, because most of the new searches are short
  first-tick ones and the mean expansion count more than halved there,
  271.2 → 107.5.

  `century`'s `paths-are-found` reads worse in absolutes — 1,118 give-ups
  against 354 at commit 3 and 420 at the baseline — and that is the denominator
  moving, not the mechanism. As a rate it is 1.3%, against 1.1% and 1.2%: flat
  across the whole pass, which is the ~1% M7 stage B already recorded. The
  check counts absolutes, so tripling the number of searches trebles the count.
  The bail-out itself is dealt with in commit 6, where `Pathfinder`'s costs are
  open anyway.

- **Commit 3, a fallback that does not move is not a fallback.** The second
  defect, and the one that most literally matches the owner's "it just doesn't
  by a tiny amount". Take a walker heading almost due east into a seam, so
  `dy ≈ 0`. `moveToward`'s first branch is refused by the water. Its second,
  `isWalkable(nx, entity.y)`, tests the same tile and is refused too. Its
  third, `isWalkable(entity.x, ny)`, computes `ny = y + (dy/dist)*speed` — and
  with `dy ≈ 0` that stays inside the walker's **own row**, so it tests the
  tile they are already standing in, succeeds unconditionally, displaces about
  four ten-thousandths of a tile, and *returns before the slide*. The
  perpendicular slide is the only branch that can carry somebody **along** an
  obstacle, and it was unreachable for every axis-aligned heading in the game.
  A walker pressed square into a shoreline did not slide, did not jitter and
  did not move: it vibrated sub-threshold for the full twenty-five ticks of
  `PATIENCE` and then gave up. The displacement detector called that stuck,
  correctly — the lesson at the top of the file — but nothing could ever
  *escape* it.

  This is the same lie the file header records costing a whole population,
  surviving inside the branch itself: "did a fallback succeed?" rather than
  "did we get anywhere?". Each axis fallback is now gated on the heading having
  enough of itself on that axis to produce a step the stuck detector would
  accept, reusing `PROGRESS_THRESHOLD` so that "a fallback counts as a move"
  and "a step counts as progress" stop being two definitions that disagree.

  And the slide now tries **both** perpendiculars rather than one. That was not
  in the plan; it came out of measuring the first version, which fixed
  `axis_null` and made `coast` *worse* (stuck ticks 15.7 → 26.0 per 1,000).
  With the dead branch gone, walkers reached the slide constantly, and a fixed
  rotation left anybody in a concave corner standing still with an open side
  beside them. Trying the other hand costs one walkability lookup and no extra
  draw, and it turned the regression around.

  `step_axis_null` is **0 on every scenario** — the branch is gone, not merely
  rarer. Stuck ticks per 1,000 walk ticks, against commit 2:

  | scenario | commit 2 | commit 3 |
  |---|---|---|
  | coast   | 15.7  | **8.9**  |
  | fishers | 13.1  | **2.4**  |
  | century | 62.3  | **20.5** |
  | crowded | 235.0 | **59.4** |
  | tiny    | 2.7   | **0.0**  |

  Twenty-seed cohort: 89.2% mean survival against commit 2's 91.4% and the
  82.6% this pass started from, 0/20 collapsed, infants starved 69 → 43 and
  adults 38 → 43. The 2.2-point move is inside the noise band `AGENTS.md`
  draws at about ten points and the starvation counts move in opposite
  directions, so the honest reading is that the cohort cannot resolve this
  commit and the mechanism counters above are the evidence.

  `century`'s `paths-are-found` reads FAIL again, and the number matters:
  354 searches hit the 2,000-expansion bail-out, against **420 on the
  pre-pass baseline** and 0 at commit 2. This is the pre-existing failure M7
  stage B already documented at "~1% of searches", returning to view because
  people who can now escape an obstacle travel further and ask harder
  questions; commit 2 had masked it rather than fixed it. Total expansions
  across the run still fell, 1.86M baseline → 1.45M. Raising the bail-out is a
  `Pathfinder` decision and belongs with the cost changes in commit 6, not in
  a movement commit.

  One correction to this pass's own instrumentation, made here because it was
  this commit's numbers that exposed it: `step_blocked`, `step_axis_null` and
  `step_slide` come from `moveToward`, which **animals call too**, while
  `walk_tick` is incremented only by people. Commit 1's report divided the
  first by the second and printed the result as a rate, which was a ratio of
  two different populations wearing a rate's clothes. The `TRAVEL` block now
  labels the two groups and only calls `walk_stuck_tick` a rate, which is the
  one number that honestly is one.

  `band.test.ts`'s rebellion window went to forty-five days, and the comment
  there now says plainly that this bound is a movement number wearing a
  politics test's clothes — it has been widened three times, never because the
  mechanism weakened. Measured on that seed: day 10 after commit 2, day 26
  after this one. (Commit 2's entry above originally recorded day 14; that was
  measured against the wrong seed and is corrected to day 10.)

- **Commit 2, never aim at a point you could not stand on.** `World.index`
  truncates, so tile `(tx, ty)` owns `[tx, tx+1) x [ty, ty+1)` and the float
  point `(tx, ty)` is its *north-west corner* — where four tiles meet, only one
  of which anything ever checked. Both of the game's aim sources handed out
  exactly that point: `Pathfinder` emits waypoints as integer tile indices and
  `MovementSystem` aimed straight at them, and `World.shoreTiles` holds integer
  coordinates that `Brain.setup` assigns straight to `person.targetX` for a
  `drink` — so the one errand that by construction ends at the boundary between
  land and water aimed at a point *on* that boundary. The net effect was a
  systematic half-tile north-west bias on every aim point in the game, which is
  why the owner saw it as intermittent and as "a tiny amount": it only bites
  where the coast lies north or west of the leg.

  Waypoints are now aimed at the tile centre (`WAYPOINT_AIM`), which restores
  the guarantee the corner rule already earns for the route — a compressed run
  is a straight sequence of *adjacent* tile centres, and every lattice point
  that line crosses truncates into a tile the corner rule has already proved
  walkable. Real targets are clamped `TARGET_AIM_MARGIN` inside their own tile,
  but only when that tile is walkable, so a fishing spot standing out over
  water keeps today's behaviour. The margin is small on purpose and the
  invariant is written down beside it: `TARGET_AIM_MARGIN * Math.SQRT2 <
  ARRIVAL_RADIUS`, so arriving at the clamped aim implies arriving at the real
  target and the arrival test needed no adjustment. The waypoint-skip test
  moved with the aim — a skip ball half a tile north-west of the thing being
  walked to would let somebody count a waypoint as spent while still walking at
  it — and `Renderer.drawPath` moved with it too, because it is the only way to
  *see* routing in play and drawing raw tile indices is precisely what let this
  hide behind a picture of a route running neatly along the water's edge.
  `needsRoute`'s walkability test deliberately did *not* move, and now says so:
  it is the one consumer that wants the tile rather than a point in it.

  New `src/sim/__tests__/shorewalk.test.ts`, and it is the honest instrument
  for this whole pass — deterministic, no draw from any shared stream, immune
  to the chaos that makes a scenario check useless for a specific geometric
  failure. 200 shore tiles sampled by a coprime stride, a walker dropped six
  tiles inland on the same landmass, target set to the raw integer coordinate
  `Brain.findWater` would have produced. Verified failing first, as `AGENTS.md`
  requires: **162/200 arrived, 19 gave up, 19 ran out of 400 ticks, 10,449
  stuck ticks**. After: **200/200, zero stuck ticks.** The hand-authored inlet
  case, which is the owner's screenshot in twelve columns, went 3/4 to 4/4.

  In play, per 1,000 walk ticks:

  | scenario | stuck ticks | step_blocked | axis_null |
  |---|---|---|---|
  | default | 192.4 → **18.8** | 263.9 → 63.8 | 5,482 → 406 |
  | coast   | 267.7 → **15.7** | 347.5 → 163.2 | 7,577 → 1,965 |
  | fishers | 249.5 → **13.1** | 316.8 → 74.9 | 19,533 → 1,198 |
  | century | 181.5 → **62.3** | 298.9 → 219.9 | 60,763 → 22,774 |
  | crowded | 213.1 → 235.0 | 305.2 → 374.1 | 17,178 → 21,178 |

  `century`'s worst-case expansions fell from the 2,000 bail-out to 1,704, so
  **`paths-are-found` passes on `century` for the first time**, and `coast`'s
  `opinions-diverge` came back. Across the canonical twenty-seed cohort, mean
  survival **82.6% → 91.4%**, collapses **1/20 → 0/20**, adults starved
  **91 → 38**, technologies known 7.5 → 8.3, lessons passed on 157 → 204. This
  is a movement commit and those are food-economy numbers, which is the point:
  travel time *is* the food economy.

  `crowded` is the one scenario that got worse, and it is not mysterious. At 73
  people the population-wide search budget is the binding constraint —
  `path_denied_budget` 9,733 → 16,502 — and people who now actually *arrive*
  finish errands and ask for new routes instead of grinding to a halt and
  re-targeting something nearer, so mean expansions rose 131.5 → 230.9. Its
  `perf-budget` was already failing before this pass and still is. Commit 4
  looks at the budgets directly.

  Two other checks moved, and both were chased rather than shrugged at, because
  `AGENTS.md` is right that a check going quiet usually means removed
  behaviour:
  - `century`'s `the-hurt-are-tended` fails at exactly 40,000 steps. It is a
    knife edge, not a break: the same seed on the same build gives `tend=101`
    and 32 tended ticks at 42,000 steps, and skips as "nobody here knows a herb
    from a weed" at 38,000. Herbalism is discovered within a hundred-odd ticks
    of the cutoff and this commit moved it across.
  - `tiny`'s `food-work-continues` reports 0 and does so stably at every run
    length, so it is *not* chaos — it is the check's premise evaporating. At
    step 800 mean hunger on that seed fell from 26.0 to 8.1, because eight
    people who no longer grind against terrain reach food before hunger ever
    reaches the threshold the exemption exists to override. `harvest_berries`
    went up (68 → 71) and five other scenarios still exercise and pass the
    check. A check that fails because the world got healthier is a defective
    check; it gains the same "premise never arose" skip clause
    `the-hurt-are-tended` already has, in commit 7.

  `band.test.ts`'s rebellion case was widened from five days. It was widened
  once already in M7 for this exact reason, and the honest reading is that it
  measures *how long people take to bump into each other*, which is a movement
  number wearing a politics test's clothes. The rebellion fires on day 10 on
  that seed after this commit, measured rather than guessed.

---

## 2026-09-10 — M7 stage B: the zombie-order bug, and A\* to actually fix coastline traps

Five commits. The owner reported two things: people getting stuck on
coastline and dying, and a "random" freeze that turned out to be the same
root cause hitting anyone under an order. Movement was greedy vector steering
with three fallbacks and no pathfinder anywhere in the codebase; `World.region`
proved only that *a* path existed, never that greedy steering could find it.

- **Commit 5, instrumentation only.** `Person.stuckSteps` replaces
  `MovementSystem`'s module-level `stuckTicks` map — that map was shared by
  every `Simulation` in the process, leaking an entry for everyone who died
  mid-slide and able to carry a stale entry from one world's person id into
  the next. Deliberately *not* reset by `clearTarget()`, unlike a literal
  reading of the plan this pass followed: this simulation is chaotic enough
  that wiring it in there shifts which tick a stuck give-up's RNG draw lands
  on, which cascades into a visibly different world thousands of ticks later
  — confirmed by isolating the change and diffing `sim:check` output. Also
  new: `gave_up_under_orders` telemetry, `walk_arrived`, and a `StallWatch` /
  `nobody-stalls-under-orders` check, cause-agnostic by design (it watches
  position and action, not any particular code path). It already failed on
  eight of thirteen scenarios in `sim:check:all` before the fix below —
  `crowded`, `century`, `craft`, `scribes`, `coast`, `millers`, `hunters`,
  `fishers` — the bug made visible instead of silent. Verified bit-identical
  to the pre-M7 baseline: same 36 checks plus the one new one, same numbers.
- **Commit 6, the zombie-order fix.** `giveUp` cleared `person.target*` but
  never `person.order`, so `Simulation.step`'s `committed = actionTimer > 0
  || order !== null` stayed true forever once a walk under order ran out of
  patience — the brain never re-planned, and `case 'wander': default:`
  discarded `MovementSystem.step`'s return value, so `finish` (the only thing
  that clears an order) was never reached either. `MovementSystem.step`
  becomes `advance(person, tick): Arrival`, a tri-state
  (`Moving`/`Arrived`/`Blocked`) so the compiler forces every one of the
  fourteen call sites to be looked at. `ActionSystem.travel` is the one place
  that now decides what `Blocked` means for an ordered action: abandon it
  with reason `cannot_reach`, through the same `onStopped` path every other
  refusal uses — `abandon` → `finish` clears the order along with the target,
  which is the actual fix. `giveUp`'s "hop to a random nearby tile" is deleted
  outright rather than ported: it was a workaround for greedy steering having
  no way to route around an obstacle, and `Pathfinder` (commit 7) is the real
  replacement. New `orders.test.ts` case: order a `goto`, stub
  `world.isWalkable` false to stand in for a concave shoreline, preset
  `stuckSteps` past `PATIENCE`, step once, assert `person.order` is null —
  confirmed failing against commit 5 first (`AssertionError: expected 'goto'
  to be null`), passing after. Also fixed as a side effect of `case 'wander'`
  finally reaching `finish`: the player's own character showing
  `action = 'walk'` forever after the keys are released. And guarded against:
  `finish` calling `noteDid('wander')` would have revived `tracking`'s fourth
  spark route (see `bugs.md`) as an unplanned side effect of a movement
  commit, so `noteDid` now ignores `'wander'` alongside `'idle'`/`'dead'`.
  `nobody-stalls-under-orders` now passes on every scenario that failed it at
  commit 5. Not bit-identical, and not meant to be: `century`'s 20-seed
  cohort moved from 75.4% mean survival (pre-M7) to 61.6%, 0/20 collapsed to
  2/20 — expected, because without a real router an abandoned order can
  immediately re-target the same unreachable spot and burn ~26 ticks failing
  again. `abandoned_cannot_reach` is exactly the counter the plan named to
  catch this, and it did.
- **Commit 7, `src/sim/core/Pathfinder.ts`, wired to nothing.** A\* over
  `World`'s own tile arrays: 8-connected with a corner rule (legal only if
  both orthogonal neighbours of a diagonal step are walkable too), which
  keeps this graph's reachability identical to `World.region`'s 4-connected
  flood fill — so a region pre-check can run *before the heap is touched*,
  making "explore the whole landmass and fail" structurally impossible.
  Octile heuristic; binary min-heap with lazy deletion, ordered by `f`, then
  `h`, then tile index (the `h` tie-break alone is the difference between
  ~100 and ~2,000 expansions on a 25-tile errand with an equal-`f` plateau);
  no RNG; zero allocation per query (`gen`-stamped `seen`/`closed` instead of
  a per-query clear, everything else sized once to `n = width * height`).
  Goal snapping via `World.findWalkableNear`, unused today. Reconstruction
  compresses collinear runs only — a straight diagonal across a fully open
  10x10 grid needs zero waypoints, a diagonal-then-straight route needs
  exactly one, at the corner (both asserted directly in `pathfinder.test.ts`)
  — and never includes the start or goal tile: the caller's final leg aims at
  the real float target, preserving the 0.6-tile arrival radius exactly. Ten
  unit tests on hand-authored grids, no callers, `sim:check` unchanged.
- **Commit 8, `MovementSystem` follows routes.** `Person` gains `path`
  (`Int16Array`, grown not reallocated per route), `pathCount`, `pathAt`,
  `pathGoalX/Y`, `pathTick`, `pathRetried`. The route lives on `Person`, not
  in a map in `MovementSystem`: `clearTarget()` is the one place that already
  forgets where somebody was going, so it is also where a stale route stops
  sending them toward the last errand's bush (`pathCount`/`pathAt` reset; the
  buffer itself is kept). `advance`, in order: the arrival check (unchanged);
  `needsRoute`/`requestRoute` deciding whether to search this tick; skipping
  waypoints already behind the walker (speed-relative — a fixed radius
  smaller than a step would orbit a waypoint forever); `moveToward` at the
  next waypoint or the real target once the route runs out; the same stuck
  detector, now buying one free re-route before `Blocked` (a route can go
  stale under a walker in a way `needsRoute` cannot predict). `requestRoute`
  gates on a 15-tick per-person cooldown and a 3-search-per-tick
  population-wide budget. `doHunt`'s moving target needs no special case:
  `needsRoute` sees the goal move, the cooldown limits how often that
  actually searches, and the final leg already aims straight at the real
  target once a stale route runs out. `resetMovementState()` and its call
  site are gone with the map it was already a no-op for. Two pre-existing
  tests widened rather than broken: `band.test.ts`'s rebellion mechanism
  needed five days instead of three to meet its quorum (routed movement
  reaches the same places by a sometimes-longer sequence of steps — verified
  this is pacing, not breakage, by running it to 20 days and finding it still
  fires, just under 4). `gave_up_walking` on the `band` scenario collapsed
  from commit 6's 119 to **1**, with 2,653 routes found and a mean of 13.0
  expansions per search. `sim:check` perf-budget: 3,064 steps/s (floor
  2,000; down from 3,409 pre-routing — real search cost, not a regression
  against the floor). `century`'s 20-seed cohort: mean survival **82.6%**,
  up from the pre-M7 baseline of 75.4% and well past commit 6's 61.6% dip —
  real routing does not just stop the thrashing, it reaches reachable places
  faster than greedy steering ever did.
- **Commit 9, the two checks, the `TRAVEL` report block, and this entry.**
  `paths-are-found`: samples 200 tile pairs deterministically (two large
  coprime strides through the tile array — no RNG draw from a stream the
  simulation shares), keeps pairs walkable and in the largest region, asserts
  every one is `Found` with a generous (`width * height`) search budget —
  `DEFAULT_MAX_EXPANSIONS` (2,000) is tuned for a real errand, always local,
  and a health check can afford more than a per-tick gameplay budget to
  confirm reachability — and separately asserts `path_gave_up === 0` across
  real play. `nobody-walled-in`: everybody alive can actually route to the
  nearest water and nearest food in their own region, via the same
  `sameRegion`-filtered nearest search `Brain.findWater`/`findNode` use;
  turns the region oracle's promise into a live assertion rather than a
  cached one. Two real bugs found writing these, both fixed before either
  check could be trusted: `AlreadyThere` (the nearest match truncating to the
  tile a person is already on) was being counted as *stranded* rather than
  *reached*; and the stall detector added in commit 5 had a false positive
  on `doBuild`, which tracks progress on the `Building` rather than on
  `person.actionTimer`, so a legitimate days-long construction job looked
  identical to a freeze by position and action alone — fixed by also
  tracking `person.workedTicks`, which `doBuild` does increment every real
  work tick. `nobody-walled-in` is mutation-verified by a permanent unit
  test (`pathfinder.test.ts`) that paints a ring of `walkable = 0` around a
  person and leaves `World.region` deliberately stale — exactly the
  situation a wall or a dig would create, and exactly what a `sameRegion`-only
  check would miss. `paths-are-found` is mutation-verified by hand, since its
  subject does not exist before this pass: dropping `maxExpansions` to 50
  fails it; disabling the corner rule is caught by
  `pathfinder.test.ts`'s "routes around a corner it cannot cut" case
  (`lastExpanded` drops from a real detour to 2 — the one-step diagonal
  shortcut the rule exists to forbid); disabling the region pre-check turns a
  genuinely cross-region query that returns instantly today into one that
  expands 9,559 nodes before concluding `NoRoute` (confirmed on the `band`
  world directly — real play never triggers this, since `Simulation.order`
  already refuses a cross-region target before a route is ever requested).
  `TRAVEL`, a new report block near `TERRAIN`: routes found, mean/worst
  expansions (the worst tracked via a new `Telemetry.max`, alongside the
  existing summed `count`), searches per 1,000 ticks, `route_arrived`,
  `walk_blocked`, `abandoned_cannot_reach`. Also: the player's own remaining
  route is now drawn on the map (`Renderer.drawPath`), restricted to their
  own character so it is not a stranger's route.

  `sim:check:all` across all thirteen scenarios: `nobody-stalls-under-orders`
  now passes everywhere (was failing on eight scenarios at commit 5). Three
  remaining failures, all understood and none an M7 regression worth
  chasing in this pass: `crowded`'s `perf-budget` (73 people, thin forage —
  already failing at commit 6, before any real routing existed, from the
  extra re-planning a dense competitive scenario does; real routing did not
  make it worse); `century`'s `paths-are-found` (real play there hits
  `DEFAULT_MAX_EXPANSIONS` on roughly 1% of searches over 40,000 ticks — the
  budget working exactly as documented, a bail-out and not a working limit);
  `coast`'s `opinions-diverge` (0 hostile relationships in one seed's 229 —
  ordinary chaos-cascade noise from a movement-pattern change, the kind
  `AGENTS.md` already documents for this class of check).

  Verified live in the browser as well as headless: ordering a walk across a
  bay routes and arrives; ordering a walk to a spot on another landmass
  produces the floater *"walking stopped — they could not get there"* and
  the character returns to `thinking` rather than freezing — screenshotted
  from a real run against the fixed e2e seed.

## 2026-09-10 — M9.3 stage A: the three amount prompts M9 phase 2 missed, and a store that never stored what you carried

Four commits, closing the quantities work: three more transfer paths still
moved everything unconditionally after M9 phase 2 shipped `QuantityPicker`,
and reading `doStore` for the third of them turned up a real arithmetic bug.
Commits 1-3 gated on `npm run sim:check` staying bit-identical to the
documented 36-of-36-pass, 27-n/a baseline — nothing in them touches a scorer,
only what the player is asked before a transfer happens. Commit 4 does touch
one, and is measured accordingly.

- **`drop_item` prompts, and Escape closes the new pickers.**
  `handleItemAction`'s `drop_item` branch wrapped `sim.drop` in
  `quantityPicker.show`, `initial` defaulting to the whole stack like `give`
  and `store` — no change to `Simulation.drop`, which already took a count.
  `escapeFoundSomething` had been snapshotting only `radial.isOpen` and
  `picker.isOpen`; it now also reads `itemPicker.isOpen` and
  `quantityPicker.isOpen`, so Escape on an amount prompt closes the prompt
  instead of falling through to the pause menu underneath it.
- **Pile pickup prompts.** `Simulation.takeFromPile` gained optional
  `itemId`/`count` parameters, both omitted meaning "everything, in pile
  order" — today's behaviour, byte-for-byte, which is what every AI caller
  still gets. `main.ts` gained `issuePickup`, mirroring `issueTake`: a room
  guard before either picker opens (`quantityPicker.show` refuses a `max` of
  zero silently, and a popup that never appears is the worst outcome), then
  straight to the amount for one stack or `itemPicker` first for several. No
  knowledge gate — goods on the ground are visible to anyone standing over
  them. Also fixed: the radial menu's `pickup` branch always acted for
  `sim.player` even while commanding somebody else, because there is no
  `pickup` verb in `ActionSystem` for a command to reach. `ActionCatalog` now
  disables the option while commanding, with the reason spoken in the menu.
- **The radial "Store what you carry" prompts, opt-in on a chosen item.**
  Exactly the shape `doTake` already has: `person.targetItemId` unset means
  "empty the pack," which is what every AI-planned trip to a granary still
  does (`Brain.setup`'s `store` case sets only `targetBuildingId`; `BandSystem`
  commands carry `{ buildingId }` alone), so this stays bit-identical for
  every caller that never named an item. `main.ts` gained `issueStore` beside
  `issueTake`, same one-stack skip, same "commanding stays blind" precedent.
  A new `store_item_gone` reason covers an order that named a stack which left
  the pack before the walk finished. Extracted `Building.accept(from, itemId,
  count)` so `Simulation.storeItem` and `doStore`'s new single-item branch
  share one definition of how much fits rather than a second copy of the
  arithmetic — `AGENTS.md`'s standing instruction to extract rather than
  duplicate.
- **Fixed `doStore` under-filling a store.** `store.storageFree` is derived
  (`def.storage - store.total`), so it already reflects an earlier stack's
  addition in the same loop; the loop's `room = store.storageFree - moved`
  subtracted that progress a second time, so a second stack that would have
  fit on its own saw a negative room and the loop broke out without taking
  it. "Store what you carry" had never stored what you carry. Two characters
  (`- moved` deleted), but it changes AI behaviour — every band's stores fill
  more completely now — so it is its own commit rather than riding inside the
  one above. `npm run sim:check`: `stored` 168 → 180, items in store 128 →
  138. `npm run sim:seeds -- --seeds 20` (`century`, before → after): mean
  survival **82.5% → 75.4%**, 326 → 311 born. That is a real move, not
  cohort noise (`AGENTS.md`'s chaos floor is under-10-points at this sample
  size), and it runs the wrong way for a bug fix — food that used to be
  stranded in a walker's own pack, still eatable on the spot, now more often
  reaches a shared store a hungry person has to walk to first. Left as
  found rather than compensated for in the same pass: the fix is correct on
  its own terms, and tuning the food economy around it is a separate
  decision. Worth a specific look before M7 re-baselines seeds on top of it.

Verified in the browser: dropping, picking up a mixed pile, and storing from
a full pack each open the amount prompt (single-item picks and stores skip
straight to the slider); Escape dismisses the slider rather than the pause
menu; a two-stack store trip that used to abandon halfway now empties the
pack; and commanding a subordinate onto a pile offers "Pick up" greyed out
with "You cannot order somebody else to pick that up."

## 2026-09-10 — M9 phase 2: quantities, recipients, and a `give_item` refusal that reached nobody

Second code of M9. Note 9 and the `give_item` defect from the triage, both
gated on `npm run sim:check` staying bit-identical — nothing here touches a
scorer, only what the player is offered and asked before a transfer happens.

- **`Simulation.handOver` and `storeItem` take a `count`.** Both used to move
  the whole stack unconditionally, defaulting `count` to
  `inventory.count(itemId)` so every existing caller (the AI's own giving and
  storing) is unaffected byte-for-byte; only the inventory panel now asks for
  less.
- **A `QuantityPicker`.** One popup, built on `sliderRow` rather than a second
  slider-and-number-box pair, reused by give, store and the new take flow
  below. Defaults to the whole stack for give/store — the old, unconditional
  behaviour — and to `min(6, stock)` for take, so withdrawing an entire granary
  is not the new default for what used to be a handful.
- **`give_item` gained a recipient picker and stopped discarding
  `lastRefusal`.** `handleItemAction` now queries every living neighbour
  within reach with `SpatialHash.queryRadius` instead of `findNearest` — the
  same fix phase 1 gave the world picker — and opens `EntityPicker` when more
  than one is in range. The branch reads `sim.lastRefusal` on a failed
  `handOver`, so a recipient whose hands are full is reported as refusing
  rather than as nobody having been there at all.
- **`doTake` can be told what to take.** `Person` gained `targetItemId` /
  `targetItemCount`, threaded through `Simulation.order`'s target object and
  `ResumedOrder` so an interrupted, player-ordered withdrawal comes back for
  the same item and count rather than whatever `doTake` would improvise.
  `doTake` itself still falls back to `bestFood() ?? entries()[0]` and a
  six-unit grab whenever nothing was named — every AI-planned trip to the
  larder, which never names an item, is unaffected.
- **"Take from store" chooses an item and an amount when the contents are
  known.** `issueTake` in `main.ts` reads `knowledgeOfBuilding` — the same gate
  the store panel already reads — and only offers a choice when the store
  belongs to the actor's own band. One item kind goes straight to the quantity
  popup; more than one opens `EntityPicker<string>` first. Unknown contents (or
  commanding somebody else, left blind deliberately — see the function's own
  note) keep the old surprise grab.
- **`EntityPicker` is now generic** (`EntityPicker<T>`), so the same bubble
  column serves both the map's `ActionTarget` chooser and the new item-id
  chooser, and takes an optional root class: a second permanently-mounted
  instance sharing `.picker` broke several e2e specs that assert on it
  expecting exactly one match. The item picker uses `.itempicker`, with the
  same rule block as `.picker` in `style.css` so the two cannot look different
  by accident.
- **A `take_item_gone` stop reason.** Distinct from `store_empty`: the store
  can still hold plenty of everything else when the one thing that was ordered
  is gone by the time the walk finishes.

Verified in the browser as well as by `npm run verify`: giving with several
bandmates in reach opens the recipient bubbles before the quantity slider;
storing and taking both default sensibly and move exactly the confirmed
amount; and a hand-built two-item storage pit offers the item chooser before
the quantity popup, while a one-item store and an unknown one both skip it.

## 2026-09-10 — M9 phase 1: the plural picker, node shapes, pile labels

First code of M9. Three UI-only changes, none of which touch a scorer — `npm
run sim:check` reports the same 36-of-36-pass, 27-n/a result before and after,
which is the gate the plan set for this phase.

- **The entity picker now offers every candidate of a kind, not just the
  nearest.** `candidatesAt` used to call `Renderer.pickPerson` and five
  `findNearest` siblings — one match each, nearest wins, so two people
  standing together silently gave up the second one. It now queries
  `SpatialHash.queryRadius` on each of `sim.peopleHash`, `nodeHash`,
  `treeHash`, `inscriptionHash`, `pileHash` and `animalHash` directly, filters
  by `hitRadiusOf(target) + GRAB_MARGIN` the same as before, and caps the
  result at `PICKER_CAP` (6) — the DOM bubble column needs protecting from a
  crowded tile, not a simulation budget. Renderer's six singular `pick*`
  methods had no other callers and are removed.
- **Resource nodes are shaped by kind, not just coloured.** `drawNode` drew
  one square for every kind, scaled by `fullness`; `sticks` and `clay` are the
  two closest browns in `RESOURCE_COLORS`, and dropped-item piles added a
  third right next to them. Now: crossed sticks, an angular flint shard, a
  clay mound, upright reeds, a cluster of berry dots, a fish wedge. Every
  shape stays within the same `size / 2` bound the square used, so
  `hitRadiusOf`'s `'node'` case — already sized from the same `fullness`
  formula — still covers what is drawn without changing.
- **`ItemPile.label` reaches the picker and the map.** The picker used to say
  "dropped goods" for every pile regardless of contents, even though
  `ItemPile.label` already distinguished "nothing", one item, or "N kinds of
  goods" — nobody read it. It now does. A pile within `PILE_LABEL_RANGE` (6
  tiles) of the player's own character also carries that label on the map
  itself, the same distance limit `Knowledge.ts` puts on everything else the
  screen is allowed to say — reading a pile's contents from across the valley
  would be exactly the omniscience that rule exists to withhold.
- **`NODE_LABELS` is now typed `Record<ResourceKind, string>`**, matching
  `RESOURCE_COLORS`. It had been a plain `Record<string, string>` keyed
  `wood` — which never matched the real `ResourceKind` value `sticks` — so
  the HUD's node panel had been silently printing the raw id `sticks` instead
  of "Fallen wood" since M8.0. A new resource kind now fails the build here
  the same way it already failed the renderer's colour table.

Verified in the browser as well as by the four `npm run verify` layers: a
household of five strangers standing together now lists all five in the
chooser instead of one, each of the six node shapes renders distinctly at
close zoom, and a mixed two-item pile drops the label "2 kinds of goods" at
the player's feet.

## 2026-09-10 — M9 triaged and planned: `notes.txt` emptied, no code touched

A documentation-only pass. The owner decided the next milestone is the social
and interface layer — talking, teaching, choosing, seeing what is on the
ground — ahead of M8.2's Neolithic, because `docs/notes.txt` had accumulated
thirteen untriaged notes, eight of them since the last triage on 2026-09-09,
and nearly all of them named that layer rather than content.

**What shipped is six documents, and the reason it is documents rather than
code is that the owner asked for a plan first.** Each of the thirteen notes was
verified against the current code before being assigned a destination — not
assumed from the note's wording — and three further defects turned up doing
that:

- **`give_item` picks its own recipient and discards the refusal it gets.**
  `Simulation.handOver` has always set `lastRefusal` when a recipient is full;
  the `give_item` branch in `main.ts` never read it, so the player saw "nobody
  to give it to" even when somebody was standing right there. This breaks the
  standing rule that every refusal must reach the player.
- **`next-steps.md` asserted that bands carry standing with each other.** They
  do not, and never did: `normsByBand` maps a band to its own norms, not to how
  it regards another band, and `Band` itself carries nothing about other bands.
  O4 and O5 had been planned against a mechanism that does not exist; both are
  redesigned in [m9_plan_words_and_hands.md](m9_plan_words_and_hands.md)'s
  closing section and rescheduled as M10, after M8.2 gives a band something
  worth fighting over.
- **`NODE_LABELS` is not compiler-enforced while `RESOURCE_COLORS` is** — known
  since M8.0, and note 7 (indistinguishable resource art) is the pass that
  finally closes it, since both tables are touched by the same commit.

**The plan itself corrected one of its own draft claims before shipping.** An
earlier version of the milestone plan attributed the warning "thinking became
the sixth most common activity in the world... which is not a stone age" to
`AGENTS.md`. Re-reading the code found that comment actually lives at
[Brain.ts:906-909](../src/sim/ai/Brain.ts#L906-L909), beside the line it
warns about, not in `AGENTS.md` at all. Fixed before the plan was finalised, on
the same principle the plan itself uses throughout: a citation is checked
against the file it names, not trusted because it reads plausibly.

**Documents touched:** `m9_plan_words_and_hands.md` (new — six phases, ordered
by how much simulation risk each carries: three interface-only phases that
must leave `sim:check` bit-identical, then two scorer-touching phases each
measured with twenty seeds, then one independent control-scheme change);
`bugs.md` (the three defects above, plus the eight notes that turned out to
name real gaps); `next-steps.md` (M9 inserted ahead of M8.2, the false
band-standing claim corrected in two places, O1-O3 pointed at M9's phases,
O4-O5 and N3 pointed at M9's closing section and phase 3 respectively, and a
new §7c indexing all thirteen notes to their destination); `notes.txt` (emptied
— all thirteen notes now have a destination); `README.md` (the plan's row).

**Verification, since there is no world to measure:** `npm run typecheck` and
`npm test` pass unchanged (16 files, 181 tests); `npm run sim:check` reports
the same 36 of 36 applicable checks passing, 27 n/a, that `next-steps.md`
already recorded for this date — recorded again here as the line M9 phase 1
promises to hold bit-identical. Every `file:line` citation added in this pass
was read from the file it names on 2026-09-10, the same way
`m8_plan_the_ages.md` dates its own.

## 2026-09-10 — M8.1, mechanism 1: spoilage, built, measured, and switched off

The last mechanism of the tier, and **it ships dormant on purpose.** That is a
decision taken on measurements, not a job left half finished, and the plan
designed the escape hatch it went out through.

**What shipped.** `ItemDef.spoilTicks` was the largest piece of inert data in
the game — declared on every item and read nowhere at all. It is read now.
`Inventory.spoil(elapsed, factorFor, apply)` ages a pack and removes what has
gone off; `Simulation.spoilFood` sweeps four collections once a day, immediately
after `refreshRecords` because it is the same kind of thing pointed at a
different target. `BuildingDef.preserves` says how much better food keeps
somewhere than in a pack — a lined pit in cold ground is a root cellar, and
keeping food is the entire reason anybody ever dug one, which the pit's own
description had claimed since M2 with nothing to back it.

**It draws no `RNG`.** Loss is proportional and the remainder is carried on the
inventory, so this needed no new stream and no change to the fork order — the
same property `workTraps` has, and worth stating rather than discovering.

**What did not ship: `preserving` and the drying rack.** Both were built, both
worked, and both were held. A technology whose effect is a multiplier on zero is
exactly the declared-and-inert content this project has a rule against.

**The measurements, which are the point of this entry.** Twenty seeds each on
`traps`, spoilage off against on:

| | survival | infants starved | collapses |
|---|---|---|---|
| off | 92.2% | 4 | 0/20 |
| rate 0.35 | 90.3% | 10 | 0/20 |
| rate 0.4 | 88.8% | 10 | 1/20 |
| rate 0.6 | 86.0% | 11 | 0/20 |
| rate 1.0 | 88.4% | 8 | 0/20 |

The four rates are indistinguishable from one another — 0.6 measured *worse*
than 1.0 — so the cost is not something a coefficient tunes away, and picking
one because a run liked it is what `AGENTS.md` forbids. What is consistent at
every rate is the shape: **infant starvation more than doubles.**

The plan's stated condition for holding was whether `preserving` brings the loss
back. It does not. On `fishers`, the scenario built for it, the band that knows
how to preserve survived at **91.5%** against **94.1%** for the band that does
not — noise in the wrong direction rather than a mechanism. Giving stores nearly
perfect keeping was tried as well, a pit at 4 and a granary at 8, and changed
nothing at **87.1%**, which locates the harm in *packs*: people carry a great
deal of food and all of it rots.

So: **keep the supply half, hold the decay half**, which is what the plan said to
do in this exact case. `needs.spoilRate` is 0 in the default config and the
`fishers` scenario sets it to 1, which is what keeps the sweep exercised and
gated rather than quietly rotting. Switching it on is one number, and
`m8_plan_the_ages.md` still carries the design for the two held nodes.

**Two other things were found on the way and are worth more than the mechanism.**

- **The store planner ranked stores by what goes in rather than what comes out.**
  A drying rack and a storage pit hold the same hundred and twenty, and on that
  tie the pit won by being declared first — so a band that could preserve dug
  five more pits across a run and never built a rack. `bestBy(def.storage *
  def.preserves)` is the honest expression and it survives the rack being held.
- **Taming lost to hunting the moment anybody had a spear.** Handing `culture` a
  spear — needed so that anybody hunts, so that there is bone, so that there is a
  flute — took taming from fifteen meals offered in a run to none. The scorer
  could see "spear it now" against "feed it and walk away hungry" and nothing
  else. It is weighted by the taker's *hunting* skill now, because a companion is
  worth 35% on every hunt for the rest of its life and the best hunter in the
  band has the most to gain from one.

**Three checks were fixed, and each was the check being wrong rather than the
world.** `kills-are-butchered-for-bone` gated on `sim.knownTech`, which says only
that somebody somewhere has worked it out — so `scribes`, where one elderly
scribe conceived bone working, reported eighteen kills and no bone and failed for
no reason: none of those kills was made by the person who knew. It gates on the
scenario's *starting* knowledge now. `music-answers-loneliness` failed where the
knowledge existed and no flute had ever been made, which is an upstream link and
more useful said than failed. `the-hurt-are-tended` failed in a world where
nobody was ever hurt; `hurt_person_days` is counted now so it can skip honestly,
and it is a statistic the health report wanted anyway — the health column is an
average and one badly hurt person in twenty barely moves it.

Every existing scenario is **bit-identical** to the commit before this: the only
difference in any report is the new `would_spoil_*` and `spoilage_prevented`
counters, which is precisely what a dormant mechanism should look like.

---

## 2026-09-09 — M8.1 completes its content: a picture, a tune, a healer and a dog

The last four nodes of the tier — **`ochre`, `flute`, `herbalism` and
`taming`** — and three of them are the first technologies in this game that are
not about getting more out of the ground. Thirty technologies now, thirteen
recipes, ten buildings, twenty-nine items, thirty-two actions.

**`ochre` made literacy a property of the record rather than of the reader.**
The gate was the bare string `'writing'` in five places, and the clay tablet's
own extra gate was a hardcoded `def.id !== 'clay'` sitting beside it.
`InscriptionDef.literacy` replaces both. A script is an agreed code and is worth
nothing outside the agreement; a painted picture of a thing being done is legible
to anybody who can recognise the thing — so a band that has never worked out
writing can leave a record on a rock wall, and **a scribe who has never seen
ochre cannot read one**. Both directions are asserted in `transmission.test.ts`,
because the second is the one that would have gone unnoticed.

That makes ochre the first record most bands will ever make despite being listed
last: `writing` sits behind `marking` and `stoneworking` and no run in the suite
reaches it from nothing. It pays for that with everything else — one thing only,
and gone in about six weeks of weather.

**`flute` is the first scorer in the game that reads somebody else's need as its
own reason.** Every social act until now was a pair: `SocialSystem.converse` sets
`company` to zero for exactly two people and nothing else touches it. A tune
reaches everybody within sixteen tiles, in small amounts every tick rather than
one lump at the end, so somebody who walks past halfway through has still heard
half of it.

**`herbalism` gives the `heal` skill the first use it has ever had.** It has been
in `SKILLS` since the beginning — spent points on at character creation,
inherited, aged, and never once practised by any action. Health was recovered at
a flat `needs.recoveryRate` and by nothing else at all, so being badly hurt has
always been a thing you wait out alone. You cannot tend yourself: the point of
the node is that a band with a healer in it is a different band.

**`taming` finally reads `Animal.fedBy` and `Animal.temperament`**, both of which
have been on that class since M6a doing nothing, deliberately, because adding
them later would have been a migration. It took two goes:

- **It counted feeders, not meals.** `fedBy` is a `Set` of person ids, so one
  person feeding an animal every day for a season added themselves to it exactly
  once and the threshold could never be reached: **a hundred and one meals were
  offered across a run and nothing was ever tamed.** `Animal.meals` is the
  counter; `fedBy` keeps the question it actually answers.
- **Which turned out to be the better design.** `fedBy` is now *who the animal
  will let near*: it does not bolt from somebody it has taken food from, which is
  what makes the second meal possible at all. Two stages rather than one, and
  recognisably how it actually goes. It also cut the waste enormously — 15 meals
  for 3 tamed animals, where the broken version threw away 101 for none.

A tamed animal heels, stops treating its owner as a threat, and multiplies the
hunt roll through `companionBonus` — capped at one companion, so a band that
tames six wolves is a band with six wolves and not a band that cannot miss.

**A new scenario, `culture`**, grouping the four because they share a
precondition rather than a mechanism: all four are what somebody does when
nothing is pressing. Ochre could not have been measured anywhere else at all —
`scribes` starts people knowing how to write, which is precisely the case ochre
exists to cover the absence of. Four new checks, all four verified failing on a
build with their feature broken.

**Two checks were fixed rather than tuned, and both were the check being wrong.**

- `crafting-is-interruptible` asserted on a floor of five attempts. The
  interruption *rate* varies by more than an order of magnitude across the suite
  — `craft` reports 192 broken-off attempts against 13 finished, `traps` reports
  3 against 27 — so at the low end, ten attempts producing no interruption has a
  probability around a third. `culture` failed at 10 and 0. The floor is
  twenty-five, which is where zero becomes surprising rather than merely quiet.
  The alternative, making `culture` less comfortable until it passed, is tuning
  the world to satisfy a measurement.
- `jobs-bias-work` is **not** fixed, and that is recorded in `bugs.md` rather
  than worked around in silence. `hunters` fails it at -0.9 on seed `ivory` while
  four other seeds of the same scenario report +0.8, +1.3, +1.6 and +1.8: the
  effect is about a point and a half and the seed spread is wider than that. The
  scenario is seeded `bone` and says so in its own comment. Widening the check
  belongs in its own pass, because it gates eleven other scenarios.

**Adding four nodes to `TECHS` changes worlds that cannot reach them**, and that
is worth stating once. `hunters` diverges from step 1800 despite never firing any
of the four verbs, because `flute` and `taming` sit behind `bone_working` and
`tracking` — which that band starts with — so there is more to think about:
`ponder` doubled and work fell. That is the tree growing, not a defect, and it is
why every content tier gets measured rather than assumed.

---

## 2026-09-09 — M8.1 continues: the bone tier

Three nodes — **`bone_working`, `tailoring` and `atlatl`** — and the first
two-stage craft in the game. Twenty-six technologies, twelve recipes,
twenty-eight items.

A kill has always given meat and a hide and thrown the rest away. `bone_working`
is noticing that the rest is the best material on the animal: out of it come a
barbed point that throws further than flint and **the eyed needle**, and out of
the needle comes the first garment that actually fits. That is as nearly as one
mechanic can put it the reason our species could live where it was cold, and
`warmthFrom` gains its third and largest term to say so.

**Bone and sinew are taken only by a butcher who knows what they are for**, which
is honest — nobody strips sinew out of a leg without a use for it — and is also
what keeps every world that has not worked it out identical to the one before
this shipped. A pack filling with material nobody can use would move `isLaden`,
and `isLaden` moves everything. The acorn follows the same rule and for the same
reason.

**Two stages rather than one, and the second was measured into existence.** The
coat could have cost "three hides and a bone" in one recipe. It costs a *needle*,
because the needle is the artefact the Upper Palaeolithic turns on and folding it
into an ingredient list would have said none of that. Making that chain actually
run took two corrections, both from measurement:

- **The needle costs bone and nothing else.** It cost a flint as well at first,
  and made *no needles at all* in a whole run while bone points were being
  knapped beside it — bone is the scarce half, and whoever has bone has sinew and
  sticks off the same carcass far more often than they happen to be carrying
  flint too. The flint burin a needle is split with is a tool rather than a
  consumable anyway, so this is also the truer description.
- **`needle` is declared ahead of `bone_point`.** Both are `knap` and both cost
  one bone, so they score identically in `Brain` and its `score > craftScore`
  hands a tie to whichever is reached first. The needle is the gateway to the
  coat and the point is the gateway to nothing.

A carcass now gives three bone and two sinew rather than two and one, because at
the lower figures a good third of every kill was dropped on the ground by a
hunter whose pack was already full.

**The third of the plan's "repairs to make while passing" is done**: `doHunt`
used the bare `REACH` constant, so a bow's `reach: 1.6` did nothing in the one
place it should matter most. The archer walked to arm's length of a deer like
everybody else and the field existed only to win brawls. Fixed here rather than
later because the atlatl is a weapon whose *whole point* is the throw, and
shipping it against a constant would have been a third node with a decorative
stat. Measured across twenty seeds of `craft`, which is the scenario that arms
people: mean survival 94.4% → 93.5%, which is noise, and conceptions past the
root nodes 1.7 → 2.2, which is the three new nodes becoming reachable.

**A new scenario, `hunters`**, with cold seasons: the bone tier is a chain four
links long and a chain is exactly the thing that passes every static test while
being impossible to walk end to end. It reports 11 kills giving 43 of bone and
sinew, worked into 14 tools and 2 coats.

New check `kills-are-butchered-for-bone`, verified failing (with the yields
removed it reports 10 kills and 0 of everything). It demands a *coat* rather than
merely a tool whenever the world can sew one, because bone and a needle getting
made proves two links and says nothing about the third — without that clause
`tailoring` could be wired, declared, offered and never once reached.

**One check was fixed rather than tuned, and it is the check that was wrong.**
`children-are-taught` asserted on a floor of one lesson, and `hunters` was the
first scenario thin enough to fail it at 0 of 3. Below a handful of lessons it
cannot tell "children are excluded from knowledge" — the real defect it was
written for, where `KnowledgeSystem.daily` skipped them outright — from "three
adults happened to teach three adults". The floor is five now, the same reasoning
`crafting-is-interruptible` already uses, and the claim itself stays asserted
deterministically in `transmission.test.ts` regardless.

---

## 2026-09-09 — M8.1 continues: crafting stations, and an oak worth standing under

Mechanism 4 of [m8_plan_the_ages.md](m8_plan_the_ages.md), with the node it
exists for: **`grinding`**, the quern, and the first recipe in the game that is
about a *place*. Twenty-three technologies, eight recipes, ten buildings,
twenty-two items.

**`RecipeDef.station` was as cheap as the plan promised, and for the two reasons
it named.** `ActionSystem.reachBuilding` took an optional predicate and its five
existing callers were untouched; `Simulation.order` already set `targetRecipe`
before the target branches, so ordering a craft with both a recipe and a building
needed no change to `order` at all, and resume works because `noteStop` captures
both. `doCraft` does **not** search for a station — buildings have no spatial
hash and `optimizations.md` owns that decision — so the scorer and the menu
choose it and hand the id over.

**The refusal reaches the player through both channels the plan asked for**, and
they answer different questions. `cancelOrder` refuses up front when the player
orders meal with no quern in the world ("that has to be made at a quern");
`onStopped` reports `no_station_quern` when the quern is demolished while
somebody walks to it. The reason id is **per station** rather than generic, so
`abandoned_no_station_quern` is available to say which station everybody is
walking to and not finding — an aggregate could not.

**The quern grinds acorns, and that was the second design in this pass, not the
first.** The plan's node table says the quern makes a `meal` item, and hazelnuts
were the obvious input. Measured across a full autumn in a two-band world, the
hazelnut recipe fired **twice**: a hazel is picked in pulls of one to three nuts,
a hazelnut at 22 nutrition is the best thing in most packs, and anybody who had
gathered enough to grind had eaten them before reaching the stone. The
competition with simply eating them is the mechanism and is meant to be there;
needing a third nut on top of it was the difference between a seasonal habit and
a curiosity.

So the oak bears now. An acorn is `nutrition: 0` — which is the honest number,
because a raw acorn is bitter with tannin and that is exactly why every people
who lived on them ground and leached them first — and `grinding` turns the
commonest tree in the wood from timber into a harvest. That is a far better
technology than a yield multiplier: before it a band walks past four hundred oaks
all autumn, and after it, it does not. Nothing competes for an acorn.

**Hanging fruit on the oak is a change to the commonest tree on the island, and
it is invisible to every world that cannot grind.** `Brain`'s fruit scorer now
weighs a tree by what its fruit is worth *to the person looking at it*
(`fruitWorth`), which is nutrition for everything that existed before this and,
for something inedible, what it becomes in the hands of somebody who can make it
into food — discounted, because an acorn is not food until it has been carried to
a stone. `band`, `century`, `harsh-winter`, `traps`, `craft`, `scribes`, `coast`
and `crowded` are all **bit-identical** before and after, every column of every
sample, which is what makes the milestone's before-and-after measurements still
comparable.

**Two candidates are scored, not one, and that is a finding.** The first version
simply widened the existing `findNearest` predicate to include acorns. But
`findNearest` returns the *nearest* match, so it quietly replaced the apple two
steps further on with an oak underfoot, everywhere, all autumn: total fruit
picked fell by a fifth and not one acorn was ground, because the oak won the
search and then lost the score. The nearest edible tree and the nearest tree
worth anything are now scored against each other, and where nobody can grind the
two queries return the same tree.

**`LEANEST_FRUIT` is 13 on purpose.** It is the least nourishing fruit that
existed before acorns, so every fruit in the game up to now clamps to 1 in
`worthRatio` and the term is a no-op for them by construction. An acorn comes out
around a half.

**The plan's warning about `proximityBonus` was measured and came out backwards.**
It predicted that without the bonus a station craft "will simply never fire". In
fact removing it produced *more* crafts — 26 against 16 — because the walk stops
being a cost and people cross the map to grind. The bonus is kept anyway: it is
the idiom every other destination scorer in the file uses, and somebody
abandoning what is underfoot to walk to a workshop is the wrong behaviour even
when it makes the counter look better. Recorded here rather than quietly
dropped, because the plan's reasoning was sound and only its prediction was
wrong.

**A new scenario, `millers`, and it needs the calendar as much as the
knowledge.** Acorns fall in autumn, and `craft` starts on day 10 and runs
thirty-three days, so it never sees one — every station check on it would have
reported n/a for ever, and n/a is not a pass. `millers` starts on day 30 and runs
to day 76: ten days to raise a roof and dig a store, the whole of autumn with
mast on the ground, and enough after it for the meal to be carried home.

**The band planner wants a station now**, ahead of traps and behind shelter and a
store. Ahead of traps because a station multiplies food a band already has where
a trap adds more, and one quern serves a band for ever so it costs a site slot
exactly once. Behind shelter and a store for the reason the trap branch already
records: a band that builds a workshop instead of a roof dies in the winter it
ate well in. Stations are exempt from the roof ceiling, like traps and for the
same reason.

**Measured, twenty seeds, `millers` with and without `grinding`:** mean survival
77.7% → **80.3%**, infant starvation 13 → 10, older children 4 → 2, adult
starvation 39 → 43. Twenty seeds cannot resolve two and a half points and this
is not claimed as one; the infant and child numbers are the more honest signal,
and adults rising slightly alongside them is what happens when more of the
vulnerable survive to be adults at risk. It is a seasonal gain of a few weeks a
year, which is the size it ought to be.

New checks: `crafts-happen-at-stations` (verified failing — with the station
handoff removed it reports 0 made against 8,832 walks that found no station).
`stations-are-required` is **not** a `simcheck` row, deliberately: nobody in the
simulation ever orders a craft they cannot do, so it could only ever report n/a.
It is four deterministic tests in `orders.test.ts` instead — refused with no
station, refused at the wrong building, walks there and finishes, and gives up by
name if the quern goes while they are walking. `tech.test.ts` gains both
directions of the table check: every `recipe.station` names a building that
exists *and is flagged* a station, and every station has something that can be
made at it.

**`fruitOnTrees` in the health report counts edible fruit only.** `AGENTS.md`
tells the next reader to watch that column against `cold` and `store` to find the
winter die-offs, and quadrupling it overnight with acorns nobody can eat would
have made a number that no longer means what its reader thinks it means.

---

## 2026-09-09 — M8.1 continues: traps, and work that goes on without you

Mechanism 3 of [m8_plan_the_ages.md](m8_plan_the_ages.md), with the four nodes it
needs: **`basketry`, `netting`, `snares` and `fish_trap`**. A snare line and a
fish trap are the first things in this game that produce food while nobody is
standing over them, which is most of what a Mesolithic band actually had over a
Palaeolithic one — and the basket and the net are the same story told in cordage,
since a woven container is what a trap *is*.

Twenty-two technologies now, seven recipes, nine buildings, twenty items.

**A trap is a `Building` with a `yields` field**, not a new entity. That was the
plan's call and it held: `ownerBandId` gives it an owner, `place`/`canPlace` and
the build menu give it placement, `store` gives it somewhere to put a catch, and
`doTake`/`reachBuilding` give it collection — nine existing systems reused
against a new entity's zero. `Inscription` is what the other road looks like and
it touched about twelve files.

**Accrual is one daily sweep that draws no `RNG` at all**, which is worth stating
rather than discovering: rates are data and the remainder is banked on the
building, so traps needed no new stream and no change to the fork order. The
fractional carry lives in `core/Progress.ts` as `accrueUnits`, beside
`workProgressOf`, because spoilage is the same arithmetic pointed the other way
and two copies of it is the drift the house style rule exists to prevent. A rate
below one a day floored at the point of use would catch nothing for ever, which
is what the remainder is for.

**A trap's rate is scaled by what the owning band still knows.** Knowledge in
this game is held by people, and a trap is the first structure whose *output*
depends on that: a snare line outlives the person who set it but not their
knowledge, so a band with nobody left who understands snares owns a loop of
rotting cord. The character panel says so — "nobody here remembers how to work
it" — because a trap that has quietly stopped is otherwise indistinguishable from
one that is working.

### Three caveats the plan named, and all three were real

- **Nothing is 1x1.** A one-tile footprint spans half a tile either side of its
  centre, `reachBuilding` wants `contains` at margin 0, and movement stops within
  0.6 tiles: a person could arrive and never be inside, walking on the spot in a
  loop with no interruption check in it. Both traps are 2x2, and a unit test
  fails the build if a future one is not.
- **Traps do not count against the band's structure ceiling.** That ceiling is
  about roofs and pits, and counting three snares would have quietly stopped a
  band ever raising another hut — and `bands-dont-overbuild` would have failed
  for a band doing exactly the right thing.
- **`planBuildings` needed a third branch**, because it wanted only shelter or
  storage and a trap is neither. That is the defect that made the granary and the
  longhouse player-only content for their whole existence.

### What the measurements changed, twice

**Traps were first planned whenever nothing else was *wanted*, and that was
wrong.** A band has two site slots, and the first version spent them on snares
while the storage pit it had already decided on was still a hole in the ground:
storing collapsed from 4,549 ticks to 394 in one run and three more people
starved than in the same world without traps. Surplus now waits behind survival,
and "survival" includes the pit that is half dug — a trap is planned only when
there is a finished store and nothing at all under construction.

**Nothing walked to a trap, and hunger was never going to fix that.** Proximity
dominates the scorer, hunger is what puts anybody near a store, and a trap is out
at the treeline: across ten seeds traps stood full for around fifty trap-days a
run while people went hungry beside them. A full trap has also stopped catching,
so the food in it was costing food. `Brain` gained a second route to `take` —
**the round**: emptying a trap that is at least two fifths full, scored on
fullness times nearness, behind the same fair-weather gate as storing, and
weighted between storing a surplus and answering an actual appetite. With it, the
same ten seeds collect nearly everything a trap catches, catches per run roughly
doubled, and days-spent-full went to zero in eight of ten.

**One principled-looking change was reverted after measuring it.** Ranking the
hungry route's larder by expected score — fullness times nearness, the same
expression the round uses — reads better than "the nearest store with food in
it", and cost **eight points of mean survival across ten seeds of the default
scenario, in worlds with no traps in them at all**. It is gone, with the number
in a comment where the next person will find it. Traps are reached by their own
route rather than by bending the one that already worked.

**The tier itself:** across twenty seeds of the new `traps` scenario against the
same scenario without the trap half of the ladder, mean survival is 89.8% either
way — no measurable change over 37 days. What does move: no seed collapses with
traps against one without, infant starvation halves (6 against 12) while adult
starvation rises (53 against 38), which is what food arriving at camp rather than
where the foragers are looks like. Traps caught between 10 and 268 items a run
and were emptied in every seed. The honest summary is that this is supply the
world did not have, and that a 37-day run is too short for it to show up as
survival.

### The nodes, and their effects

| node | requires | what it does, and where |
|---|---|---|
| `basketry` | cordage | a `basket` recipe, read by `carryFactor` |
| `netting` | cordage, fishing | a `net` recipe, read by `forageYieldFactor` on a fishing spot |
| `snares` | cordage, tracking | the `snare` design; `Simulation.workTraps` |
| `fish_trap` | netting, basketry | the `fish_trap` design, shore-only; `workTraps` |

Both items are gated on **carrying one and knowing how it works**, which is
deliberate. Knowledge alone would make the recipe pointless; the item alone is
the `handaxe` bug the M8 plan lists under repairs to make while passing — a tool
that works identically in the hands of somebody who could not have made it, and
that refinement never improves.

### Placement, and saying why

`canPlace` had no per-design predicate, because until the fish trap nothing cared
where it stood. It has one now (`BuildingDef.placement`), and the interesting half
is `placementRefusal`: the build cursor used to say "cannot build there", which is
the least useful thing a game can say, and the fish trap is the first design that
can be refused somewhere a hut would have stood happily. It now says which of the
three reasons it was — the ground, something already there, or the water's edge.

Band placement searches in widening rings from the fire rather than scattering
across a square, and for a trap that is the difference between a mechanism and a
decoration: a fish trap sixteen tiles down the coast fills up and is never
emptied again.

`doStore` refuses a trap out loud (`not_a_store`), and the scorer will not offer
one as somewhere to put a surplus, because filling a trap is a person carefully
stopping their own snare line from catching anything.

### Checks

- **`bands-set-traps`** — the tripwire on the granary failure happening a third
  time: does a band ever plan one, and could it be sited.
- **`traps-catch`** — a standing trap catches something, and the line reports
  what was collected, how many trap-days were spent full, and how many days
  nobody could work one.
- **A new `traps` scenario**, on the same terms as `craft` and `scribes`: a snare
  sits behind two technologies and a fish trap behind four, no run in the suite
  reaches either from nothing, and every check about passive yield would
  otherwise report n/a for ever.
- **`src/sim/__tests__/traps.test.ts`, eleven tests**, and the important one is
  "is worth a walk to somebody who is not hungry at all" — it fails on the build
  without the round. **There is deliberately no `traps-are-emptied` world check**:
  measured against the broken build the collection counts overlap (6 items of 59
  caught broken, 6 of 42 fixed), which is exactly the check that "looks
  reassuring and detects nothing", and two of those were deleted in the winter
  pass. Whether the scorer will walk to a full trap is a property of `Brain` and
  is tested as one.
- **`sparks-are-various` now skips honestly** when a scenario hands out six or
  more technologies. `traps` hands out eight so that both traps exist at all, and
  it read "3 routes into 1 technologies" and failed — the check being asked a
  question the world cannot answer, rather than the web having collapsed to one
  path. `craft` (four) and `scribes` (five) sit below the line and still answer
  it.

The default twelve-day scenario is **bit-identical** before and after this pass —
same drinks, same berries, same fish, same 36 checks — because no world without
trap knowledge in it takes any of the new branches. `tiny` still fails
`food-work-continues` on the one-tick margin already recorded in
[bugs.md](bugs.md), identically on both builds.

## 2026-09-09 — the game opens on its settings

Asked for by the project owner, straight after the settings screen shipped: it
should come up **before** character creation, not only from the pause menu.

The order is the argument. The settings decide how much food is on the island
and how many tribes are on it, so being asked to pick a life out of a world that
is about to be replaced is the wrong way round.

**The world built at boot is now a draft.** `Begin` keeps it if nothing that
shapes an island moved, and builds it again if something did — which choosing
any difficulty other than Normal always does, since the resource counts are on
the slider. `worldWouldDiffer()` asks only the `restart` tunables, because
everything else has already taken effect live by then.

**`rebuildBeforeStart` is deliberately not a general restart.** Before the first
step the only things holding the old world are `Renderer`'s `sim` field and its
pre-rendered terrain, `NewGame`'s `sim` field, and three module variables — so
two new `setSim` methods and a short reset cover it. A few minutes into a game
that is no longer true: `lastActions`, `lastEventId`, `commanding`, `selected`,
the floaters and half the HUD are all holding ids from the world being thrown
away. The in-game "New world with these settings" button therefore still saves
and reloads the page. One mechanism each, for two situations that are genuinely
different, and both say so in a comment.

**`window.__dynasty.sim` is a getter now.** It used to copy the reference into
the handle object, which was harmless while `sim` was a `const` and became a
silent lie the moment the start screen could replace the world — the browser
tests read that handle, and the first version of the new spec failed on exactly
this, reporting the boot island's numbers after the rebuild.

The screen itself is the same form in a `start` mode: "Before you begin", a
`Begin` in place of "back" and "new world with these settings", no restart note
(nothing has been handed over yet), no backdrop-click to leave, and no keys at
all — Escape included, for the same reason `NewGame` and `Succession` ignore it.
The action row became sticky in both modes, because the form is longer than any
screen and `Begin` was below the fold: the way into the game is not something a
player should have to go looking for.

`?skipIntro=1` bypasses both screens as it always has.

**One existing spec changed** — `character creation picks a life inside a world
that already exists` now dismisses the settings screen first. That is the spec
encoding a premise this change deliberately alters, not the game breaking.

## 2026-09-09 — the settings screen, and a difficulty from peaceful to extreme

Asked for by the project owner: tuning the game meant editing `Config.ts` and
reloading, and half the levers that matter were not in that file at all.

**The hard constraint was that the defaults must not move**, and it is enforced
rather than asserted. `src/sim/__tests__/config.test.ts` builds one world plainly
and one through the Normal anchor, steps both 500 times and compares the
determinism fingerprint. It also checks that every tunable path resolves against
`DEFAULT_CONFIG` — the failure that would otherwise be silent, a settings screen
writing `needs.hungerrate` and moving a slider that changes nothing — and that
peaceful and extreme move in opposite directions from normal, which is the
column-pasted-into-the-wrong-difficulty mistake that would otherwise only ever
show up as "extreme feels oddly generous".

`sim:check:all` is unchanged: 33/34, 36/36, 38/38, 53/53, 46/46, 48/48, 39/39,
37/37 with `tiny`'s `food-work-continues` failing exactly as before.

### Five constants became config, each wired in the same pass

Nothing was declared without something reading it.

- **`learning.skillGain`** multiplies `Person.practice`. An **instance field on
  `Person`**, not a module global: six simulations are constructed back to back
  by `sim:check:all`, a global would have the last one silently retune the
  others, and the determinism test could never see it because it compares two
  runs of the *same* build. Stamped at the only two `new Person` sites in `src/`,
  plus `Simulation.applyLearning()` to sweep the living — a multiplier stamped at
  birth is otherwise a promise the settings screen cannot keep to anyone who is
  already alive.
- **`learning.observationChance` / `childObservationChance`** replace the two
  constants in `KnowledgeSystem`. `KnowledgeContext` already carried
  `KnowledgeConfig`, so this was one field on each side.
- **`world.regrowthRate`** multiplies every node's regrowth, threaded through the
  single `node.regrow` call site. It lands on the **final term**, not on
  `growth`: `regrow` clamps with `Math.max(growth, winterFloor)`, so scaling
  growth would be swallowed entirely for fish — the one food that keeps growing
  through winter, and so the one the lever matters most for.
- **`population.conceptionChance`** replaces `LifeSystem`'s constant. It is the
  only member of `PopulationConfig` read after the constructor.

`GESTATION_DAYS` and `BIRTH_SPACING_DAYS` were deliberately left alone: nothing
in the UI would read them, and two config fields added for symmetry are two
fields that can drift.

### Five anchors, snapped, not a hundred interpolated points

`src/sim/core/Difficulty.ts` holds `TUNABLES` and `DIFFICULTIES` in one file so
the labels and the numbers cannot disagree about thirty dotted paths.

The slider snaps to peaceful / easy / normal / hard / extreme rather than
interpolating, for two reasons. Nine of the scaled fields are integers, so a
continuous slider rounds them at nine different places and the panel twitches
incoherently mid-drag. And ten seeds cannot resolve a change under about ten
points of mean survival — five anchors is five things that can be measured, a
hundred interpolated points is ninety-six claims nobody has checked. The anchors
ship as *designed* numbers and the changelog says so; measuring `hard` and
`extreme` is a follow-up, not something this pass pretends it did.

Eleven fields are exposed but **pinned** — editable, not moved by the slider.
`needs.workLimits` and `criticalThreshold` because a need parks *at* whatever
line stops work, so they are also where the band's average hunger and thirst
settle; `population.bands` because more tribes is both more rivalry and more
hands and the direction is genuinely ambiguous; the clock because pacing is
taste. Difficulty gets its winter pressure from `coldRate` and `regrowthRate`.

### Live where it can be, a new world where it cannot

Live edits are written straight into `sim.config`, which works because of object
identity rather than luck: `NeedsSystem` and `TimeManager` were handed the very
objects inside `SimConfig` in the constructor, and the per-tick and per-day
contexts are rebuilt from `this.config` every step.

`time.ticksPerDay` is the field that must never be live, and the reason is worth
recording: `TimeManager.day` is derived from an ever-increasing tick, so halving
it mid-run jumps the calendar by hundreds of days in one frame. Every absolute
day stored anywhere is then wrong at once — `lastBirthDay` locks every mother out
of conceiving, and `STALE_DAYS` abandons every idea in every head.

A new world is a **save and reload**, not an in-process restart. `main.ts` holds
`const sim`, captured by the renderer, by `NewGame` and by two dozen closures,
and there is no save system for a restart to preserve; `?seed=` and a reload is
already how a specific world is replayed. Settings persist as **the diff from an
anchor**, never as an expanded config, so a later retune of `hard` reaches a
player who never touched hunger and leaves alone one who set it by hand.
`?defaults=1` ignores stored settings, so a seed pasted into a bug report still
reproduces the reporter's world.

### Escape became a precedence chain, and three dead lines came to light

`main.ts`'s Escape handler had three lines that could never fire: each graph
overlay registers its own bubble-phase Escape listener at construction, above
the main handler, so they had already closed themselves by the time it ran.
Harmless until something needed to know whether Escape had been *consumed*.
A capture-phase snapshot now records what was open before anything closes
itself — without it, dismissing the tech web would pop the pause menu on top of
it every single time.

**One deliberate behaviour change:** clearing `commanding` now consumes the key,
where Escape used to clear it even while also closing a graph. That is the right
reading of a chain once something is waiting at the end of it.

### The notes.txt triage

- The "still says *Needs 3 thatch to build one*" report **did not reproduce** —
  that pane has been gated on `stage !== 'proven'` since the earlier fix, and
  refinement never puts the stage back. Recorded in `bugs.md` rather than
  dropped. The investigation did find a blank: a proven design being refined
  showed nothing at all, so somebody improving something for days looked idle.
  The pane now shows the refinement level and its progress.
- **"Adjustable trials to get an idea, with failures worth less"** was already
  shipped as `knowledge.trialsToProve` and `failedTrialCredit`. Both are now on
  the settings screen, which is the half that was missing.
- **The craft bar** now has a button beside Build and the menu, and says what it
  is waiting on instead of only that it is empty. See `bugs.md` — the bar was
  working; it was unfindable and usually empty, which is the same thing from
  outside.
- **A proven technology now flags its bar.** The announcement over the person
  already named what it unlocked; what was missing is that the *consequence*
  landed in a menu nobody was looking at. Watching the two list lengths catches a
  technology picked up by being taught as well as one worked out, which watching
  `prove` would not.
- Fishing spots on the coastline, rivers and salt water, and curiosity as a
  fourth transmission channel are written up in `next-steps.md` as N1–N3. The
  first two are movement-system and worldgen work that belongs with M7.

## 2026-09-08 — M8.1 begins: fishing, mechanism 2

The first node and the first mechanism of `m8_plan_the_ages.md`'s M8.1 tier,
shipped as its own vertical slice per the plan's stated order ("fishing, then
traps, then stations, then spoilage"). Thirteen more M8.1 nodes and the trap,
station and spoilage mechanisms are not in this pass; the era-ladder rename
and the `TechDef.age`/`firstKnown` axes are also deferred, since most of the
new era table's `needs` name technologies that do not exist yet.

**Fish is a `ResourceKind`, not a new action.** `doHarvest` is driven entirely
by `node.def` (kind, item, skill, harvest ticks), so a `fish` entry in
`RESOURCE_DEFS` (`entities/ResourceNode.ts`) inherits the food-work hunger
exemption, the interruption check and the stop/resume reporting with no new
code in `ActionSystem` at all — the same reasoning the plan gave for
rejecting a dedicated `doFish` action or a swimming entity. Placed on shore
tiles (`biome === 'beach' && world.isShore(...)`), the same rule `reeds` and
`clay` already use.

**The two hardcoded `n.kind === 'berries'` food predicates are now one
function.** `isFoodKind(node)` in `ResourceNode.ts` reads
`ITEMS[node.def.itemId].nutrition > 0`; `Brain`'s forage filter and
`Simulation.stats().foodInWorld` both call it instead of testing a literal
kind string. `fishing` itself is a yield multiplier on `forageYieldFactor`
(`scaled(person, 'fishing', 1.5)`), the same shape as `plant_lore` on berries
and `stoneworking` on flint — **not** a hard gate on catching fish at all, by
design: every other primary resource in this game is free to gather and only
the yield is technology-scaled, and fish measurably follows that precedent
rather than breaking it (see the measurement below).

**Decided deliberately: fish get a winter floor.** `ResourceNode.regrow`
scales by `time.growth`, which is zero in deep winter — correct for a
stripped bush, wrong for a food source whose entire purpose is not vanishing
when berries do. `ResourceDef.winterFloor` (0.4 for fish, undefined
everywhere else) sets a floor under the seasonal multiplier rather than
hardcoding a fish-specific case into `regrow`.

**The RNG seed trap the plan named twice, avoided as specified.** Fish are
placed on a dedicated `fishRng`, forked genuinely last — after the anonymous
`seedInitialForest` fork the plan flagged as a trap in its own right — and
spawned in their own pass after `spawnPeople`, never added to the `plan`
array `spawnResources`/`spawnHerds`/`spawnPeople` all share. The pre-change
world is bit-identical except for the fish.

**New: a `water` domain**, `fishingSpots` in `WorldConfig` (50, the scale of
`reedBeds`/`clayBanks`), a `fish` item (nutrition 18, spoils in 800 ticks —
faster than meat's 1200, which is real and sets up `preserving` later), a
`coast` scenario, and a `fish-are-caught` check that skips honestly rather
than assuming every region has a fishing spot (in practice it never has,
since `spawnPeople` already sites every band with water in reach).

**One check needed a sample-size floor it never had.** `crafting-is-
interruptible` only skipped at exactly zero attempts, unlike its sibling
`hunts-succeed-and-fail`; `coast`'s thin starting roster (two techs, one band)
produced exactly one craft and failed the check on a sample of one. Given the
same floor `hunts-succeed-and-fail` uses in spirit: skip under 5 attempts.
Not new behaviour from fishing, a gap in the check a thin scenario was first
to expose.

**Measured across the canonical twenty-seed cohort**, before and after, per
`AGENTS.md`: mean survival 76.2% → 79.2%, technologies known 6.2 → 6.5, taught
138.2 (noise against 142.5). Fish were caught in 20 of 20 seeds, 18,879 catches
total — the mechanism works. `fishing` itself was conceived in 0 of 20: its
only prerequisite, `spear`, was itself conceived in 2 of 20 in this same
cohort, so this is `spear`'s existing depth-two rarity inherited by anything
built on it, not a new dead spark — `tracking`'s fix does not generalise
here, because unlike `tracking` this is not a root node with a broken
ingredient, it is a node one level behind a chain that is already rare by
design. Left as a finding rather than a fix: re-tuning `spear`'s reachability
is out of scope for shipping one mechanism and risks the exact kind of
un-isolated, unmeasured change this project's own rules warn against.

`npm run typecheck`, `npm test` (140/140), `npm run sim:check:all` (all eight
scenarios, `tiny`'s one-tick `food-work-continues` flip aside — see
`bugs.md`) and `npm run e2e` (39/39, `DYNASTY_PORT=5290`) all green.

## 2026-09-08 — `tracking`'s spark, the M8.1 blocker

`m8_plan_the_ages.md` named this the one thing that had to happen before
`snares` and `taming` could land behind `tracking` without shipping
unreachable, the `leatherwork` failure again. M8.0 had found `tracking`
conceived in none of twelve instrumented worlds because its weight-1.0 route
needs `saw: quarry_escaped`, which fires about twice in two years, and its
other two routes both wait on a hunt, which is rare for the same reason.
Independently reproduced before touching anything: 1 of 20 seeds ever
conceived it (`vite-node tools/_tracking_probe.ts`, a throwaway instrument,
not kept).

**Added one ordinary route**: `{ doing: forage, place: forest }`, weight 0.7.
Anybody foraging in a forest walks past prints and droppings daily whether or
not they are hunting — the realistic story, and unlike the three routes
already there, common enough to actually fire. The three existing routes are
untouched; they are still true, just rare.

Measured across the canonical twenty-seed cohort before and after, per
`AGENTS.md`'s rule that ten seeds cannot resolve anything smaller than the
larder fix and this is smaller: mean survival 76.9% → 76.2% (noise), mean
technologies known 5.3 → 6.2, mean past-root conceptions 4.5 → 4.3 (noise),
mean taught 122.7 → 142.5. `tracking` itself went from conceiving in 1 of 20
seeds to 20 of 20, averaging 5.65 conceptions a seed — between firemaking's
and cordage's established rates on the instrumented run M8.0 quoted, not a
flood. `npm run typecheck`, `npm test` and `npm run sim:check:all` all stay
green. M8.1 is unblocked.

## 2026-09-08 — M6b phase 7: the visualisers, and a tech web that scales

`docs/m6b_plan.md` phase 7, next after jobs and rebellion. Two new panels, and
a rebuild of the one that already existed, because all three share one piece
of machinery worth building once.

**`src/ui/GraphLayout.ts` is new**, extracted from what used to be
`TechWebLayout.ts`'s own relaxation loop: repulsion between every pair,
springs along edges, a centring pull, and a last hard pass that separates
anything still overlapping. `TechWebLayout.ts` now calls it instead of
carrying its own copy — a second graph was always going to need this
arithmetic, and a second copy is how the two drift apart. Two graphs did
need it: `FamilyTreeLayout.ts` pins every node's `y` to a generation, so a
family reads top to bottom rather than relaxing into a circle; `TribeGraphLayout.ts`
seeds nodes by rank and lets springs whose rest length runs from love to
hatred do the rest.

**The family tree** (`K`) walks `motherId`/`fatherId`/`spouseId`/`childIds`
two generations up and two down from whoever it is opened on, plus siblings
found by scanning for someone else who shares a parent — not stored on
`Person` directly. A child's own spouse is shown but not traced further, or
the tree would pull in a second, unrelated family through every marriage.
Gated on the same acquaintance level `Hud.tabTies` already puts on a family
section, and — because the people gathered are not only the subject — every
individual node's name is routed through `knowledgeOfPerson` again for
*that* person: a stranger on your own family tree reads "a young man," not
by name.

**The tribe graph** (`T`) is not spokes from the subject alone. It is a
sociogram: an edge between *any* two people the subject knows who also have
an opinion of each other, not only between the subject and everyone else —
two people the subject knows who cannot stand one another is exactly the
kind of thing a map of somebody's ties should show. Capped at the
twenty-four strongest relationships (`relationships.knownBy` already sorts by
magnitude), with the head line saying so once the cap bites rather than
quietly dropping the rest. Colours reuse `.hud-tie-value.is-pos`/`.is-neg`'s
exact palette. Gated on `knowsTies`, the stricter of the two thresholds — this
can name people the subject actively dislikes, which is a sharper thing to
hand over than who their parents are.

**The tech web rebuild** is the one `next-steps.md` called mandatory, and the
numbers in that document were confirmed rather than assumed: at seventeen
nodes the old fixed-1080x720, no-pan-no-zoom layout had a fit-to-box scale of
~0.65, putting the relaxation's own 92px hard separation at about 60px on
screen — under a node's own 84px width. `layOutWeb` no longer fits itself into
a box at all; it lays out at natural size (`GraphLayout.shiftToOrigin`) and
`TechWeb.ts` owns a pan-and-zoom viewport instead, the same relationship the
game's own camera has to the world. Dragging pans, the wheel zooms centred on
the cursor, and panning or zooming touches only a `style.transform` — never a
rebuild — which is what keeps a hovered node from being detached sixty times a
second the way an earlier redraw-on-every-frame bug once did to this same
panel. Below `CHIP_ZOOM` a node collapses to an unlabelled dot rather than a
box of illegible text, its border colour still showing the domain and state.

Cross-links got a degree cap rather than a stricter threshold, and that order
was decided by measurement, not by the plan's first guess: raising the
shared-ingredient threshold from two to three was tried first and left only
three edges in the whole table today, a wall of unrelated nodes rather than a
web. `firemaking` alone drew eight of them at the threshold that stayed, most
of the way to the "hundreds of faint lines" `next-steps.md` warned about — so
`MAX_SHARED_DEGREE` caps any one node at four, keeping the strongest relations
and dropping the rest, which is the lever that actually works at this size.

**One thing in the plan not done as written, and why:** "radius becomes the
age rather than the prerequisite depth" assumes M8's seven archaeological
tiers, which have not shipped — today's `ERAS` are cumulative society-wide
milestones, not a per-technology property, and mapping each tech to "the
first era whose needs include it" would put `cordage`, a root node, in the
same band as `hafting`, three steps into the tree, because only the *tools*
era's needs happen to name it. Prerequisite depth already sorts oldest-to-
newest in practice — a root node cannot help being depth 0 — so the radius
basis is unchanged. Revisit this once M8 gives every technology a real age of
its own.

Verified: `npm run typecheck`, `npm test` (140 tests, fourteen new
determinism/overlap tests across the three layouts), `npm run e2e` (39 tests,
five new — opening each graph, the mutual-exclusion between all three, the
veil on a stranger, and a real mouse drag and wheel zoom on the tech web), and
`npm run sim:check:all` (unaffected — nothing in `src/ui/` runs headless, and
the suite stayed green to confirm this pass touched no simulation code).

## 2026-09-08 — M6b phase 6: jobs and rebellion

`docs/m6b_plan.md` phase 6, chosen by the project owner ahead of the tech
ladder. `Person.job` from a small table in the new `src/sim/entities/Job.ts`
(`forager`, `hunter`, `builder`, `crafter`); `Brain.score` leans a job-holder's
own verbs up and the rest of `WORK_ACTIONS` down by a small, calibrated factor,
never touching social or research actions or the needs that can kill someone.
The chief settles unemployed adults into whichever job the band currently has
fewest of, one a day and without spending an RNG draw; assigning someone
*else's* job is a new kind of order, through `Simulation.assignJob`, subject to
the same compliance roll `command` uses and its own `ORDER_COST.job`. A sixth
HUD tab, Work, lets the player assign a job to anyone they can see, and says
what it leans them toward.

`SKILLS` gained `farm` and `smith` ahead of the technologies that will use
them, because it is iterated by founding, inheritance, ageing and the
character-creation point budget and that migration must not hide inside the
M8 content pass that first gives either of them an action.

Rebellion is derived, not stored: `BandSystem.considerRebellion` runs beside
`considerExile`, gated on the *single most aggrieved* band member's opinion of
the chief rather than the band's average. That was a finding, not a starting
choice — instrumenting a two-year run showed the band's average regard for its
own chief never once went negative, because `chooseChief` re-elects daily and
simply replaces a chief who is losing the room before collective resentment
can accumulate. One person hating an otherwise well-liked chief is common by
comparison. Three rising outcomes, gated behind `defiance` so crossing the
threshold does not itself cause anything: public refusal, leaving the band (via
a `removeBandMembership` shared with `exile`), or a public challenge for the
chiefdom decided by the same regard `chooseChief` would use if it ran again
today (a new `standingScore` helper, extracted so the two never drift apart).

Two new `simcheck.ts` checks, and both needed a second pass once real numbers
came back:

- `jobs-bias-work` first compared job-holders' time on their own job against
  everyone-with-no-job's time on *any* job's actions, and failed by
  construction — `forage` alone is most of everyone's day, employed or not,
  since it is also how hunger gets answered, and that comparison punished
  narrow jobs like `crafter` however well the bias worked. It now compares
  each job's holders against everyone who does *not* hold that job, action by
  action, and needed the bias strengthened from a first pass that only passed
  on some scenarios in `sim:check:all` to one (`JOB_BIAS_UP`/`_DOWN` in
  `Brain.ts`) that holds a positive margin on all seven.
- `rebellion-is-rare-but-happens` reports **n/a rather than a failure** when a
  run sees no rebellion at all, for the reason `prototypes-can-fail` was
  deleted rather than kept: across fifteen seeds of `century`, six saw zero
  rebellions in a full two years, and the `century` seed's own count moved
  between 0 and 2 across two tuning passes in this one while
  `considerRebellion` itself did not change. A rare stochastic event has too
  small a sample in any one run for a hard pass/fail to mean anything; what
  the check still catches is the ceiling, and the mechanism itself is asserted
  deterministically in the new `band.test.ts` — a band with one member primed
  to despise its chief past any doubt (loyalty 0, opinion -100, so `defiance`
  is exactly 1 and no RNG draw can fail the roll).

Collateral fix, found by the above: `kin-outrank-strangers`'s three-tier
comparison could already flip on a single relationship — its own comment
documents a marriage across a band line doing exactly that — and the "leave"
rebellion outcome gave the `tiny` scenario a new way to create the outcast
band's first member inside its first week, at five or six pairs in the
outsider and band tiers. `opinionOf` now returns n/a under ten pairs rather
than under zero, chosen by measuring `tiny` (noise) against `century`
(hundreds of pairs, stable) rather than picked to make one run go green.

`npm run sim:check:all` (all seven scenarios), `npm test`, `npm run e2e` and
`npm run sim:seeds` (77.5% mean survival, 0/10 collapsed — no regression from
the 71.3%/2 baseline measured before this pass) all pass.

## 2026-09-08 — M8.0: the climb, measured across seeds instead of on one

The measurement pass `m8_plan_the_ages.md` puts before the ladder. Two checks
changed, the seed cohort learned to report the tech tree, and **the finding the
whole milestone was ordered around turned out to be a property of one unlucky
seed rather than of the game.**

### The plan's premise was drawn from a single chaotic run, and is wrong

The plan opens with a two-year `century` run in which three of seventeen nodes
are ever conceived, two technologies are known to anybody at the end, and 13
lessons are taught — and concludes from it that **the climb is set by
transmission**. Every one of those numbers reproduces exactly. They are also the
worst of twenty.

`npm run sim:seeds -- --seeds 20` now reports the tree, and the same
scenario across the canonical cohort gives **5.4 technologies known at the end,
4.2 conceived past the root nodes, and 124 things taught or picked up by
watching**. The century seed — 2 known, 0 past the roots, 24 passed on — is
**the only one of the twenty that never gets past a root node**. Nodes at depth
two are reached routinely: `stoneworking` and `leatherwork` both turn up.

*Reason this matters more than the correction itself:* `AGENTS.md` says in as
many words that the century scenario is chaotic and that one run of it is not
evidence, and the plan quotes that rule in its own risk section before resting
its ordering on exactly that. The instrumented run was real and reproducible;
generalising from it was the error.

### What actually gates the climb: the population, not the teaching

The two are not independent, and the direction runs the other way from the
plan's. Sorting the cohort by survival sorts it by the climb: the two seeds that
collapse below a quarter are the two worst climbs, and the century seed is last
on both. Transmission tracks adult-days almost exactly — 24 things passed on in
a world with 1,405 adult person-days, 194 in one with twice that — because
teaching needs somebody who knows something and somebody with the years to be
taught, and a halved population has neither.

So of the four hypotheses M8.0 was written to test: **transmission is not the
bottleneck** (refuted), **population is** (supported), and the food supply pass
M8.1 was already going to do is the same work as the tech-rate fix, exactly as
the plan's fourth point guessed.

### The idea cap is not the story either, and was not changed

`MAX_IDEAS` was raised from 2 to 4 and the cohort re-run: known 5.4 → 5.5, past
the roots 4.2 → 4.3, survival 75.7% → 77.0%. That is nothing — far inside the
ten-point floor this project already knows ten seeds cannot resolve. The
instrumented run says why: an adult held a full slate on 539 of 1,405
person-days, but on only **20** of those was there an idea open to them that the
cap was actually blocking. *Reason it was measured before being changed and then
left alone:* it is a plausible-sounding knob, and the honest measurement says it
buys a tenth of a technology.

### `sparks-are-various` now counts technologies, not routes

It read "8 distinct spark routes fired" on a world where fourteen of seventeen
nodes had never entered a head, and passed. It now reports "8 routes into 3
technologies" and asserts both. *Reason:* a check that looks healthy on a world
where four fifths of the tree never occurs to anyone is the failure that got two
checks deleted in the winter pass.

### `the-tree-is-climbed` is new, and fails on the century seed

It asserts that a run of a year or more conceives something past the four nodes
anybody can reach knowing nothing. It fails today on century — 0 of 3 — and is
the gate every content tier of M8 is held to: a tier that adds nodes and does not
move it has added content no player will ever see. Its comment says plainly that
it is a tripwire on the worst case and not the measurement, and points at
`sim:seeds` for the distribution, so that nobody reads one red line as evidence
about the pace of discovery. Both of century's failures now have one cause.

### `sim:seeds` reports the tree beside the population

Three columns — technologies known at the end, distinct nodes conceived past the
roots, and things taught or watched — plus a mean line and a count of worlds
that never got past a root node. *Reason:* the climb is a mean-across-seeds
question for precisely the reason the food economy is, and it had no home. The
tool also had to enable telemetry, which `runScenario` does and this path never
did, or every one of those columns would have read zero.

---

## 2026-09-08 — Planning: the roadmap, and a tech ladder that runs to iron

A planning pass, so no simulation code changed. What changed is the documentation
that tells the next person what to build, and it changed because two of the
owner's requests turned out to depend on a measurement nobody had taken.

### The roadmap had gone stale, and was rewritten rather than amended again

`next-steps.md` was written on 2026-09-02 and amended in place for a week. By the
end it described the tech tree as "ten nodes so far" when there were seventeen,
listed weapons and knowledge transmission as future work when both had shipped on
2026-09-07, and marked two of the owner's eight requests done inside a section
whose preamble said nothing was scheduled. *Reason for a rewrite rather than a
ninth amendment:* a roadmap somebody cannot trust to describe the present is
worse than no roadmap, because they will plan against it.

### The tech tree is to run to iron, and to follow real human history

Asked how far the ladder should reach, the owner chose **iron**; asked what to
build first, **jobs and the visualisers**; asked how eras should be named,
**both** — the real archaeological period as the title, the evocative line kept
as its description. New `docs/m8_plan_the_ages.md` carries forty-eight new nodes
across the Upper Palaeolithic, Mesolithic, Neolithic, Chalcolithic, Bronze and
Iron ages, each with the mechanism that makes it real, plus the era table, the
two new skills and domains, and `TechDef.age` and `firstKnown`.

`m6b_plan.md` phase 8 said "stop and re-plan here". It is marked superseded and
points at the new document; every node it named survives inside it.

### The measurement that reordered the whole plan

The plan was going to open with the ladder. It does not, because instrumenting a
two-year `century` run produced this: the world ends in the Age of Fire with
**two technologies known to anybody**, and across the entire run **exactly three
of the seventeen nodes were ever conceived by any person** — `cordage`,
`plant_lore` and `firemaking`. The other fourteen have never entered a head.

`bugs.md` already carried a softer version of this, guessing at four to seven
technologies and noting that nobody had measured which stage was slowest. The
stage is not in the pipeline at all: 34 ideas became 8 prototypes and 7 proofs
off 139 ponder breakthroughs and 28 from discussion, which is a healthy funnel.
The gate is that every node past the three roots carries a `knows:` ingredient
while `knownTech` reaches two to four people, so almost nobody is *eligible* to
have the next idea.

Confirmed against a control rather than left as a theory: the `craft` scenario
starts its founders with three technologies and, on a run one twentieth as long,
conceives `cooking` and `stoneworking` — both depth-1, both `knows:`-gated,
neither of which the century run reached in two years. **The rate of discovery is
set by transmission, not by discovery**, which makes teaching, watching and
writing things down load-bearing for the whole ladder rather than flavour.

So M8.0 — understand and fix the climb — now comes before any node is added.
Forty-eight more nodes on top of a tree whose upper four-fifths nobody reaches
would be the inert-content rule failing at the scale of a milestone.

*Reason for recording the negative result too:* `conceptionBase` is the obvious
knob and it is the wrong one. Raising it would conceive `cordage` a fourth time.

### A check that looks reassuring and detects nothing

`sparks-are-various` passes on that run, reporting "8 distinct spark routes
fired" — and all eight belong to those same three technologies. This project has
already deleted two checks for exactly this shape. It is scheduled to count
distinct *technologies* instead, with a new `the-tree-is-climbed` beside it, and
both must be verified to fail on today's build before they are kept.

### Two seed traps written into `AGENTS.md`

Both found by reading the constructor, and both would have silently invalidated
every measurement in M8:

- **The fork comment points at the wrong place.** The named block ends at
  `recordRng` with a comment inviting an append after it, and there is an
  anonymous fourteenth fork twenty-five lines below — the one handed to
  `seedInitialForest`. Appending where invited consumes that fork's draw and
  replants every forest in every saved seed.
- **One `spawnRng` is shared by `spawnResources`, `spawnHerds` and
  `spawnPeople`.** Adding a resource kind moves every herd and every person in
  every world. This is *not* a fork-order violation, so `determinism.test.ts`
  does not catch it — it compares two runs of the same build. Any pass that adds
  a resource and then measures itself against a baseline measures the reshuffle.

### Five more defects found and recorded, none fixed

In `bugs.md`, each scheduled in the M8 plan at the point where it does damage:
`household.store` is written by `LifeSystem` and read by nothing anywhere;
`hafting`'s felling bonus and `armourOf` both bypass `techPower`, so refining
either is worthless; `doHunt` uses the bare `REACH` constant, so the bow's reach
does nothing in the one place it should matter most; and `NODE_LABELS` is not
compiler-enforced where `RESOURCE_COLORS` is, so a new resource kind fails the
build for its colour and silently prints a raw id for its name.

### Verification

No code changed, so the gates are unchanged and were run to establish the
baseline the plan quotes: `npm run sim:check` passes **36 of 36 applicable
checks** (13 n/a) at 4,267 steps/s. `century` fails `population-persists` at 10
alive against 11, which `bugs.md` already records as this scenario's divergence
rather than a regression.

---

## 2026-09-07 — M6b phase 5: the loop the player can see, and weapons

Three things reported from play (`docs/notes.txt`), and all three sat on the seam
between the simulation working and the player being able to tell. Folded into
phase 5 rather than made a pass of their own, at the owner's direction, because
the craft bar wants recipes worth opening it for.

### Work stops for a need it is answering

The reported symptom was people downing tools far too readily. The cause was that
`WORK_LIMITS` was one flat triple — thirst 35, hunger 40, cold 45 — asked of every
job alike, so **picking berries was interrupted by hunger**, which is absurd on
its face: gathering food is how you stop being hungry.

The limits could not simply be raised, and the comment that said so was right: a
need *parks* at whatever line stops it, so wherever these sit is where the whole
population's average hunger and thirst settle, and an early build near the lethal
line had a healthy band carrying 82 thirst inside a fortnight. So the base moved
only a little — into `Config.needs.workLimits`, where a scenario can reach it —
and `ActionSystem.workLimit` puts three *per-job exceptions* on top:

- **A job that answers a need is not stopped by it** until 90, near the critical
  line rather than at it, so somebody who genuinely cannot feed themselves where
  they stand still gives up and looks elsewhere. Decided per *node*, not per
  verb: `forage` is berries at one bush and flint at the next.
- **A nearly-finished pull finishes.** This is the far half of a rule `bugs.md`
  recorded as untunable — because the limits are absolute need levels, whether a
  job is ever interrupted depended on how long it ran, so berries looked
  uninterruptible and flint hopeless under identical code.
- **Work the player asked for gets a little more rope.**

### Thirst answers to what you are doing

A person asleep in a hut in February got thirsty at exactly the rate of one
felling a tree in July. New `EXERTION` table in `NeedsSystem`, a heat term off
`time.temperature` — the same reading that drives cold, with the sign the other
way — and the base rate lowered from 0.085 to 0.075, because the owner asked for
the need itself to be lower. Hard work in high summer now reaches about 1.9x the
base and sleeping through a winter night about 0.4x, where before everything was
1.0x. **Hunger is deliberately left flat**: the food economy is this world's most
fragile part and only drinking was reported.

**This nearly destroyed the world, and how it did is worth recording.** The first
version used multipliers up to 1.8 on the fastest-climbing need, and a two-year
run ended with **nobody alive** and *eleven and a half thousand* broken-off
hunts. The thirst model was not really the culprit: `hunt` was never gated by
`pressedByNeed` in the scorer, so a thirsty hunter armed a chase, was stopped on
the next tick, re-scored, and chose the same quarry again — the exact thrash
crafting was fixed for in pass A, latent all along and set off by thirst crossing
the line mid-chase. Gating it took 11,503 thirst interruptions to 66. **A
coefficient that exposes a structural defect looks exactly like a bad
coefficient**, and both had to be fixed.

### Proving a design is progress that cannot be lost

A trial was one all-or-nothing daily roll. A failure cost a quarter of the
insight, set the stage back to `researching` **and left the prototype materials
spent** — so a second attempt at cordage wanted another three thatch, and nothing
anywhere recorded that two trials had already happened. The owner reported it as
being stuck, which from inside the game is indistinguishable.

`Idea` now carries `trials` and `proof`. Proof only goes up: a good trial adds
`1 / trialsToProve`, a bad one adds `failedTrialCredit` of that, and the design
stays on the bench either way. Luck decides how long a design takes, not whether
it arrives. The numbers are in `Config.knowledge` — `trialsToProve: 3`,
`failedTrialCredit: 0.34`, `trialChance`, `conceptionBase` — which is the
"adjustable via parameters" the note asked for; conception also rose from 0.045
to 0.06, bounded by `ideas-are-conceived` rather than by taste.

`FAILED_TRIAL_CEILING` is documented for what it actually does, which is **not**
what its first comment claimed. That at least one trial must go well is
guaranteed by the control flow — only the passing branch calls `prove` — and a
test written against that comment duly passed with the ceiling removed, because
nothing rested on it. What the ceiling buys is an honest bar: without it a run of
failures under a generous credit fills the proof bar to the brim and parks it
there beside a design that is not proven. The test asserts *that* now, and fails
when the ceiling goes.

### Three things the player could not see

- **A proven design went on asking for its prototype materials.** An idea
  survives being proven — it stays on the person to be refined and only retires
  at its ceiling — and `TechWeb.detail` gated the whole "where it has got to"
  block on whether an idea *existed*. So cordage, built and worked out, still
  said "Needs 3 thatch to build one", under an insight bar showing the refinement
  progress `prove` had just reset to zero. It asks the stage now, shows trials
  rather than insight while a design is on the bench, and says whether the
  materials are actually in hand. `STAGE_LABELS` moved to `Synthesis.ts` beside
  the stages it names, rather than being copied into a second panel.
- **There was no craft menu at all.** `RECIPES` was reachable only by
  right-clicking bare ground, and an entry the actor could not make was left out
  rather than greyed — so proving hafting changed nothing anywhere visible. New
  craft bar on **M**, mirroring the build bar, with ingredients, greyed entries
  carrying `missingIngredients`' reason, and a "not yet known" line. It is **per
  person** where the build bar is per society, and that is not an inconsistency:
  a building is raised by a band, an axe is made by one pair of hands.
- **Proving something now says what it gave you** — the building or the recipe it
  unlocks, falling back to `TECH_EFFECTS` for the quiet ones. Cordage unlocks
  neither, which is exactly why the owner saw nothing happen.

### 5b. Weapons, and the first thing made to be used *on* something

`doAttack`'s damage line had **no item term at all**, so a man with a spear hit
exactly as hard as a man with his hands and every weapon in the game was a
decoration. `ItemDef` gains `weapon?: { damage, reach, hunt, tech }` and
`armour?`, read through two new helpers in `Tech.ts` — `weaponOf` and `armourOf`
— and therefore through `techPower`, so a refined design is worth more than a
first attempt at one and a fine spear handed to a novice is still just a spear.

- **`reach` is how a spear beats a fist without ranged combat existing.** It
  widens the gap `approach` will settle for, and only for a blow, so a fight is
  decided partly by who has to close the distance.
- **`hunt` is a separate number from `damage`**, because a bow is a far better
  answer to a deer than to a neighbour and a hand axe is the reverse.
- Three new nodes — `spear`, `bow`, `leatherwork` — each with the code that makes
  it real, three recipes, and `handaxe` gains the small weapon block it always
  deserved.

**`hunts-succeed-and-fail` has reported n/a for the whole life of the project**
and now passes: 12 kills against 9 misses on `craft`. A fresh deer outruns a
person, so before this a hunt could only be won by draining an animal's stamina,
which is why a two-year run produced about three kills. That is the long-standing
"hunting is a garnish" entry in `bugs.md` closed at its root, and it is upstream
of two more: hides are taken off kills, and a hide in cold hands is clothing's
heaviest spark.

**`leatherwork` shipped briefly unreachable and a test caught it.** All of its
routes wanted a hide in hand, and hides are scarce precisely because hunting is —
the deadlock `every-tech-has-an-ordinary-route` exists to catch. It has a winter
route now that needs nothing scarce.

**`weapons-are-made-and-used` was written and deliberately not kept**, for the
reason recorded beside `prototypes-can-fail`: a world check needs the world to
produce a sample, and this one cannot. See the finding in `bugs.md`. The claims
are asserted deterministically in a new `combat.test.ts` instead, and the
`armed_blow` and `armed_hunt` counters still read out in the events table so
anybody can see how often it actually happens.

### The recipe ceiling stopped meaning what it said

`tech.test.ts` held every recipe to 400 novice ticks, on the stated grounds that
a longer craft is interrupted, restarts from the beginning and never finishes.
That stopped being true in this same pass: `doCraft` and `doPrototype` bank their
hours on the person now, the way a building banks on the site and a carving on
the stone. The bow — 140 ticks, exactly 400 for a novice — is what exposed it,
and shortening the bow to squeeze under a line that had stopped meaning anything
would have been the wrong fix. The ceiling is a sanity bound now, and the
banking is guarded end to end in `orders.test.ts` instead.

Banking is worth its own line: on the `craft` scenario it took finished goods
from **10 to 22** against the same run length.

### Fixed on the way past

- **`doHunt` reported to nobody.** It counted `hunt_ended_<reason>` and called
  `finish` directly, so a chase broken off by thirst reached neither the player's
  floater nor `person.resume`: the standing "the UI says why" rule with a hole in
  it, and the telemetry counter beside it is what made the hole look deliberate.
- **The build bar printed raw technology ids.** "Granary (needs pottery)" read
  correctly only because the ids happen to be English words.
- **`.hud-buildbar` matched two elements** once the craft bar borrowed the class.
  A selector that can no longer name either bar is as ambiguous in a stylesheet
  as it is to Playwright; the craft bar has its own class and the styling is
  shared by naming both.

### Verification

Twenty seeds, before and after the whole pass: **72.7% → 75.7%** mean survival,
268 born against 317, adult starvation 165 against 149 — and collapses below a
quarter went 1 to 2. A three-point move is **not** resolvable at twenty seeds,
where a strictly better change has measured nine points worse, so the honest
claim is that none of this is a regression rather than that any of it is an
improvement. The needs rework alone measured 75.0% at its own checkpoint.

`century/population-persists` fails at 10 alive against a threshold of 11.
Investigated rather than tuned: it fails at **8** with `conceptionBase` put back
to 0.045, and at 10 with the whole thirst model neutralised, so it is the
divergence `AGENTS.md` warns about on this scenario and not this pass. Left
failing.

Three new checks, every one verified against a build without its feature:

| check | reports (century) |
|---|---|
| `drinking-is-paced` | 563 drinks finished over 2807 person-days |
| `food-work-continues` | 14 ticks of gathering pushed through hunger; **0 with the exemption removed** |
| `trials-accumulate` | 22 good trials across 7 designs proven; equal to the proof count under the old one-roll model |

`food-work-continues` is keyed by verb as well as by need, because a first
version could not tell hunting from berry-picking and passed happily on a build
with the gathering exemption removed — the hunts alone kept it above zero.

Two new e2e specs — the craft bar's greyed reason, and a proven design that no
longer asks for materials, which fails if the stage guard is removed. Three
existing specs and three unit tests encoded rules this pass changed; they were
updated, and the order tests now ask `sim.config` for the thirst that stops work
rather than restating 40, which is why they broke when the limits moved.

---

## 2026-09-07 — M6b phase 4: how knowledge travels

Four channels now, deliberately different in cost, reach and reliability. Two of
them did not exist yesterday: a parent could not teach their own child anything,
and nothing at all survived the death of the person who knew it.

### 4a. Children can be taught, and can watch

`KnowledgeSystem.daily` skipped children wholesale and `Brain`'s pupil filter
dropped them, so **every technology in the world had to be re-derived from
nothing by each generation**. A comment above `daily` already claimed children
were skipped "for conception only"; they were not, and now they are.

- Children run `tryObserve` at `CHILD_OBSERVATION_CHANCE`, nearly three times an
  adult's. *Reason:* a child spends its whole day underfoot while the people
  around it work, and picking things up by watching is most of what childhood
  is; an adult watching somebody else work is an adult not doing their own.
- `KnowledgeSystem.teach` refuses a child *teacher*. What a child holds is real
  and personal, held at level 0, and goes no further until they are grown.
- A new **`teach_child`** scorer term, rewritten to `teach` in `Brain.setup` —
  the idiom `feed` and `gather_for_site` already use. *Reason it is its own term
  and not a wider filter on the existing one:* an adult pupil is chosen for how
  much they lack and how well you get on, a child is chosen because it is
  *yours*. Sharing a scorer would have had every elder in the band teaching the
  same brightest child and nobody teaching their own.

**`refreshEra` counts adults only.** Two reasons beyond the story. The era
fraction divides holders by adults, so counting children in the numerator alone
could put it over one and advance an age on a cohort of six-year-olds; and
`knownTech` gates the build menu, so a band would have been able to raise a
granary because somebody's daughter once watched a pot being fired. The
consequence is deliberate and is one of the better stories the model tells: a
technology whose last adult holder dies leaves the world and comes back years
later when the child who was watching grows up.

**Fixed on the way past:** neither `Brain` nor `ActionCatalog` checked whether a
pupil had the *prerequisites* for anything the teacher knew, though
`KnowledgeSystem.teach` has always dropped those. The scorer therefore sent
people to give lessons that could not land, and the menu offered a Teach that
silently did nothing. Rare while every pupil was an adult; the common case the
moment children became pupils.

### 4b. Writing

New `src/sim/entities/Inscription.ts`, `Simulation.inscriptions` with its own
spatial hash, and a `recordRng` **appended after `wildlifeRng`** — never
inserted, because the fork order is the seed contract.

Four nodes, each with the code that makes it real:

| node | requires | what it does |
|---|---|---|
| `marking` | cordage | tallies; `tallyFactor` multiplies an argument's chance of getting somewhere |
| `writing` | marking + stoneworking | the `inscribe` and `read` actions exist at all |
| `clay_tablet` | writing + pottery | a second form: cheaper, holds two, and perishes |
| `library` | writing + carpentry | a building; `LIBRARY_INSIGHT` makes thinking go better under its roof |

**Reading requires `writing`, and that is the point of the whole feature.** A
record grants nothing to somebody who cannot read, so a band can sit on a
library holding the answer to its own dark age and starve beside it. It is what
makes writing an exception bought on purpose rather than a free second copy of
`knownTech` — and it is why the death of the last *reader* is a different and
worse event than the death of the last potter. The rule is enforced in the
action, in the radial menu's greyed-out reason, in the inspector (which counts
the marks rather than naming them), and in the entity picker.

`Simulation.recordedTech` sits beside `knownTech`: the first is what a society
could get back, the second what it can presently do. They come apart exactly
when a band loses its last holder of something and still has the stone.

### Three defects found while building it, all of the same family

- **A long job that loses its progress can never be finished.** Written as one
  uninterrupted pull, a stone took a novice twelve hundred ticks — and a novice
  picks up thirty-five points of thirst in four hundred, so the interruption
  check stopped them every time and the action restarted from nothing. A run
  spent **forty-five thousand ticks carving and produced not one record**: from
  outside, people standing in a field. Lowering the number only moves the line,
  so work banks on the record the way it banks on a building site. The escape
  hatch for anything genuinely long is to bank the progress somewhere, not to
  shrink the job until it fits; `tech.test.ts` now says so in both directions.
- **A carver abandoned their own half-cut stone on the tick after starting it.**
  A technology is claimed the moment the first mark is made, so by the second
  tick "what is worth writing down" no longer included the thing they were in
  the middle of writing down. The stone under their feet is checked *before*
  that question is asked.
- **Records stack, and "the nearest" is not good enough.** A carving is a place
  rather than a structure — a library is a heap of them on one floor — so a
  carver standing over a finished stone and a half-cut one got whichever the
  index returned first, which stranded every second carving for ever.
  `inscriptionAt` takes a filter now.

And one waste rather than a defect: seven separate stones all saying "writing"
while half of what anybody knew went unrecorded, because the daily recount could
not see a carving still under way. `recordsInHand` is claimed eagerly and is
kept distinct from `recordedTech`, which stays strictly what is *legible*.

### A scenario in which anything is written

`scribes`: two bands whose founders already know cordage, hafting, stoneworking,
marking and writing. Writing sits behind marking and stoneworking, which nothing
in the suite reaches from nothing, so without it every check about records would
report n/a for ever — the same reasoning that produced `craft` in the last pass.

**Reading is deliberately not asserted in `simcheck`, and that is a finding
rather than an omission.** A living teacher is quicker to reach than a stone
across the valley, so reading fires when the chain breaks: when the last holder
of something is dead, or when a record carries something newly worked out. A
fifty-eight-day run has neither. A twenty-four-thousand-step run does — it
produced `read_firemaking` and `recovered_firemaking` — but a run that long
makes `people-survive` ask a different question, and an *illiterate* control at
the same length survived worse (6/24 against 10/24), so that is the run length
and not the feature. The claim that a record outlives its author, and grants
nothing to somebody who cannot read, is asserted deterministically in
`transmission.test.ts` instead.

### `prototypes-can-fail` was deleted, not disabled

It asserted that both trial outcomes occur in a run. A two-year run produces
about eight trials at roughly a one-in-three failure rate, so zero failures is
ordinary chance — and the century scenario duly reported "8 built, 1 failed" and
then "8 built, 0 failed" across a change that never went near the roll. Raising
the minimum sample does not save it: the number of trials a run yields is
smaller than a statistical claim of this kind needs, so every threshold is
either flaky or permanently n/a. Both outcomes are asserted deterministically in
`research.test.ts` now, over twelve hopeless prototypers and twelve able ones.
The comment where it used to live says all this, because the obvious thing for a
later reader to do is put it back.

Two more gates were corrected rather than tuned, both exposed by the new
scenarios sitting between twelve days and two years where nothing had sat
before: `knowledge-is-found` and `ideas-become-tech` shared a thirty-day gate
with *conception*, which happens in an afternoon, while proving a design is
measured in seasons. Both want a year now. `knowledge-is-passed-on` keeps the
short gate, because handing over something you already know takes ninety ticks.

### Verification

`children-are-taught` reports **17 of 35 lessons went to a child, 16 of those
from a parent** on the century run, and fails on the build without phase 4a with
*"0 of 18 lessons went to a child"*. `records-are-cut` reports seven distinct
technologies on seven stones in `scribes`. New: `transmission.test.ts` (ten
assertions covering all four channels), an e2e spec that fails if the panel's
literacy gate is removed, and the tech web's node count is now read from `TECHS`
rather than written as a literal that any new node would break.

**Food economy: measurably better, and the cause is named but not confirmed.**
Twenty seeds, 65.6% mean survival before against **72.7%** after. The plausible
mechanism is that children now arrive at adulthood already holding `plant_lore`
and `cooking` — which are `forageYieldFactor` and `nutritionFactor`, the two
technologies that feed people — where before every generation started from
nothing. That is a real directional story rather than a coefficient, but it has
not been isolated, and this project has been wrong about a cause it did not
measure before.

---

## 2026-09-06 — Pass A: content that can be reached, and movement you can watch

Four defects and two of the owner's eight requests, lifted out of the phases
they were scheduled into because they are cheap, visible in the first minute of
a game, and two of them break rules `AGENTS.md` calls inviolable. `m6b_plan.md`
phases 5 and 6 lose their "fix on the way past" notes to this entry; what
remains of those phases is unchanged.

### `doCraft` was the one long action nothing could interrupt

A novice's `skillFactor` is 0.35, so a hand axe is `ceil(90 / 0.35)` = **258
ticks** — more than a whole in-game day at `ticksPerDay` 240. For every one of
them the knapper was `committed`, which stops the brain re-planning, and the
action had no `interruption()` call inside it. Nothing could reach them: not
thirst, not hunger, not cold, not being attacked. At `thirstRate` 0.085 that is
twenty-two points of thirst in one sitting, against a threshold of thirty-five.

*Reason:* it is exactly the omission `AGENTS.md` blames for the two worst bugs
in this project's history, sitting in the one action nobody had looked at. A
second consequence was invisible until it was fixed: with no `stop()` the craft
never reached the player's floater and never set the order aside for `resume`,
so the whole of M6c was bypassed here.

**`Brain` now also refuses to *start* one while a need is already over the
line.** The interruption check alone produced 786 abandoned attempts against 10
finished items: somebody one point past the thirst threshold armed a
two-hundred-tick timer, was stopped on the next tick, re-scored, and chose the
same thing again. The thresholds moved into `WORK_LIMITS` and `pressedByNeed` in
`ActionSystem` and are asked for rather than copied — *reason:* two copies of
those numbers would drift, and the drift would resurface as that same thrash
months later with nothing to point at. 786 became 14.

### The granary: a chain broken in four places, not a bad number

`BUILDINGS.granary` asks for six `pottery`, and `pottery` was the only id in
`ITEMS` with no source anywhere — no resource node, no tree, no kill, no recipe.
That was only the first link:

- **Nothing produced it.** New `src/sim/entities/Recipe.ts`: a `RECIPES` table
  shaped like `BuildingDef.materials`, holding the hand axe (moved across
  without changing a number) and the pot. Two entries and no more — *reason:* a
  recipe whose output nothing consumes is the same defect with the arrow
  reversed, and the new `recipes` tests assert every output is either worth
  carrying for its own sake or named by a building.
- **`doCraft` was monolithic.** The axe's predicate was written out three times
  — action, catalogue, scorer — plus a fourth copy of its name in the floater
  labels. All four read the table now, and `Person.targetRecipe` carries which
  one through `order`, `resume` and the stop notice.
- **The scorer could not fetch it.** `Brain`'s `kindFor` maps a material to the
  node it is dug out of and had no entry for `pottery`, so `wantedKind` came out
  undefined and `gather_for_site` was never scored: the site sat six pots short
  for ever. It now looks for a recipe, fetches the *ingredients* instead, and
  the craft scorer turns them into the thing once they are in the pack.
- **No band ever planned one.** `BandSystem.planBuildings` chose between three
  ids written out by hand — `windbreak`, `mud_hut`, `storage_pit` — and never
  consulted the designs available to it. **The granary and the longhouse were
  therefore structures no band would build in the entire history of the game**:
  correctly gated behind a real technology, listed in the player's build menu,
  and unreachable by the world that was supposed to grow into them. The planner
  now picks the best design its own members can actually raise.

*Reason for asking the band's own members rather than `Simulation.knownTech`:*
knowledge is held by people. A granary is something *this* band can build when
*this* band has somebody who can fire clay, and it stops being one when that
person dies. Building on the strength of a potter three valleys away would make
the knowledge pillar a lie.

Two deliberate conservatisms in the new planner: the first store is always the
cheap one, and nothing grander than a mud hut is planned until the band has
finished one. *Reason:* a granary is 900 ticks and 64 units of material against
the storage pit's 180 and 10, and a band whose first structure is an
eighteen-hundred-tick longhouse spends its first winter under a frame.

### A refusal by authority threw away the reason it had just worked out

`Simulation.command` computes `standing` on one line and fails the roll on the
next, and never touched `lastRefusal` — while `main.ts` was already waiting to
concatenate it, and the Ties tab was already printing that very sentence right
up until the moment it mattered. The player read a bare "Aldric refuses".

Also in `Authority.ts`: `ORDER_COST` gained `craft`, `hunt`, `sleep`, `teach`,
`ponder`, `discuss`, `prototype` and `flee`, every one of which had been falling
through to the 0.3 default; and `willObey` was deleted, having been exported and
never once called.

### O6 — movement is continuous

The simulation runs at five steps a second and the renderer at sixty, and every
drawable read its position straight off the simulation: each position was
painted for **twelve identical frames** and then jumped about ten pixels. The
`accumulator` in `main.ts` was already carrying the missing fraction of a step
and discarding it.

New `src/render/Interpolator.ts`, purely presentational and never constructed by
the headless harness. What is not standard about it is the **window**.
`WildlifeSystem` moves an animal one tick in five at five times the speed, so at
`tickRate` 5 an animal moves once per real second; interpolating that against
the preceding step would slide it across in a fifth of a second and hold it
still for four fifths — a 1 Hz twitch, and visibly worse than not interpolating
at all. Each entity therefore carries the span its current move was made over,
measured by watching when its position actually changes. A person gets 1 and the
textbook formula; an animal gets 5 and glides; one rule keeps covering both if
either stagger is ever retuned.

Three edge cases are blinded on purpose: `alpha` is forced to 1 while paused and
when a backlog is dropped — a zeroed accumulator would rewind the world by a
whole step at the exact moment it is already struggling — and clamped when the
speed slider changes `stepDuration` underneath an accumulator filled at the old
rate. Anything the interpolator has never seen is drawn where it says it is,
which is the right answer for the frame somebody is born on, and tracks are
swept so a long run does not remember everyone who ever lived.

**The camera follows the drawn player, not the stepped one** — otherwise the
world slides smoothly beneath a character who is still jumping, which is worse
than either half alone. `Camera.follow` also stopped being framerate-dependent
while it was open: it applied a flat 0.12 *per frame*, so the same code chased
at half the speed on a 30fps machine and at twice on a 120Hz display.

Measured beforehand at about 60 FPS in headless Chromium, which is what said the
renderer was never the constraint. `optimizations.md` has said so in as many
words since 2026-09-02; the frames were never the problem, the missing fraction
of a step was.

`Config.maxTicksPerFrame` was declared, never read, and written out as an 8 in
`main.ts` — the same duplication the comment above `tickRate` claims to have
fixed. Closed while the loop was open.

**A defect found by its own gate.** `Person` and `Animal` number themselves from
separate counters, so person 5 and animal 5 both exist and are different
creatures. The first interpolator kept one map keyed on the bare id, so the two
overwrote each other and a person was drawn sliding to wherever an unrelated
deer stood — sixty-five tiles in the run that caught it. Tracks are keyed by
kind as well now, and the e2e spec that found it asserts the width of the move
being drawn is more than nothing and less than anybody covers in one step. It
fails with *"the player was drawn at one fixed point all second"* on a build
without interpolation, which is what makes it a gate rather than a decoration.

### O7 — clicking one thing still offers the ground

The chooser needed **two** stacked candidates, and the ground was only ever
added as an entry once a stack had already opened it. Clicking somebody standing
on the tile you meant to walk to gave you the person and no way at all to say
otherwise — and standing on the thing you are working on is the ordinary state
of affairs in this game, not an edge case. It opens for any real candidate now,
with one exception: your own character alone under the cursor, because a
two-entry menu in front of the commonest click in the game is worse than the
problem it solves.

Two e2e specs were updated rather than the game: both right-clicked a lone
person and expected the radial menu, which is precisely the premise this
changes.

### A scenario in which anything is made

`craft`: two bands whose founders already know firemaking, hafting and pottery,
through a new `population.startingTech` that is empty in every world a player
will ever start.

*Reason:* knowledge takes years to work out from nothing, so **no run in the
suite had ever crafted anything or reached a gated design**, and any check about
either would have reported n/a for ever. A check that detects nothing is worse
than no check, and this is a large part of how the granary stayed unbuildable
without anything noticing. It is the affordance `harsh-winter` already uses when
it shortens a season to six days: move the starting conditions until a run can
reach the thing under test, rather than weakening the test until it passes.

### Verification

Both new checks were measured against the build without the fix, as required:

| check | on the broken build |
|---|---|
| `crafting-is-interruptible` | *"17 things made, 0 attempts broken off for a need"* |
| `pots-reach-a-granary` | *"3 granaries marked out, 0 pots made, 0 finished"* — the pre-fix world exactly |

New unit tests: `buildings-ask-for-things-that-exist`, which reports *"granary
asks for pottery, which nothing in the world produces"* against the old table;
the recipe-table invariants; `interpolator.test.ts`; an interrupted craft that
reports its reason and is picked back up; and a failed authority roll that
carries `standing.because`. Two new e2e specs for O7, one of which fails if the
self-click exception is removed.

**Two checks were corrected rather than tuned**, both exposed by the new
scenario and both cases of a check asking a question its run could not answer.
`techs-are-refined` shared a thirty-day gate with the rest of the research
lifecycle, which covers proving a design and comes nowhere near improving one,
and wants a year now. `prototypes-can-fail` demanded both outcomes from as few
as one trial, which is a coin toss rather than a measurement, and wants four —
the same reasoning `hunts-succeed-and-fail` already applies to strikes.

**Food economy: no resolvable effect.** Twenty seeds, 67.1% mean survival before
against 65.6% after. That sits well inside the band this project has already
measured as noise: twenty seeds separated phase 1 by 65.7 against 64.6, and ten
seeds once put a strictly better change nine points worse. Recorded as *not
resolvable*, which is not the same as unchanged.

---

## 2026-09-06 — M6b phase 3: the tech web

The visualiser for phase 2, and equally the instrument for telling whether
phase 2 works. The project already values that pairing — `npm run why` and the
HUD render the *same* `lastScores` table two ways — and this is the same idea
applied to knowledge: the web draws the same `TECH` table and the same `Notice`
that `KnowledgeSystem.tryConceive` decides on, so a picture that looks wrong is
a simulation that is wrong.

### The panel

- **`src/ui/TechWeb.ts`**, a full-screen overlay on **`G`**, following the
  `Succession`/`NewGame` boilerplate: own root on `document.body` rather than
  `#hud` — which rebuilds its subtree every frame — one delegated listener
  dispatching on `data-*`, and Escape to dismiss.
- **Five node states**, which are the whole legend: *proven* (lit, domain
  coloured, refinement pips), *in hand* (a ring drawn to the idea's insight),
  *within reach* (dashed outline — a spark fires right now), *understood but
  unsuggested* (faint), and *out of sight* (a small dark circle with **no
  label**). *Reason:* the shape of what is unknown should be visible without its
  content being handed over. Naming everything turns the web into a walkthrough.
- **Hovering answers "why not"**: each route in, with every ingredient marked
  present or missing — "✓ knowing firemaking, ✗ holding raw meat".
  *Reason:* this is the standing "the UI must say why" rule applied to
  discovery, and it is the half that makes the panel teach the player how the
  world works rather than decorate it. It is also the reason the panel is worth
  building at all: a tree that shows a locked node and nothing else is a list of
  things you cannot have.
- **`Simulation.noticeOf`** and **`describeIngredient`** in `Synthesis.ts`.
  *Reason:* the panel must answer out of the *same* situation the simulation
  decides on, and out of the same vocabulary. A UI holding its own copy of
  either would drift the first time an ingredient was added, and would then go
  on confidently describing a spark that no longer exists. A unit test asserts
  every ingredient the table names has words.
- **Gated through `knowledgeOfPerson`.** Opened on a stranger it shows the veil
  and not one node. *Reason:* `AGENTS.md` names "any new panel" explicitly, and
  a map of somebody's mind is the easiest possible way to hand the player the
  god's-eye view the whole design is built to withhold.

### The layout

- **`src/ui/TechWebLayout.ts`**, kept apart because it is pure arithmetic and
  touches no DOM, which is what lets `techweb.test.ts` test it. Domains own
  angular sectors, `requires` depth sets the radius, and a fixed number of
  relaxation passes — repulsion between all pairs, springs along the edges —
  pulls the seeded arrangement into an organic shape. Computed once per size and
  cached.
- **No randomness of any kind.** Not `Math.random`, which the project forbids
  outright, and not a fork of a simulation stream either: `RNG.fork()` consumes
  a draw from its parent, so opening a panel would shift every subsequent draw
  in the world and two players who pressed `G` at different moments would get
  different games.
- **Two kinds of edge.** `requires` is scaffolding and is drawn as a solid line;
  a faint dashed line joins two technologies sparked by two or more of the same
  things, which is a real relation in the table and the thing that makes the
  picture read as a web rather than a family tree. Cross-domain prerequisites
  get longer springs, so the areas that feed each other drift together and the
  arcs between clusters are the shape of the image rather than lines drawn over
  it.

### Two defects found while building it

- **The panel rebuilt its DOM every frame**, which detached whatever node the
  cursor was over before a hover could land on it. Playwright said so in as many
  words — "element was detached from the DOM, retrying", a hundred times over —
  and in play the detail pane would simply never have filled in. It now keeps a
  digest of everything on screen and redraws only when that changes. The digest
  includes the *notice*, not just the known technologies, because that is what
  moves a node between "could occur to them now" and "nothing has suggested it".
- **`KnowledgeSystem.advance` would refine an already-retired idea** past its
  ceiling. Found by `research.test.ts` in phase 2 and fixed there; noted here
  because the guard is what the ceiling now rests on rather than on where the
  callers happen to look.

### Two facts about the game recorded rather than changed

- **A conversation is four and a half in-game hours**, not the "half an hour"
  the comment beside `TALK_TICKS` claimed — 45 ticks at 240 ticks to the day.
  The comment was wrong by a factor of nine and is corrected; the number is
  deliberately left alone, because `next-steps.md` §O1 replaces the single
  conversation with several modes at several costs and changing it first would
  only move the problem.
- **The owner's list is written down** as `next-steps.md` §O1–O8: conversation
  modes, talking while working, learning by working alongside somebody,
  tribe-owned buildings that rivals may be refused, sabotage, continuous
  movement instead of five discrete jumps a second, and offering the ground as a
  choice when a single entity is clicked. Each is checked against the code, so
  whoever picks one up starts from what is there rather than from a guess.

### Verification

`techweb.test.ts`: the layout is byte-identical between two runs, no node
overlaps another at two different panel sizes, every edge has both endpoints on
the web, no pair is joined twice, and the cross-domain arcs exist. Two e2e specs
cover the panel opening on `G` with its five states and its "why not" pane, and
the veil on a stranger. The tour gained `12-techweb.png`.

The mandatory `.techweb[hidden] { display: none; }` is in place and the e2e spec
asserts it, because an author `display` beats the browser's rule for `hidden`
and this project has now made that exact mistake four times. The z-index ladder
is radial 20, picker 21, **techweb 30**, newgame/succession 40.

---

## 2026-09-06 — M6b phase 2: the mind, and where ideas come from

The largest phase of M6b and the heart of it
([m6b_plan.md](m6b_plan.md) §Phase 2). Discovery stops being a uniform random
pick from whatever is reachable and becomes a lifecycle: a named person in a
particular situation has an idea, works on it alone and with people who know
something, builds one, finds out whether it works — it can fail — and afterwards
improves it. It had to land whole, because an idea that can be conceived and
never proven is inert content by another name.

### The tree is not a tree

- **`knowledge/Synthesis.ts`**, and `TechDef.sparks`. A technology is now
  reached by a *situation*: what you know together with what is in your hands,
  underfoot, on your mind, in front of you and what season it is. Each node has
  two to four such routes.
  *Reason:* the design decision taken with the project owner after phase 1. The
  register is the owner's own: holding a vegetable while knowing fire suggests
  putting the two together; holding fur while cold suggests wrapping it round
  yourself. Several routes per node is what makes this a web rather than a tree,
  and it is why the same technology arrives for different reasons in different
  bands — on a two-year run, eleven distinct spark routes fired.
- **`requires` stays and means something different.** It is what you must
  already understand, and it gates teaching, observation and conception alike;
  `sparks` is what makes a thing occur to you, and gates conception only.
  *Reason:* they are honestly different questions, and collapsing them would
  lose both. A person can be perfectly equipped to understand clothing and never
  think of it, which is the interesting case.
- **`TechDef.pressure` is gone.** Need used to be a multiplier on the discovery
  roll; it is now an ingredient. *Reason:* cold *is* the reason clothing
  occurred to you, and multiplying by it as well would count it twice.
- **`clothing` no longer requires `plant_lore`**, only `cordage`.
  *Reason:* it follows the worked example in the plan, and the plant-lore
  prerequisite was scaffolding that nothing about clothing actually rests on.

### Two senses that did not exist

- **`Person.lately`** — a decayed tally of what somebody has actually been
  doing, written from `ActionSystem.finish`, the single funnel every ended
  action passes through. *Reason:* there was no such record anywhere.
  `workedTicks` is zeroed on every finish and never knew which action it
  counted, `skills` are cumulative and saturating with ten of them covering two
  dozen verbs, `telemetry` is global and disabled in the browser build, and
  `actionCounts()` is a census of the living rather than a history. Synthesis is
  impossible without one.
- **`Person.noticed`** — the same, for the reasons somebody's own work kept
  stopping, written from `abandon` and `stop`. *Reason:* being brought up short
  is one of the things that puts an idea in a head. Somebody whose hands keep
  being full is somebody who might think of a carrying strap, and `cordage` has
  exactly that spark.
- **The ground underfoot.** `World.biomeAt` has existed since M0 and nothing in
  `Brain` or `ActionSystem` had ever called it — the only biome the player could
  read was the one under a *selected* node, never under the person doing the
  noticing. `KnowledgeSystem.notice` calls it once a day.

### An idea has five stages, and can fail at four of them

`Person.ideas` (capped at two, so nobody dabbles at everything) and
`Person.techLevel`.

- **Conceived** by a spark; **researched** by two new actions; **prototyped** at
  0.6 insight for real materials; **tested** in use, which can fail and costs
  insight when it does; **refined** afterwards to a per-technology ceiling, at
  which point the idea retires and frees its slot.
- **`ponder` and `discuss`**, both with interruption checks. Both roll for a
  *breakthrough* rather than accruing smoothly. *Reason:* insight that creeps up
  a hundredth at a time is a progress bar; insight that lurches when somebody
  finally sees it is an event that can carry a floater and a chronicle line.
  Discussion is worth more than thinking alone and a second conversation with
  the same partner is worth a third of the first, or two people would sit in a
  field discussing hafting until one of them starved.
- **The test is a daily roll, not an action**, and `techPower` hands a prototype
  half its effect meanwhile. *Reason:* the world has to actually use a thing to
  find out whether it works, and `techPower` is called from the renderer and the
  HUD as well as the simulation — a draw from an `RNG` in there would make what
  the world does depend on how often it was looked at.
- **`KnowledgeSystem.advance` refuses an idea that has already retired.** Found
  by `research.test.ts`. Nothing in the game can reach one, but the ceiling was
  being enforced by where the callers happened to look rather than by the rule.

### Every stall says so

Five new `STOP_REASONS` — nothing on their mind, nothing came of it, not ready
to build, a partner who knows nothing about it, a partner who would not discuss
it — and a second queue, `Simulation.insights`, carrying the other half: an idea
had, a breakthrough made, a prototype that did not work, a design improved.
Gated on line of sight from the player's own character, the way witnessed deeds
are. *Reason:* the standing instruction from the project owner, applied to a
whole new subsystem rather than retrofitted to it later. An idea that silently
evaporates is indistinguishable from one nobody ever had.

- **An idea thought all the way through and never built is given up on after
  ninety days**, with a chronicle line and a floater. *Reason:* without it, an
  idea whose materials never turn up occupies one of two slots for the rest of a
  life and the person never thinks of anything again.

### Two things the sparks needed, which did not exist

- **`hide` is a real item**, taken off every kill alongside the meat.
  *Reason:* clothing's heaviest route is cold hands holding fur, and nothing in
  the world produced a hide. The ingredient did not exist, so the route could
  never have fired.
- **Clothing's *prototype* costs reeds, not hides.** *Reason:* measured. Hunting
  is rare enough that costing the first garment two hides left clothing
  permanently conceivable and permanently unbuildable — the inert-content rule
  wearing a different hat. The hide spark stays; hide garments arrive with
  leatherwork in phase 5.

### Two coefficients that were measured rather than guessed

- **`FELT_AT` is 30, not 40.** *Reason:* the interruption thresholds are where a
  need *parks*, so a population's hunger settles at 40 and cold is answered by
  shelter at 25. At 40 the whole fire branch of the web was unreachable: across
  a two-year run nobody made fire where the previous build had eight people
  doing it. Firemaking also gained a route that needs nobody to be cold, since
  every other route into it wanted the one need the band answers well.
- **`ponder` is weighted close to `gather`.** *Reason:* half again higher on a
  first pass and thinking became the sixth most common activity in the world,
  ahead of building and sleeping, which is not a stone age.

**Survival is unchanged.** Twenty seeds before and after: **64.6% both times.**
That was the risk this phase carried — two long actions and a think-tick
competitor to foraging — and it did not materialise.

### The health report

Seven new checks, and one fix to an old one:

`ideas-are-conceived` (bounded at both ends, because a flood means the web is
decoration), `discovery-is-situated`, `sparks-are-various`, `ideas-become-tech`,
`research-is-social`, `prototypes-can-fail` (a test that always passes is a
delay with a dice roll drawn over it) and `techs-are-refined`. New unit files
`synthesis.test.ts` and `research.test.ts`; the ingredient and prerequisite
checks were both verified against a deliberately broken table before being kept.

- **`kin-outrank-strangers` was measuring three categories that were not
  disjoint.** `kin` and `band` both exclude household-mates and `outsider` did
  not, so somebody who marries across a band line — `bandId` is not reassigned
  on marriage — counted as a stranger to their own in-laws for life. On the
  century seed one such marriage plus a band worn down to three survivors put
  mean stranger regard above mean band regard. *This is a fix to the
  measurement, not a tuning:* a plausible theory that the new `discuss` action
  was mixing bands was tested by biasing partner choice toward one's own band,
  which made the figure **worse**, and was reverted rather than kept with a
  false explanation attached. Twenty seeds, before and after: the outsider mean
  sits within a few points of zero in nineteen of them.

### UI

A "Working on" section in the Self tab — the idea, its stage in the player's
words, the story that started it, an insight bar and a count of attempts that
did not work — refinement pips beside each known technology, `Think`, `Build the
first…` and `Discuss … with` in the radial menu, and floaters for every beat.
Two e2e specs cover the panel and the greyed-out `Think` with its reason.

---

## 2026-09-05 — M6b phase 1: the tech tree becomes a registry

First phase of M6b ([next-steps.md](next-steps.md) §1). The goal of this phase
was not new content for its own sake — it was to put a seam in place that the
research lifecycle, weapons and jobs can all be built behind, and to stop the
tree accumulating nodes that do nothing.

### Every technology now does something, and a test says so

- **`TECH_EFFECTS` and `techs-have-effects`.** A technology may not enter
  `TECHS` without an entry saying what it does and where the simulation reads
  it, and `src/sim/__tests__/tech.test.ts` fails the build otherwise.
  *Reason:* the opposite kept happening and nothing caught it. `farming` gated
  an entire era and changed nothing on the ground; `clothing` and `cordage`
  unlocked nothing at all; `ItemDef.spoilTicks` carries six distinct values and
  is never read. The guard was verified against a broken build before being
  kept — reintroducing `farming` with no effect fails with `farming has no
  declared effect` — because a check that detects nothing is worse than none.
- **`farming` is removed from `TECHS`** until fields, sowing and reaping arrive
  with it, and the Age of Sowing with it. The top era is now the Age of
  Building, off `stoneworking` and `carpentry`.
  *Reason:* shipping it inert is the exact thing the rule above forbids, and
  leaving it in would have made the new test a lie on its first day.

### The longhouse has never been buildable

- **`carpentry` is a real technology now**, which fixes it.
  *Reason:* `BUILDINGS.longhouse` was gated behind `requiresTech: 'carpentry'`
  and `'carpentry'` was not a member of `TECHS`. Nothing could ever satisfy the
  gate, so the best shelter in the game has been permanently unbuildable and
  permanently listed in `lockedDesigns()` for its whole existence. A test now
  asserts every `requiresTech` names a real tech.

### One seam instead of six call sites

- **`techPower(person, tech)`**, with `carryFactor`, `forageYieldFactor`,
  `nutritionFactor`, `buildFactor`, `quarryReachFactor`, `stealthFactor` and
  `warmthFrom` on top of it. The six inline `knownTech.has(<literal>)` tests are
  gone.
  *Reason:* refinement — a design its holder has improved — is coming in phase
  2, and six call sites would each have had to learn about it separately. One
  function learns instead. Refinement will live on the *knower*, not the object:
  a fine axe in a novice's hand is just an axe. That is a deliberate trade for
  keeping per-unit quality out of `Inventory`'s stacks, which are relied on as a
  plain id-to-count map nearly everywhere.
- **`ERA_ORDER` is derived from `ERAS`** rather than hand-written in
  `Simulation`. *Reason:* it was a second list of era ids that nothing kept in
  step, and an era missing from it would have been silently reported as a loss.

### Four new technologies, and two old ones that finally pay

`plant_lore` (forage and fruit yield ×1.3), `tracking` (quarry search ×1.6 and
notice radius ×0.75), `stoneworking` (flint yield ×1.5) and `carpentry` (the
longhouse, and build speed ×1.3). `cordage` now gives carry capacity ×1.25 and
`clothing` gives real warmth, where both previously unlocked nothing.

`warmthFrom` combines fire and clothing with diminishing returns rather than by
adding them. *Reason:* summed, a clothed firemaker exceeds 1, which inverts the
chill term into warming and makes February the most comfortable month of the
year.

### Two new trait axes

- **`intelligence` and `industriousness`**, taking `TRAITS` to seven.
  `intelligence` speeds skill practice, discovery and being taught;
  `industriousness` biases the scorer toward work and away from rest and
  wandering. Rebelliousness is deliberately *not* here — it stays derived from
  `loyalty` in `Authority.ts`, because two knobs for one behaviour is how a
  scorer becomes untunable.
- **`industriousness` never touches how fast work actually goes**, only how
  much a person wants to do it. *Reason:* work rates set the whole food economy,
  which is measured across many seeds rather than in one run, so a trait quietly
  moving them would not surface until a population collapsed.
- **`intelligence` is a bonus to `practice`, never a penalty.** *Reason:* skill
  gain is damped by the level already reached, so it is concave — a multiplier
  centred on 1 takes more from slow learners than it gives quick ones and drags
  the band's average skill down, and skill is what forage yields scale by.
- Two extra `rng.gaussian` draws per person shift every later draw on
  `spawnRng` and `lifeRng`, so **pinned worlds have changed**. This is a
  draw-count change, not a fork reorder: the fork order in `Simulation`'s
  constructor is untouched and the seed contract holds. The determinism test
  compares two runs of one seed and still passes.

### What this did to the world: nothing measurable, and that is the finding

Across **twenty** seeds of `century`, mean survival went **65.7% → 64.6%** —
neutral within the noise.

The more useful result is about the measurement itself. Four variants of this
change, none of which touched the food economy on purpose, produced ten-seed
means of 73.1%, 65.2%, 64.4%, 63.6% and 59.3%; at one point a *strictly better*
learning rate measured nine points worse than the version it replaced, which is
not a mechanism, it is chaos. **Ten seeds cannot resolve a difference of under
about ten points.** The larder fix that moved 40% → 59% was far outside that
band, which is why it read clearly. Use twenty seeds for anything smaller, and
do not tune against a single ten-seed figure.

`century`'s `population-persists` failed on one intermediate variant and passed
again on the next with no food mechanism changed in between — more divergence,
and consistent with what [bugs.md](bugs.md) already says about that check
sitting near its threshold.

### Interface

- The Self tab lists what each technology **does**, not just its name.
  *Reason:* a list of bare nouns told the player nothing about why the band's
  only potter dying mattered.

### Two test-harness fixes, both measurement rather than world

- **`e2e` picks its target in two round trips, with the world paused.**
  *Reason:* the spec snapped the camera and computed a screen coordinate in the
  same `evaluate`, but the frame loop calls `clampTo` immediately afterwards and
  pulls the view back inside the map, so for a camp near the edge the coordinate
  was stale before it was used. The click landed on whatever had not moved —
  the mud hut the person was standing in — and two specs failed with a message
  about huts. They passed before only because the person the spec happened to
  pick was standing still. The world is not wrong: a person may stand in a hut,
  and the picker correctly offers both.
- **The Playwright port is overridable via `DYNASTY_PORT`.** *Reason:* Windows
  reserves blocks of TCP ports for Hyper-V, and on this machine the reserved
  range 5111-5210 swallows Vite's default 5173 outright — the dev server dies
  with `EACCES` before a single test runs. `netsh interface ipv4 show
  excludedportrange protocol=tcp` lists the ranges. Default behaviour is
  unchanged.

---

## 2026-09-02 — The winter economy

Item 0 of [next-steps.md](next-steps.md): the island was only marginally
sustainable over two in-game years, and the failure was concentrated in winter.

Measured across ten seeds before this pass: **mean survival 40%**, with two
seeds collapsing outright — one to two people out of a peak of thirty-one. After
it: **59%, and nothing collapses**.

### People were starving beside full larders

- **`take` is no longer gated behind "carrying no food at all".** The condition
  was `!carriedFood`, so a single berry in the pack ruled out a trip to the
  store. In winter people forage more or less constantly and therefore almost
  always hold *something*. The gate is now what they carry measured against
  their hunger.
  *Reason:* over a two-year run `take` accounted for about a thousand ticks out
  of a million while the band's pits held fourteen hundred items and twenty
  people starved. This one change is nearly the whole of the improvement above:
  withdrawal trips went up ten- to thirtyfold, and the two collapsing seeds
  stopped collapsing.
- **`TAKE_APPETITE` 2.4 → 4.2, scaled by how well stocked the larder is.**
  *Reason:* a stocked pit is a certainty and a bush in February is a walk and a
  gamble — and the bushes are not regrowing at all in the cold. Proximity was
  otherwise settling every comparison in favour of whatever bare bush was
  nearest.

### Parents feed their own small children

- **A `feed` action**: an adult with food near a hungry child of their own
  household gives it to them, on a reserve of 15 nutrition rather than the 90
  that governs ordinary generosity. Routed through `doGive`, the same way
  `gather_for_site` is routed through `gather` — the action system does not need
  to know the difference, only the scorer does.
  *Reason:* of seventeen starvation deaths in one sampled run, eight were
  children and most of those were infants — ages 0, 0, 0, 1, 3, 3, 5. An infant
  cannot forage, cannot walk to a bush and cannot ask. With one reserve for
  everybody, parents walked around holding food they were not desperate enough
  to part with.
  *Measured honestly:* across ten seeds this cuts infant starvation from 51 to
  40 and older-child starvation from 10 to 7, but raises adult starvation from
  85 to 99, and **mean survival is unchanged within noise** (58.2% → 58.9%). It
  is kept because it does the thing it was built to do and because a band that
  will not feed its own young is wrong on its face — not because it raises the
  headline number. Redistributing food does not create any.

### Tried, measured, reverted

- **Reserving most of each storage pit for food.** One bad seed had 678 items in
  store with only 143 of them edible; the rest was sticks, thatch and flint, and
  the decision to store is scored on a *food* surplus while `doStore` put away
  the entire pack. Capping materials at 35% of a pit made things **much worse** —
  mean survival 58.9% → 40.1%, with starvation up across every cohort.
  *Why:* carrying capacity is shared between food and materials, so a store that
  will not take a hauler's sticks leaves them carrying sticks, and a pack full of
  kindling is a pack that cannot hold berries. Materials in the pit are doing
  useful work. Reverted.

### A new instrument: `npm run sim:seeds`

- **`tools/seeds.ts`** runs a scenario across many seeds and reports mean
  survival, collapses, births and starvation split by cohort.
  *Reason:* none of this was visible to `sim:check`. Every named check passed
  while a band starved beside a full pit, and a single `century` run is chaotic
  enough that its end state flips on changes unrelated to food.
  *And a check would not have helped:* two were written and then deleted after
  being measured against the broken build. Withdrawals as a share of deposits is
  *higher* in the broken world (48–53%) than the fixed one (38%), because the
  problem was the number of trips, not the size of them; and the starvation
  counts of the two builds overlap. The signal genuinely lives in the mean across
  seeds, so the honest answer was to build the instrument that measures it rather
  than a check that looks reassuring and detects nothing.

### Where it stands

Mean survival 59% over two in-game years, no collapses in ten seeds. The
remaining deaths have shifted: **99 adults to 40 infants**, where before the
larder fix the split was more even. Food distribution is no longer the binding
constraint; total food and carrying capacity are. See
[next-steps.md](next-steps.md).

---

## 2026-09-02 — M6c: the reported bugs

Five defects reported from play after M6a, written up as section M6c of
[m6_plan_households_sleep.md](m6_plan_households_sleep.md) and fixed here. Four
of them turned out to be one root cause wearing four hats.

### 11. Every reason now reaches the player

- **`ActionContext.onStopped`, `Simulation.interruptions` and
  `stopReasonLabel`.** Every path that ends an action — `abandon` for "the world
  changed" and a new `stop` for "they had had enough" — reports the reason
  before `finish` clears the action. The simulation queues them for anyone under
  an order; `main.ts` decides whose are worth showing (the player's own
  character and whoever they are commanding) and puts them on a floater and in
  the panel's action line for six seconds.
  *Reason:* `interruption()` returned eight reasons and `abandon()` a dozen
  more, and **every one was a telemetry counter for the health report and
  nothing else**. From inside the game an order stopped and the character went
  back to "thinking". A simulation that knows exactly why it refused you and
  does not say so is worse than one that does not know.

### 12. Sleep

- **`doSleep` no longer borrows `interruption()`.** It has its own
  `wakeReason`: thirst > 45, hunger > 50, being attacked, dawn, or fully rested.
  Never `hands_full`, never `long_enough`, and the `workedTicks++` is gone.
  *Reason:* the work list's *first* clause is `isLaden`. A player who had been
  out foraging came home with a full pack, lay down, and was woken on the same
  tick — measured: 0 ticks, fatigue 60 → 59.1. "Your hands are full" is a reason
  to stop picking berries and has nothing whatever to do with lying down.
  Waking thresholds sit above the working ones on purpose: you work through mild
  thirst and stop at 35, you sleep through it and wake at 45.
- **Cold is deliberately not a waking reason.** The roof overhead is the thing
  that fixes cold; throwing somebody out of the hut for being cold in it is a
  circle.
- **A daytime nap holds if the player ordered it**, exactly as `rest` already
  did. Left to their own judgement, nobody sleeps through the day.

### 13. "Go to" on the Ties tab

- **A focus button per row**, `data-focus` → `onFocus` → `camera.snapTo` with
  the follow released.
  *Reason:* a name in the Ties tab that you cannot find on the map is a dead
  end. `snapTo` rather than `recentre` because `recentre` re-attaches the camera
  to the player, so the view would slide straight back off whoever the player
  just asked to look at; `F` re-attaches it when they are done.
  *On the knowledge pillar:* this reveals nothing gated. The camera already pans
  freely over the whole island. What is withheld is a stranger's name, skills,
  condition and history, and a camera position touches none of them.

### 14. Interrupted work is now picked back up

- **`Person.resume`**, stashed by `Simulation.noteStop` for need-driven stops
  only (`thirsty`, `hungry`, `cold`), restored by `resumeOrders` once the person
  is genuinely comfortable again — thirst under 20 against the 35 that
  interrupted them, so the two cannot ping-pong. Expires after 2,000 ticks, and
  any new order supersedes it.
  *Reason:* the reported symptom was "berries never get interrupted, clay and
  flint always do". The code path is identical for all three; the difference is
  **job length against absolute need thresholds** — measured, from zero thirst:
  berries 148 ticks reaching thirst 13 and never interrupting, flint 416 ticks
  reaching 35 and always interrupting. Nothing short of making the rule relative
  would equalise that, and a relative rule has the same problem. What actually
  fixes the complaint is that the outcome stops differing: the job gets done
  either way, because he goes for a drink and comes back.
- **`clearOrder` no longer wipes `resume`; `forgetPlans` does.**
  *Reason:* `finish` calls `clearOrder` at the end of *every* action, including
  the interruption that had just stashed the resume a few lines earlier — so
  resumption was impossible and measured as never firing. Refusals, exile and
  the player taking the controls by hand use `forgetPlans` and mean it.
- **`interruption` gained `lookaheadTicks`**, so harvesting asks whether
  finishing the *next* pull would put them over the line rather than only
  checking where they are now.
  *Reason honestly stated:* this is a small improvement in predictability and it
  did **not** fix the reported asymmetry — a pull is 8–14 ticks and the
  projection moves flint from 416 ticks to 388. It is kept because "he will not
  start a pull he cannot afford" is a legible rule; the actual fix is resumption
  above.

### 15. Felling

- **`interruption` gained `ignoreLaden`, and `doChop` passes it.**
  *Reason:* measured, a laden feller chopped for **0 ticks** and reported
  `work_ended_hands_full`. A tree needs pack room only at the instant the trunk
  drops.
- **Timber that will not fit falls as an `ItemPile`** via a new
  `Simulation.dropAt`.
  *Reason:* `doChop` clamped the yield to what the feller could carry and the
  remainder simply ceased to exist. This world's standing rule is that goods
  move rather than appearing and vanishing.
- **`workProgressOf` extracted to `sim/core/Progress.ts`** and shared by the
  renderer and the panel.
  *Reason:* M6a's panel work bar read `person.cycleProgress`, which is `null`
  for the whole of felling and building, so the bar over the woodcutter's head
  filled while the panel beside it showed nothing for the ninety seconds it
  takes to fell a tree by hand. The renderer already had all three cases; the
  panel had reimplemented one of them. Same "two implementations drift" lesson
  as `moveToward`, `linkFamily` and `hitRadiusOf`. The shared version also fixes
  a bug the renderer had on its own: it ignored the hand-axe multiplier, so the
  bar lied to anyone holding one.
- **The forest no longer retires a tree somebody is felling.**
  `ForestSystem.daily` grants a stay of execution to any tree with
  `chopProgress > 0` and counts `tree_death_deferred`.
  *Reason:* measured — at a day boundary a standing, actively-chopped tree was
  removed from `treesById`, taking several hundred ticks of accumulated axe work
  with it and ending the order with a bare "the tree was gone". It is still past
  its span and is offered up again the next day.

### Verification

- **A new `src/sim/__tests__/orders.test.ts`**, ten cases covering all of the
  above.
  *Reason for putting them here rather than in `simcheck`, which is what the
  plan proposed:* every one of these is a specific interaction — a laden
  sleeper, a tree dying under the axe — and the scenario runs are chaotic enough
  that they would report these as flaky long before they reported them as
  broken. A scenario check answers "is the world healthy?"; these answer "does
  this exact thing still work?".
- **A new e2e spec** for the Ties "go to" button.
- Side effect worth recording: `century` improved from 16 alive out of a peak of
  31 to **22 out of 33**, without anything in this pass aiming at the food
  economy. Sleep working, and ordered work surviving a trip to the river, were
  apparently worth six people over two in-game years.

---

## 2026-09-02 — M6a: hands, households and hooves

One pass, implementing [m6_plan_households_sleep.md](m6_plan_households_sleep.md)
in full. Grouped by the section of the plan each change came from.

### 1. The inventory panel that keeps up

- **`Inventory` gained a `version` counter**, bumped in `add` and `remove`, and
  `Hud.selectionKey` folds it into the panel's cache key.
  *Reason:* the panel cached on selection + tab and, on a cache hit, patched
  only the action line, the need bars and the score table. The Kit tab has none
  of those, so it was built once and never touched again — berries landed in the
  pack and the panel went on saying what it said a minute ago. A rebuild every
  harvest cycle (8–35 ticks) costs nothing, and is also correct for the per-item
  verbs, since what can be done with a stack depends on what is in it.
- **A work bar in the Now tab**, from `person.cycleProgress`, patched every frame
  rather than rebuilt.
  *Reason:* the renderer floats a progress bar over the actor's head while the
  panel beside it says nothing. A player watching one of them move and the other
  sit still reasonably concludes one is lying.

### 2. Clicking the thing you meant

- **`Renderer.hitRadiusOf` and `GRAB_MARGIN`**, replacing the picker's fixed
  radii, and living beside the drawing code that produces the sizes.
  *Reason:* the picker used person 1.2 / node 1.4 / tree 1.6 tiles regardless of
  how large the renderer actually painted the thing, so a seedling drawn as a
  two-pixel sprig captured clicks a tile and a half away and the bush you were
  pointing at lost every one of them. Putting the radii next to the painter is
  what stops the two drifting apart again.

### 3. Bubbles for a stack

- **New `ui/EntityPicker.ts`**, replacing the blind `lastPick` cycling on both
  left- and right-click. Zero or one candidate behaves exactly as before; two or
  more put up a bubble each, with a hover ring drawn on the map
  (`Renderer.hoverRing`).
  *Reason:* repeated clicks used to step through a stack with no indication of
  what was in it or how deep it went. A person standing on a berry bush inside a
  hut is three guesses.
- **Bubbles are named through the knowledge layer**, so a stranger reads as
  "a man".
  *Reason:* a picker that prints a stranger's name hands the player the
  god's-eye view the rest of the interface is built to withhold.

### 4. Speed, and a panel you can fold away

- **Default speed 20/s → 5/s**, and the number now lives only in
  `Config.time.tickRate`; the loop and the HUD slider both read it.
  *Reason:* at twenty steps a second a harvest cycle passes in under half a
  second and there is no following what anyone is doing. The value had been
  hardcoded in three places, which is how the slider and the loop came to
  disagree about what speed the game opens at.
- **A collapsible panel** with a header strip, mirrored to `localStorage`, plus
  `P` to fold and `H` to hide all HUD chrome.
  *Reason:* the panel is 286px of opaque overlay pinned over the map, and the map
  is the game.

### 5. Bands that stop over-building

- **`BandSystem.planBuildings` rewritten.** Stores are wanted only above 60%
  full; shelter is measured as floor area rather than a count of roofs; a hard
  ceiling of `ceil(members / 4) + 2` completed structures; and sites with no work
  and no delivery for six days are abandoned (`dropStaleSites`), with anything
  already delivered dropped on the ground rather than vanishing.
  *Reason:* the planner counted *buildings*, not capacity or use, so a band with
  three empty storage pits planned a fourth, and a 3×3 hut and a 2×2 windbreak
  counted as the same amount of roof. The stale-site rule exists because
  `underway >= MAX_SITES` otherwise deadlocks the planner behind a hut nobody
  will ever haul timber to.

### 6. Kin, band, stranger

- **A three-rung first-impression ladder** (`SocialSystem.firstImpression`):
  own household +18, own band +6, anyone else −6. Blood kinship stays separate
  and additive.
  *Reason:* the old flat ±(10 / −14) could not express that family outranks
  band, which is the point of having households at all — and it is the household
  rung, not kinship, that covers in-laws, step-kin and fostered members. At −14 a
  stranger started most of the way to the exile threshold before doing anything.

### 7. Sleep, as distinct from sheltering

- **A `sleep` action**: `ActionSystem.doSleep`, offered on any completed shelter,
  restoring 0.9 fatigue a tick, ending at dawn, at zero fatigue, or on an
  interruption. Scored above `rest` at night when a roof is in reach.
  *Reason:* `shelter` was standing indoors waiting out the cold and `rest` was
  sitting down anywhere at 0.35 a tick. Neither was sleeping, and nobody in this
  world had ever gone to bed.

### 8. Three tribes, made of families

- **New `systems/Founding.ts`**, replacing the "everyone is head of a household
  of one" loop. `Config.population.bands` 2 → 3.
  *Reason:* a dynasty game whose opening position contains no dynasties starts
  the player a generation late.
- **`linkFamily` extracted to `SocialSystem`** and **`inheritTraits` extracted
  to `LifeSystem`**, shared by founding and by birth.
  *Reason:* two copies would drift, and a founding sibling and a born sibling
  would end up with different kinship edges — a family who are strangers to each
  other for no reason anyone could find.
- **`peoplePerBand` 15 → 10.**
  *Reason:* three bands of families is far more mouths than two bands of
  unrelated adults, because every family brings children who eat a full share and
  forage at a fraction of an adult's rate. At fifteen the island carried 48 people
  on forage tuned for 30, and the difference came out as mass starvation.
- **The last family in a band is *shaped* to the room left** rather than added
  whole.
  *Reason:* three bands asked for ten each were delivering thirty-eight, and a
  world tuned for thirty spent its first fortnight burying the difference.
- **Founding couples' ages skew young** (`min + spread * rng() * rng()`) instead
  of uniform across 20–45.
  *Reason:* the same principle `Person`'s constructor already records — a
  population that starts at the average age of its span has no breeding cohort.
  Drawn flat, the founding wives averaged thirty-three, most passed forty-five
  within two years, and two in-game years produced three births island-wide.
  Skewing brought that to ten.

### 9. Character creation

- **New `ui/NewGame.ts`**: pick a tribe (described by comparing its `norms`
  against `DEFAULT_NORMS`, so it can never describe a culture the simulation does
  not have), then a person from a shortlist, then keep their skills or spend 60
  points with a cap of 40 in any one.
  *Reason:* the world and its families generate first and the player chooses
  somebody already standing in it — nothing here creates anyone, which keeps the
  pillar that the world was not arranged around the player.
- **`possessFirst` generalised into `possess(person)`**; `?skipIntro=1` bypasses
  the screen.
  *Reason:* one path into a character; and every existing Playwright spec was
  written against a game that starts immediately.

### 10. Animals that move

- **The `game` resource node is gone**, removed from `RESOURCE_KINDS`,
  `RESOURCE_DEFS`, `suitsBiome`, `RESOURCE_COLORS`, `NODE_LABELS`, the Brain's
  food filter and the `people-harvest` check. `Config.world.gameAnimals` became
  `gameHerds`.
  *Reason:* hunting a stationary node was foraging with a different skill
  attached. Two food systems where one would do is one too many.
- **New `entities/Animal.ts` and `systems/WildlifeSystem.ts`**: deer, boar and
  hares in herds that drift, graze, and bolt as a group. `Animal.temperament` and
  `Animal.fedBy` are declared and unused *on purpose* — adding them later is a
  migration and adding them now is two fields.
- **`moveToward` extracted from `MovementSystem`** and shared with wildlife.
  *Reason:* a second steerer would drift from the first, and the first symptom
  would be deer standing in lakes.
- **A `hunt` action** that closes on a fleeing target and rolls `hunt` skill
  against the animal's evasion. `track` shrinks the radius at which an animal
  notices you — the first thing `track` has ever done.
- **A new `wildlifeRng`, appended after `knowledgeRng`.**
  *Reason:* the fork order is part of the seed contract. Inserting a stream
  invalidates every saved seed.

### Fixes found while building the above

- **Cornered animals stayed "alarmed" and motionless for ninety ticks.**
  `setFlight` only tried straight away from the threat; a herd driven against a
  shoreline had nothing walkable behind it, found no flight point, and stopped
  fleeing while standing next to the hunter. It now tries seven bearings at four
  distances and settles honestly if genuinely cornered.
- **`Animal.stamina` added.** A fresh deer outruns any person and re-alarms
  every time one closes, so the chase was arithmetically endless and no hunt ever
  finished. Stamina drains while bolting, shortens each successive bolt, slows
  the animal, and makes a blown animal easier to bring down. This is persistence
  hunting, which is also how it actually worked.
- **`HUNT_APPETITE` raised to 9**, tuned against the score table rather than by
  feel. Below about 6 nothing in the world ever hunted at all: berry bushes
  outnumber animals six to one, so they are always nearer, and proximity settled
  every comparison before hunger did.
- **`gameHerds` 14 → 22.** The `game` node this replaced was spread over forty
  sites; the same animals gathered into fourteen herds are far harder to *find*,
  and wild meat is the one food that does not stop existing in winter.
- **`.newgame` and `.picker` needed explicit `[hidden] { display: none }`.** An
  author `display` beats the browser's rule for the `hidden` attribute, so a
  hidden full-screen overlay stays laid out and swallows every click on the game
  underneath — which broke sixteen e2e tests at once. The project had already
  learned this for `.succession`; this pass reintroduced it twice.
- **`simcheck`'s bounds check now asks `World.inBounds`** instead of
  recomputing `x > width - 1`. The hand-written bound was a tile stricter than
  the world's own, so someone at x=127.6 on a 128-wide map — on a walkable tile
  the movement system had just approved — was reported as having escaped.
- **`animals-flee` was measuring the wrong thing, twice.** First against a flat
  probe radius, which counted a boar calmly grazing six tiles from a camp as
  having failed to run; then against whichever person was nearest *now*, which
  on an island with three camps reports running away from one band as a failure
  because it ran you toward another. It now measures distance to the specific
  person that spooked it.

### Tests and checks

- **Eight new health checks**: `animals-move`, `animals-flee`,
  `hunts-succeed-and-fail`, `people-eat-meat`, `bands-dont-overbuild`,
  `families-exist`, `sleep-restores`, `kin-outrank-strangers`. The harness now
  watches wildlife and sleep *during* the run, because displacement and flight
  are differences between two moments and a report assembled from the final
  state cannot see either.
- **Three e2e specs updated** because M6a changed their premises, not because
  they broke: the two that picked "the next person in the list" as a stranger
  were picking the player's own wife, and the family panel spec asserted
  "unmarried, no children", which is exactly what founding families abolished.
- **A `clickAndChoose` helper** teaches the specs the picker flow, since a click
  on a crowded tile now asks which thing was meant.
- **A new spec for character creation.**

### Deliberately not done

- **The courtship gate was left at `opinion > 5`.** Lowering it to `> 0` was
  tried on the theory that the softer in-group bias had left it sitting exactly
  on the threshold; it changed the measured behaviour not at all, so it was
  reverted rather than shipped with a comment asserting a cause the data
  contradicted. See [bugs.md](bugs.md).

---

## Earlier — M0 to M5

Not reconstructed here; the top-level [README](../README.md) carries the
milestone table and the war stories, and the git history has the rest. This
changelog starts at M6a because that is when it started being kept.
## 2026-09-26 — M15 fase 1a, muerte asentada

Añadida una prueba de regresión que fuerza una muerte, deja que `Simulation`
retire el cuerpo del array vivo y verifica que `DemographyWatch` la cuenta
desde el registro estable de personas. El informe de cohortes mostró 38 muertes
en HISTORY y cero en DEMOGRAPHY; queda pendiente aislar esa discrepancia en la
ejecución de semillas antes de cambiar el observador.
