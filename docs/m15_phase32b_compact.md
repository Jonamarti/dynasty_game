# M15 32b — Registros y compacto local (nivel 1), mecanismo a mecanismo

2026-10-06. Punto 2 de §7 de [m15_simulation_lod.md](m15_simulation_lod.md).
Todo vive en `src/sim/compact/`, sin renderer ni DOM, **inerte**: ningún sistema
del juego lo llama, `Simulation.step()` sigue ejecutando a todos en detalle y el
juego normal es bit-idéntico (ver «Verificación»). No se filtra el loop detallado.

Orden elegido (distinto del sugerido): scheduler primero, porque es puro, no
depende de `Person` y lo necesitan las otras tres piezas (fechas de eventos,
ledger de transacciones); después agenda y conversión; avance al final, porque
es lo único que exige calibrar.

## 1. `CompactScheduler` (commit «scheduler»)

`compact/CompactScheduler.ts`. Eventos `{id, tick, phase, subjectId, kind, data}`
ordenados por **tick, fase, sujeto, id**; el orden de inserción no cuenta (test:
adelante y atrás drenan igual). Fases: urgente, llegada, trabajo, demografía —
en un mismo tick las llegadas y urgencias se resuelven antes que el trabajo
ordinario (§2: nadie aparece de golpe junto al jugador). `drain(tick)` entrega lo
vencido y fija el horizonte: programar detrás de él o drenar hacia atrás falla,
porque una transición no puede leer un registro atrasado.

Además lleva el **ledger de transacciones**: `commit(id)` devuelve `false` en la
segunda aplicación de un mismo id (la defensa contra «duplicar una transferencia»,
§3/§4). Snapshot JSON de pendientes y transacciones, con restauración.
Sin RNG, sin FPS, sin reloj de pared.

Controles negativos en `compact-scheduler.test.ts`: id de evento duplicado,
transacción repetida, snapshot que pierde eventos (distinto del original),
transacciones duplicadas en el snapshot, tick negativo, programar en el pasado.

## 2. `CompactPerson`, `CompactAuthority` y la conversión (commit «persona compacta»)

`compact/CompactPerson.ts`. Una persona compacta **es la misma persona**: posee la
instancia única de `Person` (identidad, parentesco, hogar, inventario, equipo,
heridas, recuerdos, órdenes y trabajo ya contabilizado) y añade solo lo que el
scheduler necesita: `lastAdvancedTick`, un **stream propio derivado**
(`deriveCompactStream(semilla, personId)`, hash de `compact|semilla|id`, fuera del
contrato de forks de `Simulation`), una etiqueta de agenda (`obtain_food`,
`build`, `care`, `travel`, `idle`, con `target` tipo `building:12`) y un `epoch`.
La etiqueta se **lee** de la acción/orden actual; el progreso real sigue en la
persona (`workedTicks`, `workBank*`, `resume`) y en la cosa trabajada, de modo
que no hay un segundo contador que pueda divergir. `toCompactRecord` /
`fromCompactRecord` serializan a JSON usando el `PersonRecord` completo de fase 28
(mismo sello de tick; el decodificador rechaza versión, tick, id y agenda
inválidos).

`compact/CompactAuthority.ts` es el registro de dueño único: `demote` (detallado →
compacto, misma instancia, nada se clona), `promote` (exige que el registro esté
avanzado hasta el tick de la transición), `adopt` (rehidratar desde JSON tras una
recarga). Rechaza, con motivo nombrado: ya compacto, ya detallado, registro viejo
(`epoch` distinto), copia decodificada que no es el dueño vivo, atrasado respecto
al tick, y las personas que el nivel compacto aún no sabe resolver — jugador,
muerto, llevado en brazos, retenido/atado/cautivo, que lleva un bebé, o en medio
de una interacción con otra entidad (`interacting`: objetivo/perseguido/huyendo).
Esos rechazos son conservadores: el puente de interacciones de §4 (punto 3 de §7)
los levantará. El stream de una persona se conserva al promover y se retoma al
volver a degradar (no se vuelve a derivar: «materializar no repite tiradas»).

**Alcance.** Todavía no saca a nadie de `Simulation.people` ni de los hashes: el
registro es la autoridad de nivel y el guardia que `Simulation` llamará al
integrarse (punto 3). Sin esa integración no hay «dos dueños» posibles porque nadie
llama a `demote` en el juego. No hay camino de UI para estos rechazos porque aún no
existe ninguna orden del jugador que los dispare; cuando exista, cada motivo
tendrá que pasar por `lastRefusal` y `t()` (anotado en `bugs.md`).

Tests (`compact-person.test.ts`): ida y vuelta repetida cuatro veces por JSON a una
autoridad nueva con un mundo evolucionado 700 pasos (registro de `Person` idéntico,
mismo id y hogar, inventario, trabajo bancado, el stream continúa la misma
secuencia que un control); negativos: demote duplicado, promote doble, adopt de un
segundo vivo y de un registro viejo, copia decodificada, tick atrasado, cada
motivo de rechazo, un registro que pierde inventario (distinto del original) y
registros dañados.

## 3. `CompactBody.advance`, el cuerpo cerrado (commit «avance del cuerpo»)

`compact/CompactAdvance.ts`. Lleva a una persona compacta hasta una fecha ejecutando
**el mismo `NeedsSystem.update`** del nivel detallado, tick a tick, sobre una sola
persona y un reloj privado (`TimeManager` propio, que no toca el del mundo). Es
deliberadamente no una segunda implementación de las tasas: comparte el código y
no puede divergir. Cubre necesidades, exposición, hemorragia, fiebre, veneno y la
muerte que causan; devuelve eventos fechados (`death` en el tick exacto, fase
demografía, id del llamante). El avance solo va hacia delante (rebobinar lanza), el
muerto no se avanza ni resucita, y partir el intervalo (0→300 frente a 0→100→JSON→300) no
cambia el registro completo: cambiar de selección no puede renovar reservas ni
esquivar una muerte.

**Qué NO hace, y por eso no está enchufado a `Simulation`:**

- **Sin ingesta.** Nadie come, bebe, se calienta ni duerme mientras es compacto:
  hambre y sed solo suben. Medido con 10 personas a hambre 0 y sed 0: mueren entre
  los ticks 1.961 y 2.127 (~8 días), todas «starvation». Eso es lo que el modelo
  detallado haría sin comida ni agua, no lo que una banda con intendencia hace.
- **Sin producción ni progreso de órdenes.** La acción y su trabajo bancado quedan
  retenidos, no avanzan (congelarlos fuera de vista es justo lo que §4 prohíbe, por
  eso este mecanismo es insuficiente para activar el LOD).
- **Sin demografía** (hasta el §6: con `env.life` envejece, concibe, pare y muere de viejo por
  `LifeSystem.daily`, que necesita `LifeContext` completo: padre, stream, `onBirth`).

La ingesta, la producción y la demografía necesitan tasas **medidas** contra el
modelo detallado (qué rendimiento de comida por persona-día en cada estación y
terreno, qué fracción del día se bebe, tasa de concepción real con su condición),
y esa medición es de varios escenarios y semillas; no se ha hecho en esta pasada ni
se han inventado coeficientes: darles un valor sin medirlo regala o quita
supervivencia, que es lo que el diseño prohíbe. Queda pendiente (ver `bugs.md`).

Coste (una sola corrida, 10 personas × 2.400 ticks, V8 caliente, sin repetir):
≈1,4 µs por persona-tick, frente a los ≈100 µs por persona-paso del paso completo
(1,09 ms/paso con 10 humanos, `m15_profile_systems.md`). Es un orden de magnitud, no
un benchmark: no incluye la ingesta ni la producción que faltan.

Tests (`compact-advance.test.ts`): igualdad de registro completo con el reloj
detallado manejado tick a tick; invariancia a cortes y a ida y vuelta JSON; fecha
de muerte y no resurrección; negativos (tasa de hambre distinta, un trozo de
tiempo saltado, fecha rebobinada).

## 4. Medir antes de modelar: `RateWatch` y `tools/compact-rates.ts` (commit «tasas medidas»)

2026-10-06. Instrumento determinista y de solo lectura (`compact/CompactCalibration.ts`,
CLI `npx vite-node tools/compact-rates.ts -- <escenario> <semillas> [pasos] [out.json]`).
Lee el estado tras cada `sim.step()`; no engancha nada del juego ni saca números de
ningún stream (un mundo observado y otro sin observar quedan idénticos, test).

**Qué mide.** Para cada persona-día completo: (a) el *alivio* efectivo de hambre y sed
dividido por la deriva del día (`alivio = necesidad_antes + deriva − necesidad_después`
por tick; deriva = `hungerRate` × factor de lactancia/lactante, y `thirstRate` ×
esfuerzo × calor); 1 es «se sostiene», 0 «no obtuvo nada». Se condiciona a la necesidad
al empezar el día (4 intervalos de 25), porque quien tiene hambre come más y una media
incondicional alimentaría a un hambriento compacto como a uno saciado. (b) los ticks por
agenda (`goalOf`) y los de `drink`. (c) personas-año y muertes por edad y causa. (d)
nacimientos por mujer fértil-año (16-45) y por estación. Se publica la distribución
(cuantiles 0..100 % en pasos de 5), no solo la media: la cola mala (días sin comer,
que producen el 65 % de las muertes de la línea de 32a) es justo lo que no se puede
promediar.

**Datos.** `lean` (24.000 pasos = 100 días ≈ 2,5 años de 40 días) y `craft` (16.000
pasos), semillas `alpha,beta,gamma` de cada uno: 4.088 y 6.042 personas-día. Salidas
completas en `artifacts/verification/m15-phase32b-rates-2026-10-06/` (local, ignorado
por Git; lo que sigue es el registro versionado).

| adultos, por estación | `lean` alivio/deriva (n) | `lean` comido nominal/deriva | `craft` comido nominal/deriva |
|---|---:|---:|---:|
| primavera | 0,14-0,83 (558) | 0,56 | 1,14 |
| verano | 0,59-1,40 (800) | 0,97 | 1,32 |
| otoño | 0,72-1,84 (674) | 1,21 | 1,33 |
| invierno | 0,12-0,63 (592) | 0,48 | 1,26 |

(el rango del alivio es el de los cuatro intervalos de hambre al empezar el día; la
tabla completa con cuantiles está en el artefacto y en `MeasuredRates.ts` cuando se
emite.) Lo que dice, sin adornar:

- **No existe «la tasa»**. `lean` y `craft` difieren en el balance comida/deriva por un
  factor de 2-3 en invierno y primavera, y en la mortalidad por un factor de ~50
  (`lean`: 1,0-1,4 muertes por persona-año en casi todas las edades, 127 muertes en
  ~104 personas-año, 86 por inanición; `craft`: 0,000-0,095, 4 muertes en ~152 personas-
  año). Una tabla de intake única regalaría supervivencia a `lean` o se la quitaría a
  `craft`: el compacto tiene que recibir, además de la tabla, una **medida agregada de lo
  que la banda consigue** (`bandScale`, mecanismo 2).
- La ingesta es **a golpes**: la distribución del alivio diario es bimodal (p5 y p50 en
  0 en casi todos los intervalos de adultos y p95 en 2-4): un día sin comer y otro con
  dos raciones. Con hambre alta (≥75) el alivio medio de `lean` es 0,12-0,59 (en invierno
  y primavera, 80-90 % de esos días no traen nada: una banda que se muere no alimenta ni a
  los más hambrientos) y el de `craft` 1,2-2,1 (n = 6-23, fino): lo que distingue a una banda
  de otra es la probabilidad de un día vacío para el hambriento, no el tamaño de la ración.
  (Corrección del 2026-10-06: la primera medida clavaba esas filas en ~1,0 porque contaba a
  una persona pegada a 100 como aliviada; ver §5.)
- Lactantes: alivio ≈ 0,9-1,1 en todas partes (las tomas mantienen la deriva); no son
  la fuente de la mortalidad infantil por esta vía, que empieza cuando la madre no come.
- Agenda de adultos (`lean`/`craft`, verano): comida 0,31/0,29, construir 0,03/0,05,
  cuidar 0,005/0,02, viajar 0,10/0,05, ocioso 0,55/0,59; beber (dentro de «ocioso» o
  «viajar» según la acción) 0,046/0,059 del tiempo. Invierno: comida 0,125/0,20.
  Niños: comida 0,04-0,24, viajar 0,18-0,27.
- Natalidad: `lean` 0,763 nacimientos por mujer fértil-año (20 / 26,2); `craft` 0,954
  (38 / 39,8). La línea congelada de 32a (`century`) daba 0,898 (574 mujer-años) y
  `generations` 0,841: del mismo orden. Con 3 semillas y 26-40 mujer-años el intervalo
  de cada una es de ±0,2, así que **no se distingue** de la línea 32a ni se afina más.
- Mortalidad por edad: la de `craft` (sano) y la de `lean` (en colapso) no se parecen a la
  línea 32a (`century`: <1 año 0,188 por cohorte, edad media al morir 14,9) porque cada
  escenario es otro régimen; por eso la mortalidad no se calibra desde una tabla sino que
  surge de las necesidades (mecanismos 2 y 3) y se **compara**.

Límites declarados: tres semillas por escenario y dos escenarios baratos; el alivio
usa la acción vista al final del paso anterior para el esfuerzo de la sed y la
temperatura del tick actual; no modela el frío, el veneno ni otros ganchos de hambre
más allá de lactancia y lactante (mueven el denominador unos pocos por ciento); el alivio
que el suelo de cero tira no se cuenta (es lo correcto: el cuerpo no lo absorbió).
Los intervalos de 8 estaciones × 3 grupos × 4 bins con pocas decenas de muestras se
marcan `*` y el modelo compacto no los usa solos (mecanismo 2). **Producción** (cuántos
frutos/presas por tick de trabajo en cada terreno) NO se midió: el alivio ya es lo
que cada persona logró, repartido por la banda; separar «producción» de «reparto» exige
un ledger de despensas que el detallado no publica. Se documenta como límite en lugar de
inventar un rendimiento.

## 5. Ingesta compacta con tasas medidas (commits «ingesta» y «ingesta v2»)

`compact/CompactIntake.ts` + `CompactAdvance.ts` (`env.intake`) + tabla generada
`compact/MeasuredRates.ts` (`tools/compact-rates.ts`, `lean,craft`, semillas
`alpha,beta,gamma`, 10.130 personas-día).

**Historia, porque el primer diseño estaba mal y el instrumento también.** La primera versión
(commit «ingesta», 10 días) escalaba toda la distribución del alivio por un solo número de la
banda y aprobó los casos de otoño; al alargar a 40 días en `craft` dejó morir de hambre a 30 de
91 personas frente a 1 en el detallado. Dos causas, ambas medidas: (1) un multiplicador mueve la
media, no la probabilidad de un día sin comer, y la inanición es una racha de días vacíos; y (2)
`RateWatch` contaba como «aliviada del todo» a una persona clavada en 100 de hambre (el reloj
recorta en 100, así que `antes + deriva − después` daba la deriva entera): las filas de hambre
≥75 de la tabla v1 eran falsas (mediana 1,0 en cada estación) y habían inflado la ingesta de los
hambrientos. El instrumento ahora usa `min(100, antes + deriva) − después` (test con negativo:
una banda mantenida viva a 100 lee alivio < 0,05; la fórmula vieja leía 1). Las cifras de esta
sección y de §4 son las posteriores a la corrección; las de la v1 se conservan en
`artifacts/verification/…/v1-before-clamp-fix/` (local).

**Mecanismo (v2).** Una vez por día de calendario y por necesidad se sortean **cuatro** números
del stream propio de la persona (¿día vacío? y ración de hambre; ¿día vacío? y ración de sed,
siempre los cuatro y en ese orden). El día es *vacío* con la probabilidad medida para
(estación, etapa, necesidad al empezar el día) y, si no, trae una ración tomada de la
distribución medida de los días con relief (`qf`, cuantiles de los días no vacíos). Lo que una
banda puede hacer por quien lo necesita es la probabilidad de día vacío: para los que empiezan
hambrientos (bin ≥ 1) esa probabilidad **la pone la banda** (`BandCapacity.hungryZero`, leída por
`IntakeModel.capacityFrom` de los días propios de la banda que empezaron hambrientos; `thirstyZero`
igual para la sed si hay ≥ 30 días sedientos). El día vacío de un saciado (no come porque no
quiere) sigue siendo de la tabla: es apetito, no capacidad. El tamaño de la ración es el mismo
en todas partes. Se aplica tick a tick en proporción a la deriva nominal (no al cambio
observado: una necesidad clavada en 100 no sube y aun así debe poder bajar), tras el
`NeedsSystem` compartido. El sorteo vive en la persona (`CompactPerson.intake`, serializado,
versión del registro sin cambio: ausente = null), de modo que cortar a mitad de día o guardar no
lo redibuja (test: 0→5 días igual a 0→777 ticks→JSON→5 días; un control que olvida el plan
difiere). Sin modelo de ingesta el stream no se toca. Rechaza en lugar de inventar: una celda con
menos de 30 muestras cede a la más cercana poblada, una sin ≥ 10 días con relief presta la ración
de la más cercana que sí los tiene, y si no hay ninguna lanza `IntakeUnmeasured`; una ventana
de banda con menos de 30 días hambrientos no se lee.

Cambio compartido: `thirstDriftPerTick` sale de `NeedsSystem.update` (misma aritmética) para que
el reloj de necesidades, `RateWatch` y la ingesta compacta no tengan tres copias.

**Correspondencia (tolerancias declaradas antes de la primera medida y no movidas):** diferencia
de supervivencia ≤ 0,10; hambre y sed medias de los supervivientes a ≤ 15 puntos; y el cuerpo
cerrado debe quedar ≥ 0,30 por debajo del detallado. Cohorte equivalente = todos los vivos en T
copiados por JSON del `PersonRecord`; el detallado sigue N días y las copias se avanzan con
`CompactBody`. Una muerte violenta en el detallado cuenta como superviviente (censura). Semillas
`delta,eps(,zeta)`, que no entraron en la tabla. «Previa» = capacidad leída de los 10 días
anteriores a T; «oráculo» = capacidad de los mismos días que se comparan.

| caso (n) | brazo | supervivencia | hambre media | sed media |
|---|---|---:|---:|---:|
| `lean`, otoño d20-30 (80) | detallado | 95,0 % | 47,2 | 15,3 |
| | compacto previa / oráculo | 95,0 % / 92,5 % | 30,5 / 42,0 | 14,4 / 14,3 |
| | cerrado | 21,3 % | 100 | 91,9 |
| `craft`, otoño d20-30 (63) | detallado | 100 % | 22,7 | 15,7 |
| | previa / oráculo | 100 % / 100 % | 18,5 / 22,9 | 15,4 / 15,6 |
| | cerrado | 17,5 % | 100 | 88,5 |
| `lean`, invierno d30-40 (80) | detallado | 41,3 % (33 inanición, 14 exposición) | 87,6 | 32,9 |
| | previa | **76,3 %** | 46,3 | 15,4 |
| | oráculo | 43,8 % (29 inanición, 16 exposición) | 79,3 | 18,3 |
| | cerrado | 3,8 % | 100 | 85,6 |
| `lean`, 40 días d20-60 (80) | detallado | 7,5 % (6 vivos) | 13,2 | 34,5 |
| | previa / oráculo | **67,5 %** / 10,0 % | 25,7 / 55,7 | 15,5 / 10,7 |
| `craft`, 40 días d20-60 (91) | detallado | 98,9 % | 24,0 | 14,4 |
| | previa / oráculo | 93,4 % / 89,0 % | 19,1 / 20,3 | 19,4 / 19,7 |

Veredicto contra lo declarado, sin matizar:

- **Con la capacidad del periodo (oráculo): los cinco casos quedan dentro de 0,10 en
  supervivencia**: `lean` otoño (Δ −2,5), `craft` otoño (0), `lean` invierno (+2,5; hambre Δ 8,3; sed
  Δ 14,6, **al límite de 15**), `lean` 40 días (+2,5) y `craft` 40 días (Δ −9,9, **al límite de 0,10**
  agrupando tres semillas; en la semilla `delta` sola el oráculo da 77,4 % frente a 96,8 %: suspende
  por 19 puntos; `eps` 93,8 vs 100; `zeta` 96,4 vs 100). La única medida fuera de tolerancia con
  oráculo es el hambre/sed de los 6 supervivientes de `lean` 40 días (Δ 42 y 24), que son seis
  personas y no sirven para comparar medias.
- **Con la capacidad leída de la ventana previa: aprobado donde no cambia el régimen**
  (`craft` 40 días: Δ −5,5 puntos; `craft` otoño; `lean` otoño en supervivencia, pero el hambre
  media sale 16,7 puntos por debajo: **suspende** el hambre) y **suspende con claridad al cruzar de
  régimen**: `lean` otoño→invierno da 76,3 % frente a 41,3 % y `lean` 40 días 67,5 % frente a 7,5 %.
  La capacidad de la banda en la estación que viene es una entrada que este modelo no sabe
  producir: es la despensa/estación de la economía de banda (32c).
- **Cuerpo cerrado**: queda 0,74-0,82 por debajo del detallado en todos los casos (control
  negativo cumplido). Con una banda que nunca alimenta al hambriento (`hungryZero` = 1) la persona
  muere como el cuerpo cerrado (test).
- **El frío no se modela**: en `craft` 40 días mueren 2-4 compactos por exposición y ninguno en el
  detallado (donde se acercan al fuego y duermen bajo techo); en `lean` invierno son 16 frente a
  14. Parte de los 10 puntos que pierde `craft` a 40 días son esas muertes.
- La extensión a la sed (`thirstyZero`) se añadió **después** de ver que la sed del compacto en `lean`
  invierno salía 17 puntos por debajo del detallado; movió el resultado de 15,5 a 18,3 (a 14,6
  del detallado: aprueba por 0,4 puntos). No es un logro: es un margen de ruido.

Por eso lo entregado es **el mecanismo condicionado a una capacidad del periodo**, no «ingesta
resuelta». Los tests del repo (`compact-correspondence.test.ts`) fijan lo que se midió y aprobó,
con oráculo: `lean` y `craft`, semilla `delta`, 10 días de otoño; el invierno y los 40 días de
`lean` no están en la suite (~45 s por semilla) y su resultado queda aquí y en `bugs.md`.

**No entregado:** *producción* (rendimiento por tick de trabajo y progreso de órdenes) y sus
dependencias de carga, herramientas y conservación. La tabla mide lo que cada persona absorbió,
no cuánto se produjo ni de dónde salió; separar producción de reparto exige un ledger de
despensas que el detallado no publica. El compacto sigue sin avanzar órdenes ni construcciones
(congelarlas fuera de vista lo prohíbe §4 de `m15_simulation_lod.md`, así que sigue sin poder
activarse el LOD). No se calienta ni se duerme. La correlación entre personas de una misma banda
(una semana mala para todos) no está: cada persona sortea sus días por separado.

## 6. Envejecer, concebir y morir de vejez (commit «demografía»)

`CompactBody` acepta `env.life`. En cada tick que cruza un día de calendario (`tick % ticksPerDay
=== 0`, tras el reloj de necesidades, el mismo punto del paso en que corre el bloque diario) llama a
`LifeSystem.daily` con la persona, **su propio stream** en lugar del de nacimientos del mundo, y los
callbacks de quien integre (`makeChild`, `onBirth`). No hay coeficientes nuevos: edad, condición de
concepción (hambre y salud de la madre), espaciado, gestación y la probabilidad diaria de morir de
vejez son el código del nivel detallado, no una copia. Lo que sí se verifica es que las cifras que
produce coinciden con el detallado. `onBirth` recibe al niño; además se fecha un evento `birth`
(sujeto: la madre; `childId`, `fatherId`). Quien integre decide qué significa un nacimiento
(registrar, parentesco, darle registro compacto).

Tests (`compact-life.test.ts`), tolerancias declaradas antes de medir:

- **Envejecer**: exactamente un día por día de calendario cruzado; el cuerpo cerrado no envejece
  (control).
- **Vejez**: la vida media truncada a 25 días de 300 personas compactas que empiezan al 93 % de su
  vida está a menos del 10 % de la esperada con la fórmula del detallado (`min(0,5, 0,002·exceso²·
  fragilidad)` una vez al día); el control sin reglas de vida vive los 25 días en los 20 casos.
- **Concebir y parir**: con probabilidad 1 concibe el primer día elegible y pare `gestationDays`
  días después, en ese tick exacto, con el niño apuntando a la madre y al padre; controles negativos:
  sin padre vivo, sin pareja, con probabilidad 0 o demasiado pronto tras un parto no nace nadie.
- **Stream propio**: dos mujeres con el mismo stream y la misma situación paren el mismo día.

Correspondencia (`compact-correspondence.test.ts` y la tabla del §5, `craft`, 40 días, semillas
`delta,eps,zeta`, cohorte equivalente, capacidad del periodo): hijos de las madres de la cohorte
**detallado 23 / compacto con capacidad previa 21 / oráculo 21** (−9 %); por semilla 7/6/7, 7/8/7,
9/7/7. Tolerancia declarada: 0,6x a 1,4x y al menos un nacimiento (la semilla `delta` del test
cumple: 7 frente a 7). Es el mismo orden que los 0,954 nacimientos por mujer fértil-año medidos en
`craft` (§4, 38 / 39,8) y los 0,898 / 0,841 de la línea congelada de 32a. En `lean` (colapsa) el
detallado de la cohorte parió 4 y el compacto con capacidad del periodo 4 en 40 días; con capacidad
previa 15, porque esa capacidad sobreestima el invierno (ver §5).

Mortalidad por edad: no se calibra desde una tabla. La de `lean`/`craft` (§4) está dominada por la
inanición y la de vejez es 2 muertes en 127 en `lean` y ninguna en `craft`; la de la línea 32a es
vejez 14 de 502 y 25 de 949. Con tan pocas muertes de vejez medidas, lo que se verifica de ella es
la fórmula (test de arriba), no su frecuencia en una población: el compacto comparte el código, así
que mismo hazard por edad, y la frecuencia sale de cuántos llegan a viejos, que depende de la
supervivencia del §5.

**No cubierto**: el niño nacido en el compacto no recibe registro compacto ni cuerpo (la
correspondencia no lo avanza); un padre compacto aún no avanzado a este tick puede figurar vivo
cuando ya murió (se lee de `peopleById`); no hay muertes ni nacimientos de parejas compactas
coordinados (cada una sortea con su stream, lo que es correcto para la tasa pero no reproduce la
secuencia del detallado); y las muertes por exposición del compacto siguen sin modelo de calor (§5).
