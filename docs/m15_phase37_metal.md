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
