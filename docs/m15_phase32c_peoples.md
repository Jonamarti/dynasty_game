# M15 32c — `PeopleSim`, el nivel 2, mecanismo a mecanismo

2026-10-06. Punto 4 de §7 de [m15_simulation_lod.md](m15_simulation_lod.md); diseño en
`m15_plan.md` §32c. Todo vive en `src/sim/world/`, sin renderer ni DOM, **inerte**: nada de
`Simulation` lo llama y el juego normal es bit-idéntico. Sin UI, así que sin capturas.

## 1. Estructura de un pueblo (`PeopleSim.ts`)

Un `People` tiene: id estable; **cohortes por edad y sexo** (13 bandas de 5 años, 0-4 … 55-59 y
60+; enteros, nunca un contador); `comarcas` ocupadas (un número); **técnicas como bitset sobre
`TECHS`** (`TechSet`); cultura (`norms` de `Events.ts`, `strangerRegard`, media de cada rasgo de
`TRAITS`); excedente (raciones, agregado); su stream propio y la fecha de su próxima actualización.
El **nivel de organización** (`band`/`tribe`/`chiefdom`/`state`) no se guarda: se deriva de las
técnicas (`organisationOf`), como la civilización de la fase 38c: `division_of_labour` es el primer
peldaño (M9.5 4c), `chiefdom` el segundo (4d) y un Estado tiene los seis nodos de
`CIVILISATION_NEEDS`. *Decisión de diseño que el propietario puede cambiar*: el plan no fija cuándo
una banda es «tribu»; se eligió el peldaño que el juego ya trata como primer paso más allá de la banda
en vez de un umbral de población inventado. El modo de vida y las relaciones de comercio no están
todavía (el primero sale de la capacidad de §2; el segundo no tiene mecanismo que lo escriba).

**Técnicas.** `TechSet.add` rechaza (lanza) una técnica a la que le falta un `requires`, con la
misma regla (`TECH[t].requires`) que el juego detallado; el constructor rechaza un conjunto inicial
que no está cerrado bajo `requires`; el registro JSON guarda recuento y hash de `TECHS` y
`fromRecord` rechaza una lista distinta o un conjunto no cerrado. Test: añadiendo lo alcanzable
(`reachableFrom`) se llega a los 100 % de los nodos.

**Relaciones.** Un registro por par no ordenado en `PeopleSim.relations`, con id (standing,
contacto, postura): ningún pueblo guarda copia, de modo que «actualizar ambos extremos» es escribir
un registro y un comercio o tributo no se aplica dos veces. `commit(idTransacción)` devuelve `false`
en la segunda aplicación (mismo patrón que el ledger del compacto, §3/§4 del diseño).

**Streams.** `derivePeopleStream(semilla, id)` = hash de `people|semilla|id`: fuera de los forks de
`Simulation` y sin depender de cuántos pueblos existan (test: el pueblo 1 saca lo mismo con 1 que con
10 pueblos fundados). Su estado se guarda (`PeopleRecord.rng`); un restaurado que re-derivara sus
streams diverge (control negativo).

**Actualización estacional repartida por número de paso.** Cada pueblo toca una vez por estación, en
el paso `estación·pasosPorEstación + offset(id)`, `offset` = hash de semilla e id: la carga se reparte
por los 2.400 pasos de la estación en vez de caer en uno. `advanceTo(paso)` ejecuta lo vencido por
(paso, id) y solo hacia delante; partir la corrida en trozos cualquiera (1, 7, 333, 334, …, o paso a
paso) da el mismo estado y las mismas tiradas (test); un mecanismo que leyera el paso que pidió el
llamante (un reloj) sí cambia con los cortes y lo detecta el mismo test (control). Nada lee FPS ni
reloj de pared. Los mecanismos se pasan al constructor en un orden fijo (`SeasonMechanism`).

Serializa a JSON (`snapshot`/`fromSnapshot`), rechazando versión, ids, cohortes negativas,
relaciones o transacciones duplicadas y un pueblo cuya actualización ya se perdió.

Tests: `src/sim/__tests__/people-sim.test.ts` (13). 

## 2. Crecer o menguar, y la capacidad de banda por estación (`PeopleCapacity.ts`, `PeopleDemography.ts`)

Medir antes de modelar (`tools/people-calibrate.ts` → `tools/people-measured.ts` →
`world/PeopleMeasured.ts`, generado). Tres mundos de la fase 32b, tres semillas (`alpha,beta,gamma`),
una comarca cada uno: `lean`, `craft` y `leankit` (= `lean` con `firemaking`, `plant_lore`, `cooking`
de fundadores, para **medir** el efecto de un kit de técnicas en vez de suponerlo). Por estación y mundo
se guardan las raciones que la comarca dio por día (comido nominal / deriva de hambre de cada
persona-día, sumado, dividido por los días de calendario; una ración = la necesidad diaria de una
persona), la población media, y de los días de adultos que empezaron con hambre (necesidad >= 25) la
fracción sin alivio alguno (`hungryZero`, lo que `CompactIntake` lee como capacidad) y la fracción que
empezó con hambre (`hungryShare`).

| mundo, estación | raciones/día | población media | `s` = raciones/población | `hungryZero` | `hungryShare` |
|---|---:|---:|---:|---:|---:|
| `lean` primavera | 5,31 | 11,9 | 0,446 | 0,756 | 0,49 |
| `lean` verano | 11,0 | 12,9 | 0,855 | 0,431 | 0,57 |
| `lean` otoño | 14,3 | 14,1 | 1,011 | 0,232 | 0,45 |
| `lean` invierno | 6,46 | 16,3 | 0,396 | 0,808 | 0,68 |
| `craft` primavera | 26,7 | 29,1 | 0,918 | 0,250 | 0,32 |
| `craft` verano | 31,7 | 29,6 | 1,073 | 0,153 | 0,30 |
| `craft` otoño | 32,1 | 32,2 | 0,999 | 0,121 | 0,25 |
| `craft` invierno | 31,0 | 31,2 | 0,994 | 0,149 | 0,22 |

(`leankit` está en `PeopleMeasured.ts`: doce puntos en total.) Los doce puntos, ordenados por `s` y fundidos
por *pool-adjacent-violators* (más comida por persona nunca da más días vacíos ni más hambrientos), son la
curva `capacityAt(s)`. Los dos extremos no están medidos: en `s = 0` nadie come (`hungryZero = hungryShare = 1`,
recta hasta el primer punto) y por encima del `s` más rico medido la curva se mantiene plana.

**Hallazgos de la medida, sin adornar.**

- **Los kits no se ven en `s`, se ven en la población.** `leankit` da casi el mismo `s` que `lean`
  (0,47/0,84/0,99/0,45 frente a 0,45/0,86/1,01/0,40) pero con 1,3x más población media: más comida, más
  gente, mismo hambre. El multiplicador del kit sobre lo que alimenta la comarca (raciones/día, ponderado
  por días) es **1,24**; tres semillas y confundido por ese efecto de población. Es la **única** técnica
  (conjunto) medida: cualquier otra cuenta 1, lo que es conservador y *no* un hallazgo (agricultura,
  pastoreo y almacén seguro que importan, y nada de esto los mide).
- **La oferta no es independiente de la población.** Las raciones medidas son lo que se comió, que depende de
  cuántos buscan y de si el hambre aprieta (`craft` está limitado por el apetito, no por la comarca). Por eso
  `s` solo es fiable cerca de las poblaciones a las que se midió; ver el veredicto de `lean`.

**Modelo.** `suministro = comarcas x raciones/comarca/día[estación] x multiplicador(técnicas)`; `s = suministro /
población`; de la curva salen `hungryZero` y `hungryShare`. Muerte por inanición: una persona con hambre
muere tras `K = 8` días seguidos sin alimento (medido en 32b: tick 1.961-2.127 a 240 por día); el riesgo
diario es la probabilidad de que un día empiece una racha así, `hungryShare x (1 - z) z^K`, con `z` el
`hungryZero`. **Derivado, no ajustado**; por encima de `z = K/(K+1) = 0,889` (donde la fórmula deja de
crecer) se mantiene en su máximo: ningún punto medido pasa de `z = 0,81`, así que eso es extrapolación.
Muerte de vejez: la **misma** función que tira `LifeSystem` (`oldAgeChancePerDay`, ahora exportada y usada
también por `checkMortality`, misma aritmética, bit-idéntico) integrada sobre la distribución de vidas que
sortea `Person` (`LIFESPAN_MEAN_YEARS`/`SD`, también exportadas); test Monte Carlo de 6.000 vidas
individuales contra la tabla (±0,03 de supervivencia a 55-72 años; control: una tabla sin dispersión de vidas
queda a más de 0,05). Nacimientos: mujeres fértiles (16-44) x natalidad medida en `craft` (0,954 por
mujer-año fértil, sana), escalada por la condición de concepción `1 - hambre/140` según la fracción de
hambrientos (referencia: la de `craft`, 0,24). Guerra y enfermedad: hay un enganche `DemographyEnv.losses`
(personas perdidas por estación, repartidas por cohortes); **ningún mecanismo lo escribe todavía** y el
pueblo no tiene campos para ellos, para no declarar contenido que nadie lee. El orden de cada actualización
(muertes, pérdidas externas, envejecer 1/20 por banda, nacimientos) y el stream (el propio del pueblo) son
fijos; la población se conserva exactamente (test: variación = nacidos - inanición - vejez - perdidos).

**Capacidad de banda por estación para el compacto.** `bandCapacityOf(pueblo, región, estación)` devuelve el
`BandCapacity` que lee `CompactIntake`, para **cualquier** estación, también la que aún no ha llegado, solo
desde la región y el pueblo: es la entrada que en 32b hacía suspender el cruce de régimen
(`lean` otoño a invierno, 76 % frente a 41 %). Test: la misma persona compacta 30 días con la capacidad de un pueblo
bien alimentado vive y con la de uno hambriento muere. **Falta medir** si, con esta capacidad pronosticada,
el caso `lean` otoño a invierno de 32b queda dentro de su tolerancia; no se ha corrido (cohorte pesada de 45 s por
semilla y el invierno `lean` no está en la suite): no se afirma.

### Correspondencia con el detallado (`tools/people-correspond.ts`)

Semillas **fuera** de la curva (`delta,eps,zeta`), un pueblo del modelo por cada semilla y 20 streams, mismos
días. **Tolerancias declaradas antes de la primera medida y no movidas:** T1 la capacidad pronosticada
(región medida / población media del detallado) a <= 0,15 de la que tuvo el detallado, en >= 3 de las 4 estaciones
con >= 30 días de hambre; T2 población final media a +-35 % del detallado (con cifras absolutas y extinciones al
lado); T3 inanición por persona-año a un factor 2 si el detallado tiene >= 20 muertes que medir; T4 nacimientos por
mujer-año fértil a <= 0,20.

| | `craft` (66 días) | `lean` (100 días) |
|---|---|---|
| T1 capacidad (modelo / detallado), 4 estaciones | 0,32/0,21, 0,16/0,15, 0,25/0,13, 0,25/0,16: **4 de 4** | 0,84/0,71, 0,46/0,33, 0,44/0,25 (**falla**, 0,19), 0,85/0,78: **3 de 4** |
| T2 población final | detallado 39,0 (de 24,7), modelo 37,3: razón 0,96, 0 extinciones en 60: **pasa** | detallado **1,3** (de 36,7), modelo **11,3**, 0 extinciones en 60: razón 8,5, **falla** |
| T3 inanición/persona-año | no se juzga (1 muerte en 158 pa): 0,006 y 0,006 | 0,878 (108 muertes) frente a 0,762: **pasa** |
| T4 nacimientos/mujer-año fértil | 1,055 frente a 0,896: **pasa** | 0,982 frente a 0,739: **falla** |

Historia, porque la primera medida fue peor y el hallazgo es del instrumento: la primera versión ponía en el eje
de la curva el cociente comido/deriva de los **adultos**, mientras el modelo calcula raciones/población de **todos**;
no son el mismo número y la capacidad pronosticada salía 0,2-0,3 por encima en `craft` (0 de 4 estaciones; y T2 no se
pudo correr porque el pueblo `craft` se fundaba con técnicas sin sus requisitos, un fallo de la herramienta). Se
corrigió el eje (no una tolerancia) y se midió de nuevo con las mismas semillas y las mismas tolerancias.

**Veredicto, sin matizar.** El modelo reproduce `craft`: un pueblo bien alimentado crece como el detallado y su capacidad
cae donde cae la del detallado. **No** reproduce `lean`: el detallado colapsa a casi cero (en la calibración, 36,7 a 1,0;
en las semillas nuevas, 36,7 a 1,3, una de ellas extinta) y el modelo se queda en ~11 y no se extingue nunca. T1 pasa por
la mínima (el otoño falla), la natalidad del detallado en `lean` (0,98) queda por encima de lo que el modelo da, y T2
falla por casi un orden de magnitud. **La causa no está confirmada**; la hipótesis es que la oferta medida (raciones/día)
no es independiente de la población (menos gente, menos forrajeo, menos raciones) y el modelo la mantiene fija, y que no
modela el colapso de una banda pequeña (sin pareja, sin cuidados, sin enseñanza), con lo que **sobreestima** la
supervivencia de un pueblo en espiral descendente. Por eso: **no se declara correspondencia** y `peoples-match-bands`
(20 semillas, +-15 %) sigue **pendiente de medición diferida**; no se afirma que se cumpla ni se ha corrido. No debe
usarse `PeopleSim` para pueblos en régimen `lean` hasta resolverlo (`bugs.md`).

Límites declarados: una sola comarca por mundo medido; tres semillas por mundo; el kit de técnicas es una sola
medida; no hay mortalidad infantil propia, ni frío, ni salud (la vejez es la sana); la cohorte 60+ se evalúa a los
62 años; la inanición por encima de `z = 0,81` es extrapolación. Tests: `people-demography.test.ts` (16),
instrumentos `tools/people-calibrate.ts`, `tools/people-measured.ts`, `tools/people-correspond.ts`. Salidas completas en
`artifacts/verification/m15-phase32c-2026-10-06/` (local, ignorado por Git; las cifras de arriba son el registro).
