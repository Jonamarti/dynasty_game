# M11, Bloque V — Las notas del 2026-09-22, y el cierre del milestone

Escrito el 2026-09-23. **Es la fuente única de todo lo que le queda a M11.**
[m11_plan.md](m11_plan.md) conserva el diseño de los bloques I-IV, ya enviados,
y un índice que apunta aquí. El detalle de las fases 12-17 vive sólo en este
documento: dos copias del mismo plan divergen igual que dos copias del mismo
código, y la divergencia sale meses después como una contradicción que nadie
sabe cuál de las dos es la buena.

**Nada de este documento está construido todavía.** Cada referencia a código se
comprobó contra el árbol el día en que se escribió; las líneas se moverán.

---

## 0. Contexto

### De dónde sale

El 2026-09-22 el propietario dejó dieciséis notas en `notes.txt`, escritas
jugando sobre la build de 11c. La triage está en `next-steps.md` §7g; cada nota
se verificó contra el código antes de darle destino, y `notes.txt` quedó vacío.
Después pidió **el plan completo: las notas y los pasos que quedan** del
milestone, hasta el nivel de commit.

### Las decisiones del propietario

1. **El miedo (fase 14) va antes que la defensa de la propiedad (fase 15).**
2. **`cordage` permite fabricar cuerda con palos o con paja** (`sticks`,
   `thatch`). Cierra la pregunta abierta de la fase 15c.
3. **Por ahora, sólo el plan.** Ningún arreglo se envía con este documento, ni
   siquiera los dos defectos baratos de la fase 12.

### Dónde está M11

| fase | estado |
|---|---|
| 0a, 0b, 0d | enviadas (`a393fda`, `b78fa6b`, `1c11168`) |
| 0c | **retirada** a la luz de 0b |
| 1a-1b · 2a-2b · 3a-3c | enviadas (`6693179`…`1549996`) |
| 4 | enviada (`effc442`) **al revés de su propio plan** — ver 15a |
| 5a-5f | enviadas (`e0e8894`, `6b6d476`, `1549996`, `51b6f50`) — **sin los cuatro checks que prometía**, ver 17b |
| 6a-6e · 7a-7c · 8a-8e · 9a-9c | enviadas |
| 10 | enviada en siete commits (`41fee78`…`648bd96`); fuera, a propósito: la velocidad de `the_wheel` y la fiesta de `brewing` |
| 11a-11c | enviadas (`43fa7ac`, `f72493b`, `a196f10`, `7b6c4ae`) |
| 11d cautiverio | **fundida en 15d** |
| 11e lectores y UI | **fundida en 13** |
| 12-17 | **pendientes — este documento** |

(`a627458`, titulado "m11 phase 11", es en realidad M9.6 fase 2d.)

### La deuda que no tenía fase

Encontrada revisando `changelog.md` y `bugs.md` contra el plan. Todo tiene ya
destino:

| deuda | destino |
|---|---|
| El hecho `gift` sigue declarado y sin emitir; el plan lo prometía "hasta la fase 6" | 17a |
| Los checks de la fase 5 —`exile-is-reachable`, `factions-form`, `gossip-is-aimed`, `the-cast-out-find-a-home`— nunca se escribieron | 17b |
| Un asalto que nadie de la banda víctima ve no mueve `BandRelations` | 14e |
| Un campo no se puede sabotear porque arruinarlo no haría nada | 17c |
| `DECISIVE_GAP` no se volvió a medir tras 11a | 15f |
| El guardia fronterizo (O5, M10 fase 2) no tiene fase | 15e |
| M9.6 4b-4d: el ánimo no tiene ni escritores ni lectores | 14a-14b y 14f para `security`; el resto sigue en [m9_6_plan.md](m9_6_plan.md) |
| `perf-budget` es de reloj de pared y oscila un 21% bajo carga; los checks de uno o dos eventos cambian de lado solos | 17d |
| El signo de `considerTerritory` | 14c |

---

## 1. El orden, y por qué

**12 → 13 → 14 → 15 → 16 → 17.**

- **12 y 13 primero** porque son baratas y casi todas **bit-idénticas en el
  arnés**: ningún escenario posee un jugador, así que nada que sólo toque la
  ruta del jugador o `src/ui/` puede mover un mundo de `sim:check`.
- **El miedo (14) antes que la defensa (15). Decisión del propietario.** La
  nota 7, leída entera, es una queja sobre el mundo que dejaron 11b-11c —*"esto
  debería impedir la destrucción de edificios y las muertes tempranas y al azar
  por todo el mapa"*— y `bugs.md` lo tiene medido en `lean`: asesinatos 3 → 22,
  `attack` ×7 al llegar `sabotage`. Una escalera de defensa calibrada contra ese
  mundo queda mal calibrada en cuanto el miedo lo corrige.
- **El cuerpo (16) después**, porque una investigación necesita algo que hacer
  con el culpable, y los castigos —destierro (5e), venganza, cautiverio (15d)—
  tienen que existir antes.
- **El cierre (17) al final**, porque sus checks miden cosas que 14-16 mueven.

---

## Fase 12 — Reparaciones

Cuatro commits, independientes entre sí.

### 12a — `consumeFood`: una sola forma de comer (nota 8)

**El defecto.** Hay dos implementaciones de comer.
`ActionSystem.doEat` ([ActionSystem.ts:752](../src/sim/systems/ActionSystem.ts#L752))
escribe `macroIntakeToday` desde la fase 8b; `Simulation.eatItem`
([Simulation.ts:1352](../src/sim/core/Simulation.ts#L1352)), el botón *Eat* del
Kit, se escribió antes, dice en su propio comentario que tiene que dar *"la
misma nutrición"* que comer por orden, y **nunca aprendió los macros** ni el
contador `eaten_<id>`. Un jugador que sólo come desde el panel tiene la dieta
congelada.

**El commit.** Un único `consumeFood(person, itemId)`, llamado por los dos:
aplica `nutritionFactor` ([Tech.ts:1898](../src/sim/knowledge/Tech.ts#L1898)),
baja `hunger`, escribe `macroIntakeToday` y cuenta `eat`/`eaten_<id>`. Es el
argumento de `moveToward` y `linkFamily`: dos copias de la misma idea derivan.

**Y lo que la nota realmente ve.** Aun arreglado, ninguna barra sube al comer:
las tres de *Diet* son **proporciones** de lo comido y se mueven **sólo a
medianoche** (`decayMacroBalance`). En el mismo commit:
- una línea *"hoy: 3 bayas, 1 carne"* leída de `macroIntakeToday`;
- el rótulo deja de leerse como un depósito que se llena;
- **hallazgo de la exploración**: las barras de macros se pintan con `bar()` sin
  `data-need`, así que `Hud.refreshPerson` ([Hud.ts:704](../src/ui/Hud.ts#L704))
  nunca las parchea y sólo cambian al reconstruir el panel. Se les da el
  atributo que `refreshPerson` sabe leer.

**Bit-idéntico.**

### 12b — atacar a alguien lejano (nota 10)

**El defecto.** `doAttack` compara con `PURSUIT_LIMIT` (9,
[ActionSystem.ts:441](../src/sim/systems/ActionSystem.ts#L441)) **antes** de
`approach`, en el primer tick, y llama a `finish`. Una orden contra alguien a
diez casillas termina sin moverse y sin motivo. El límite quería decir *"la
presa se escapa"* y dice *"a qué distancia empezó"*; y `finish` no es `abandon`,
así que ni `noteStop` ni la telemetría de abandonos se enteran.

No es sólo del jugador: `Brain` elige víctimas dentro de `sightRadius` (12), así
que toda agresión de NPC puntuada entre 9 y 12 casillas se pierde igual.

**Los commits.**
1. **La orden del jugador** (`person.order === 'attack'`): el límite se mide
   contra la distancia al empezar la persecución, guardada en el objetivo; el
   fracaso es `abandon(person, 'quarry_escaped', ctx)`. `STOP_REASONS`
   ([Floaters.ts:246](../src/render/Floaters.ts#L246)) dice *"the animal outran
   them"*: hace falta un motivo propio para personas, `target_escaped`.
   **Bit-idéntico.**
2. **La ruta de los NPCs**, con la misma regla. **Medido, 20 semillas**: dejar de
   perder esas agresiones cambia el mundo, y en la dirección en la que la nota 7
   pide menos violencia. Si la supervivencia de `lean` cae, esa es la razón, y
   14 es la respuesta, no un techo más bajo aquí.

### 12c — tribus y gente por tribu en la partida nueva (nota 4)

**Ya existen**: `population.bands` (1-8) y `population.peoplePerBand` (2-30),
con `restart: true` en [Difficulty.ts:200](../src/sim/core/Difficulty.ts#L200),
enterrados en Ajustes.

**El commit.**
- `NewGame.tribeStep` ([NewGame.ts:145](../src/ui/NewGame.ts#L145)) gana dos
  `sliderRow` ([SliderRow.ts:39](../src/ui/SliderRow.ts#L39)) con los mismos
  límites del `TunableSpec`.
- Un cambio guarda con `saveSettings` y reconstruye por la ruta que ya existe
  para esto, `rebuildBeforeStart` ([main.ts:130](../src/main.ts#L130)), que
  llama a `newGame.setSim`.
- El título deja de decir *"three peoples"* fijo.
- `BAND_COLORS` ([Sprites.ts:32](../src/render/Sprites.ts#L32)) tiene **seis**
  colores para **ocho** tribus, y la banda proscrita (id `bands.length + 1000`)
  coge el suyo con un `%`. Pasa a ocho, más un color neutro para los proscritos.
  El atlas los prerenderiza todos ([Sprites.ts:425](../src/render/Sprites.ts#L425)):
  medir el coste de memoria del atlas.

**Bit-idéntico.**

---

## Fase 13 — Lo que se ve (absorbe 11e)

Seis commits, **todos bit-idénticos**: todo es `src/ui/` y `src/render/`.

### 13a — el contorno de la tribu (nota 3)

`Renderer.drawBuilding` ([Renderer.ts:941](../src/render/Renderer.ts#L941))
dibuja obra, campo y edificio terminado, con ruina (relleno oscuro, contorno rojo
discontinuo) y barra de `soundness`. Ninguno dice de quién es. Un contorno del
color de `ownerBandId`, el mismo que llevan sus miembros. **Comprobar que la
ruina sigue leyéndose** con el contorno encima: el rojo discontinuo tiene que
ganar.

Es lo que 11e llamaba *"panel de durabilidad"*: en el mapa ya existe, y lo que
faltaba es saber de quién es lo que está en ruinas.

### 13b — "Entre vosotros" (nota 5)

Pulsar a alguien enseña en *Ties* su familia, sus lazos y cuánto te
obedecería, pero **no qué piensas tú de él**; eso sólo está en tu propia lista,
que corta en los catorce lazos más intensos.

Sección nueva al principio de *Ties*:
- **Tu opinión**, desglosada en los mismos términos que la lista (banda,
  hechos, familiaridad, parentesco), leída con `RelationshipGraph.peek`
  ([Relationships.ts:48](../src/sim/social/Relationships.ts#L48)), que no crea
  la arista.
- **Lo que piensa él de ti** es estado privado de otro y pasa por
  `Knowledge.ts`:

| nivel | se ve |
|---|---|
| `stranger`, `seen` | nada |
| `known` | en palabras — *"parece tenerte aprecio"* |
| `close` | con número |

### 13c — los muertos, aparte (nota 14)

- ***Ties***: `knownBy` ordena por |opinión| sin filtrar muertos, y un padre
  muerto con +80 desplaza a un vecino vivo de los catorce. Los vivos arriba; los
  muertos en un `<details>` plegado por defecto. **Sobrevive al redibujado**: el
  panel de persona sólo se reconstruye al cambiar de selección o pestaña (el
  resto es `refreshPerson`), así que el estado abierto no se pierde a cada frame
  — la regla de `AGENTS.md` sobre overlays que se redibujan.
- **Grafo de tribu**: `tribeMembers`
  ([TribeGraphLayout.ts:178](../src/ui/TribeGraphLayout.ts#L178)) toma los 24
  primeros de `knownBy`, y los muertos ocupan plazas. Se filtran **antes** del
  corte, y la cabecera dice *"y N muertos"*. Cambia la disposición del grafo:
  `bugs.md` ya avisa de que nada la fija; el digest tiene que seguir estable.

### 13d — el panel Life agrega (nota 15)

Cada `emit` escribe una línea en la crónica, y `storeItem` emite `trespass` en
cada click: veinte clicks, veinte *"used what wasn't theirs"*. Se agrega en la
**presentación**, no en la crónica —la crónica la lee la sucesión—: entradas
consecutivas con el mismo texto se funden en una con *"×20"* y el intervalo.

### 13e — la muerte cuenta lo que hizo (nota 2)

`Succession.render` ([Succession.ts:44](../src/ui/Succession.ts#L44)) enseña los
seis últimos `'milestone'`; ni un asesinato ni un edificio lo son. Dos recuentos
nuevos, leídos de la crónica: **a quién mató** (entradas `murder` de tipo `did`,
con los nombres por `Knowledge`) y **qué levantó** (*"finished building a"*). Sin
estado nuevo.

### 13f — rechazos y nombres que se escapan

- **Los rechazos pendientes de 11b-11c**: cada camino de `sabotage` y del asalto
  organizado que termine en `finish` en vez de `abandon`, o en un `abandon` sin
  texto en `STOP_REASONS`.
- **`mayUse` pone el nombre del testigo en pantalla.** `because` es
  `seen.name + ' is close enough to see them'`
  ([Property.ts:74](../src/sim/social/Property.ts#L74)) y llega por **dos**
  sitios: `lastRefusal` en `storeItem`
  ([Simulation.ts:1409](../src/sim/core/Simulation.ts#L1409)) y la razón del
  menú radial ([ActionCatalog.ts:596](../src/sim/ai/ActionCatalog.ts#L596)).
  `mayUse` es puro y no sabe quién mira, así que deja de construir la frase:
  devuelve al testigo, y quien lo enseña lo nombra con `knowledgeOfPerson`.
- **La crónica propia se escribe con nombres reales.** `SocialSystem.emit`
  empuja `describeEvent(type, actor.name, target.name)`; si robas a un
  desconocido, tu *Life* te dice cómo se llama. La crónica guarda ids y el texto
  se compone al enseñarla, como ya hace `rememberedAbout` con la memoria.
  **Ojo**: la sucesión y los checks leen `chronicle[].text`; migrarlos en el
  mismo commit.

---

## Fase 14 — El miedo (nota 7)

La nota: con miedo bajo se habla con forasteros y se aleja uno de casa; con
miedo alto se queda en el territorio, no habla con extraños, se arrima a los
suyos y puede atacar al que entre. Que el odio entre grupos crezca de
**incidentes concretos**, que de ahí salga la **segregación**, y que si lo que
falta no está en el territorio propio se **asalte** a otra tribu por ello.

**El canal ya existe y está vacío.** `Person.mood.security`, de M9.6 4a, se
documentó para esto —*"daño reciente, amenazas, extraños en el campamento"*— y
`Mood.add` ([Mood.ts:78](../src/sim/core/Mood.ts#L78)) **no tiene ni un
llamador fuera de los tests**. Esta fase le da escritores y lectores al canal
`security`; los otros tres siguen en `m9_6_plan.md`.

**Todo por la regla del propietario**: nadie teme lo que no ha visto ni le han
contado.

### 14a — los escritores, inertes

Dos capas:

- **El miedo general**, en `mood.security`, con `Mood.add`:

| fuente | dónde | peso |
|---|---|---|
| sufrir `assault`, `threaten`, `theft` | `SocialSystem.absorb`, rama de la víctima | fuerte |
| verlo hecho por un forastero a alguien de tu banda | `emit`, el bucle de testigos que ya existe | medio |
| que te lo cuenten | `absorb` con `firsthand: false`, por `HEARSAY_WEIGHT` | débil |
| **ver** a un forastero dentro de `TERRITORY_RADIUS` de tu casa | bloque diario, por persona y por su consulta de vista | leve, acumulativo |

- **El miedo a alguien concreto** — *"a la gente que les hizo daño"*: un término
  nuevo `dread` en `Relationship`, alimentado por lo que esa persona te hizo a
  ti. Hay que tocar la interfaz, `empty()`, el decaimiento (más lento que
  `deeds`: el miedo dura), la condición de poda y un `addDread` junto a
  `addDeed`. **`dread` no entra en `opinion`**: al matón se le odia *y* se le
  teme, y son dos preguntas distintas que leen verbos distintos.

Contadores `security_*` y `dread_*`. Nada lo lee todavía. **Bit-idéntico**, y el
mismo commit que existe y el que cambia el mundo van separados, como spoilage y
el ánimo.

### 14b — los lectores

Uno por commit, **el de `Brain` el último y solo**, cada uno a 20 semillas.

| miedo | conducta | dónde |
|---|---|---|
| bajo | el ×0.43 plano entre bandas **sube**; se trabaja lejos de casa | `Conversation.crossBand` ([Conversation.ts:184](../src/sim/social/Conversation.ts#L184)) |
| medio | el radio de trabajo se encoge hacia casa | `findNode` ([Brain.ts:2274](../src/sim/ai/Brain.ts#L2274)) |
| alto | no se sale del territorio; `wander` y el ocio tiran hacia la propia banda | `wander`, `Brain` |
| — | se huye de quien se teme, no sólo del que acaba de pegarte | `flee` ([Brain.ts:1700](../src/sim/ai/Brain.ts#L1700)) lee `dread` además de `lastHarmedBy` |

**El rango de casa es mecanismo nuevo.** `Brain` no tiene hoy ningún término de
distancia al hogar: todo el trabajo busca desde donde está la persona, a
`sightRadius*2`. Se añade como **filtro** en `findNode`, centrado en el hogar de
la banda y con radio función de `security`. No como coeficiente: *la proximidad
domina el scorer*, y un término suave perdería siempre contra el nodo más
cercano.

**La tercera ruta de `attack`: defensa del territorio.** Al lado de la venganza
([Brain.ts:1213](../src/sim/ai/Brain.ts#L1213); el gate `grudge > 0.5` no se
toca) y la depredación (`:1300`), con techo propio. Exige que el intruso esté
dentro del territorio, que se le vea, y miedo alto. `threaten` va primero; el
ataque sólo si el intruso no se va.

### 14c — `considerTerritory` deja de ser un sensor

[BandSystem.ts:1409](../src/sim/systems/BandSystem.ts#L1409). Dos defectos:
- **cuenta a todo forastero dentro del radio de casa** haya o no alguien de la
  banda para verlo. Pasa a leer los avistamientos de 14a;
- **el signo** (`bugs.md`): el comentario dice que resiente la banda
  *hambrienta*, y `pantryPressureOf` devuelve cuánto de **llenos** están los
  almacenes — con almacenes vacíos no resiente nada, justo en la escasez de
  `lean`. Se decide aquí qué regla se quería, y se mide la otra a 20 semillas.

### 14d — asaltar por lo que falta

`considerRaid` sólo tiene un motivo, el rencor (`RAID_FURY`). La nota añade
**un tipo de recurso que la banda necesita y no tiene en su territorio**.

Dos precedentes de 11c: el hambre como disparador dio **cero** saqueos porque
ninguna banda está hambrienta a medianoche, así que el motivo es la
**ausencia** de un tipo (pedernal, barro, madera, grano), no el nivel de la
despensa.

**Y requiere un mecanismo que no existe**: hoy el conocimiento de recursos es
**omnisciente** — `findNode` consulta el hash de nodos directamente. Para que
una banda sepa que el pedernal está *en tierra ajena*, alguien tiene que haberlo
visto. Se crea **`BandMaps`**: una rejilla gruesa por banda con los tipos de
recurso que sus miembros han visto, actualizada en el bloque diario desde la
posición y la vista de cada miembro. Determinista, sin tiradas. Su cabecera
tiene que decir que es la semilla del mapa del mundo de M12.

**Aviso de determinismo.** El `rng` de `BandSystem` **es `forestRng`**
([Simulation.ts:2712](../src/sim/core/Simulation.ts#L2712)), compartido con
`ForestSystem.daily` (`:2693`). **Una sola tirada nueva dentro de
`BandSystem` replanta los bosques de todas las semillas.** 14c y 14d tienen que
ser deterministas.

### 14e — un hecho contra la propiedad visto mueve el standing

`SocialSystem.emit` mueve `BandRelations` sólo cuando el hecho tiene una
**persona** de otra banda como víctima
([SocialSystem.ts:339](../src/sim/social/SocialSystem.ts#L339)). Un `sabotage` o
un robo de almacén emiten con `target: null`: destrozar la choza del vecino no
cuesta nada entre los dos pueblos, lo vea quien lo vea. Pasa a moverse **una
vez por hecho** —nunca una por testigo, la multiplicación contra la que el
propio comentario de `emit` ya se guarda— cuando algún testigo es de la banda
dueña. Cierra la entrada de `bugs.md` *"A raid that nobody from the victim's
band sees…"*, y va aquí porque es lo que hace que un asalto alimente el miedo.

### 14f — la cara del miedo (M9.6 4b, sólo `security`)

`expressionOf` ([Mood.ts:170](../src/sim/core/Mood.ts#L170)) no lee el ánimo,
aunque su cabecera lo prometa. Aprende a leer `security`: se ve quién tiene
miedo. Renderer, **bit-idéntico**.

### El gate de la fase

- 20 semillas en `lean` y `century`, supervivencia media y colapsos.
- **`violence-concentrates`**: fracción de `assault`/`sabotage`/`murder` que
  ocurre dentro del territorio de una de las dos partes. La nota describe
  violencia dispersa por todo el mapa; el check dice que se concentra.
- **`peoples-drift-apart`**: distancia media entre miembros de bandas distintas
  a lo largo del run; crece **después** de los incidentes, no antes.
- Los dos **verificados fallando contra la build de hoy** antes de darlos por
  buenos. `AGENTS.md` es explícito, y este proyecto ya borró dos checks por no
  pasar esa prueba.
- La tabla del forastero del Context de `m11_plan.md` se vuelve a medir: la fase
  7 quitó la constante que no decaía; esta fase no debe devolverla por otra
  puerta.

---

## Fase 15 — Defender lo propio, y el cautiverio (notas 6 y 9; absorbe 11d)

### 15a — ser visto deja de ser un veto (nota 6)

**La fase 4 se envió al revés de su propio plan.** El plan decía *"si no es
tuyo: permitido igualmente, pero `seen` dice si hay algún miembro de la banda
dueña con línea de visión… el testigo puede intervenir"*. `mayUse` devuelve
`allowed: false` en cuanto hay un testigo, y `useProperty`
([ActionSystem.ts:1094](../src/sim/systems/ActionSystem.ts#L1094)) aborta con
`property_guarded`. Un almacén vigilado es tan imposible de usar como bajo el
test de pertenencia que la fase 4 sustituyó.

1. **Bit-idéntico**: `PropertyUse` separa *"te han visto"* de *"no puedes"*; los
   llamadores siguen rechazando.
2. **Medido**: el uso ocurre. El hecho con testigos ya se emite, y los testigos
   ya ajustan su opinión: esa es la penalización que pide la nota. Al jugador le
   llega un **aviso**, no un rechazo, sin nombre si el testigo es un desconocido
   (13f). Los llamadores de `useProperty`: `doStore`, `doTake`, `doShelter`,
   `doSleep`, `doSabotage`, el montón de compost y el campo.

### 15b — la escalera del testigo (nota 9)

Quien ve a alguien usar, llevarse o destrozar lo de su banda gana un motivo
para intervenir, puntuado como cualquier otro. **La escalera depende de quién
sea**:

| infractor | primero | después |
|---|---|---|
| forastero | `threaten` (existe) | `attack` por la ruta de defensa de 14b |
| de la propia banda | `restrain`, verbo nuevo | si es más fuerte: `call_for_help` |

- **`restrain`**: un forcejeo de `skillFactor('fight')` y `vigour`, tirado con
  el `ctx.rng` de `ActionSystem` (`actionRng`): **ningún fork nuevo**. Si gana,
  la acción del otro se aborta con `restrained`, y la UI dice quién le sujetó.
- **`call_for_help`**: un grito con el radio de oído que ya existe, `EARSHOT =
  16` ([ActionSystem.ts:465](../src/sim/systems/ActionSystem.ts#L465)), que usan
  `play` y `toast`. Quien lo oye se entera de que alguien pide ayuda, **no del
  delito**; lo ve al llegar. Es la regla del propietario aplicada al sonido.
- Toda acción larga lleva `interruption()`, y cada abandono nuevo tiene texto en
  `STOP_REASONS` (regla permanente de `AGENTS.md`).

### 15c — la cuerda, y atar (nota 9; decisión del propietario)

**La cuerda.** Objeto nuevo `rope` en `ITEMS`, y dos recetas en `RECIPES`, las
dos con `tech: 'cordage'`:

| receta | ingredientes | por qué |
|---|---|---|
| `rope` | `sticks` | fibra de corteza y varas finas |
| `rope_thatch` | `thatch` | hierba y junco retorcidos, la chispa del propio nodo |

Históricamente exacto: la cordelería del Paleolítico Medio —el nodo dice
*"about 50,000 years ago"*— se retorcía con las dos cosas.

- **Dos recetas del mismo resultado sólo compiten si los ingredientes
  difieren**: el scorer no tiene término de "más barato" (la trampa de
  `kiln_pot`, 10-4). Aquí difieren, así que gana la que esté a mano — el
  precedente de `groats`/`meal`.
- `workTicks` por debajo de 140: una receta no tiene dónde bancar el progreso.
- **`keep: 1`, obligado**: `tech.test.ts:498` exige `keep > 0` o que la salida
  sea material de un edificio. Consecuencia a medir: todo el que sepa `cordage`
  lleva una cuerda encima.
- El resumen de `TECH_EFFECTS.cordage` —hoy sólo `carryFactor`— gana la cuerda.

**Atar.** Verbo `bind`: varios reduciendo a uno le atan si alguno **sabe
`cordage` y lleva una `rope`**, que se gasta. **La cuerda, sus dos recetas y
`bind` salen en el mismo commit**: una cuerda sin nada que la gaste sería
contenido declarado e inerte.

### 15d — el cautiverio (lo que era 11d)

- `captiveOf` en `Person`; trabajo forzado en la casa del captor.
- **La fuga se puntúa por los testigos**, el espejo exacto de `mayUse`: nadie
  mirando, se escapa.
- La vuelta reutiliza la puerta que la fase 5f construyó: `adopt` y
  `considerAdoption`.
- **Dos fuentes desde el primer día**: el asalto organizado de 11c y la captura
  en el acto de 15c.
- Aviso de cautiverio en la UI, y el cautivo jugador sabe por qué no puede irse.

### 15e — el guardia fronterizo (O5, M10 fase 2)

Nunca tuvo fase. Un `Job` que patrulla el territorio con **vista normal**: no
es un sensor, ve lo que ve. Le da un motivo para existir a la ruta de defensa de
14b y a la escalera de 15b, y su amenaza sube el `security` de los suyos.

### 15f — `DECISIVE_GAP`, medido de nuevo

`DECISIVE_GAP = 0.3` ([Vulnerability.ts:76](../src/sim/social/Vulnerability.ts#L76))
se fijó cuando nadie tenía habilidad de pelea. Tras 11a sí la hay, y
`changelog.md` y `bugs.md` lo dejaron para *"el siguiente commit de la fase 11
que lo necesite"*. Éste lo necesita: la escalera lee quién es más fuerte.
Commit propio, medido.

### El gate de la fase

`the-watched-intervene`, `captives-are-taken` y `guards-see`, cada uno
verificado fallando contra la build anterior; 20 semillas en `lean`.

---

## Fase 16 — El cuerpo queda (nota 1)

Hoy un muerto **desaparece**: `cleanupDead`
([Simulation.ts:2984](../src/sim/core/Simulation.ts#L2984)) lo saca de `people`
en el mismo tick (sólo el del jugador se queda, hasta la sucesión). Un
asesinato sin testigos es un crimen perfecto por construcción: no queda nada
que encontrar. Tampoco hay cadáveres de animales: `doHunt` los retira y el
botín va directo al hatillo.

### 16a — el cadáver

Entidad nueva `Corpse` (persona, posición, tick, causa, si hay heridas), **del
molde de `ItemPile`** ([ItemPile.ts](../src/sim/entities/ItemPile.ts)): hash
propio, `corpseHash`, reconstruido sólo al cambiar, como `pileHash`. **Toda**
muerte deja uno: el viejo que muere en su choza también se encuentra y se llora.
Se dibuja como las pilas (`Renderer.ts:488`), se escoge como ellas
(`main.ts:787`), y la HUD gana `kind: 'corpse'`, con el nombre sólo si lo
conocías.

`Person` sigue saliendo de `people` como hoy, para no tocar ningún bucle.
**Medido** si el hash o el dibujo cuestan pasos por segundo; si no, bit-idéntico.

### 16b — lo que le pasa con el tiempo

- Se **descompone** por días; al final, huesos.
- **Trocear** (`dismember`): el molde del despiece de una presa, acción larga
  con progreso bancado **en el cadáver** (la regla de las acciones largas). Un
  cuerpo troceado no se identifica.
- **Arrastrar al agua**: desaparece.
- **Dejarlo a los animales**: hoy ningún carnívoro come nada (`next-steps.md`
  §8), así que por ahora es sólo la descomposición. **No se declara un carroñero
  que no existe**; llega con los depredadores.

### 16c — el hallazgo

Quien tiene un cadáver en su línea de vista lo encuentra, una vez: hecho nuevo
`body_found` (`describeEvent` es exhaustivo y necesita su caso; peso de hecho
0, saliencia alta), recordado y **contable** por `absorb` como cualquier
noticia. Búsqueda por vista una vez al día, determinista.

**Y hoy todo el mundo lo sabe al instante.** `settleAffairs` pone
`widow.spouseId = null` en el mismo tick
([Simulation.ts:826](../src/sim/core/Simulation.ts#L826)): la viuda de un hombre
asesinado en un claro sin testigos puede cortejar al día siguiente sin que nadie
le haya dicho nada. Pasa a esperar al hallazgo; es el primer lector que lo hace.

### 16d — la investigación

La dispara el hallazgo si quien lo encuentra es **pariente o de la misma
casa**, **amigo**, **de la misma banda**, o **justo**. *Justo* no es un rasgo
nuevo —otra migración de `TRAITS` movería todas las semillas—: se deriva de
`loyalty` alta, `malice` baja y lo que le pesa `murder` a su banda en
`VARIABLE_NORMS`.

Investigar es ir al cuerpo y preguntar. Las pruebas llegan por cuatro canales,
cada uno con su confianza:

1. **testigo** — alguien vio el asesinato; `emit` ya lo registra;
2. **motivo** — memorias de amenazas o agresiones de alguien contra el muerto;
3. **ensangrentado** — `bloodied` durante un día tras matar, visible para
   cualquiera que le vea, que lo recuerda;
4. **lo que lleva encima** — los bienes del muerto en el hatillo de otro.

La conclusión es una **sospecha con confianza menor que 1**, que se propaga como
un `murder` de oídas y alimenta lo que ya existe: facción y destierro (5d/5e),
venganza (la ruta de rencor de `attack`), captura (15) y el standing (14e).
**Las acusaciones falsas son posibles, y es a propósito**: una calumnia de 5c
puede señalar a un inocente.

### 16e — que se vea

El cadáver en el inspector; la investigación en curso en *Life*; y el jugador
puede investigar, deshacerse de un cuerpo, o enterarse de que alguien ha
encontrado el que escondió.

### El gate de la fase

`bodies-are-found` y `murders-are-solved` — **ni cero ni todos** —, verificados
fallando contra la build anterior.

---

## Fase 17 — El cierre de M11

### 17a — `gift`

Declarado en `EVENT_TYPES` y sin emitir desde 5b. `doGive` emite `share_food`
para la comida y nada para lo demás. O se emite `gift` cuando lo dado no es
comida —el gran hombre que convierte riqueza en prestigio, que es para lo que
se quedó—, o se retira de la tabla. Se decide midiendo si `renown` (6c) se
mueve.

### 17b — los cuatro checks de la fase 5

`exile-is-reachable`, `factions-form`, `gossip-is-aimed`,
`the-cast-out-find-a-home`. Hoy lo cubren tests unitarios de `band.test.ts`.
Cada uno se escribe y **se verifica fallando contra la build anterior a 5c-5f**;
el que no falle se descarta y el commit dice por qué.

### 17c — el sabotaje de campos

Decidir qué es un campo arruinado —¿muere lo sembrado?, ¿no se siembra hasta
repararlo?, ¿queda peor la tierra una estación?—; cablear `doSow`/`doReap` a
`!ruined`, y levantar la exclusión de `Brain` y de `ActionCatalog` **en el mismo
commit**.

### 17d — la política de medición

- **`perf-budget`**: suelo escalado por población, y medido por escenario
  aislado, nunca sobre el número de la matriz.
- **Los checks de uno o dos eventos** (`the-hurt-are-tended`,
  `kills-are-butchered-for-bone`, `heads-direct-work`, `animals-are-tamed`…):
  o suelos reales, o pasan a `sim:seeds`.
- La deriva de `lean` (91.2% → 88.1%) y la semilla `tau`, revisadas contra el
  mundo que dejan 14-16.

### 17e — los documentos

La fila de cierre en `next-steps.md`, el *"Where things actually stand"*
reescrito, y lo que M11 deja fuera **a propósito**, con su motivo: otros
lectores de `conspiracyAgainst`; la mitad de fiesta de `brewing`; la velocidad
de `the_wheel`; fijar la disposición de la tech web; el zoom móvil de
`FamilyTree`; y los canales `comfort`, `belonging` y `purpose` del ánimo.

---

## Determinismo

- **Ningún fork nuevo previsto.** `restrain` tira del `actionRng` que
  `ActionSystem` ya recibe; el hallazgo, la descomposición, `BandMaps` y el rango
  de casa son deterministas.
- **Nunca una tirada nueva en `BandSystem`**: su `rng` es `forestRng`.
- Si un commit necesita un stream propio, va **después de `hearthRng`**
  ([Simulation.ts:495](../src/sim/core/Simulation.ts#L495), el decimosexto), y
  su fila se añade a la tabla de `AGENTS.md` en el mismo commit.

## Libro de commits

| commit | expectativa |
|---|---|
| 12a `consumeFood` + UI de la dieta | **bit-idéntico** |
| 12b orden del jugador | **bit-idéntico** |
| 12b ruta de los NPCs | medido, 20 semillas |
| 12c `NewGame` + colores | **bit-idéntico** |
| 13a-13f | **bit-idénticos** |
| 14a escritores de `security` y `dread` | **bit-idéntico** (inerte) |
| 14b lectores, uno por commit | medidos; el de `Brain` último y solo |
| 14c `considerTerritory` · 14d `BandMaps` + asalto por necesidad · 14e standing por hecho visto | uno cada uno, 20 semillas |
| 14f la cara | **bit-idéntico** |
| 15a separar *visto* de *prohibido* | **bit-idéntico** |
| 15a el uso ocurre | medido |
| 15b escalera · 15c `rope` + recetas + `bind` · 15d cautiverio · 15e guardia · 15f `DECISIVE_GAP` | uno cada uno, medidos |
| 16a `Corpse` | bit-idéntico salvo coste medible |
| 16b-16d | medidos |
| 16e UI | **bit-idéntico** |
| 17a-17c | medidos |
| 17d-17e | checks y documentos |

## Verificación

```bash
npm run typecheck
npm test
npm run sim:check:all
DYNASTY_PORT=5399 npm run e2e
npm run sim:seeds -- --seeds 20          # todo lo que mueva el mundo
npm run sim:check -- --scenario lean     # la fase 14 y la 15 se miden aquí primero
npm run why -- --person 0 --from 1700 --to 1760
```

Un commit "bit-idéntico" lo demuestra con `sim:check:all` sin una sola cifra
cambiada, no con un test verde.

## Riesgos

- **Un miedo alto que vacíe la exploración.** El rango de casa es un filtro; con
  `security` bajo en toda la banda, nada queda a su alcance y la banda se muere
  de hambre en casa. Suelo mínimo de radio, y la supervivencia de `lean` como
  alarma.
- **Una defensa que convierta la banda en picadora** — el fracaso que `Brain`
  ya registra (*"a band would consume itself"*). La amenaza va antes que el
  golpe, y `restrain` no hiere.
- **`keep: 1` de cuerda** puede llenar hatillos que ya van cortos.
- **`Corpse` puede costar pasos por segundo** en una matriz donde
  `perf-budget` ya oscila; medir aislado (17d).
- **`BandMaps` es la primera memoria de lugares del juego.** Todo lo que hoy
  pregunta al hash de nodos lo hace de forma omnisciente; no se migra en esta
  fase. Sólo lo lee 14d.

## Después de M11

**M12 — el mundo más allá de la isla**: el arco tipo Spore, el mapa del mundo,
la migración, las civilizaciones y el comercio por caravanas. Esbozado en *"Para
el futuro"* de [m11_plan.md](m11_plan.md); tendrá su propio documento cuando M11
cierre.
