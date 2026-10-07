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
