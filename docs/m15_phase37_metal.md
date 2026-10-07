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
