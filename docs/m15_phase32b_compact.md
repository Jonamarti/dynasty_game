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
- **Sin demografía.** No envejece, concibe, pare ni muere de viejo (`LifeSystem.daily`
  necesita `LifeContext` completo: padre, rng de nacimientos, `onBirth`).

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
| primavera | 0,42-0,89 (558) | 0,56 | 1,14 |
| verano | 0,65-1,40 (800) | 0,97 | 1,32 |
| otoño | 0,72-1,98 (674) | 1,21 | 1,33 |
| invierno | 0,33-0,71 (592) | 0,48 | 1,26 |

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
  dos raciones. Con hambre alta (≥75) la mediana ya es ~1,0.
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
