# M15 fase 37 — El Calcolítico y el Bronce

Plan: [m15_plan.md](m15_plan.md), «Fase 37»; detalle de origen en `m14_plan.md`
fase 19 y `m8_plan_the_ages.md` §M8.3. Una sección por entrega.

**Cómo se trabaja.** En su propio worktree (`.claude/worktrees/m15-phase37`,
rama `worktree-m15-phase37`), porque otro agente trabaja la fase 34 en
`master`. Un commit por función, con su prueba, su documentación y, si cambia
la interfaz, su captura. Hasta cerrar M15 solo se corren las capas rápidas
(`typecheck`, `npm test`, un `sim:check` de una semilla): las cohortes de 10 y
20 semillas están diferidas por orden del propietario y cada commit lo dice.

**Línea base** (worktree limpio sobre `d7e7a29`): `typecheck` limpio; `npm
test` 187 archivos / 1.381 pruebas, todas pasan; `sim:check` (escenario
`band`) 2 de 137 fallan, `cravings-steer-the-diet` y `perf-budget`, los mismos
fallos de base que registra la fase 13.

## 37a — `charcoal` y la carbonera

**Qué hay.** El nodo `charcoal` (dispositivo, dominio fuego, Calcolítico,
«hacia el 5000 a. C.», requiere `firemaking` y `carpentry`), el ítem `charcoal`,
la estación `charcoal_pit` (3×3, sin almacén, de palos y barro) y la receta
`charcoal` (seis palos → tres de carbón, en la carbonera, `keep: 4`).

**Quién lo lee.** Dos lectores, para que no entre inerte:
`Tech.warmthFrom` (un carbón en el zurrón es un brasero: séptimo término,
`CHARCOAL_WARMTH` 0,12, el más pequeño de la lista, con la misma doble puerta
que el resto: saber hacerlo **y** llevarlo) y, desde 37c, las recetas del
horno de fundición, que es para lo que sirve.

**Por qué palos y no madera.** El plan pensaba en madera, pero nada de lo que
llena el zurrón (`matNode` de `Brain`) tala un árbol para una receta, y un
ingrediente que nadie va a buscar es el defecto de `pottery` otra vez. Los
palos sí los recoge un recolector. El planificador de bandas ya levanta cualquier
estación para la que algún miembro tenga receta (`BandSystem`, la rama de
estaciones), así que la carbonera se planifica sola.

**Sub-red Fuego.** El plan dice que `charcoal` va a la sub-red Fuego, pero esa
red (fase 16) no existe todavía: `WEBS` solo declara las redes con al menos dos
nodos con efecto, y `tech.test.ts` lo exige. `charcoal` vive en la red
principal hasta que la fase 16 abra Fuego; mudarlo será cambiar `web` y nada
más (la simulación no lee `web`).

**Pruebas.** `src/sim/__tests__/metal.test.ts` (8): declaración, estación,
receta, ítem, doble puerta del calor, y de punta a punta —una persona que
sabe `charcoal` y lleva seis palos recibe la orden `craft`, anda a la
carbonera y sale con tres carbones— más la negativa con motivo lejos de la
carbonera. `tech.test.ts` gana `charcoal: ['warmth']` en los motivos
soportados (el carbón sí responde al calor). Arte: `b/charcoal_pit/ext` y
`item/charcoal` generados con `npm run art:build`.

**Medido.** `sim:check` del escenario `band`: los mismos dos fallos de base;
nadie conoce `charcoal` en ese mundo, así que no cambia. Cohorte de 20 semillas
no corrida (diferida).

## 37b — `native_copper`: el cobre que se encuentra como metal

**Qué hay.** El nodo `native_copper` (dispositivo, dominio nuevo `metal`,
Calcolítico, «hacia el 7000 a. C.», requiere `stoneworking`); la clase de nodo
`native_copper` (pepitas de superficie: seis como mucho, **no vuelven a crecer**,
las recoge cualquiera); los ítems `copper_nugget`, `copper_awl` y
`copper_pendant`; y dos recetas manuales, sin fuego ni estación,
`copper_awl` y `copper_pendant`, las **primeras que entrenan `smith`**, una
habilidad que todo personaje lleva desde M6b sin nada que la mejore.

**Dónde está en el mundo.** `Simulation.spawnOres`, una pasada propia con su
propio stream, `oreRng`: **fork n.º 23**, añadido tras `edgeRng` (fila nueva en
la tabla de `AGENTS.md`, y las cuentas de esa nota corregidas; las filas 21-22
habían perdido el `>` del bloque y se arreglan de paso). En la isla clásica,
cinco pepitas (`ORE_COUNTS`, escaladas por `resourceScale`) en colinas. Con
mapa, cada clase usa su stream derivado (`geographicResourceRng`) y se coloca
solo donde el perfil de la región lo tiene: `GeographicResources` ahora lee una
tabla `GATED` (grano, sílex y cobre) en vez de dos `if`; en el mapa generado la
región debe listar `copper`, en la Tierra el rasgo `copper`. Un test prueba que
**todo lo demás queda donde estaba** (se apaga el cobre con `ORE_COUNTS` y se
compara el mundo), que es lo que el test de determinismo no puede ver.

**Quién lo lee.** Tres lectores:

- `Ore.wantedOreKinds` (nuevo, `knowledge/Ore.ts`): **la tabla de recetas dice
  qué va a buscar uno a la tierra.** Quien puede hacer algo de lo que tiene
  menos de lo que guarda (`keep`) y le falta un mineral de la receta va al nodo
  más cercano que conoce; quien no sabe, pasa de largo. `Brain` lo usa como
  hace con las hierbas: sustituye a `matNode` (flint/sticks), con el mismo
  puntaje y la misma puerta de comodidad.
- `Tech.awlFactor`, leído por `ActionSystem.doCraft`: el punzón acelera las
  recetas cosidas (`SEWN_RECIPES`: armadura de cuero, bolsa y abrigo) con la
  doble puerta de siempre (saberlo **y** llevarlo).
- El colgante es un adorno: su razón de existir es `baseValue` (18, tres veces
  la pepita), que ya leen `gift` (el excedente sobre `keep` se regala), el robo
  y, desde la fase 36, el trueque.

**Medido.** `sim:check` `band`: los mismos dos fallos de base. Las pepitas
añaden nodos al mundo pero nadie las busca hasta que alguien concibe el nodo.
Dos pruebas de otros archivos se actualizaron porque su premisa cambió, no
porque el juego se rompiera: `herbs.test.ts` daba por hecho que la pasada de
hierbas era la última en poner nodos (ahora lo es la de minerales).

**Pruebas.** `metal.test.ts` (+11): declaración, chispa sin pepita, pasada
propia (el resto del mundo no se mueve), determinista, puerta del mapa
(cobre sí, estaño no), `wantedOreKinds`, recetas y `smith`, `awlFactor` (doble
puerta y solo lo cosido), un oficio cosido de punta a punta más corto con
punzón, y recoger una pepita que no se regenera. Arte: tres iconos y los nodos
dibujados por código en el `Renderer`.

## 37c — `mining`: la mina es un nodo, no un agujero

**Qué hay.** El nodo `mining` (dispositivo, piedra, Calcolítico, «hacia el
4000 a. C.», requiere `ground_stone` y `hafting`); dos clases de nodo, `copper_ore`
(cuatro vetas en las colinas de la isla clásica) y `tin_ore` (**una**: la escasez
es el diseño; el comercio del Bronce existió porque el estaño estaba en pocos
sitios); los ítems `copper_ore` y `tin_ore`. Una veta no se excava: «una mina es
un nodo, no una casilla», así que no hace falta la reparación de regiones (16a).
Ni una ni otra vuelven a crecer.

**Quién lo lee.** `mining` tiene tres lectores, y el primero no es metal:

- `Tech.forageYieldFactor`: más sílex de cada afloramiento (×1,25: las minas de
  sílex neolíticas, Spiennes, son donde se aprendió) y ×1,5 el mineral.
- La **puerta**: `ResourceDef.requiresTech` y `Ore.canWork`, leída por
  `ActionSystem.doHarvest` (se abandona con el motivo `cannot_mine`, «no saben
  extraer mineral», visible en el flotante), por `Simulation.order` (se rechaza
  *antes* de caminar, con el mismo texto) y por `ActionCatalog.nodeActions` (el
  menú deshabilita la veta y dice por qué: «No sabes extraer mineral», o «No
  saben…» si se manda). Un saber perdido a mitad de camino también se detiene
  con motivo (test). La regla del propietario: si la simulación rechaza algo, la
  interfaz lo dice.
- `Ore.wantedOreKinds` ya cubría las vetas, pero hasta que `smelting` (37d)
  declare una receta que consuma mineral, nadie tiene un motivo para quererlas:
  un minero sin horno no sale a buscar cobre. Es la respuesta honesta, y una
  prueba la fija.

**Dónde está en el mundo.** La misma pasada y el mismo `oreRng` de 37b (sin fork
nuevo); con mapa, `GATED` ahora conoce `copper_ore` (cobre) y `tin_ore` (estaño),
cada uno donde la región tiene ese metal. La prueba de «el resto del mundo no se
mueve» ahora apaga **todos** los minerales.

**Pruebas.** `metal.test.ts` (+10): declaración, chispas, estaño más escaso que
cobre, puerta del mapa por metal, `canWork`, rendimientos, rechazo de la orden
con motivo, el menú (deshabilitado con razón / ofrecido), extraer de punta a
punta, y el saber perdido a mitad de camino (`cannot_mine` llega a
`sim.interruptions`). Arte: dos iconos y los nodos del `Renderer` (afloramiento
gris con vetas verdes, o claras para el estaño).

## 37d — `smelting` y el horno de fundición

**Qué hay.** El nodo `smelting` (dispositivo, metal, Calcolítico, «hacia el 5000 a. C.», requiere `native_copper`, `charcoal` y `kiln`: el calor sostenido del horno de alfarero apuntado al mineral en lugar de a la arcilla), la estación `furnace` (3×3, sin almacén, de sílex 10 y barro 8, más larga de levantar que el horno de alfarero), el ítem `copper` (lingote, `baseValue` 14) y la receta `smelt_copper`: tres de mineral y dos de carbón dan dos lingotes, en el horno, con `smith`, `keep: 4`.

**Quién lo lee.** El horno lo planifica solo `BandSystem` (cualquier banda con un miembro que pueda hacer algo en una estación que no tiene); `Ore.wantedOreKinds` manda al herrero a la veta mientras tenga menos lingotes de los que guarda y menos mineral del que pide la receta, y no manda a quien sabe fundir pero no sabe minar (prueba). El lingote es la materia de `casting` (37f) y, mientras tanto, un bien con `baseValue`: regalo, robo y, desde la fase 36, trueque.

**Sub-red Metal.** Sigue sin declararse: una red de un solo nodo es una puerta declarada antes que su contenido y `tech.test.ts` la rechaza. Se abre en 37e, con `bellows`, el segundo nodo que la llena.

**Pruebas.** `metal.test.ts` (+6): declaración, estación, receta, `wantedOreKinds`, fundir de punta a punta (3 mineral + 2 carbón → 2 lingotes en el horno) y la receta sin carbón se abandona con `lack_materials`. Arte: `b/furnace/ext` e `item/copper`.

## 37e — `bellows` y la sub-red Metal

**Qué hay.** El nodo `bellows` (dispositivo, metal, Edad del Bronce, «hacia el 3000 a. C.», requiere `smelting` y `leatherwork`) y la receta `smelt_copper_bellows`: la misma carga que la fundición simple (tres de mineral, dos de carbón), **tres** lingotes en vez de dos y 90 ticks en vez de 120. Con este segundo nodo con efecto **se abre la sub-red Metal** (`WebId 'metal'`, puerta `native_copper`, color verdín): `smelting` y `bellows` viven en ella y `native_copper` gana `opens`. `tech.test.ts` ya exigía que toda red tenga dos nodos como mínimo, que sus nodos requieran la puerta y que cada puerta abra exactamente su red; su lista de redes declaradas gana `metal`.

**Por qué una segunda receta y no un término.** Es el modelo de `kiln_pot`, con la trampa que esa receta ya anotó: el puntuador de `Brain` no tiene un término de «mejor» y un empate lo gana la primera receta que llega. Por eso `smelt_copper_bellows` se declara **antes** que `smelt_copper` (una prueba lo fija): quien sabe el fuelle toma la soplada, y quien no lo sabe no puede (`techPower` es cero) y cae a la simple.

**Lo que no se midió.** El puntuador no eligió fundir en una prueba autónoma (la persona estaba cavando y proponiendo: el oficio gana pocos puntos frente al trabajo del campamento); por eso las pruebas ordenan la receta con nombre y comparan ticks y lingotes (3 contra 2, menos ticks). Si un herrero autónomo funde, lo dirá el escenario `smiths` del cierre de la fase.

**Pruebas.** `metal.test.ts` (+5): la red y sus nodos, requisitos y edad, la receta mejor con la misma carga, el orden de declaración, la soplada de punta a punta (3 lingotes, menos ticks que la simple, que da 2) y la orden de la soplada sin saber el fuelle se detiene con `dont_know_how`.

## 37f — `casting`: el hacha de cobre y la daga

**Qué hay.** El nodo `casting` (dispositivo, red Metal, Calcolítico, «hacia el 4000 a. C.», requiere `smelting` y `pottery`: el molde es de arcilla cocida), los ítems `copper_axe` y `copper_dagger` y sus recetas en el horno, de lingote (dos y uno). `maxRefinement: 1`, no 2, por la regla que `ground_stone` dejó anotada: el multiplicador del hacha pasa por `scaled` con un `full` por debajo de 1, y 0,3 a dos pasos de refinamiento daría 0,02.

**Quién lo lee.** El hacha, `Tech.axeFactor` y `axeItemOf`, que eran dos ramas escritas a mano y ahora son **una tabla**, `AXE_TOOLS` (hacha de mano 0,5, pulida 0,35, de cobre 0,3), porque la fase añade dos más y cuatro copias de una idea son cuatro respuestas que se separan. El comportamiento de las viejas no cambia (el empate sigue siendo del hacha más humilde; una prueba lo fija) y una prueba recorre la tabla comprobando que cada `full` deja el multiplicador positivo con el refinamiento máximo de su técnica. `EquipmentAnimation` lee la misma tabla, así que el hacha de cobre se ve en la mano (con la silueta del hacha). La daga es un arma (`weapon`, daño 0,5, alcance 0,25, caza 1,2) y solo eso, por la razón del `handaxe`: saber hacer un arma y blandirla son preguntas distintas, y el hacha de cobre **no** es arma. La daga lleva su propia mano en el arte (`held/copper_dagger`).

**Pruebas.** `metal.test.ts` (+7): declaración, recetas, el suelo de la tabla de hachas, el hacha de cobre tala más rápido que la pulida y nada sin saber hacerla (doble puerta), el hacha antigua sigue igual, la daga solo vale a quien sabe, verter un hacha de punta a punta y la mano dibuja cualquier hacha. Arte: dos iconos y la mano de la daga.

## 37g — `alloying`: el bronce y el estaño que está lejos

**Qué hay.** El nodo `alloying` (dispositivo, red Metal, Edad del Bronce, «hacia el 3300 a. C.», requiere `casting` y `mining`), los ítems `tin` y `bronze`, y dos recetas en el horno: `smelt_tin` (dos de mineral y uno de carbón → un lingote de estaño) y `alloy_bronze` (tres de cobre y uno de estaño → tres de bronce: la proporción real, y nada generosa). El estaño se funde aquí y no antes porque ningún nodo anterior le da uso al lingote.

**La escasez es el diseño.** Una veta de estaño en toda la isla clásica, de catorce de mineral: da siete lingotes y a lo sumo veintiuno de bronce. Una prueba lo cuenta (`bronze` entre 1 y 39) para que subirlo sea una decisión y no un descuido. Con mapa, el estaño solo aparece donde la región lo tiene, que es casi ninguna (0,45 % de las regiones del mapa generado, un puñado de puntos de la Tierra): ahí empieza el comercio a distancia de la fase 36. `Ore.wantedOreKinds` manda al alfarero de bronce a la veta de estaño solo cuando ya lleva cobre y no lleva estaño.

**`bronze-needs-a-trader` queda sin medir.** La puerta del plan («casi ninguna banda sin estaño en su comarca funde bronce sin haber comerciado o asaltado») necesita el comercio y las caravanas de la fase 36, que no están en esta rama, y una cohorte con mapa. Se deja anotada en `docs/next-steps.md`; lo que sí se puede decir hoy es lo que prueba la cuenta de arriba: sin estaño en la región no hay bronce que fundir.

**Pruebas.** `metal.test.ts` (+6): declaración y edad, chispa sin estaño en mano, las dos recetas y la proporción, `wantedOreKinds` (estaño sí, cobre ya no), el tope de bronce de la isla, y fundir estaño y alear bronce de punta a punta (tres de bronce).

## 37h — `bronze_tools`: hacha, azuela, hoz y pala

**Qué hay.** El nodo `bronze_tools` (dispositivo, red Metal, Edad del Bronce, «hacia el 3000 a. C.», requiere `alloying`), cuatro ítems y cuatro recetas en el horno (`bronze_axe` 2, `bronze_adze` 2, `bronze_sickle` 1, `bronze_spade` 3 de bronce, `keep: 1` cada una: el bronce es lo escaso y una banda que ha hecho sus cuatro ha gastado casi todo el que tendrá).

**Quién lo lee.** Cuatro funciones que ya existían, ninguna con código nuevo de lector: `axeFactor`/`axeItemOf` (`AXE_TOOLS` gana `bronze_axe`, 0,25), `buildFactor` (la azuela de bronce, 1,45, contra la pulida de 1,2; se cuenta la mejor de las dos, no se apilan), `reapFactor` (la hoz de bronce, 0,45, contra la de sílex de 0,6; la menor) y `Earth.digTool` (`DIG_TOOLS` gana `bronze_spade`, potencia 5: «las herramientas de bronce cavan a 5×», frente a la pala de madera de 3 y el palo de 1). Todas con la doble puerta de siempre (saberlo y llevarlo), y `maxRefinement: 1` para que el multiplicador siga siendo positivo (una prueba lo comprueba para el hacha y la hoz).

**Arte.** Cuatro iconos, la mano `held/bronze_spade` (el arte pide una por cada herramienta de cavar con técnica) y el caso de `Sprites`; el hacha de bronce se ve con la silueta del hacha.

**Pruebas.** `metal.test.ts` (+7): declaración, recetas sin armas, la escalera hacha de cobre < bronce, azuela y hoz mejor que su piedra, la doble puerta, cavar a cinco veces el palo (y sin la técnica es solo un palo pesado), el suelo del multiplicador y fundir la pala de punta a punta.

## 37i — `bronze_arms`: la espada, el yelmo y `armourOf` por `techPower`

**Qué hay.** El nodo `bronze_arms` (dispositivo, red Metal, Edad del Bronce, «hacia el 2800 a. C.», requiere `alloying` y `spear`), la espada (`weapon`: daño 0,75, alcance 0,55, caza 1,35; la mejor hoja del juego) y el yelmo (`protects: { head: 0,55 }`, la primera prenda que cubre la cabeza), vertidos en el horno (tres y dos de bronce).

**La deuda que cobra.** El plan dice «`armourOf` por fin pasa por `techPower`». Hasta hoy `protectionOf` leía `ITEMS[...].protects` sin mirar quién la llevaba. Ahora una prenda que nombra su técnica (`ItemDef.armourTech`) protege según `Tech.armourFit`: tres cuartos de su valor para quien no la sabe hacer (un yelmo quitado a un muerto es un yelmo), cerca de nueve décimos mientras se prueba el diseño y el valor entero y algo más al refinarlo, con un techo (nunca 1: nadie queda invulnerable). **Las prendas que no nombran técnica conservan su número exacto**, así que ningún mundo existente se mueve (el chaleco de cuero y el abrigo de pieles no declaran `armourTech`; una prueba lo fija). `armourOf`, el promedio por dónde caen los golpes, pasa por la misma función, y la prueba de que sube al ponerse el yelmo cierra el círculo.

**Lo que no está.** El yelmo no se dibuja puesto en la cabeza: el arte de personas solo conoce las prendas de `Wear` y añadir una es un pase aparte (anotado en `next-steps.md`); vive como icono de inventario, y la espada como mano (`held/bronze_sword`).

**Pruebas.** `metal.test.ts` (+7): declaración, recetas, la espada supera a la daga y no la maneja quien no sabe, el yelmo (cabeza sí, torso no, techo bajo 1), las prendas sin técnica no cambian, `armourOf` sube y verter la espada de punta a punta.

## 37j — `goldwork`: el adorno que más vale

**Qué hay.** El nodo `goldwork` (dispositivo, red Metal, Calcolítico, «hacia el 4600 a. C.», el oro de Varna; requiere `native_copper`: se martilla en frío igual), la clase de nodo `gold` (granos de la grava: cuatro como mucho, no se reponen, los coge cualquiera; dos puntos en la isla clásica, en playa o colina), los ítems `gold_nugget` y `gold_ornament` y la receta `gold_ornament` (dos granos, sin fuego ni estación, con `smith`).

**Quién lo lee.** El adorno es lo más valioso del juego a propósito (`baseValue` 60, por encima de la espada de bronce, 34): vale lo que un pueblo acuerda que vale, y ese número es el que leen `gift` (el excedente sobre `keep` se regala: la generosidad del «gran hombre»), `doSteal` y las deudas de `Amends`; a la fase 36 le queda el trueque. Una prueba recorre todos los ítems para que siga siendo el máximo. `Ore.wantedOreKinds` manda al orfebre al grano, y `forageYieldFactor` le da más por tirón. Con mapa, el oro solo donde la Tierra lo tiene (`WORLD_FEATURE.gold`); en el mapa generado, que no tiene un recurso propio para él, donde hay cobre (la misma ganga).

**Pruebas.** `metal.test.ts` (+8): declaración, chispa sin oro en mano, dónde está, la puerta del mapa, la receta y el máximo de `baseValue`, el orfebre quiere oro y saca más, martillar de punta a punta y el regalo.

## 37k — el escenario `smiths`, y querer lo que la cadena pide

**Lo que se midió, y lo que falló.** `smiths` es el escenario nuevo (`tools/simcheck.ts`): dos bandas con los diez nodos y todo lo que necesitan (`withPrerequisites` cierra la lista), con una carbonera y un horno ya en pie junto a cada campamento y una veta de cobre junto a cada uno (estaño, pepitas de cobre y oro, junto al primero): el mismo concedido de `polity` con su granero, porque levantar dos estaciones desde cero se come buena parte de la corrida y las vetas no se van a buscar a tientas. La primera versión de `Ore.wantedOreKinds` pedía solo el mineral que una receta consume directamente. Medido en `smiths` (16.000 pasos): **11 cargas de mineral de cobre extraídas y ningún lingote fundido**: tres personas llevaban mineral y dos llevaban carbón y nadie llevaba los dos, con el horno ocioso al lado del campamento.

**La corrección.** Querer **hasta las hojas de la cadena**: quien puede hacer algo de lo que tiene menos de lo que guarda quiere lo que le falta, y lo que eso necesita a su vez, hasta lo que yace en el suelo. El que lleva mineral y no carbón va a por palos (el carbón se hace de palos, y solo lo hace quien sabe `charcoal`); el que lleva carbón va a la veta; un encargo de herramientas de bronce sin bronce remonta hasta el estaño. Quien no sabe hacer el eslabón no va a buscar lo que pide. Siguen siendo `matNode`, con el mismo puntaje y la misma puerta de comodidad: no hay una conducta de herrero escrita en ningún sitio, solo la tabla de recetas.

**Resultado en `smiths`** (misma semilla): 9 cargas de mineral de cobre, **3 fundiciones con fuelle**, 3 hachas y 3 dagas de cobre, 1 fundición de estaño, un punzón, un colgante, una pepita de oro recogida. No se llegó a aleación de bronce en 16.000 pasos (el cobre se gasta en hachas y dagas antes de juntar tres lingotes y el estaño): lo que cabe esperar con una sola veta de estaño, y no se «arregla».

**Los dos checks.** `ore-becomes-metal` (hay cobre extraído y se funde) y `metal-is-cast` (hay cobre fundido y se vierte algo). Verificados contra la build rota, como pide el proyecto: con el `wantedOreKinds` de un solo paso, `ore-becomes-metal` **falla** (11 cargas, 0 fundiciones); con el actual **pasa** (9 cargas, 3 fundiciones). La primera redacción contaba mineral de estaño también y *pasaba en la build rota* (quien llevaba estaño sí llevaba su único carbón), así que se acotó al cobre: un check que mira bien y no detecta nada es peor que ninguno. `metal-is-cast` es n/a en la build rota por construcción.

**Fallos del escenario que no son de esta fase.** `smiths` falla además `cravings-steer-the-diet`, `nights-are-slept`, `moods-move-choices`, `projects-find-backers`, `roast-wins`, `cooking-spreads`, `discovery-is-situated`, `bands-take-sides` y `perf-budget`: son los de siempre de un mundo cuya gente empieza sabiendo oficios y casi nada de cocina (los mismos nombres, por familia, que `craft` y `hearths` arrastran); `craft` y `hearths` dan **exactamente la misma lista** en el commit base y en este (7 fallos cada uno, medido en un worktree aparte en `d7e7a29`).

**Pruebas.** `metal.test.ts` (+5): el herrero con mineral va a por palos, el del carbón va a la veta, quien no sabe hacer carbón no va a por palos, un encargo de bronce remonta al estaño, y quien no sabe nada no mira el suelo.

## 37l — los peldaños del Calcolítico y del Bronce

**Qué hay.** `ERAS` gana dos peldaños, `chalcolithic` (los del Neolítico más `native_copper`, `smelting` y `casting`) y `bronze` (más `alloying` y `bronze_tools`), con `heldBy: 0,15`. Antes de esta fase la escalera acababa en el Neolítico porque un peldaño cuyos requisitos nombran algo que nadie puede aprender no lo alcanza ningún mundo (la regla del encabezado de `Tech.ts`); ahora cada nombre es una técnica real y alcanzable. Las cuatro pruebas de eras de `tech.test.ts` (orden, periodos reales, acumulativa, ninguna técnica de un periodo posterior) pasan sin tocarlas.

**Por qué 0,15 y no 0,3.** No es una rebaja: `heldBy` pide la fracción de adultos que saben *todo* lo de la lista, y un pueblo que trabaja el metal tiene unos pocos herreros entre muchos. Un umbral de tres de cada diez adultos pediría un herrero por hogar y el peldaño no se alcanzaría nunca en una banda de la isla. Es una suposición (documentada aquí, sin medir): la cohorte `smiths` de 16.000 pasos no lo alcanza en ninguna banda, lo que es coherente con que el bronce de una isla con una veta de estaño es de unas pocas personas.

**Pruebas.** `metal.test.ts` (+2): la escalera acaba en `neolithic, chalcolithic, bronze`, y un mundo sube y baja por ella según cuántos adultos saben fundir (al perderse los que saben `casting`, vuelve al Neolítico).

## 37m — lo que se ve (interfaz, capturas y e2e)

**Qué cambia en pantalla.** Las dos estaciones y las cuatro clases de nodo se dibujan (el `Renderer` las pinta por código, los edificios y los iconos salen del arte); el menú de un nodo de mineral ofrece «Extraer mineral de cobre» y, para quien no sabe minar, lo deshabilita con su motivo («No sabes extraer mineral», o «No saben…» si se manda); la telaraña de técnicas gana el dominio Metal (un sector más) y la sub-red Metal con su marca en `native_copper`.

**Un defecto de pantalla que apareció al mirar.** El selector y el título de un nodo mostraban el id con guion bajo en inglés (`copper_ore`, y ya `wild_grain` desde hace tiempo): `tc('node', kind)` devuelve el id cuando no hay tabla. `Hud.kindWord` lo escribe con espacios.

**e2e.** `e2e/phase37-metal.spec.ts` (3 pruebas, añadida a `npm run e2e`): las dos estaciones y las cuatro clases de nodo en el suelo, el menú que dice por qué (aserción sobre el `title` del botón deshabilitado) y la telaraña con el sector y la sub-red Metal. **Una prueba existente cambió de premisa, no el juego:** `tech-subwebs.spec.ts`, «screenshots», en el teléfono, daba por hecho que la marca de la puerta cae dentro del visor al abrir la telaraña; con un noveno sector el dibujo reparte los nodos de otro modo y la marca de «La lanza» quedó bajo el texto de ayuda, de modo que el toque caía en el texto. Pasa en el commit base y falla en este por esa razón; la prueba ahora arrastra el visor hasta despejar la marca antes de tocar (como haría quien no la ve), con el motivo en un comentario. Resultado de `npm run e2e` tras la corrección: **97 de 97** (la primera corrida, antes de corregir esa prueba, dio 96 de 97).

**Otra prueba cambió de cota, con su medida.** `people-knowledge.test.ts`, «sustained full contact does homogenise»: el umbral 0,3 medía 0,21 antes de la fase y 0,33 con los diez nodos de metal; sin contar esos diez da 0,12. Lo que queda distinto tras treinta años de contacto pleno es la cadena profunda que un pueblo aprende despacio, y una tabla más larga tiene más. El mundo no está mal y la afirmación se mantiene (sigue muy por debajo del 0,9 que la prueba vecina exige a diez años), así que la cota pasa a 0,4 y lo dice en un comentario. **Efecto sin medir:** `PeopleSim` (nivel 2) lee la misma tabla `TECHS`, así que el mundo de pueblos de la fase 32c/33 también tiene ahora los nodos de metal; `world:cohort` y `world:bench` no se han corrido (cohortes diferidas).

**Capturas.** `artifacts/screenshots/m15-phase37-metal-2026-10-07/`: `01-pit-furnace-and-seams.png` (carbonera, horno y las cuatro clases de nodo sobre el suelo), `02-menu-refuses-the-seam-with-a-reason.png` (el verbo deshabilitado), `03-tech-web-main-with-metal.png` y `04-tech-web-metal-subweb.png`.

## Lo que queda de la fase 37 (y por qué)

El plan nombra, además de los diez nodos, cinco cosas que **no** se han hecho en esta entrega, dichas aquí en vez de dejarlas en silencio:

- **La fíbula de bronce** (sub-red Ropa) y **el sebo y las velas** (`tallow`, sub-red Fuego): son nodos nuevos en redes que todavía no existen (Ropa, Fuego, fases 14 y 16); declararlos antes que sus redes es el defecto de «contenido declarado e inerte».
- **La sal gema**: la sal no existe en esta rama (fase 15).
- **`charcoal` en la sub-red Fuego**: espera a que la fase 16 la abra; mudarlo es cambiar un campo.
- **`bronze-needs-a-trader`**: necesita el comercio de la fase 36 y una cohorte con mapa. Lo que sí hay medido es la escasez (una veta de estaño, a lo sumo veintiuno de bronce por isla).
- **El trabajo `smith`**: `JOBS` se negaba a tenerlo «hasta que M8.3 le dé un verbo»; el verbo es `craft` en el horno, que ya sesga el trabajo `crafter`. Un segundo trabajo con las mismas acciones no cambia nada que se pueda medir; la habilidad `smith` sí se entrena (las recetas del horno y las de martillar en frío) y es lo que importaba.

**Medidas diferidas por orden del propietario** (hasta cerrar M15): cohortes de 10 o 20 semillas de `sim:seeds`, `century` y `generations`. Lo medido: `typecheck`, la suite completa, un `sim:check` de una semilla de `band`, `craft`, `hearths`, `scribes` y `smiths`, y la e2e. `craft` y `hearths` dan la misma lista de fallos en el commit base y aquí; `smiths` y `band` fallan los de siempre (`perf-budget`, `cravings-steer-the-diet`, ...).
