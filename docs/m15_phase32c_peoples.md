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

### Por qué no reproduce `lean` (investigación, 2026-10-06)

El modelo **no se tocó**: mismas tolerancias, mismas semillas (`delta,eps,zeta`), y la medida de partida se repitió y da lo
mismo que arriba (T1 3 de 4, T2 11,3 frente a 1,3, T3 pasa, T4 0,739 frente a 0,982). Instrumentos nuevos, todos medición y
ninguno toca `Simulation`: `tools/people-trajectory.ts` (día a día: población, raciones, tiempo forrajeando, muertes por
causa, existencias), `people-probe.ts` (condición de la gente y despensas cada 5 días), `people-groups.ts` (quién muere y de
qué), `people-condition.ts` (supervivencia según la condición de entrada), `people-supply-vs-pop.ts`, `people-hazard.ts`
(el enlace oferta-hambre-inanición contra lo que hizo el detallado) y `people-replay.ts` (se le da al modelo la comida por
persona que el detallado tuvo de verdad). Salidas en `artifacts/verification/m15-phase32c-lean-2026-10-06/` (local).

**El detallado, a lo largo del colapso** (`lean`, `delta,eps,zeta`, 36-37 fundadores; el año del detallado son 40 días, 10 por
estación). Población al cierre de cada estación, delta/eps/zeta: 36 42 42 19 0 / 36 38 38 13 1 / 37 41 44 30 3; el mundo
sigue después con 0, 1 y 3 supervivientes **sin cambio en 60 días**. Raciones por persona y día (sumadas sobre personas): 0,94
1,05 0,73 0,21 0,18 (delta), con `foodInWorld` ~150-300 todo el tiempo: no se agota la comarca. El primer invierno (días 30-40)
mata 30-47 % por inanición y 7-19 % más por exposición o animales; en la segunda primavera mueren 63-87 % de los que quedan.

Hipótesis, cada una con su medida y su veredicto:

1. **«La oferta depende de cuánta gente forrajea» (la del agente anterior). Confirmada para primavera, verano y otoño;
   refutada para invierno.** Mismo mundo `lean` con 1, 2 y 3 bandas fundadoras (12, 25, 37 personas, tres semillas), primer año:
   raciones por persona y día **0,85 / 0,84 / 0,87** (primavera), **1,00 / 1,00 / 1,07** (verano) y **0,90 / 0,79 / 0,75**
   (otoño) para 12 / 25 / 37 fundadores, y por tanto el total diario crece con la boca (10,4 / 20,8 / 31,7 en primavera). Lo que
   la curva llama «suministro de la región» es, fuera del invierno, lo que la gente comió, limitado por el apetito (una ración
   es la necesidad diaria), no una propiedad de la comarca. En invierno el total sí es casi fijo: 5,6 / 3,5 / 6,6 raciones al
   día para 12 / 25 / 37, o sea 0,48 / 0,18 / 0,19 por persona, que es el supuesto del modelo. Consecuencia mecánica: la región
   del modelo (5,3 / 11 / 14,3 / 6,5 raciones, promedio de una corrida que se colapsa) deja a 36 personas con `s` = 0,15-0,4 en
   estaciones en las que el detallado tiene ~0,9: el modelo mata gente **de más** en el primer año (en su corrida, 36 a 25
   en la primera estación media, cuando el detallado no pierde a nadie).
2. **«El enlace oferta-hambre-inanición está mal»: refutada donde se midió.** Con la oferta *exacta*
   (`people-replay.ts`, `s` = raciones/persona-día del detallado en cada estación, forzada), el primer invierno sale bien: inanición
   por estación 0,31 / 0,33 / 0,30 del modelo frente a 0,36 / 0,47 / 0,30 del detallado (`people-hazard.ts`), y el `hungryZero` que
   da la curva extrapolada (0,90 / 0,94 / 0,89) es el que tuvo el detallado (0,84 / 0,89 / 0,83). El tope de `z` = 0,889 no es la causa.
3. **«La maquinaria sola sí falla»: confirmada, y aquí está el grueso.** Con la oferta exacta el modelo **sigue sin colapsar**: población
   final media 30,4 / 41,7 / 33,4 (0 de 20 extinguidos) frente a 0 / 1 / 3 del detallado. Dos partes distintas:
   a. **La condición de entrada.** En la segunda primavera el detallado mata 63 / 69 / 87 % de los que quedan con `s` = 0,18 / 0,65 / 0,35,
      donde el modelo da 0,31 / 0,03 / 0,24 por inanición. Al día 40, con las seis semillas (`alpha..gamma` y `delta..zeta`), 61 de
      96 supervivientes tienen ya el hambre al máximo (>= 100) y 47 la salud < 50; de los 10 días siguientes sobreviven un 2 % de
      los de hambre >= 100 y un 18-50 % de los de menos, 0 de 47 con salud < 50 y 31-33 % con salud >= 75 (`people-condition.ts`; son
      11 de 96 en total). La muerte en el detallado depende del estado en que se llega, y el modelo no tiene estado: cada
      estación reparte hambre y muerte como si la gente empezara fresca. Además el `hungryZero` observado en esas primaveras
      (0,25-0,65) es **menor** que el de la curva: murieron con alivio parcial, no por una racha de 8 días vacíos, así que la racha
      derivada en 32b para una persona sana no es el mecanismo de la muerte de una persona debilitada.
   b. **Quién muere.** Las fundadoras (40) mueren todas antes del día 50 (0 % de supervivencia), los varones sobreviven un 10 %, los niños
      0 %: los supervivientes son 1-3 hombres sin ninguna mujer fértil, y por eso el detallado **no se recupera** (60 días con 1 y
      3 personas sin un nacimiento) mientras que el modelo, con hazard uniforme por sexo y banda, conserva mujeres y sigue naciendo.
      Además, causas que el modelo no tiene: de 106 muertes de fundadores, 22 exposición y 5 fieras (frío y animales, ya declarados como
      «no modelados»).
4. **Natalidad (T4).** Con la oferta exacta el modelo da 0,84 / 0,91 / 0,93 nacimientos por mujer-año fértil, dentro de 0,20 del
   0,98 del detallado: **el fallo de T4 viene de la oferta errónea de (1)** (un `hungryShare` demasiado alto en el primer año), no de la
   fórmula de natalidad.
5. **«Ruido de banda pequeña / curva fuera de rango»: descartada.** Hubo 0 de 60 extinciones del modelo, así que no es ruido; y en
   invierno `s` = 0,12-0,23 queda por debajo del primer punto medido (0,396) y la extrapolación acierta (punto 2).

**Veredicto.** Lo que hace que `PeopleSim` no reproduzca `lean` son dos defectos que **se compensan en parte**, y arreglar solo uno
empeoraría la razón T2: (i) la oferta de primavera a otoño la fijó la calibración como propiedad de la región cuando es consumo
proporcional a la gente (el modelo mata de más pronto) y (ii) la demografía no tiene memoria de condición ni distingue sexos
(no mata de más tarde, cuando la banda ya está debilitada, y mantiene a las mujeres que el detallado pierde primero). **No se
implementó ninguna corrección**: (i) por sí sola daría un modelo aún más vivo (el replay, que ya incluye la oferta exacta, termina en 30-42
frente a 0-3), y (ii) exige un estado nuevo (reserva de salud o racha de hambre acumulada por cohorte y sexo) cuya forma no sale de
ninguna medida hecha: la racha de 8 días no la explica (punto 3a), y ajustarla contra estas mismas tres semillas sería afinar contra el
test. Lo que falta: medir en el detallado la mortalidad por sexo/edad y por salud de entrada con **semillas de calibración** (`alpha..gamma`)
y solo entonces proponer un estado, contrastándolo en `delta..zeta`; y separar, en el mundo `lean`, la oferta que es de la comarca
(invierno) de la que sigue a la gente (resto del año), que la curva actual mezcla. Hasta entonces la advertencia de arriba se mantiene: no usar
`PeopleSim` en régimen `lean`.

Límites declarados: una sola comarca por mundo medido; tres semillas por mundo; el kit de técnicas es una sola
medida; no hay mortalidad infantil propia, ni frío, ni salud (la vejez es la sana); la cohorte 60+ se evalúa a los
62 años; la inanición por encima de `z = 0,81` es extrapolación. Tests: `people-demography.test.ts` (16),
instrumentos `tools/people-calibrate.ts`, `tools/people-measured.ts`, `tools/people-correspond.ts`. Salidas completas en
`artifacts/verification/m15-phase32c-2026-10-06/` (local, ignorado por Git; las cifras de arriba son el registro).

## 3. Inventar y aprender de vecinos (`PeopleKnowledge.ts`)

Por temporada y pueblo, para cada técnica que no tiene y cuyos `requires` sí tiene (misma regla que el juego,
impuesta por `TechSet.add`), dos oportunidades independientes del stream propio:

- **Invención (Kremer).** `p = 1 - exp(-KAPPA x Neff / dificultad)`. `dificultad` es el `TECH[t].difficulty` del
  juego; `Neff = N + suma(contacto x N del vecino)`: más gente y más contactos, más invenciones por candidata. Solo si
  la región tiene lo que se necesita para el primer prototipo (todas las claves de `TECH[t].prototype` en
  `region.materials`): sin trigo silvestre no se inventa la agricultura; el mapa solo condiciona dos materiales (grano
  silvestre y sílex, `geographicResourceAvailable`), de modo que una región es «todos los materiales menos lo que el mapa
  dice que le falta» (`regionMaterials`).
- **Aprendizaje.** `p = 1 - exp(-MU x suma(contacto x similitud climática de quienes la tienen))`. El contacto es el
  `PeopleRelation.contact` del par (comercio, matrimonio, guerra y cercanía escribirán ahí; **nada lo escribe todavía**);
  la similitud es `1 - distancia/sqrt(2)` entre dos climas en el cuadrado unidad (temperatura, humedad): **una
  suposición de diseño, no medida**, que solo se prueba monótona. Aprender no necesita materiales locales (la semilla
  viaja).

Dos tiradas por técnica y actualización, siempre y en orden de `TECHS`, tenga o no el pueblo la técnica (el stream no
depende de lo que sabe; test: mismo estado del stream con y sin técnicas). Ambas se juzgan contra lo que se tiene al
empezar la actualización: una técnica y la que la requiere no llegan en la misma temporada (test). Los vecinos se leen tal
como están cuando corre este pueblo (orden por paso e id): lo que un vecino aprendió antes en la misma temporada puede
aprenderse en ella. No se modelan, y por tanto no se declaran, olvidar una técnica ni sus practicantes.

### Medida (`tools/people-discovery.ts`)

**`KREMER_KAPPA` = 4,7e-4** por persona-temporada y por unidad de 1/dificultad, medido en el mundo por defecto (`century`,
tres bandas, fundadores sin técnicas, 40.000 pasos = 16 temporadas) en `alpha,beta,gamma`: 16 técnicas encontradas, exposición
33.945 (suma, sobre temporadas, de población x suma de 1/dificultad de las candidatas abiertas: sus requisitos en poder de alguien y sus
materiales en el mundo); intervalo de Poisson al 95 %: 2,4e-4 a 7,0e-4. **Es un solo número con 16 eventos**, y el modelo
supone que la tasa por técnica sigue a 1/dificultad. Los datos lo contradicen en lo fino: `plant_lore` (dificultad 0,25) la
encuentra alguien en las temporadas 3, 4 y 5 en las tres semillas (unos 0,25 por temporada) mientras el modelo da ~0,07;
`division_of_labour` (0,45) tarda 9-16 temporadas, que es lo que el modelo da. La tasa por técnica depende de sus chispas
(`sparks`), no solo de `difficulty`. Se usa el agregado y se dice.

**`MU` no se pudo medir** (lo que sigue es lo que decide que `KnowledgeEnv.mu` no tenga valor por defecto). Dos bandas del mundo `craft`
(el mundo por defecto con dos bandas), la primera con `firemaking`, `plant_lore` y `cooking` de fundadores y la segunda con nada, 40.000
pasos, 5 semillas (`alpha,beta,gamma,delta,eps`): `firemaking`, abierta durante 85 temporadas-candidata, **no llegó nunca** a la
segunda banda (0 de 85; cota superior al 95 %: 3,69/85 = **0,043**); `plant_lore` sí llegó en las 5 semillas, a las 2-8 temporadas.
Pero `plant_lore` la inventa de forma independiente cualquiera en 2-5 temporadas en las tres semillas de la medida de invención, así
que esas llegadas no se distinguen de invenciones (el número esperado con la tasa agregada es 0,5 por semilla, y el observado es 1: el
agregado está por debajo de lo que pasa con esa técnica). Hay más de 5x entre las dos técnicas, y un solo `MU` no cabe en los datos.
Lo que sí queda es la cota `LEARN_MU_BOUND = 0,043` (exportada, documentada como cota y no como estimación).

**Pregunta para el propietario (decisión, no se ha tomado):** el aprendizaje entre pueblos, ¿se mide por técnica (una
*transmisibilidad* por nodo: lo que se ve usar a diario, como forrajear, pasa casi sin querer; lo que exige un hogar y una
enseñanza, como encender fuego, casi nunca pasa sin ella), o se acepta un `MU` agregado por debajo de la cota 0,043? Lo
primero añade un campo a `TECHS` que el juego detallado ya tiene implícito en sus `sparks`; lo segundo seguirá dando
transferencias de `plant_lore` y de `firemaking` en la misma proporción, que el detallado no produce. Hasta que se decida,
`knowledge()` exige que quien lo maneje dé `mu` y el resto de pruebas lo pasan explícito.

### Correspondencia de la invención (`tools/people-knowledge-correspond.ts`)

Semillas fuera de la medida (`delta,eps,zeta`); el detallado de 16 temporadas desde nada; el modelo, un pueblo con la población media
del detallado, 60 streams por semilla. **Tolerancias escritas antes de la primera medida:** K1 media de técnicas dentro del 35 %
del detallado; K2 al menos 2 de las 3 cuentas del detallado dentro del rango 5-95 % del modelo; K3 con la población doblada el
modelo halla >= 20 % más (Kremer).

| | detallado | modelo |
|---|---|---|
| técnicas tras 16 temporadas (`delta` 38,9 vivos, `eps` 43,3, `zeta` 20,7) | 4, 6, 1: media 3,67 | media 4,62 (razón 1,26): **K1 pasa** |
| rango 5-95 % del modelo | | [0, 10]: 3 de 3 dentro, **K2 pasa** (con un rango tan ancho es poco exigente) |
| población doblada | | 10,33 frente a 4,62: **K3 pasa** |

El modelo se pasa un 26 % (dentro de la tolerancia) y el rango de 0 a 10 dice poco: la correspondencia es de orden de magnitud con
tres semillas, no una medida fina. Por técnica no se compara (ver arriba: `plant_lore` sale mucho más rápida en el detallado).

### «Nada por guion» (`people-knowledge.test.ts`, 15 pruebas)

Ninguna técnica se concede por fecha, nombre, región concreta o identidad: lo único que entra es la población, lo que ya se tiene,
lo que la región ofrece (materiales) y los contactos. Una *auditoría* mide invariantes que una versión honesta cumple y un guion
rompe: (A1) un pueblo sin gente y sin vecinos que ya sabe cosas no gana nada en 40 temporadas; (A2) sin materiales solo se
inventan técnicas de prototipo vacío, con 1 a 4 comarcas y varios pueblos; (A3) un vecino con contacto 0 no cambia nada
(mismas semillas, mismos números); (A4) fundar el pueblo 40 temporadas después da el mismo ritmo relativo (±25 %) y la primera
técnica no llega en la misma temporada en todas las ejecuciones; (A5) dos pueblos idénticos con id 1 y 2 se parecen (±20 %). Se
comprueba que la auditoría **no es vacía** (sin materiales el honesto aún inventa más de cinco técnicas, todas de prototipo
vacío) y que **falla** contra cuatro versiones trucadas: concesión por fecha (temporada 6), por nombre (si tiene plant_lore y
cordage, basketry), por región (comarcas == 3, farming) y por identidad (el pueblo 2, pottery). Además, ningún nombre de técnica
aparece en el código de `PeopleKnowledge.ts` (leído sin comentarios). Otras pruebas: la probabilidad de invención solo usa
dificultad y población efectiva; solo se adquiere con requisitos y no en la misma temporada; la invención escala con el
tamaño (razón de tiempos entre 2,8 y 5,5 con 4x población, esperada 4) y un vecino con contacto 1 cuenta como población (<0,7x),
con contacto 0 no; sin trigo silvestre no hay agricultura (0 de 40) y con trigo sí (más de 30 de 40); aprender sube escalón a
escalón de la cadena de requisitos de `farming` (la cadena completa llega a farming, sin saltos) y cuenta con la similitud
climática y el contacto.

Límites: una sola `KAPPA` para todas las técnicas; sin olvido, sin refinamiento ni practicantes; el clima es una suposición;
`MU` sin medir; contacto sin escritor; la población del pueblo viene de fuera (aquí constante: este mecanismo no la mueve). La
puerta `peoples-match-bands` no se ha corrido.
