# M13 — Por qué hace cada uno lo que hace

Escrito el 2026-09-25, a partir de una conversación con el propietario sobre la
motivación intrínseca y extrínseca de los NPC. **Este milestone ocupa el hueco
del antiguo M13**, el mapa del mundo, que pasa a ser M14
([m14_plan.md](m14_plan.md)); todo lo que venía detrás suma uno. **Todo M13
ocurre en el mapa local.** Nada de aquí necesita comarcas, globo ni LOD.

**Para quién está escrito.** Para un agente que no estuvo en esa conversación
y tiene que ejecutar las fases deprisa sin romper el proyecto. Cada fase dice
qué problema resuelve, qué archivos y funciones toca y en qué orden, qué tests
y qué checks añade, cómo se mide y cuándo hay que parar y preguntar. Los
números de línea cambian con cada edición, así que el plan cita **nombres**
(funciones, constantes, comentarios de sección como `// --- Hunt ---`):
búscalos. Si algo de este plan contradice al código, manda el código:
compruébalo y anota la discrepancia en `docs/bugs.md` antes de seguir.

**Lee antes, en este orden:** `AGENTS.md` (entero, son reglas que rompen el
proyecto si se ignoran), `docs/architecture.md` §«The AI is a utility scorer»,
y la cabecera de `src/sim/ai/Brain.ts` hasta `class Brain`.

---

## 0. Lo que pidió el propietario

Resumen fiel de lo que dijo, porque es el criterio contra el que se juzga cada
fase:

1. **Los comportamientos tienen que surgir, no programarse.** Nadie tiene
   programado «haz fuego cuando tengas frío». Existe una tecnología; a alguien
   se le ocurre por una chispa o experimentando con palos y sílex; descubre que
   sirve para quitarse el frío; y los mecanismos que ya existen la extienden:
   enseñar, pedir que te enseñen, aprender mirando.
2. **Motivación intrínseca:** la personalidad cambia las prioridades. Al
   curioso le interesa la tecnología; al malicioso, cotillear; a otros no. El
   hambre no es siempre la prioridad al 100%.
3. **Motivación extrínseca:** si me atacan, buscar comida deja de importar:
   defenderme, atacar o huir pasa delante de todo.
4. **Que se den cuenta de que lo avanzado es mejor.** La carne cocinada llena
   más que diez bayas. Y un instinto de variedad: «me he llenado de bayas pero
   no me satisface», por la proteína baja. Hacerlo depender de la personalidad
   le parece «arte muy fino»: **no se hace** salvo que se pida.
5. **Lo primero que hay que corregir:** la tribu se dispersa. Un individuo
   acaba en la otra punta del mapa, come, bebe y descansa en el suelo allí, y
   no vuelve a su casa ni a su tribu. **Tiene que existir una necesidad de
   estar cerca de la familia.** Algún rasgo de personalidad puede tenerla más
   baja e ir más «a su bola».
6. **Los niños van pegados a los padres**, cada vez menos según crecen.
   Muy pequeños, siempre al lado; después, cerca de los padres y de los
   edificios de la tribu. El plan del embarazo (M14 fase 6) ya dice que el
   primer año no andan; esto es lo que viene después.
7. **La respuesta a una agresión debe ser alta.** Un niño que no puede
   defenderse huye, y los padres deberían estar cerca.
8. **Cómo medir que «se parece a la historia»**, en palabras del propietario:
   una guerra puede tirar la población un 80% a corto plazo, y eso puede estar
   bien, porque ha pasado; después la guerra acaba, la gente vuelve a tener
   hijos y la población se recupera. Lo que está mal es una caída del 100%,
   salvo que no haya comida para absolutamente nadie, y aun entonces la tribu
   tendría la opción de emigrar. Que en una tribu se maten todos entre sí puede
   pasar alguna vez, pero no como norma. Que una tribu se deje matar sin
   defenderse no pasa nunca. **No sabe qué números poner**: el plan propone
   unos y los deja como decisión suya (§«Objetivos históricos»).
9. **Aprobó la tabla** de personalidad → motivos: los rasgos fijan cuánto pesa
   cada motivo, en un solo sitio.
10. `docs/notes4.txt`: «en lugar de empezar los NPC a construir los edificios,
    primero hay que convencer a los de la tribu. El jugador puede empezar él
    solo o dar órdenes a compañeros de tribu o familia para que le ayuden, pero
    empezar todos juntos a la vez no está bien».

El destino a largo plazo (tribus → territorio → comercio y guerra → jefaturas
→ civilizaciones, sin intervención del jugador) está en la memoria del
proyecto y en M14. **M13 construye la base de la que eso tiene que salir.**

---

## 1. Diagnóstico, medido el 2026-09-25

### 1a. Cómo decide hoy un NPC

`Brain.score` puntúa unas sesenta acciones y `Brain.think` elige entre las
mejores (`core/Choice.ts`):

```
puntuación = urgencia(necesidad)² × cercanía × personalidad × inercia
```

El tipo de puntuador es el correcto y **no se tira**: se puede ampliar sin
tocar lo demás y se puede inspeccionar (`npm run why`). Lo que falla es lo que
lleva dentro:

- **La personalidad no actúa a través de motivos.** Hay 61 lecturas de
  `person.traits` en `Brain.ts` (y 30 más repartidas por `ActionSystem`,
  `KnowledgeSystem`, `Authority`, `Factions`…), cada una un coeficiente suelto
  sobre un verbo. Inventario en el Apéndice A.
- **Las necesidades son sólo físicas**: `hunger`, `thirst`, `fatigue`, `cold` y
  `company` (`Person.NEEDS`). El ánimo (`core/Mood.ts`) tiene cuatro canales y
  **`Brain` no lee ninguno**. La malnutrición (`core/Macros.ts`) sólo baja la
  salud: nadie tiene antojo de nada.
- **Usar una tecnología es automático o está programado a mano.** `cooking`
  multiplica la nutrición de toda comida en `consumeFood` sin que nadie decida
  nada (`nutritionFactor` en `Tech.ts`). Otras tienen su rama escrita en el
  cerebro: `techPower(person, 'cordage')` aparece tres veces y otras seis
  tecnologías una vez cada una. La banda elige qué construir con la cascada de
  reglas de `BandSystem.planBuildings`, y todos los que están cómodos acuden.
- **Nadie aprende que algo es mejor.** No existe ningún registro de «esto me
  sirvió». Saber una técnica no cambia lo que nadie piensa que vale.

### 1b. Qué produce eso

`npm run sim:check -- --scenario century` (dos años):

| | |
|---|---|
| Tecnologías conocidas al final | 9; la era sigue siendo el Paleolítico inferior |
| Personas que saben hacer fuego | 0 |
| `ponder` / `prototype` (muestras) | 79.119 / 1.259 |
| `sabotage` / `steal` / `attack` / `slander` | 22.308 / 12.055 / 12.101 / 9.771 |
| Relaciones hostiles / cálidas | 970 / 922 |

El conflicto está mucho más vivo que el progreso. El volumen de `sabotage`
(más que `chop`) no está diagnosticado: se mira en la fase 12.

**La dispersión**, medida con el script del Apéndice B (16.000 pasos, 67 días):

| | `century` | `lean` |
|---|---|---|
| Distancia al campamento de día, mediana / p90 / máx. | 15 / 53 / 138 | 22 / 69 / 119 |
| Noches a más de 25 casillas del campamento | 40% | 46% |
| Noches a más de 45 casillas | 12% | 25% |
| Noches durmiendo bajo techo (`sleep`) | 4,7% | 2,9% |
| Niños < 10 años: distancia al padre o madre más cercano, mediana / p90 | 12 / 39 | 21 / 63 |
| Niños < 10 años a más de 30 casillas de ambos padres | 20% | 37% |

Y de noche la gente **trabaja como de día**: en `century` las acciones
nocturnas más frecuentes son `forage` (12,7%), `shelter` (10,9%), `rest`
(10,2%), `pick` (9,2%), `ponder`, `talk`, `drink`… y `sleep` (4,7%).

Por qué pasa, en el código:

- El único freno a alejarse es el **miedo** (`Fear.homeRange`, 48 casillas en
  una isla de 128), y sólo se aplica a los nodos de recursos (`Brain.findNode`).
  El agua, los árboles frutales, la caza, la leña y el paseo no tienen límite.
- `wander` sólo se inclina hacia casa si la persona tiene miedo
  (`Fear.homeward`).
- `sleep` exige un edificio y sólo se puntúa con frío o con cansancio por
  encima de 20. El cansancio sube 0,04 por paso y rara vez llega, así que
  nadie duerme; quien descansa lo hace donde esté (`rest`).
- Nada en el cerebro trata a un niño como alguien que sigue a sus padres: un
  niño puntúa `forage`, `pick` o `wander` como un adulto, más lento.

### 1c. Por qué no va a surgir nada por sí solo

El ciclo que describe el propietario es: **se le ocurre → lo prueba → nota que
sirve → lo prefiere → lo enseña o se lo piden**. El primer eslabón existe
(las chispas de `knowledge/Synthesis.ts`) y el último también (`teach`, `ask`,
observar en `KnowledgeSystem.tryObserve`). **Los del medio no existen.**
Mientras no existan, cada tecnología nueva necesita su propia rama escrita a
mano en el cerebro, que es un guion con otro nombre. Con 51 tecnologías ya
cuesta; con la amplitud de Evolve que quiere el propietario no se puede
mantener.

---

## 2. La arquitectura a la que se llega

Cinco capas, **todas sobre el mismo puntuador**:

```
          ┌───────────────────────────────────────────────────────────┐
  estado  │ necesidades · ánimo · dieta · miedo · distancia a casa    │
          └──────────────┬────────────────────────────────────────────┘
                         ▼
  1 MOTIVOS    presión(motivo) = urgencia(estado) × sensibilidad(rasgos)
                         ▼
  2 CREENCIAS  cuánto espera ESTA persona que cada opción calme el motivo
               (aprendido haciendo, mirando, oyendo, heredado)
                         ▼
  3 ARBITRAJE  la amenaza pasa delante; la supervivencia, después; el resto
                         ▼
  4 MEDIOS     quiero X → necesito Y → consigo Y (recetas y edificios)
                         ▼
  5 GRUPO      una obra, una incursión o una mudanza se proponen, se
               defienden hablando y se hacen con quien se convence
```

La fórmula a la que tiende cada fila del puntuador:

```
puntuación(verbo) = presión(motivo) × alivio_esperado(opción) × cercanía × inercia
```

**Principio de migración: envolver, no reescribir.** Hoy cada verbo tiene un
coeficiente calibrado contra los demás (`AGENTS.md`: «Coefficients in `Brain`
are calibrated against each other»). Ninguna fase reescribe el puntuador de una
vez. Cada fase sustituye *una familia* de términos por su equivalente en
motivos, con los números elegidos para que la media de la población no se
mueva (sensibilidad 1 con el rasgo en 0,5, ver fase 2), y mide.

### Glosario (se usa así en todo el plan y en el código)

| término | significado | dónde vive |
|---|---|---|
| **motivo** (`DriveId`) | una razón para actuar: hambre, sed, descanso, calor, compañía, querencia, variedad, seguridad, pertenencia, propósito, estatus, curiosidad, posesión | `src/sim/ai/Drives.ts` (nuevo) |
| **presión** | 0-1 (puede pasar de 1 por la sensibilidad): cuánto empuja ahora un motivo | `drivePressures(person, …)` |
| **sensibilidad** | multiplicador por persona que sale de sus rasgos; 1 con el rasgo en 0,5 | `src/sim/ai/Temperament.ts` (nuevo, fase 2) |
| **ancla** | el punto al que pertenece alguien: su cuidador si es niño, su casa o su campamento si es adulto | `src/sim/ai/Anchor.ts` (nuevo, fase 2) |
| **alcance** | hasta dónde de su ancla está dispuesto a ir alguien a trabajar | `Anchor.reachOf` |
| **creencia** | lo que una persona espera de una opción («comer carne asada me quita 40 de hambre»), con su **confianza** (0-1) y su **fuente** (`instinct`, `own`, `seen`, `told`, `inherited`) | `src/sim/ai/Beliefs.ts` (nuevo, fase 6) |
| **proponente** / **partidario** | quien propone una obra, incursión o mudanza / quien se ha dejado convencer | `src/sim/social/Persuasion.ts` (nuevo, fase 11) |

### Los parámetros van a la configuración

Todos los coeficientes nuevos de este milestone viven en una sección nueva
`Config.motivation: MotivationConfig` (`src/sim/core/Config.ts`), con sus
valores por defecto en `DEFAULT_CONFIG` y un comentario por cada uno que diga
de dónde sale el número. `BrainContext` recibe `motivation`. Motivo: la fase
14 calibra contra la historia, y calibrar exige poder mover un número desde un
escenario sin tocar código. `config.test.ts` ya comprueba que la configuración
por defecto es coherente: añade los campos nuevos a lo que compruebe.

---

## 3. Reglas de trabajo para este plan

Además de las de `AGENTS.md`, que siguen mandando:

1. **Cada fase se hace en dos tipos de commit, en este orden:**
   - **commit de instrumento, bit-idéntico:** contadores de `telemetry`,
     observadores en `tools/`, el check nuevo (que tiene que **fallar** en ese
     build), tests. No cambia ni una decisión del mundo.
   - **commit de comportamiento, medido:** el cambio de verdad, medido a 20
     semillas contra el commit de instrumento.
   Así «el check detecta el fallo» y «el cambio lo arregla» son dos
   mediciones separadas, que es la disciplina que el proyecto ya sigue con la
   descomposición de la comida y con el ánimo.
2. **Cómo se demuestra que un commit es bit-idéntico.** Antes y después:
   ```bash
   npm run sim:check:all -- --verbose > artifacts/m13-<fase>-before.txt
   # … el cambio …
   npm run sim:check:all -- --verbose > artifacts/m13-<fase>-after.txt
   diff <(grep -v -E "steps/s|perf-budget" artifacts/m13-<fase>-before.txt) \
        <(grep -v -E "steps/s|perf-budget" artifacts/m13-<fase>-after.txt)
   ```
   Sin diferencias fuera de las líneas de tiempo. Un test verde **no** lo
   demuestra. Si aparecen otras líneas que sólo dependen del reloj, fíltralas
   también y di cuáles en el mensaje del commit.
3. **Cómo se mide un commit de comportamiento.**
   `npm run sim:seeds -- --scenario <s> --seeds 20` en `century`, `lean` y
   `crowded`, antes y después, guardado en `artifacts/m13-<fase>-<s>-{before,after}.txt`.
   **Declara el coste aceptable en supervivencia media antes de medir**, en el
   mensaje del commit o en el changelog. Si se supera, **para**: anótalo en
   `bugs.md` y pregunta al propietario. No subas un coeficiente hasta que el
   número salga, y no toques ritmos de necesidades (`Config.needs`) para
   compensar.
4. **Ninguna tirada nueva de RNG si se puede evitar.** Todo lo de este plan
   está diseñado para ser determinista sin tirar dados: anclas, alcances,
   creencias, persuasión. **M13 no añade ningún fork.** Si una fase acabara
   necesitando uno, va el n.º 18, detrás de `cultureRng` y antes del bloque de
   `spawnResources`, con su fila en la tabla de `AGENTS.md` en el mismo commit,
   y hay que subir en uno los forks que el plan de M14 numera (`healthRng`,
   `ecologyRng`).
5. **`Brain.score` no escribe estado.** Se ejecuta en cada fotograma para el
   personaje del jugador (`Simulation.steerPlayer` y la rama que puntúa «para
   el HUD»). Todo lo que se aprende o se acumula se escribe en
   `ActionSystem`, `consumeFood`, `SocialSystem`, `KnowledgeSystem`, el bloque
   diario de `Simulation` o en `Brain.think` (una vez por turno de pensar,
   nunca por fotograma). `Choice.ts` explica por qué.
6. **Las creencias son estado privado.** La interfaz sólo enseña las del
   personaje del jugador y las de quien `Knowledge.ts` diga que conoce de cerca
   (añade `knowsBeliefs` junto a `knowsCondition`, con la misma regla). Nada
   las enseña a un desconocido.
7. **Si el sistema se niega, para o abandona algo, la interfaz dice por qué**
   (`abandon(…, 'razón')` con su frase, el patrón de `ActionSystem.abandon` →
   `ctx.onStopped`). Cada verbo nuevo de este plan lista sus razones.
8. **Toda palabra que lee el jugador pasa por `t()`**, con el español en
   `src/i18n/es/`. `i18n.test.ts` falla si falta. Etiqueta de acción nueva:
   en `src/render/Floaters.ts` (el mapa verbo → gerundio en inglés) y su
   español en `src/i18n/es/actions.ts`.
9. **Nada declarado e inerte.** Un motivo entra en la tabla de `Drives.ts` en
   la misma fase que su primer lector; una fila de `Temperament.ts`, en la
   misma fase que el motivo que modula; un campo `answers` de tecnología, en la
   fase que lo lee. `drives.test.ts` comprueba que cada motivo declarado tiene
   al menos un lector registrado (ver fase 1).
10. **La cercanía domina el puntuador.** Un tirón suave hacia casa pierde
    siempre contra el arbusto más cercano. Donde el plan dice «filtro», es
    filtro (se descarta el candidato), no coeficiente. `Fear.homeRange` explica
    por qué con números.
11. **Mensajes de commit en español y con el prefijo del milestone**, como los
    de M12: `m13: …`. Al final de cada fase: `docs/changelog.md` (fecha y
    porqué de cada cambio), `docs/bugs.md` (lo encontrado y no arreglado),
    la fila de `docs/next-steps.md` y una línea **«Avance del AAAA-MM-DD»**
    bajo la fase en este documento.

---

# Bloque I — Medir antes de tocar

## Fase 0 — Instrumentos y línea base (bit-idéntico)

**Avance del 2026-09-25 — completada:** `CohesionWatch`, `HistoryWatch`,
`range`, y las líneas pooled HOME/HISTORY de `sim:seeds` están implementados.
Las tres cohortes de veinte semillas y `m13_baseline.md` están guardados. Los
cuatro tests de neutralidad, `typecheck` y los 541 tests pasan. `sim:check:all`
termina con los mismos 14 pares escenario/check ya observados antes; el informe
final está en `artifacts/m13-phase0-after.txt`. La discrepancia de
`DemographyWatch` queda anotada en `bugs.md` y sus cifras no se usan.

**Objetivo.** Que cada fase posterior tenga un número contra el que medirse.
Nada de esta fase cambia el mundo.

### 0a. `tools/cohesion.ts` y la línea `HOME` de `sim:seeds`

Crea `tools/cohesion.ts` con una clase `CohesionWatch` hecha **igual que**
`DemographyWatch` de `tools/demography.ts` (léela primero): se construye con
la simulación, `observe(sim)` cada 40 pasos, `finish()` devuelve un objeto, y
una función `formatCohesion` lo imprime. No tira RNG ni escribe nada en la
simulación.

Qué mide, sobre personas vivas de bandas que no sean la de los proscritos
(`band.outcast`):

- `nightNearHome`: fracción de muestras nocturnas (`sim.time.isNight`) de
  **adultos** a menos de `NIGHT_NEAR = 15` casillas de su ancla. Hasta que
  exista `Anchor.ts` (fase 2), el ancla es el campamento de su banda
  (`band.homeX/homeY`); después, `anchorOf`. **Deja escrito en el código cuál
  usa**, porque la línea base se toma con el campamento.
- `nightFar25`, `nightFar45`: fracción de muestras nocturnas a más de 25 y 45
  casillas del campamento.
- `nightSleeping`: fracción de muestras nocturnas con `action === 'sleep'`, y
  `nightResting` con `rest`.
- `nightActions`: las diez acciones más frecuentes de noche, con su fracción.
- `dayDistance`: mediana, p90 y máximo de la distancia al campamento de día.
- `childToCarer`: para niños de menos de 10 años con algún progenitor vivo,
  mediana y p90 de la distancia al progenitor vivo más cercano, y fracción a más
  de 12 y a más de 30 casillas. Después de la fase 2, además, la fracción
  dentro del radio que le toca por edad (`childRadius`, fase 2).

En `tools/seeds.ts`: instancia un `CohesionWatch` por semilla como se hace con
`DemographyWatch`, junta los resultados de todas las semillas (sumando
muestras, no promediando porcentajes) e imprime una línea `HOME` después de
`DEMOGRAPHY`.

Crea también `tools/range.ts` (`"range": "vite-node tools/range.ts --"` en
`package.json`): ejecuta un solo escenario (`--scenario`, `--steps`, `--seed`)
con `CohesionWatch` e imprime el informe completo. Es la herramienta rápida
para iterar en las fases 2 y 3. El Apéndice B tiene el script desechable con
el que se tomaron los números del §1b: parte de él.

### 0b. `tools/history.ts` y la línea `HISTORY`

`HistoryWatch`, con el mismo patrón, observa una vez al día. Mide lo que el
§«Objetivos históricos» necesita. Cada métrica, definida con precisión para
que no haya que interpretar:

- **Población por banda y día**: miembros vivos con `bandId` igual al de la
  banda. Se guarda la serie.
- **`drawdown` (caída)**: por banda, el máximo a lo largo de la partida de
  `(pico_hasta_ahora − actual) / pico_hasta_ahora`, contando sólo desde que el
  pico llega a 6 personas. Se informa p50, p90 y máximo de todas las bandas de
  todas las semillas.
- **`recovered` (recuperación)**: para cada caída de al menos el 40%, si más
  tarde la banda vuelve al 75% del pico previo a la caída antes de acabar la
  partida. Se informa `recuperadas/caídas` y la mediana de días hasta
  recuperarse. Si la partida acaba antes, la caída cuenta como «sin
  seguimiento suficiente», no como fracaso (el mismo cuidado que `DEMOGRAPHY`
  tiene con los niños censurados).
- **`bandLost` (banda extinguida)**: una banda que tuvo miembros y llega a 0.
  Se clasifica por la causa dominante entre las muertes de sus miembros en los
  30 días anteriores (usa la misma agrupación de causas que `demography.ts`:
  los golpes son `murder`): `violence`, `starvation`/`dehydration`/`exposure`,
  u `other`. Si sus últimos miembros pasaron a otra banda (adopción,
  cautividad), es `absorbed`, no una extinción.
- **`worldLost`**: todas las personas muertas al final de la semilla.
- **`selfDestroyed`**: una banda en la que las muertes causadas por miembros
  de la **misma** banda suman al menos el 50% de su pico de población. Usa
  los contadores `harm_own_band_murder` que ya existen y el registro de quién
  mató a quién que usa `Investigation.ts` (si no basta, añade un contador
  `killed_by_own_band_b<id>` en el punto donde se emite el asesinato, en el
  commit de instrumento).
- **`inBandKillRate`**: asesinatos dentro de la propia banda por 1.000
  personas-año (personas-año = suma diaria de vivos ÷ días del año).
- **`violentShare`**: fracción de las muertes de adultos cuya causa es un golpe.
- **`answered`**: `1 − blow_repeat_unanswered / blow_repeat` (los contadores
  de `the-struck-respond`).
- **`warEpisodes`**: por cada par de bandas que se han golpeado, los días con
  al menos un golpe entre ellas se agrupan en episodios (dos días de golpes
  separados por menos de 5 días sin golpes son el mismo episodio). Se informa
  el número de episodios por par y año, la mediana de su duración y
  `peaceShare`, la fracción de días desde el primer golpe sin ningún golpe
  entre ese par.
- **`fireBy`**: si alguien vivo conoce `firemaking` al final, y el día en que
  lo supo la primera persona (contador `conceived_firemaking` o, mejor, el
  primer día en que `sim.knownTech` lo contiene).
- **`adoption`**: para cada tecnología que llegó a tener al menos dos
  portadores adultos en una banda, los días desde el primer portador hasta que
  la sabe la mitad de los adultos de esa banda (o «no llegó»). Mediana.
- **`diet`**: malnutrición media (`telemetry` ya tiene `malnutrition_sum`) y la
  fracción de nutrición comida que vino de alimentos con `protein ≥ 0,3`.

`tools/seeds.ts` imprime una línea `HISTORY` con todo esto. Añade también un
test `history.test.ts`, calcado de `demography.test.ts`, que ejecute el mismo
mundo con y sin observador 500 pasos y compruebe que personas, recursos,
animales, edificios, hogares **y el estado del RNG** coinciden.

### 0c. La línea base

Con 0a y 0b en `master`, ejecuta y guarda:

```bash
npm run sim:seeds -- --scenario century --seeds 20 > artifacts/m13-base-century.txt
npm run sim:seeds -- --scenario lean    --seeds 20 > artifacts/m13-base-lean.txt
npm run sim:seeds -- --scenario crowded --seeds 20 > artifacts/m13-base-crowded.txt
```

y escribe `docs/m13_baseline.md` con las líneas `HOME` e `HISTORY` de las tres
cohortes y una frase por métrica que diga qué significa. **Es el documento
contra el que se compara todo M13.** Añádelo a `docs/README.md`.

**Puerta de la fase 0:** `sim:check:all` bit-idéntico; `history.test.ts` y el
test equivalente de cohesión en verde; `m13_baseline.md` escrito.

---

# Bloque II — Motivos

## Fase 1 — El andamiaje de los motivos (bit-idéntico)

**Avance del 2026-09-25 — completada:** `Drives.ts` concentra las cinco
presiones físicas con la misma curva cuadrática y sin sensibilidades. `Brain`
usa esos valores en sus filas existentes; `why` muestra las cinco presiones a
dos decimales. Los cuatro campos de etiqueta tienen traducción española.
`drives.test.ts`, `typecheck` y los 543 tests serializados pasan. La matriz
final conserva los mismos pares fallidos que la fase 0; no se alteró ninguna
decisión ni stream RNG.

**Objetivo.** Que exista un solo sitio donde se calcula cuánto empuja cada
motivo, y que `Brain` lo lea desde ahí, **sin cambiar ni un número**.

### Pasos

1. Crea `src/sim/ai/Drives.ts`:
   ```ts
   export type DriveId = 'hunger' | 'thirst' | 'rest' | 'warmth' | 'company';
   export interface DriveDef {
     id: DriveId;
     /** English label for the inspector; goes through t(). */
     label: string;
     /** Which Brain rows read it — kept by hand, checked by drives.test.ts. */
     readers: readonly string[];
   }
   export const DRIVES: Record<DriveId, DriveDef> = { … };
   export type DrivePressures = Record<DriveId, number>;
   export function urgencyCurve(value: number): number { … } // movida desde Brain.ts, idéntica
   export function drivePressures(person: Person): DrivePressures { … }
   ```
   `drivePressures` devuelve exactamente `urgencyCurve(person.needs.hunger)`,
   `…thirst`, `…fatigue` (como `rest`), `…cold` (como `warmth`) y
   `…company`. Nada más: **sin sensibilidades todavía** (regla 9: la tabla de
   temperamento llega con el primer motivo que la lee, en la fase 2).
2. En `Brain.ts`: borra la función local `urgencyCurve` e impórtala de
   `Drives.ts`. Al principio de `score`, calcula `const drive =
   drivePressures(person)` una vez, y sustituye:
   - `const thirst = urgencyCurve(person.needs.thirst)` → `drive.thirst`, y
     lo mismo con `hunger` y `fatigue` (→ `drive.rest`);
   - `const loneliness = urgencyCurve(person.needs.company)` → `drive.company`;
   - en `// --- Shelter and sleep ---`, `urgencyCurve(person.needs.cold)` →
     `drive.warmth`.
   Deja como están las llamadas a `urgencyCurve(lonelyNear)` (música y
   cerveza): no son la presión de nadie, son la de quien está cerca.
3. Exporta desde `Brain.ts`, junto a `lastScores`, un
   `lastDrives = new Map<number, DrivePressures>()` que `score` rellena igual
   que `lastScores` (no es estado de la simulación: es para el inspector).
4. `tools/why.ts`: imprime, junto a la tabla de puntuaciones de cada tick, las
   presiones de `lastDrives` con dos decimales.
5. `src/sim/__tests__/drives.test.ts`:
   - para una persona con necesidades conocidas, `drivePressures` coincide con
     `urgencyCurve` de cada necesidad **con `toBe`**, no con aproximación;
   - cada entrada de `DRIVES` tiene `readers.length > 0`.

**Puerta:** bit-idéntico (regla 2). **Commit:** `m13: motivos como tabla, sin
cambiar ninguna decisión`.

---

## Fase 2 — Querencia: la casa y la familia

**La primera corrección de comportamiento, y la que el propietario pidió
primero.** Motivo nuevo `home` («querencia» en la interfaz española: el apego
al sitio y a los tuyos).

### 2a. El ancla — `src/sim/ai/Anchor.ts` (nuevo)

```ts
export interface Anchor { x: number; y: number; kind: 'carer' | 'home' | 'camp'; carerId: number | null }
export function carerOf(child: Person, peopleById: ReadonlyMap<number, Person>): Person | null
export function anchorOf(person: Person, ctx: AnchorContext): Anchor | null
export function childRadius(person: Person): number
export function reachOf(person: Person, ctx: AnchorContext): number
```

`AnchorContext` lleva `peopleById`, `buildingsById`, `householdsById`, `homes`
(el mapa de campamentos que `Simulation.bandHomes()` ya construye), `time` y
`motivation`. Añade a `BrainContext` lo que le falte (`buildingsById` existe en
`Simulation`; pásalo donde se construye el contexto del cerebro, junto a
`homes: this.bandHomes()`).

- **Cuidador de un niño** (`person.isChild`): la madre si vive, está en la
  misma banda, no está cautiva (`captiveOf === null`) y está en la misma región
  (`world.sameRegion`); si no, el padre con las mismas condiciones; si no, el
  cabeza del hogar (`Household.headId`) si no es el propio niño; si no, nadie.
- **Ancla**:
  - niño con cuidador → la posición del cuidador (`kind: 'carer'`);
  - adulto (o niño sin cuidador) cuyo hogar tiene `homeBuildingId` apuntando a
    un edificio que existe, está completo, no está en ruinas y es de su banda →
    el centro de ese edificio (`'home'`);
  - si no, el campamento de su banda (`homes.get(bandId)`, `'camp'`);
  - proscritos (banda sin campamento) → `null`: sin ancla no hay querencia.
  - cautivos: su `bandId` ya es el de los captores, así que el ancla sale
    sola; **no** añadas un caso especial (la huida tiene su propia lógica en
    `// --- Escape ---`).
- **Radio de un niño por edad** (`childRadius`), en casillas, desde
  `Config.motivation.childRadius`: menos de 1 año, 2 (hasta que M14 fase 6a
  los lleve en brazos); 1-3 años, 3; 4-7, 6; 8-11, 10; 12-13, 16. Es la
  gradación que pidió el propietario: «cada vez más».

### 2b. La tabla de temperamento — `src/sim/ai/Temperament.ts` (nuevo)

Aquí nace la tabla que aprobó el propietario. **Sólo con las filas que se leen
en esta fase**; las demás llegan en la fase 10.

```ts
/** Multiplier on how strongly a drive pulls this person. 1 at every trait = 0.5. */
export function sensitivity(person: Person, drive: DriveId): number
```

Fila de esta fase, **apego** (`home`):

```
apego = clamp(1 + (loyalty − 0,5) × 0,8 − (curiosity − 0,5) × 0,6, 0,4, 1,6)
```

Con los rasgos en campana (`TRAIT_SPREAD = 0,18`), la mayoría queda entre 0,8
y 1,2. Los que andan «a su bola» son la cola: leales poco y curiosos mucho.
**Los niños tienen apego mínimo 1**: un niño no es un solitario. Es un rasgo
**derivado**, no uno nuevo, a propósito: añadir un rasgo a `TRAITS` cambia las
tiradas del constructor de `Person` y desplaza todas las semillas (ver
§«Decisiones», 1).

Todas las demás sensibilidades devuelven 1 y **no se declaran** hasta su fase.

### 2c. La presión de querencia

En `Drives.ts`, `DriveId` gana `'home'` y `drivePressures` pasa a recibir el
contexto del ancla (`drivePressures(person, anchorCtx)`; actualiza la llamada
de `Brain` y el test de la fase 1):

```
d        = distancia al ancla (0 si no hay ancla → presión 0)
r        = radio de comodidad: niño → childRadius; adulto → comfortAdult (24) / apego
noche    = 1 − daylight / 0,35, recortado a 0-1   (0 de día, 1 en plena noche)
r_noche  = niño → max(2, childRadius / 2); adulto → nightRadius (8)
lejos    = clamp((d − r) / span, 0, 1)                 span = 30
lejos_n  = clamp((d − r_noche) / spanNight, 0, 1)      spanNight = 12
presión  = urgencyCurve(100 × max(lejos, lejos_n × noche)) × sensibilidad(home)
```

De día sólo pesa quien se ha ido lejos; al caer la noche pesa estar fuera de
casa aunque sea a 15 casillas. Todos los números, en `Config.motivation`.

### 2d. El verbo `go_home`

- **`Brain.score`**, en una sección nueva `// --- Going home ---` justo antes
  de `// --- Rest ---`: si hay ancla y `d > r_noche`,
  `add('go_home', drive.home × motivation.homeWeight)` con `homeWeight = 2,4`
  (entre `drink` × 3 y `rest` × 2,4 de noche: volver a casa gana al paseo y al
  trabajo cómodo, pierde contra la sed seria). Para un niño con cuidador, el
  mismo verbo.
- **`Brain.setup`**, `case 'go_home'`: el destino es la casilla transitable
  más cercana al ancla, buscada en espiral **sin RNG** (anillos de radio 0, 1,
  2… hasta 4 con `world.isWalkable`). Para un niño con cuidador, a 1 casilla
  del cuidador. Guarda el destino en `targetX/targetY`.
- **`ActionSystem.execute`**, `case 'go_home'`: como `goto`: `travel`, y al
  llegar `finish`. Si `travel` no puede llegar, `abandon(person,
  'cannot_reach_home', ctx)` con su frase: t('could not find the way home') /
  «no encontró el camino a casa».
- **`NeedsSystem.EXERTION`**: `go_home: 1.05` (lo mismo que `walk`).
- **`Floaters.ts`**: `go_home: 'going home'` → «volviendo a casa». Para un
  niño cuyo ancla es su cuidador, la etiqueta es t('keeping close to {name}')
  → «sin separarse de {name}»; si la interfaz que la pinta no tiene el nombre
  a mano, usa t('keeping close to family') → «sin separarse de su familia».
- **No es** un `WORK_ACTIONS` (el trabajo no lo empuja) ni un `IDLE_ACTIONS`
  (la laboriosidad no lo frena). No lo metas en `CUT_OFF_AT_ONCE`.

### 2e. El alcance: el filtro que de verdad funciona

Regla 10: un tirón suave no gana a la cercanía. Por eso la querencia actúa
**también** como filtro.

```
reachOf(adulto) = min(Fear.homeRange(person), reachAdult (32) / apego)
reachOf(niño)   = childRadius + 4
reachOf(madre o padre con un hijo vivo de menos de 4 años en su banda)
                = min(reachOf(adulto), parentReach (16))
```

El padre sólo si la madre ha muerto o no está en la banda. Es lo histórico
(quien cría forrajea cerca del campamento) y es lo que pidió el propietario:
«los padres deberían estar siempre cerca del niño». Con `reachOf` en la mano:

1. Escribe en `Anchor.ts` `withinReach(person, anchor, reach, x, y)` y úsalo
   para filtrar, **alrededor del ancla y no de la persona**:
   - `Brain.findNode` (ya filtra por `homeRange` alrededor del campamento:
     sustitúyelo por `withinReach`, con cuidado de mantener el mismo filtro
     `sameRegion`);
   - los árboles de `// --- Pick fruit ---` (`edible`, `worthwhile`);
   - la presa de `// --- Hunt ---`;
   - el árbol que busca `// --- Building ---` para leña (`candidate`);
   - el objetivo de `sabotage` (**sí**: nadie se va solo a quemar una choza al
     otro lado de la isla; las incursiones son órdenes y no pasan por aquí).
2. **Excepción de supervivencia** (lo extrínseco manda): si
   `pressedByNeed(person, ctx.needs.workLimits, 'hunger')` es cierto, los
   filtros de comida (nodos de comida, fruta, caza) no se aplican. Si no hay
   agua dentro del alcance, `findWater` busca sin él. El que tiene sed seria
   bebe donde haya agua; el que tiene hambre seria busca comida donde la haya.
3. `wander` (`Brain.setup`, `case 'wander'`): el centro de la caja ya se
   mueve hacia casa con `homeward(person)` (miedo). Usa
   `pull = max(homeward(person), min(0,8, drive.home))` hacia el **ancla**. Las
   dos tiradas por intento siguen siendo las mismas, así que el número de
   tiradas no cambia, sólo dónde cae el paseo. Necesitas `drive.home` en
   `setup`: pásalo en `found` (añade `homePressure` a `FoundTargets`).

### 2f. Qué ve el jugador

- El inspector de una persona (el panel que ya enseña necesidades y ánimo):
  una fila «Querencia» con la presión, y la razón en palabras cuando pase de
  0,3: t('far from home') → «lejos de casa», t('it is getting dark') →
  «se hace de noche», t('away from {name}') → «lejos de {name}» para un niño.
  Pasa por `Knowledge.ts` como el resto del panel.
- `Autonomy.ts`: **no** añadas `go_home` a lo que hace sola la jugadora en
  autonomía `urgent`. El jugador decide adónde va su personaje; su tabla sí
  muestra el impulso.

### 2g. Tests y checks

- `anchor.test.ts`: cuidador = madre; si la madre muere, el padre; si la madre
  es cautiva, el padre; adulto con casa → centro de la casa; casa en ruinas →
  campamento; proscrito → `null`; `childRadius` crece con la edad;
  `reachOf` de una madre con un bebé ≤ `parentReach`.
- `drives.test.ts`: presión 0 dentro del radio; crece fuera; de noche es mayor
  que de día a la misma distancia; apego alto → presión mayor a igual
  distancia.
- **Checks nuevos en `tools/simcheck.ts`** (en `buildChecks`, con su medición
  dentro del bucle de `runScenario`, en el bloque que ya corre cada
  `WATCH_EVERY` pasos):
  - `nights-are-spent-at-home`: de las muestras nocturnas de adultos, la
    fracción a menos de 15 casillas de su ancla es **≥ 70%**. n/a con menos de
    200 muestras.
  - `children-keep-close`: de las muestras de niños de menos de 8 años con
    cuidador, la fracción dentro de `childRadius + 3` de al menos uno de sus
    progenitores vivos y elegibles es **≥ 75%**. La misma muestra conserva la
    distancia a la cuidadora designada como diagnóstico: la IA sigue
    prefiriendo a la madre como ancla, pero la métrica mide proximidad familiar.
    n/a con menos de 200 muestras.
  **Los dos tienen que fallar en el commit de instrumento** (la línea base del
  §1b dice que fallarán con holgura). Si alguno pasa en el build viejo, el
  check está mal: no sigas.

### 2h. Medición

**Estado, 2026-09-25: implementación entregada por indicación del
propietario, pese a que la fase no pasa la puerta de supervivencia.** Con la
excepción de hambre/sed ya corregida, `lean` a 20 semillas da 45,9% de
supervivencia frente a 65,9% en la base (-20,0 puntos), y 5/20 mundos colapsan
bajo un cuarto. El reparto observado (304 muertes por inanición de bebés, 67
de niños mayores, 176 de adultos) incluye mortalidad en los tres grupos; la
discrepancia abierta de `DemographyWatch` impide atribuir con confianza qué
radio es la causa. Por la regla 3 del plan, se detiene la fase y se consulta al
propietario, que indicó hacer commit y push de lo hecho y añadió el requisito
de inmovilizar a los bebés. En `39b3361`, `lean` dio 43,8% de supervivencia
(20 semillas), 22,1 puntos bajo la base. La lactancia urgente de la madre la
subió a 49,7% (`artifacts/m13-phase6-nursing-lean.txt`), todavía 16,2 puntos
bajo la base y por encima del coste máximo. El contador solo agrupa muertes de
menores de seis años; no permite medir por separado a menores de uno. No se
ajustan más radios sin autorización; el propietario pidió explícitamente
continuar con el plan. Por eso la fase 3 se desarrolla a continuación mientras
se conservan y reportan las regresiones de supervivencia. Véanse `docs/bugs.md`
y los artefactos de fase 2.

Coste declarado: **supervivencia media ≤ 5 puntos por debajo** de la línea
base en `century`, `lean` y `crowded` a 20 semillas. Lo esperable: menos
distancia recorrida (bueno para la sed), menos comida alcanzable (malo) y
menos sabotaje espontáneo. Si la supervivencia cae más:

1. mira `DEMOGRAPHY` y las causas: si es inanición de adultos, el alcance es
   demasiado corto → sube `reachAdult` de 4 en 4; **no quites el filtro**;
2. si es inanición infantil, mira `parentReach`;
3. si no cuadra con ninguna, para y pregunta.

Mira también la línea `HOME`: `nightNearHome` debe subir mucho y
`childToCarer` bajar. Y `ai-uses-many-actions` como distribución: `go_home`
no debería estar entre las tres acciones más frecuentes; si lo está, la gente
va y vuelve sin parar (sube `r` o baja `homeWeight`).

**Commits:** (1) `m13: medir la querencia` (instrumento, checks en rojo);
(2) `m13: la querencia, el ancla y el alcance` (comportamiento).

**Trampa conocida.** Un niño cuyo cuidador está trabajando en una obra lejana
lo sigue hasta allí. Es correcto: el niño va con la madre. Lo que no puede
pasar es que el niño se quede a medio camino oscilando; si `why` lo enseña
alternando `go_home` con otra cosa, la histéresis de `add` (×1,25) no basta:
no pongas `go_home` a competir con `wander` en el niño (quita `wander` de sus
candidatos cuando `drive.home > 0,2`).

---

## Fase 3 — El día tiene noche

**Avance, 2026-09-25:** implementados el suelo nocturno de sueño (3b), la
recuperación reducida al raso y el fallback a dormir en el campamento cuando no
hay techo accesible (3a). `sim:check` mide `nights-are-slept` contra el umbral
de 55%; la primera lectura de `century` fue 21,1% (no pasa). `lean` a 20 semillas dio
46,4% de supervivencia frente a 65,9% de base, aunque ese resultado mezcla el
sueño con la política de comida infantil y no aísla sus efectos. `children-keep-close`
marcó 70,7% en la misma ejecución de `century`, también por debajo de 75%.

**Objetivo.** Que de noche la gente duerma, en casa, con techo o sin él. Hoy
el 3-5% de las muestras nocturnas son alguien durmiendo. Recoge la fase 4a del
plan de M14 (dormir al raso), que se movió aquí.

### 3a. Dormir al raso (antes M14 4a)

- `ActionSystem.doSleep` hoy exige un edificio (`reachBuilding`). Añade una
  rama: si `person.targetBuildingId === null`, se duerme en el sitio: el
  cansancio baja `SLEEP_RECOVERY × motivation.groundSleep` (0,7) por paso, no
  hay allanamiento que anotar, y `wakeReason` se aplica igual. El frío ya lo
  cobra `NeedsSystem` (sin techo no hay refugio).
- `Brain.score`, `// --- Shelter and sleep ---`: hoy sólo se puntúa `sleep` si
  hay un techo. Si es de noche y **no** hay techo dentro del alcance, puntúa
  `sleep` al raso **sólo si la persona está a menos de `r_noche` de su ancla**:
  `drive.rest × 3,2 × motivation.groundSleepScore (0,8)`. Si está más lejos,
  lo que toca es `go_home` (fase 2), no dormir en el monte.
- `Brain.setup`, `case 'sleep'`: sin edificio, el destino es donde está.
- La crónica y el panel distinguen «durmiendo bajo techo» de «durmiendo al
  raso» (t('sleeping in the open') → «durmiendo al raso»).

### 3b. El sueño de la noche

`Drives.drivePressures`: la presión de descanso gana un suelo nocturno:

```
profundidad = clamp((0,25 − daylight) / 0,25, 0, 1)
rest        = max(urgencyCurve(fatigue), nightSleepiness (0,3) × profundidad)
```

Sólo `sleep` y `rest` leen `drive.rest`, así que el suelo no toca nada más.
Con 0,3 × 3,2 ≈ 1 en plena noche, dormir gana a casi todo el trabajo cómodo y
pierde contra un hambre o una sed serias, que es el orden correcto (lo
extrínseco manda).

### 3c. Check y medición

- `nights-are-slept`: de las muestras de adultos en plena noche
  (`daylight < 0,1`), la fracción con `sleep` o `rest` es **≥ 55%**. Tiene que
  fallar en el commit de instrumento.
- **Es el cambio económico más fuerte del milestone**: un tercio del día sin
  trabajar. Coste declarado: **supervivencia media ≤ 5 puntos**. La
  recolección nocturna ya rinde menos (`daylight` escala la recolección), así
  que parte de ese trabajo era poco productivo. Si se supera el coste: baja
  `nightSleepiness` a 0,2 o limita el suelo a `daylight < 0,15`, **en ese
  orden**, y no toques `hungerRate` ni `thirstRate`.
- Mira `sleep-restores` (hoy n/a porque nadie tiene techo) y `shelter-answers-cold`.

**Commits:** instrumento; `m13: dormir al raso`; `m13: de noche se duerme`
(dos commits de comportamiento, medidos por separado).

---

## Fase 4 — Lo que viene de fuera: la amenaza antes que el hambre

**Objetivo.** Que nadie se quede quieto ante una agresión, que los niños huyan
hacia los suyos y que los padres defiendan a sus hijos. La base ya existe
(M12 fase 2c): `assailantOf` en `social/Defence.ts`, `RESPOND`, `escapeFrom`
y el final de `score` (`// --- Words that would be cut off, and being set upon ---`),
donde quien es atacado huye o devuelve el golpe y un adulto acorralado pelea.

### 4a. El niño huye hacia su cuidador

`Brain.escapeFrom(person, from, ctx)` elige, en abanico, el punto más recto
alejándose de la amenaza. Para un niño con cuidador: entre los candidatos
válidos del abanico, elige el que **más reduce la distancia al cuidador**
(desempate: el orden actual). Sin RNG nuevo. Además, un niño que **ve** un
golpe a menos de 6 casillas (hay que leerlo del mismo sitio que `assailantOf`
mira) puntúa `go_home` (su ancla es el cuidador) a `RESPOND × 0,8`.

### 4b. Los adultos defienden a los suyos

Sección nueva en `score`, `// --- Defending kin ---`, antes del bloque final:

1. Para cada vecino `o` (ya filtrados por región) que sea **hijo propio**
   (`person.childIds`), **del mismo hogar**, o **niño de la misma banda**,
   calcula `a = assailantOf(o, …)`. Si `a` existe y no es la propia persona, es
   un candidato.
2. La respuesta:
   - si el agresor es de **la misma banda**: `restrain` (el verbo de M11 fase
     15b ya existe, y `restrainee` es su objetivo). Dentro de la banda se
     sujeta, no se mata;
   - si es de fuera: `attack` sobre el agresor, con una ruta nueva
     `attackRoute = 'defend_kin'` (añádela al tipo de rutas y a la telemetría);
   - puntuación: hijo propio → `RESPOND` (un padre defiende a su hijo aunque
     vaya a perder); mismo hogar → `RESPOND × 0,9`; niño de la banda →
     `(0,4 + aggression × 0,6 + loyalty × 0,4) × odds`, con `odds` calculado
     como en el término de autodefensa que ya existe.
   - si las probabilidades son malas y no es hijo propio: `call_for_help` (ya
     existe) en vez de atacar.
3. Si la propia persona está siendo atacada (`setUpon`), su respuesta va
   primero. Esto no cambia.
4. Telemetría: `kin_attack_seen_<child|household|band>` y
   `kin_defended_<attack|restrain|call_for_help>`.

### 4c. Checks

Instrumento en `simcheck.ts`: un `KinWatch` en el bucle. Cuando `watchConflict`
ve un golpe cuya víctima es un niño, apunta los adultos del hogar de la
víctima y sus padres que estaban a menos de `sightRadius`, no atados ni
sujetos, y el agresor. Durante los 60 pasos siguientes mira si alguno tiene
como acción `attack` o `restrain` con `targetPersonId` igual al agresor, o
`call_for_help`.

- `kin-are-defended`: de esos golpes, la fracción defendida es **≥ 60%**. n/a
  con menos de 10.
- `the-young-run-to-their-own`: de los niños atacados que eligen `flee`, la
  fracción cuya distancia al cuidador es menor 40 pasos después es **≥ 60%**.
  n/a con menos de 10.
- Endurecer `the-struck-respond` del 35% al 15% de golpes sin respuesta
  **sólo si** la medición lo sostiene a 20 semillas; si no, se deja y se anota.

Verifica que los dos checks nuevos fallan (o, si no hay golpes a niños en la
matriz, que son n/a y se leen en la cohorte: añade `KIN` a la línea `HISTORY`
con los mismos dos cocientes).

### 4d. Medición

`sim:seeds` a 20 semillas en `lean` y `century`, leyendo `VIOLENCE` y
`HISTORY`. Coste declarado: `ownBandBlows` no sube más del 10% (sujetar a un
agresor de la propia banda es un golpe más en ese contador si la sujeción
falla y se pelea: vigila).

**Commits:** instrumento; `m13: los niños huyen hacia los suyos`; `m13: los
padres defienden a sus hijos`.

---

**Avance, 2026-09-25:** implementados huida hacia el cuidador, respuesta
parental y observadores `KIN` en simcheck/cohortes. La cobertura de defensa es
n/a en los 20 `lean` seeds (0 ataques infantiles observados), así que no
demuestra aún su eficacia en mundos ordinarios. Fase 5 implementó antojos,
selección de comida, sesgo de caza/recolección y telemetría. El check falla en
`century`: 8,0% de comidas ricas en proteína durante el antojo frente a 39,9%
cuando está calmado; no se considera completada. `lean` en 20 semillas promedió
51,7% de supervivencia (3 colapsos), frente al 65,9% base. La comparación
agrupa las reglas de las fases 2-5 y no permite atribuir el coste. La matriz
también deja rojos sueño nocturno y proximidad infantil en varios escenarios.

**Avance fase 6, 2026-09-25:** creada la memoria acotada de creencias por
persona, instinto para alimentos crudos, aprendizaje tras comer e herencia con
confianza reducida. La expectativa influye en la elección de qué comer. También
se registran rendimiento nutricional por tick de recolección, pesca, fruta y
caza, incluida la caminata y los intentos sin fruto; tradición modula cuánto
aprende cada cual. Quien ve a otro trabajando puede adquirir esa expectativa
como `seen`, y quien presencia una comida puede aprender su expectativa de
comida. Faltan la comparación con instintos de rendimiento al escoger acciones,
la transmisión mediante conversación y mostrar evidencia al jugador; la fase
sigue abierta.
En la nueva cohorte `lean` de 20 semillas el resultado acumulado quedó en
50,6% de supervivencia (4 colapsos), frente a 65,9% base; el coste supera el
límite declarado y requiere revisión antes de calibrar la fase. La cohorte con
aprendizaje observado también dio 50,6% al redondeo, sin coste adicional de
supervivencia detectable en esta lectura.

## Fase 5 — El antojo: variedad en la dieta

**Objetivo.** «Me he llenado de bayas pero no me satisface.» La malnutrición
existe (`Macros.malnutrition`, `macroBalance` frente a `macroTarget`); falta
que alguien la **sienta** y actúe. Sin sensibilidad por personalidad (§0,
punto 4).

### Pasos

1. `core/Macros.ts`:
   ```ts
   /** 0-1 per macro: how far below target this person has been eating it. */
   export function cravings(person: Person): { fat: number; protein: number; carb: number }
   // craving[m] = clamp((macroTarget[m] − macroBalance[m]) / motivation.craveSpan, 0, 1), craveSpan = 0,12
   /** How good this food looks to this person right now. */
   export function appealOf(person: Person, itemId: string, varietyWeight: number): number
   // nutrition × (1 + varietyWeight × Σ_m craving[m] × macros[m]),  varietyWeight = 0,6
   export function bestFoodFor(person: Person, varietyWeight: number): string | null
   ```
   `bestFoodFor` recorre el inventario en el mismo orden que
   `Inventory.bestFood` y elige el de mayor `appealOf`; en empate, el primero
   (determinista).
2. `Drives.ts`: motivo `variety`, presión = `urgencyCurve(100 × max(cravings))`.
3. Lectores (en la misma fase):
   - `ActionSystem.doEat`: `bestFoodFor` en lugar de `inventory.bestFood()`.
     `Brain` sigue usando `bestFood()` sólo para saber si lleva comida.
   - `// --- Hunt ---`: `payoff = quarry.def.meat / 20 × (1 + varietyWeight ×
     (craving.protein × 0,55 + craving.fat × 0,45))`. Las fracciones son las de
     `ITEMS.meat.macros`: léelas de ahí, no las copies.
   - `Brain.nodeWorth` y `fruitWorth`: multiplica por `appealOf / nutrition` del
     alimento que da el nodo o el árbol (así el pescado sube con el antojo de
     proteína y la fruta baja).
4. `DRIVES.variety.readers`: `['eat', 'hunt', 'forage', 'pick']`.

**Trampa conocida** (M11 fase 10, `dairying`): cuando `bestFood` elegía por
nutrición, la leche no se comía nunca. Cambiar el criterio de elección cambia
qué se come: compara los contadores `eaten_<item>` antes y después.

### Check y medición

- Instrumento: en `consumeFood`, contadores `eat_craving_protein` (si
  `craving.protein > 0,5`) y `eat_craving_protein_rich` (si además lo comido
  tiene `macros.protein ≥ 0,3`), y los mismos con `eat_calm_…` para
  `craving.protein < 0,1`.
- `cravings-steer-the-diet`: la fracción de comidas ricas en proteína entre
  quienes la ansían es **al menos 1,3 veces** la de quienes no. Tiene que
  fallar en el build de instrumento (si no falla, es que la disponibilidad ya
  explica la diferencia: el check no vale, bórralo y dilo).
- Medición a 20 semillas en `century`, `lean` y `hunters`. Coste declarado:
  supervivencia ≤ 3 puntos. Esperado: `diet` (malnutrición media) baja.

**Commits:** instrumento; `m13: el antojo`.

---

# Bloque III — Creencias

## Fase 6 — Lo que uno espera de cada cosa

**La pieza clave del milestone.** Cada persona guarda lo que espera de cada
opción, lo aprende de lo que le pasa y elige según eso.

### 6a. `src/sim/ai/Beliefs.ts` (nuevo)

```ts
export type BeliefSource = 'instinct' | 'own' | 'seen' | 'told' | 'inherited';
export interface Belief { value: number; confidence: number; source: BeliefSource; tick: number }
export class Beliefs {
  static readonly MAX = 48;
  get(key: string): Belief | undefined;
  /** What this person expects, falling back to instinct, then to the unknown. */
  expect(key: string): { value: number; confidence: number };
  /** Moves a belief toward something observed. Deterministic. */
  learn(key: string, observed: number, alpha: number, source: BeliefSource, tick: number): void;
  entries(): IterableIterator<[string, Belief]>;
  /** A copy for a newborn, confidence scaled down. */
  inherit(scale: number): Beliefs;
}
```

- `learn`: `value += (observed − value) × alpha`; `confidence = min(1,
  confidence + alpha × (1 − confidence))`; si la clave no existía, `value =
  observed` y `confidence = alpha`. Si hay más de `MAX` claves, se descarta la
  de menor `confidence` (en empate, la más antigua por `tick`). Nada de RNG.
- **Claves** (cadenas, cerradas en una lista exportada `BELIEF_KEYS` más los
  prefijos): `eat:<itemId>` (hambre quitada por unidad comida), `yield:forage`,
  `yield:fish`, `yield:pick`, `yield:hunt` (nutrición conseguida por cada 100
  pasos de acción, **incluido el camino**), `warm:<buildingId>` (frío quitado
  por cada 100 pasos dentro). Nada más en esta fase.
- **Instinto** (`INSTINCT`): para los alimentos crudos que cualquiera conoce
  (`berries`, `apple`, `pear`, `plum`, `hazelnut`, `meat`, `fish`, `milk`),
  `eat:<id>` = su `ITEMS.nutrition`, confianza 0,5. Para `yield:*`, la media
  medida en la línea base: **en el commit de instrumento de esta fase** añade
  telemetría de rendimiento observado por clave (ver 6b) y copia las medias de
  `century` y `lean` a `INSTINCT` con un comentario que diga de qué cohorte
  salen.
- **Lo desconocido**: un alimento sin creencia ni instinto (lo que se fabrica:
  `meal`, y en la fase 8 `roast_meat`) se espera como **su ingrediente más
  valorado** si sale de una receta (`RECIPES` con ese `output`), o como
  `motivation.unknownFood` (10) si no. Es «parece carne»; no es la verdad.
- `Person` gana `beliefs = new Beliefs()` (sin RNG en el constructor),
  `actionTicks = 0` y `yieldKey: string | null`, `yieldNutrition = 0`.

### 6b. Aprender de lo propio

- `ActionSystem.execute`: `person.actionTicks++` en cada paso en que la acción
  no es `idle`, antes del `switch`.
- Donde la comida entra en la mochila (`doHarvest` para nodos de comida y de
  pesca, `doPickFruit`, `doHunt` al cobrar la pieza): `person.yieldKey =
  'yield:forage' | 'yield:fish' | 'yield:pick' | 'yield:hunt'` y
  `person.yieldNutrition += ITEMS[id].nutrition × cantidad`.
- `ActionSystem.finish` (el embudo por el que acaba todo, también `abandon`):
  si `person.yieldKey` no es null y `actionTicks ≥ 20`, `beliefs.learn(key,
  yieldNutrition / actionTicks × 100, alphaOwn(person), 'own', tick)` y
  resetea los tres campos. **Un intento abandonado sin nada también enseña**
  (rendimiento 0): la caza fallida es información. `finish` no recibe
  `ctx`, así que el `tick` sale de un campo que `execute` actualice
  (`person.lastTick`), o se cambia la firma de `finish` con cuidado: es
  decisión tuya, pero dila en el commit.
- `Macros.consumeFood`: `beliefs.learn('eat:' + itemId, eaten, alphaOwn, 'own', tick)`.
  `consumeFood` no tiene tick: añade el parámetro y pásalo desde sus dos
  llamadores (`doEat` y `Simulation.eatItem`).
- `alphaOwn(person) = motivation.alphaOwn (0,3) × (1,5 − tradition)`: quien se
  aferra a lo de siempre aprende más despacio de lo que le pasa.
- Telemetría del instrumento: `yield_obs_<key>_sum` y `_n` en `finish`.

### 6c. Elegir según lo que se espera (el lector de esta misma fase)

```ts
/** How much better or worse than instinct this person expects `key` to be, with a pull toward the untried. */
export function expectationRatio(person: Person, key: string, cfg: MotivationConfig): number
// clamp(expect.value / instinct(key), 0,5, 2) + curiosity × cfg.novelty (0,15) × (1 − expect.confidence)
```

- `// --- Forage / hunt ---`: multiplica la puntuación de `forage` por
  `expectationRatio(person, nodo de pesca ? 'yield:fish' : 'yield:forage')`.
- `// --- Pick fruit ---` (`pickScore`): por `expectationRatio(…, 'yield:pick')`.
- `// --- Hunt ---`: por `expectationRatio(…, 'yield:hunt')`.
- `Macros.bestFoodFor`: la nutrición que entra en `appealOf` es
  `beliefs.expect('eat:' + id).value`, **no** `ITEMS[id].nutrition`: se elige
  por lo que se cree, y se sacia por lo que es.

Con creencias iguales al instinto el cociente es exactamente 1 (se multiplica
por 1 en coma flotante sin error), así que el mundo sólo se aparta del de
antes a medida que la gente aprende. Aun así, **no es un commit
bit-idéntico**: las creencias se aprenden desde el primer paso.

### 6d. Qué ve el jugador

Pestaña o sección «Lo que sabe por experiencia» en el panel de su personaje:
las creencias con más confianza, en frases (t('meat fills about {n}') →
«la carne llena unos {n}»; t('hunting pays about {n} a day') …; t('learnt it
themselves') / t('saw it') / t('was told') / t('grew up knowing it')). Para
otros, sólo si `Knowledge.knowsBeliefs` (regla 6).

### 6e. Tests y medición

- `beliefs.test.ts`: `learn` converge al valor observado; un `alpha` mayor
  converge antes; el tope de 48 descarta la de menor confianza; `expect` de un
  alimento fabricado desconocido es el de su ingrediente más valorado;
  `expectationRatio` es 1 con creencias de instinto y confianza 1; el de un
  tradicional aprende más despacio que el de uno que no lo es.
- Medición a 20 semillas en `century`, `lean`, `hunters` y `fishers`. Coste
  declarado: supervivencia ≤ 3 puntos. Lo que se espera ver en `why` y en la
  telemetría: que el buen cazador espera más de la caza que el malo, y caza
  más (**especialización que nadie ha programado**). Informa en el changelog
  la dispersión de `yield:hunt` entre adultos al final de `century`.
- No hay check de comportamiento todavía: el que importa llega en la fase 8,
  cuando haya algo nuevo que aprender a preferir.

**Commits:** instrumento (telemetría de rendimiento; `INSTINCT` todavía sin
lector no se añade aquí); `m13: creencias aprendidas de lo propio`.

---

## Fase 7 — Creencias que viajan: visto, contado, heredado

**Objetivo.** La regla del propietario: nadie sabe nada salvo que lo haya
visto o se lo hayan contado. Aplicada a «qué merece la pena».

### 7a. Visto

En `ActionSystem.doEat` (tiene `ctx`), después de `consumeFood`: cada persona
viva a menos de `motivation.seeRange` (6) casillas, que no sea quien come,
aprende `eat:<item>` con `alphaSeen = 0,1 × (1,5 − tradition)`, y la mitad si
su opinión de quien come es negativa (`relationships.opinion(obs, eater) < 0`).
Fuente `seen`. Una consulta a `peopleHash` por comida: es barato.

### 7b. Contado

`SocialSystem.converse(a, b, tick, peopleById, mode)`: en los modos `chat` e
`interests` cada lado cuenta **una** creencia; en `deep`, dos; en `greet`,
ninguna (como las historias). La que se cuenta es la de mayor
`confidence × |value − listener.expect(key).value|`: lo que más sorprendería al
otro. El oyente aprende con

```
confianza_en_quien_habla = clamp((opinion(oyente → hablante) + 50) / 100, 0, 1)
alphaTold = 0,25 × confianza_en_quien_habla × (1,5 − tradition_oyente) × confidence_del_hablante
```

fuente `told`. Contador `belief_told`. Nada de RNG: la elección es un máximo.

### 7c. Heredado

`Simulation.registerBirth(child, mother, father)`: `child.beliefs =
mother.beliefs.inherit(0,6)` (si la madre ha muerto en el parto, la del padre;
si no hay ninguno, vacío). Fuente `inherited`. Es la cultura: un pueblo que
pesca cría hijos que esperan algo del pescado.

### 7d. El valor de una tecnología que no se tiene

```ts
/** What this person believes knowing `tech` would be worth to them. */
export function techAppeal(person: Person, tech: Tech): number
```

Para cada receta de `RECIPES` con `recipe.tech === tech` cuyo producto se come:
`max(0, expect('eat:'+producto) − expect('eat:'+ingrediente principal))` × las
unidades que la persona suele comer al día (usa 3). Para cada edificio con
`requiresTech === tech` y `shelter > 0`: `expect('warm:'+id)`. Se suma.

Lectores, en esta fase:
- el puntuador de `ask` (pedir que te enseñen, en `// --- Social ---`; busca
  `mentor`): multiplica por `1 + techAppeal(person, tech que el mentor sabe y
  la persona no)` y, al elegir mentor, prefiere al que sabe la técnica más
  valorada;
- `teach` (quien enseña elige qué): enseña primero lo que **él** más valora
  (`techAppeal` evaluado con sus creencias sobre lo que el alumno no sabe).
  Busca en `ActionSystem.doTeach` cómo se elige hoy la técnica y cámbialo ahí.

Al **aprender** una técnica (`KnowledgeSystem.receive` y la prueba superada de
un prototipo), el que la aprende recibe las creencias de sus productos que
tenga quien se la enseña (fuente `told`), o, si la ha inventado él, la de su
primera prueba (`own`). Así nadie sabe hacer fuego sin saber que calienta.

### 7e. Checks y medición

- `word-travels` (check, n/a si hay menos de 20 adultos): al final, la
  fracción de adultos con al menos una creencia de fuente `seen`, `told` o
  `inherited` es **≥ 50%**. Es débil a propósito: sólo dice que el canal
  funciona. El que importa es el de la fase 8.
- Test en `beliefs.test.ts` con una `Simulation` pequeña: una creencia
  sembrada en una persona llega a la mayoría de su banda en N días de charla.
- Medición a 20 semillas. Coste declarado: supervivencia ≤ 3 puntos.

**Commits:** instrumento; `m13: lo que se ve comer`; `m13: lo que se cuenta
y lo que se hereda`; `m13: pedir que te enseñen lo que vale la pena`.

---

## Fase 8 — La hoguera y el asado (antes M14 8a y 8b)

**El caso de prueba del propietario**: que la carne asada se prefiera porque
alguien la probó y se corrió la voz, no por un coeficiente. Las fases 6 y 7
hacen posible esto; esta fase pone algo nuevo que aprender a preferir.

### 8a. La hoguera

- `BUILDINGS.hearth` (añádelo **al final** de la tabla): `requiresTech:
  'firemaking'`, materiales `sticks: 4, flint: 2`, `workTicks` pequeño (60),
  1×1, sin almacén.
- Calor: en `NeedsSystem.update`, además de `shelterAt`, una hoguera completa
  a menos de `motivation.hearthRadius` (3) casillas da un refugio parcial
  `hearthWarmth` (0,35), que se combina con el techo por `max`.
- Es **estación** de cocina (el mecanismo 4 de M8: `recipe.station`).
- Quien está junto a una hoguera con frío aprende `warm:hearth` (en
  `ActionSystem`, al acabar `shelter`, `rest` o `sleep` cerca de ella), y los
  que lo ven, igual que en 7a.
- `BandSystem.planBuildings`: una banda planea una hoguera cerca del
  campamento **cuando algún miembro tiene `expect('warm:hearth').value` por
  encima de `motivation.hearthPlanAt`**, no por saber `firemaking`. Hasta la
  fase 11 sigue siendo la banda quien planea; allí pasa a ser una propuesta.
- i18n: nombre y descripción en `src/i18n/es/data.ts`.

### 8b. El asado

- `ITEMS.roast_meat` (nutrición 40, macros de `meat`, `spoilTicks` 2400) y
  `ITEMS.roast_fish` (24, macros de `fish`), al final de la tabla.
- `RECIPES.roast_meat` y `RECIPES.roast_fish`: `tech: 'cooking'`, `station:
  'hearth'`, un crudo → un asado, pocos pasos.
- **`cooking` deja de multiplicar toda la comida.** `nutritionFactor` pasa a
  aplicarse sólo a los asados (su nivel de refinamiento sigue contando). Es un
  cambio del efecto de un nodo: actualiza `TECH_EFFECTS` y su descripción, y
  `tech.test.ts` seguirá exigiendo que el nodo tenga efecto.
- **Quién asa**: sección nueva en `// --- Craft ---` (o junto a `eat`): quien
  sabe `cooking`, lleva carne o pescado crudos, tiene una hoguera de su banda
  dentro del alcance y no está apretado por una necesidad puntúa `craft` con
  la receta de asar:
  ```
  ganancia = expect('eat:roast_meat') − expect('eat:meat')    (por unidad)
  puntuación = clamp(ganancia / 10, 0, 1,5) × min(crudos, 4) / 4 × cercanía(hoguera)
  ```
  Si la persona nunca ha comido asado ni se lo han contado, `expect` le da el
  valor de la carne cruda (fase 6a) y la ganancia es 0: **no asa hasta que lo
  prueba o se lo cuentan**. El inventor lo prueba en su prototipo; quien
  aprende de él, lo oye (7d). Esa es toda la gracia.
- `bestFoodFor` ya elige lo asado si se cree mejor. Verifica con un script
  desechable antes del commit, como se hizo con `kiln_pot`, que con las
  creencias maduras lo asado se come antes que lo crudo.

### 8c. Escenario nuevo `hearths`

En `tools/simcheck.ts`, `SCENARIOS.hearths`: 2 bandas de 12, 16.000 pasos,
`startingTech: ['firemaking']` y **un solo fundador por banda que sabe
`cooking`**. Para eso añade a `PopulationConfig` un campo
`startingTechFew?: { tech: string; perBand: number }[]` que da la técnica a
los N primeros fundadores de cada banda por id (determinista, sin tirada), y
léelo en el constructor de `Simulation`, justo donde ya se aplican
`startingTech` y `startingTechByBand` (busca `startingTechByBand?.[b]`).

### 8d. Checks

- `the-hearth-warms`: con hoguera y frío, la fracción de muestras frías cerca
  de una hoguera que ven su frío bajar. n/a sin hogueras.
- `roast-wins`: de la carne y el pescado comidos por quien sabe `cooking`, la
  fracción asada es **≥ 60%**. En el build de antes no hay asado: falla.
- `cooking-spreads`: en `hearths`, los adultos que saben `cooking` al final son
  **al menos el triple** que al principio (2 → 6 o más).

### 8e. Medición

`sim:seeds` a 20 semillas en `hearths`, `craft` (empieza con `firemaking`) y
`century`. Coste declarado: supervivencia ≤ 3 puntos en `century` y
`craft`. `HISTORY.adoption` de `cooking` en `hearths` es el número que se
enseña al propietario: cuántos días tarda la mitad de una banda en cocinar.

**Commits:** instrumento; `m13: la hoguera`; `m13: el asado y lo que
cooking deja de hacer`; `m13: el escenario hearths`.

---

## Fase 9 — Descubrir por necesidad

**Objetivo.** Que la necesidad también invente. Hoy pensar exige estar
cómodo (`comfortNow > 0.45` en `// --- Research ---`) y las chispas leen las
necesidades inmediatas (`KnowledgeSystem.notice`, `FELT_AT = 30`). En
`century` nadie hace fuego en dos años.

### 9a. La memoria de lo que falta

`Person.chronic: Partial<Record<DriveId, number>>`, una media móvil de cada
presión. Se actualiza en `Simulation.step`, en el bucle por persona, cada
`thinkInterval` pasos para **todos** los vivos (también el jugador), con
`chronic[d] += (presión − chronic[d]) × motivation.chronicRate (0,02)`. Usa
`drivePressures`, la misma función que el cerebro. Sin RNG.

### 9b. Una chispa nueva: echar algo en falta

- `knowledge/Synthesis.ts`: ingrediente `{ kind: 'wanting', drive: DriveId }`,
  satisfecho si `chronic[drive] ≥ motivation.wantAt (0,3)`. `Notice` gana
  `wanting: ReadonlySet<DriveId>`, que rellena `KnowledgeSystem.notice`.
- Rutas nuevas, **cada una con su historia en inglés y en español**, añadidas
  al final de la lista de chispas de su técnica (no reordenes las existentes:
  `sparks-are-various` cuenta por índice):
  - `firemaking`: `wanting warmth` + `holding flint` (0,8), «tiritaba noche
    tras noche con una piedra en la mano»;
  - `tracking`: `wanting variety` + `doing hunt` (0,6);
  - `fishing`: `wanting variety` + `place beach` (0,6);
  - `cordage` o `basketry`: `wanting home`… **sólo** si encuentras una
    relación real; si no, no la inventes.
  Revisa las técnicas cuyo efecto calma un motivo y dales una ruta `wanting`
  sólo donde la historia se sostenga. Menos es mejor que forzado.

### 9c. `answers`: qué calma cada técnica

`TechDef.answers?: DriveId[]`, **sólo en las técnicas cuyo efecto
realmente lo hace** (`firemaking` → `warmth`; `cooking` → `hunger`,
`variety`; `clothing` → `warmth`; `fishing`, `tracking`, `snares` →
`hunger`, `variety`; `well` → `thirst`; `flute` → `company`…). Test en
`tech.test.ts`: toda técnica con `answers` tiene un efecto registrado en
`TECH_EFFECTS` que toque ese motivo (léelo de su descripción de efecto; si no
se puede comprobar automáticamente, una lista mantenida a mano en el test).
Lectores, en esta fase:

- `Brain.workableIdea`: entre las ideas en curso, elige la que responde al
  motivo crónico más alto (desempate: el orden actual).
- `// --- Research ---`: `ponder` y `discuss` se permiten con
  `comfortNow > motivation.needComfort (0,3)` **si** la idea responde a un
  motivo crónico por encima de `wantAt`, y su puntuación se multiplica por
  `1 + chronic[motivo]`. Sigue sin pensar quien tiene hambre de verdad.

### 9d. Checks y medición

- `fire-is-found` (en la cohorte, línea `HISTORY.fireBy`): fracción de
  semillas de `century` en las que alguien sabe `firemaking` al final.
  Recomendación: **≥ 50%**, decisión del propietario (§«Decisiones», 4).
- `discovery-is-situated` sigue en verde (toda idea llega por una ruta con
  nombre).
- `ideas-are-conceived` no puede pasar de su techo de tres ideas por
  persona-año: si lo pasa, baja los pesos de las rutas nuevas, no
  `conceptionBase`.
- Medición a 20 semillas en `century` y `lean`: `known` y `pastRoots` de
  `sim:seeds` no pueden bajar; supervivencia ≤ 3 puntos.

**Commits:** instrumento (sólo la línea `fireBy` y los contadores por ruta
`wanting`; **no** escribas `chronic` ni el ingrediente sin sus lectores, por la
regla 9); `m13: la necesidad también inventa` (`chronic`, `wanting`,
`answers` y sus lectores juntos).

---

# Bloque IV — El alma y el grupo

## Fase 10 — Los motivos que no son del cuerpo

Recoge las fases 4b y 4d del plan de M14 (los escritores y lectores del
ánimo). Seis motivos, **uno por subfase, uno por commit medido**. En cada
uno: quién escribe su estado, cómo se calcula la presión, su fila de
sensibilidad en `Temperament.ts`, qué verbos lo leen, y **qué coeficientes de
rasgo del Apéndice A se sustituyen**.

Regla de la sensibilidad para todas las filas: vale 1 con los rasgos en 0,5 y
se recorta a [0,6; 1,4], salvo que la subfase diga otra cosa. Así la media de
la población no se mueve y los extremos quedan en la cola, como pide la memoria
del proyecto sobre el temperamento en campana.

Método para migrar un coeficiente (sirve para todas las subfases):
1. localiza la expresión en el Apéndice A;
2. sustitúyela por `presión × sensibilidad`, escogiendo el factor de escala
   para que, **con el rasgo en 0,5 y la presión típica** (léela con `why` en
   `century`), el valor salga igual que antes;
3. mide la distribución de `ai-uses-many-actions`, no sólo el aprobado.

- **10a. Seguridad** (`safety`). Estado: `Fear.fearOf(person)` y
  `mood.security` (ya escrito por M11 fase 14). Presión = `max(fear,
  −security/100)`. Sensibilidad: `1,4 − aggression × 0,8`. Lectores: `flee`
  (sustituye `(1.4 - person.traits.aggression)` en `// --- Flee ---`), la
  presión de `home` (se suma: con miedo se vuelve a casa antes), y el
  alcance (ya lo hace `homeRange`).
- **10b. Pertenencia** (`belonging`). Escritores (antes M14 4b): dormir bajo
  el techo del propio hogar (`shareTheHearth`) y hablar con parientes suman
  `mood.belonging`; pasar la noche lejos del ancla lo resta. Presión =
  `clamp(−belonging/60, 0, 1)` combinada con `company`. Sensibilidad:
  `0,6 + loyalty × 0,8`. Lectores: `talk` hacia parientes, `go_home` al
  atardecer, `play`, `toast`, la flauta (antes M14 4d). Sustituye los términos
  de `loyalty` de `bond` y de la elección de compañía.
- **10c. Propósito** (`purpose`). Escritor: `person.noticed` (trabajo que
  acaba frente a trabajo interrumpido), como proponía `m9_6_plan.md`.
  Lectores: los `WORK_ACTIONS`, sustituyendo `drive` e `idle` de `Brain.score`
  (`0.8 + industriousness × 0.4`) por `presión(purpose) × sensibilidad`,
  sensibilidad `0,8 + industriousness × 0,4` (la misma banda estrecha, por la
  razón que da su comentario).
- **10d. Estatus** (`status`, nuevo). Estado: renombre del hogar frente a la
  media de la banda (`averageRenown` en `Household.ts`) más los hechos propios
  recientes. Presión alta cuando se está por debajo. Sensibilidad («ambición»):
  `1 + (greed − 0,5) × 0,6 + (aggression − 0,5) × 0,4 − (tradition − 0,5) × 0,3`.
  Lectores: `gift`, `praise`, `spar`, y en las fases 11 y 12, proponer obras e
  incursiones.
- **10e. Curiosidad** (`curiosity`). Estado: días desde la última vez que
  aprendió o probó algo nuevo (una creencia nueva, una técnica, una idea).
  Sensibilidad: `0,5 + curiosity × 1,0`, recortada a [0,5; 1,5] (aquí la
  curiosidad es justo lo que separa a unos de otros). Lectores: `reflect`,
  `ponder`, la novedad de `expectationRatio` (sustituye allí `curiosity`) y el
  alcance (los curiosos van algo más lejos: ya está en el apego). Sustituye
  los términos de `curiosity` de `// --- Research ---` y de `gather`.
- **10f. Posesión** (`possession`). Estado: lo que lleva y guarda su hogar
  frente a lo que come en una semana. Sensibilidad: `0,6 + greed × 0,8`.
  Lectores: los términos de acopio (`stockpileWish` en `forage`, `pick`, el
  `HOARD_PULL` de `store`). Sustituye los términos de `greed` de esos verbos.

**Lo que no se toca en esta fase**: los términos de `malice` y `aggression` de
la violencia, el robo, el sabotaje y la predación. Están calibrados contra la
paz interna de M12 (la regla de «uno de cada cien»). Se revisan en la fase 12
y sólo con la línea `VIOLENCE` delante.

Check nuevo, `moods-move-choices`: la fracción de `talk` en quien tiene
`mood.belonging` bajo (tercil inferior) es mayor que en quien lo tiene alto.
Tiene que fallar en el build de instrumento.

**Commits:** uno de instrumento y uno por subfase, medidos. Si una subfase
cuesta más de 3 puntos de supervivencia, para en esa subfase.

---

## Fase 11 — Obras por persuasión (`notes4.txt`)

**Objetivo.** Nadie empieza a construir porque la banda lo haya decidido en
abstracto. Alguien propone, convence o manda, y trabajan quienes se han
convencido o a quienes se ha mandado.

### 11a. Proponente y partidarios

- `Building` gana `sponsorId: number | null` y `backers: number[]`.
- `BandSystem.planBuildings` sigue decidiendo **qué** hace falta (hasta que la
  fase 14 decida si también eso debe salir de las creencias), pero ya no pone
  a trabajar a nadie: nombra **proponente** al miembro adulto que más lo
  quiere. Para un refugio, el de mayor presión de `warmth` + `home`; para un
  almacén, `possession`; para una hoguera, `warmth` × `expect('warm:hearth')`;
  en empate, el jefe; si no, el primero por id.
- Las obras que coloca el jugador tienen `sponsorId = jugador`.
- `Brain`, `// --- Building ---`: sólo puntúan `build`, `haul`, `chop` para
  la obra y `gather_for_site` quienes sean su proponente, sus partidarios o
  estén bajo una orden sobre ella. Es un filtro (regla 10).

### 11b. Convencer — `src/sim/social/Persuasion.ts` (nuevo)

```ts
export function support(listener: Person, sponsor: Person, site: Building, ctx: PersuasionContext): number
```

```
apoyo = opinión(oyente → proponente) / 100 × 0,5
      + bond(oyente, proponente)                  (ya existe en Brain: extráelo a un helper compartido)
      + autoridad del proponente sobre el oyente   (Authority.ts, la misma que pesa una orden)
      + presión del motivo que la obra calma × expect(la obra)   (el oyente también tiene frío)
      + loyalty × 0,2
      − coste (workTicks / 1000)
```

Verbo nuevo `propose` (social, con `socialCooldownUntil` como `talk`): el
proponente de una obra con menos de `motivation.backersWanted` (3)
partidarios lo puntúa hacia los miembros de su banda cercanos que no lo son
todavía, con `drive.status` y la presión del motivo que calma la obra.
`ActionSystem.doPropose`: al acabar la conversación, si `support ≥
motivation.persuadeAt (0,5)`, el oyente pasa a `backers`. **Sin RNG**. Ambos
casos dejan una frase visible (floater y crónica):
t('{name} agreed to help with the {building}') → «{name} aceptó ayudar con {building}»;
t('{name} was not convinced about the {building}') → «a {name} no le convenció {building}».

### 11c. El jugador

- Menú radial sobre un miembro de la banda: «Pedir ayuda con…» (lista de sus
  obras en curso) → `propose` con la misma fórmula. Rechazo con su razón.
- Ordenar sigue funcionando como hoy (`Simulation.command`, `ORDER_COST`).
- Nadie de la banda empieza una obra del jugador por su cuenta.

### 11d. El jefe

`BandSystem.directWork` sigue mandando gente a las obras, pero **sólo a las
obras de las que el jefe es proponente o partidario**: el jefe manda en lo que
quiere, no en todo.

### 11e. Checks y medición

- `building-starts-small`: en los 200 primeros pasos de cada obra, el número
  de personas distintas que trabajan en ella es **≤ 1 + partidarios + a
  quienes se mandó**. En el build de antes falla (acuden todos).
- `projects-find-backers`: al menos el 70% de las obras terminadas tuvieron
  un partidario.
- `bands-decide-to-build`, `shelter-answers-cold` y `bands-dont-overbuild`
  siguen en verde. Mira las muertes por frío (`exposure`) en `DEMOGRAPHY`.
  Coste declarado: supervivencia ≤ 3 puntos. Si las chozas no se acaban antes
  del invierno, baja `persuadeAt` antes que nada.

**Commits:** instrumento; `m13: las obras tienen quien las propone`;
`m13: convencer para construir`; `m13: pedir ayuda desde el menú`.

---

## Fase 12 — Incursiones por propuesta, y guerras que empiezan y acaban

**Objetivo.** Que la guerra salga de las ganas de alguien y de cuántos se
convencen, y que acabe por agotamiento, no porque una regla lo diga.

- **12a. El instigador.** `BandSystem.considerRaid` hoy lo decide el jefe con
  la posición entre bandas (`RAID_HOSTILITY`) y convoca con `warParty`. Pasa a
  necesitar un **instigador**: un adulto cuyo «ánimo de incursión» supera
  `motivation.raidUrge`:
  ```
  ánimo = hostilidad hacia esa banda (bandHostility)
        + hambre del hogar × lo que cree que guardan (BandMaps: la incursión por necesidad ya lo lee)
        + presión de estatus × sensibilidad de ambición
        − presión de seguridad (miedo)
  ```
  El instigador propone al jefe con `propose` (tema: incursión). El jefe la
  aprueba si su propio ánimo más la autoridad del instigador supera el
  umbral; entonces convoca como hoy. Si no la aprueba, el instigador puede ir
  con quienes haya convencido él (fórmula de 11b), sin la autoridad del jefe:
  una partida más pequeña y una falta que el jefe puede juzgar (M12 fase 2b).
- **12b. El cansancio de la guerra.** Cada muerto o herido propio en una
  incursión o defensa sube la seguridad (miedo) de quienes lo vieron o lo
  supieron (ya circula por `Memory`), y eso resta del ánimo de incursión y
  suma a `parley` y `make_peace` (verbos que ya existen). Así una guerra
  cara acaba sola.
- **12c. El sabotaje suelto.** Con el alcance de la fase 2 el sabotaje
  espontáneo lejano ya debería haber bajado. Mide `sabotage` en `century`
  antes y después de esta fase; si sigue por encima de `chop`, el término
  (`// --- Sabotage ---`) necesita una razón además del rencor (seguridad o
  estatus) y se cambia aquí, con `VIOLENCE` delante.
- **Checks**: los de la cohorte, en `HISTORY`: `warEpisodes`, `peaceShare`,
  `violentShare`, `answered`, `bandLost` por violencia. Los umbrales son de
  la fase 14 y del propietario; aquí sólo se exige que la guerra sea por
  episodios: `peaceShare ≥ 50%` en `lean` a 20 semillas.

**Commits:** instrumento; `m13: incursiones con instigador`; `m13: el
cansancio de la guerra`; y, si hace falta, `m13: el sabotaje necesita una
razón`.

---

## Fase 13 — El campamento se mueve (dentro del mapa local)

**Pendiente de la decisión del propietario** (§«Decisiones», 5). El propietario
dijo que ante el hambre «la tribu tendría la opción de emigrar». En el mapa
local eso es mudar el campamento.

- **Cuándo se propone**: cuando la comida al alcance del campamento se agota
  (fracción de nodos de comida agotados dentro de `reachAdult`) durante
  `motivation.relocateAfter` días, o cuando el miedo medio de la banda es muy
  alto después de una guerra perdida.
- **Quién**: el adulto con más presión combinada de `hunger` crónico y
  `safety`; propone con `propose` (tema: mudanza), a la banda entera.
- **Adónde**: el mejor punto de la isla en su misma región según comida y agua
  dentro de `reachAdult` y distancia a otras bandas, buscado en una rejilla
  gruesa (la de `BandMaps`), sin RNG.
- **Qué pasa**: si más de la mitad de los adultos se convencen, `band.homeX/Y`
  cambia. Los hogares conservan su casa (`homeBuildingId`) hasta que duermen
  en otra; las obras nuevas se planean alrededor del campamento nuevo. Quien
  no se convenció puede quedarse: **una banda puede partirse**, igual que en
  M14 fase 16b.
- **Check**: `camps-move-when-the-land-fails` en `lean`.

---

# Bloque V — La historia como objetivo

## Fase 14 — Calibrar contra la historia

**Objetivo.** Ajustar **parámetros** (los de `Config.motivation` y, si hace
falta, los de `Temperament.ts`) para que la distribución de resultados sobre
muchos mundos se parezca a la historia humana. **Nunca** se ajusta un check.

1. `tools/seeds.ts` gana `--set ruta=valor` (repetible), que aplica un valor a
   la configuración del escenario antes de construir la simulación. Así se
   barre un parámetro sin tocar código.
2. Escenario nuevo `generations` (`SCENARIOS`): el mundo por defecto durante
   quince años de juego (con `daysPerSeason: 10` y `ticksPerDay: 240` son
   144.000 pasos). Es el único que puede medir la recuperación después de una
   caída, porque un niño tarda catorce años en ser adulto. Es lento: 10
   semillas para explorar, 20 para decidir.
3. Protocolo: un parámetro cada vez; 20 semillas por valor; tabla de
   resultados en `docs/m13_calibration.md` (parámetro, valor, cada métrica de
   `HISTORY` y `HOME`, supervivencia). Se elige el valor que deja más métricas
   dentro de su objetivo **sin sacar a ninguna que estuviera dentro**.
4. Lo que salga fuera de objetivo tras la calibración se anota en `bugs.md`
   con la métrica, el valor y la hipótesis, y se lleva al propietario.

---

## Objetivos históricos

**Provisionales.** Se fijan con la línea base de la fase 0 delante y los
decide el propietario (§«Decisiones», 2). Son distribuciones sobre muchos
mundos, no secuencias obligatorias: el juego nunca dice «ahora toca guerra».

| métrica | objetivo recomendado | por qué |
|---|---|---|
| `worldLost` | 0 de 20 semillas en `century`, `lean`, `generations` | Una caída del 100% está mal (propietario), salvo que no haya comida para nadie; y aun así, en M13 fase 13 y M14, se emigra |
| `bandLost` por violencia | ≤ 1 de cada 20 bandas-partida | Pasa en la historia, pero es la excepción |
| `selfDestroyed` | ≤ 1 de cada 100 bandas-partida | «Que se maten entre sí todos los de una tribu, alguna vez; por lo general, nunca» |
| `drawdown` | **sin límite**; se informa | El propietario: un 80% en una guerra puede estar bien |
| `recovered` | ≥ 50% de las caídas de más del 40%, en `generations` | Lo que distingue una catástrofe de un final es que se vuelve a crecer |
| `violentShare` | entre el 5% y el 30% de las muertes de adultos | Las estimaciones que se suelen citar para sociedades sin Estado (Bowles 2009; Pinker 2011) rondan el 15%, con una dispersión enorme. Orientativo |
| `inBandKillRate` | ≤ 1 por 1.000 personas-año | La memoria del proyecto: contra los propios, «uno de cada cien» como mucho, y matar mucho menos que eso |
| `answered` (adultos) | ≥ 90% | «La respuesta a una agresión debería ser bastante alta» |
| niños que huyen | ≥ 90% de los atacados | «Un niño que no se puede defender huye» |
| `peaceShare` | ≥ 60% de los días, por par de bandas que ha peleado | La guerra por episodios: empieza y acaba |
| `nightNearHome` | ≥ 75% | La tribu duerme junta |
| niños dentro de su radio | ≥ 80% | «Pegados a los padres» |
| `fireBy` | ≥ 50% de semillas de `century` | Que el fuego llegue sin regalarlo |
| `adoption` | mediana ≤ 80 días (dos años de juego) para técnicas con uso | Una técnica útil se extiende dentro de una generación |
| `diet` | malnutrición media por debajo de la línea base | El antojo sirve para algo |

---

## Determinismo

- **M13 no añade forks.** Todo lo nuevo es determinista sin tirar dados. Si
  una fase necesitara uno, regla 4 del §3.
- **No cambies el número de tiradas de `wander`** (dos por intento) ni de
  ninguna función existente: se mueve dónde caen, no cuántas son.
- **Tablas**: `BUILDINGS.hearth`, `ITEMS.roast_meat` y `roast_fish`, las recetas
  y las chispas nuevas se añaden **al final** de sus tablas y listas. Ningún
  recurso nuevo en el `plan` de `spawnResources` (este milestone no añade
  ninguno).
- Nada escribe estado en `Brain.score` (regla 5).

## Libro de commits

| fase | commits | expectativa |
|---|---|---|
| 0 | instrumentos, línea base | **bit-idéntico** |
| 1 | motivos como tabla | **bit-idéntico** |
| 2 | instrumento · querencia | instrumento bit-idéntico; querencia medida |
| 3 | instrumento · dormir al raso · de noche se duerme | medidos uno a uno |
| 4 | instrumento · niños huyen · padres defienden | medidos uno a uno |
| 5 | instrumento · antojo | medido |
| 6 | instrumento · creencias propias | medido |
| 7 | instrumento · visto · contado y heredado · pedir enseñanza | medidos uno a uno |
| 8 | instrumento · hoguera · asado · `hearths` | medidos; `hearths` nuevo |
| 9 | necesidad que inventa | medido |
| 10 | instrumento · 10a-10f | uno a uno, medidos |
| 11 | instrumento · proponente · persuasión · menú | medidos; menú con e2e |
| 12 | instrumento · instigador · cansancio · (sabotaje) | medidos |
| 13 | (si se aprueba) mudanza | medido |
| 14 | `--set`, `generations`, calibración | herramientas bit-idénticas; calibración medida |

## Escenarios nuevos

`hearths` (fase 8) y `generations` (fase 14). Nada más: todo lo demás se mide
en `century`, `lean`, `crowded`, `hunters`, `fishers` y `craft`.

## Verificación

```bash
npm run typecheck
npm test
npm run sim:check:all
DYNASTY_PORT=5399 npm run e2e              # si el puerto 5173 está reservado
npm run sim:seeds -- --scenario century --seeds 20
npm run range -- --scenario century --steps 16000     # desde la fase 0
npm run why -- --person 0 --from 1700 --to 1760       # con presiones desde la fase 1
npm run violence -- --scenario lean                    # fases 4 y 12
```

---

## Riesgos

- **El hambre como efecto secundario.** Las fases 2 (alcance) y 3 (dormir de
  noche) quitan horas y terreno de trabajo. Cada una declara su coste antes de
  medir; si se pasa, se para. La economía de la comida es lo más frágil del
  proyecto (`AGENTS.md`).
- **Coeficientes acoplados.** La fase 10 toca términos calibrados entre sí. Un
  motivo por commit, y `ai-uses-many-actions` leído como distribución.
- **Ida y vuelta.** Un motivo nuevo que gana y pierde contra otro en cada
  turno de pensar hace que la gente oscile (`go_home` contra `forage` en el
  borde del alcance). La histéresis de `add` ayuda; si no basta, que el filtro
  y la presión usen radios distintos (la presión empieza antes que el filtro),
  que es lo que ya propone la fase 2.
- **Las creencias como segundo coeficiente disfrazado.** Si alguien acaba
  ajustando `INSTINCT` para que un verbo gane, se ha vuelto al problema del
  §1c. `INSTINCT` sale de una medición y lleva el nombre de la cohorte en su
  comentario; no se toca a mano.
- **Rendimiento.** `drivePressures` y `anchorOf` corren en cada turno de
  pensar; las creencias añaden búsquedas en un `Map` pequeño; ver comer añade
  una consulta al hash por comida. `perf-budget` es la alarma.
- **`century` es caótico.** Todo se juzga a 20 semillas.

---

## Decisiones para el propietario

Cada una tiene una recomendación; el plan la da por tomada hasta que el
propietario diga otra cosa.

1. **¿Rasgo nuevo o derivado para los que van «a su bola»?** *Recomendado:*
   derivado (lealtad baja y curiosidad alta, fase 2b). Un rasgo nuevo en
   `TRAITS` desplaza todas las semillas y obliga a migrar herencia, fundación y
   la pantalla de creación. Si más adelante se quiere un rasgo propio
   («independencia»), se añade entonces con su migración.
2. **Los umbrales de los objetivos históricos.** *Recomendado:* los de la
   tabla, revisados con la línea base de la fase 0 delante. Sobre todo:
   ninguno limita la **caída**; sí la **extinción** y la **falta de
   recuperación**.
3. **Dormir de noche cuesta horas de trabajo.** *Recomendado:* aceptarlo con
   un coste máximo de 5 puntos de supervivencia media; si se pasa, dormir sólo
   en lo más profundo de la noche.
4. **¿Cuántos mundos deberían descubrir el fuego en cuatro años?**
   *Recomendado:* al menos la mitad.
5. **¿El campamento puede mudarse (fase 13)?** *Recomendado:* sí. Es la única
   salida al hambre en el mapa local y prepara la migración de M14.
6. **Madres con hijos pequeños trabajan cerca del campamento** (`parentReach`).
   *Recomendado:* sí, es lo histórico; se revisa si la mortalidad infantil
   sube.
7. **El antojo por personalidad.** *Recomendado:* no, como dijo el propietario.

---

## Apéndice A — Los rasgos que lee `Brain.ts` hoy

61 lecturas. Agrupadas por la sección `// --- … ---` en la que están (las dos
últimas filas son funciones auxiliares al final del archivo). Búscalas por el
texto; los números de línea cambian.

| sección | rasgos | motivo que los absorbe | fase |
|---|---|---|---|
| función `add` (arriba de `score`) | `industriousness` ×2 (`drive`, `idle`) | propósito | 10c |
| `Forage / hunt` | `greed` (`stockpileWish`) | posesión | 10f |
| `Pick fruit` | `greed` | posesión | 10f |
| `Gather materials` | `curiosity` | curiosidad | 10e |
| `Social` | `malice`, `loyalty` ×2, `aggression` ×2, `tradition` ×2, `curiosity`, `greed` ×6, `greed`+`loyalty`, `aggression`+`loyalty` | pertenencia, estatus, posesión; **los de violencia y robo se quedan** | 10b, 10d, 10f; 12 |
| `Sabotage` | `aggression`, `loyalty` | se revisa con `VIOLENCE` | 12 |
| `Violence` | `aggression` ×2 | se queda | — |
| `Predation` | `aggression` | se queda | — |
| `Territory` | `aggression` ×2 | seguridad | 10a (con cuidado) |
| `Caught in the act` | `loyalty` ×4, `aggression` ×2 | pertenencia, seguridad | 10a, 10b |
| `Correcting a child` | `loyalty` | pertenencia | 10b |
| `Making amends` | `loyalty`, `greed` | pertenencia, posesión | 10b, 10f |
| `Going to the chief` | `loyalty`, `tradition` | pertenencia | 10b |
| `Putting a wrong to another people` | `tradition` | se queda | — |
| `A gift` | `greed`+`loyalty` | estatus, posesión | 10d, 10f |
| `Hiding a body` | `malice` | se queda | — |
| `Answering a call` | `loyalty` | pertenencia | 10b |
| `Sow, spread and reap` | `greed`, `industriousness` | posesión, propósito | 10c, 10f |
| `Store and withdraw` | `greed` ×2 | posesión | 10f |
| `Flee` | `aggression` ×2 | seguridad | 10a |
| `Research` | `curiosity` ×3, `intelligence` ×2 | curiosidad (`intelligence` se queda: es capacidad, no ganas) | 10e |
| `Writing and reading` | `tradition` ×2, `curiosity` | curiosidad | 10e |
| `bond()` | `loyalty` ×3 | pertenencia | 10b |
| `predationAppeal()` | `aggression` | se queda | — |

Fuera de `Brain.ts` leen rasgos: `Mood.ts` (8, las líneas base del ánimo),
`KnowledgeSystem.ts` (5), `ActionSystem.ts` (5), `Factions.ts` (3),
`Authority.ts` (3) y uno cada uno `BandSystem`, `Restraint`, `Justice`,
`Investigation`, `Conversation`, `Amends` y `Person.practice`. **No se migran
en M13** salvo que una fase lo diga.

## Apéndice B — El script de la medición del §1b

Desechable; es el punto de partida de `tools/cohesion.ts`. Se ejecutó con
`npx vite-node tools/_scratch/strays.ts century 16000`.

```ts
import { Simulation } from '../../src/sim/core/Simulation.ts';
import { SCENARIOS } from '../simcheck.ts';

const name = process.argv[2] ?? 'century';
const steps = Number(process.argv[3] ?? 16000);
const sim = new Simulation(SCENARIOS[name]!.config);
let nightSamples = 0, nightFar = 0, nightVeryFar = 0, nightRest = 0, nightSleep = 0;
const dayDist: number[] = [], kidDist: number[] = [];
let kidSamples = 0, kidFar = 0, kidVeryFar = 0;
const nightActs = new Map<string, number>();
for (let i = 1; i <= steps; i++) {
  sim.step();
  if (i % 40 !== 0) continue;
  const homes = new Map(sim.bands.filter(b => !b.outcast).map(b => [b.id, b]));
  for (const p of sim.livingPeople()) {
    const home = homes.get(p.bandId);
    if (!home) continue;
    const d = Math.hypot(p.x - home.homeX, p.y - home.homeY);
    if (sim.time.isNight) {
      nightSamples++;
      if (d > 25) nightFar++;
      if (d > 45) nightVeryFar++;
      if (p.action === 'rest') nightRest++;
      if (p.action === 'sleep') nightSleep++;
      nightActs.set(p.action, (nightActs.get(p.action) ?? 0) + 1);
    } else dayDist.push(d);
    if (p.isChild && p.years < 10) {
      const parents = [p.motherId, p.fatherId]
        .map(id => (id === null ? undefined : sim.peopleById.get(id)))
        .filter(q => q && q.alive) as { x: number; y: number }[];
      if (parents.length > 0) {
        const pd = Math.min(...parents.map(q => Math.hypot(q.x - p.x, q.y - p.y)));
        kidSamples++; kidDist.push(pd);
        if (pd > 12) kidFar++;
        if (pd > 30) kidVeryFar++;
      }
    }
  }
}
// … imprime medianas, p90 y porcentajes
```

---

## Documentación al cerrar cada fase

`docs/changelog.md` con la fecha y el porqué de cada cambio; `docs/bugs.md`
con lo encontrado y no arreglado; `docs/next-steps.md` con la fila de la
fase; una línea «Avance del …» bajo la fase en este documento; y
`docs/architecture.md` al cerrar la fase 6, porque la fórmula de
§«The AI is a utility scorer» deja de ser la de hoy y el documento tiene que
decir cuál es.
