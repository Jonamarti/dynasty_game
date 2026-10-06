# M15 fase 13 — Sub-redes de tecnología

Plan: [m15_plan.md](m15_plan.md), «Fase 13». Una sección por entrega.

## 13a — Datos y reubicación (2026-10-06, bit-idéntica)

**Qué se quería.** Dar a cada técnica una red (`web`) y a cada puerta la red que
abre (`opens`), y mudar a su sub-red lo que ya existe y es variante de su
puerta, cambiando solo `web`. La simulación no lee `web`, así que no cambia.

**Qué se hizo (`src/sim/knowledge/Tech.ts`).**

- `WebId = 'main' | 'arms' | 'field' | 'domestication'`; `WebDef { id, label,
  gate, color }`; `WEBS: Record<WebId, WebDef>` (incluye `main`, con `gate:
  null`); `SUB_WEBS: WebDef[]` (las que tienen puerta, en orden).
- `TechDef.web?: WebId` (opcional; ausente = `'main'`, así las ~50 técnicas que
  no se mueven no ganan una línea) y `TechDef.opens?: WebId`. Se lee con
  `webOf(tech)`; `techsOfWeb(web)` da las técnicas de una red en el orden de
  `TECHS`.
- Solo se declaran las redes que se abren ahora (regla «nada declarado e
  inerte»). Ropa, Conservación, Fuego, Tierra y Metal no existen todavía como
  `WebId`, y ninguno de sus nodos se movió.
- Etiquetas por `t()`: `Main web`/`Weapons` nuevas en `src/i18n/es/tech.ts`
  (`Field` y `Taming` ya tenían español); `src/i18n/tables.ts` las registra.
  `TechWeb.ts` no se toca: la red principal sigue dibujando todos los nodos
  (la pantalla es 13c).

| red | puerta (`opens`) | color | nodos mudados |
|---|---|---|---|
| `main` | — | `#9aa4b2` | todo lo demás |
| `arms` (Armas) | `spear` | `#c9694b` | `bow`, `atlatl` |
| `field` (Campo) | `farming` | `#8fb35a` | `composting`, `sickle`, `calendar`, `arboriculture` |
| `domestication` (Doma) | `taming` | `#c9a34b` | `herding`, `dairying`, `wool`, `dog` |

**Cómo se verificó** (en un contenedor Linux en la nube, con el sustituto
esbuild/shim de vitest; no se ejecutó `npm test` ni `npm run e2e`).

- Tests primero (`tech.test.ts`, «the sub-webs»): fallaban por import
  inexistente; ahora pasan. Comprueban que toda puerta está en `main`, que todo
  nodo de una sub-red requiere su puerta directa o transitivamente, que ninguna
  sub-red tiene menos de dos nodos, que todo `web`/`opens` apunta a `WEBS`, y que
  cada puerta tiene `opens` igual a su red y ningún otro nodo lo tiene.
- Hashes SHA-256 de `JSON.stringify(toCheckpointRecord(sim))` (script
  `classic-hashes.ts`, el de la fase 29 con semilla `phase13a` y un tick más) para
  las semillas `band`, `century` y `phase13a` en los ticks 0, 180, 500 y 1500:
  **12/12 coinciden** antes y después (`hashes-before.json` = `hashes-after.json`,
  `cmp` sin diferencias).
- `tsx tools/headless.ts --scenario band|hearths|craft` antes y después: todas
  las líneas coinciden salvo las de tiempo (`steps/s`, `ms`). Fallos de base,
  idénticos antes y después: `band` 2/137 (`cravings-steer-the-diet`,
  `perf-budget`); `hearths` y `craft` conservan sus fallos de siempre
  (`perf-budget` siempre en esta máquina lenta).
- `tsc --noEmit` limpio. Suite completa con el sustituto: 158 archivos, 1.100 tests (1.094 de base + 6 nuevos), todos pasan (`unit-full.log`; un test supera los 5 s en esta máquina lenta, `earthwork-checks`, ajeno a esta fase).
- Artefactos: `artifacts/verification/m15-phase13a-20261006/`.

## 13b — La receta como conocimiento (2026-10-06, bit-idéntica por ahora)

**Qué se quería.** Un nivel de nodo, `craft`, para recetas y variantes de su
puerta: se prueba rápido (dificultad × 0,4), se enseña también charlando, y por
lo demás viaja por la maquinaria de siempre.

**Qué se hizo.**

- `TechDef.tier?: 'technique' | 'craft'` (ausente = técnica; se lee con
  `tierOf`, como `web` con `webOf`).
- `Config.knowledge.craftDifficulty = 0.4`. **Un solo sitio** lee la dificultad
  de un nodo: `tryConceive` en `KnowledgeSystem`, que ahora llama a
  `difficultyOf(tech, knowledge)` (en `Tech.ts`); el cálculo del multiplicador
  no está en ningún otro sitio. Los checkpoints validan la config con la forma
  de `DEFAULT_CONFIG` (`copyConfig`), así que basta con añadir el campo allí,
  como hizo `foundersKnowRadius`; un checkpoint antiguo sin el campo ya no
  carga (la regla de siempre: «la configuración completa»).
- `KnowledgeSystem.teach` gana un parámetro opcional `only?: TechTier`, y un
  método nuevo `conversationLesson(a, b, mode, …)` llama a `teach(..., 'craft')`
  en las dos direcciones, en todos los modos menos `greet`. `ActionSystem.doTalk`
  lo llama justo después de `social.converse`.
- **Dado por candidata, medido a mano.** `teach` hace como mucho dos tiradas por
  intento (`rng.int` para elegir entre los candidatos y `rng.chance` para el
  éxito), y **ninguna si no hay candidato** (vuelve antes). La conversación solo
  considera nodos `craft`, así que una pareja sin ninguna receta que compartir
  no toma nada de `actionRng`; un test lo cuenta (0 tiradas). Hasta que exista
  el primer `craft`, ningún mundo cambia. No se añade ninguna tirada por técnica
  no craft.
- Las chispas «sobre todo de hacer y de lo manejado» son guía para el contenido
  de los nodos de 13d, no un mecanismo: no se construye nada en `Synthesis`.
- Refinar, olvidar y heredar: sin cambios. Un test pasa un `craft` por
  `advance` (sube de nivel y se retira en su techo), por `countHolders` (se va
  con su último portador vivo) y por `hearthLesson` (a un niño, a nivel 0).

**Qué nodos son `craft` en este commit: ninguno.** Los nodos que podrían
serlo por naturaleza (`bow`, `atlatl`, `sickle`, `wool`, `dairying`…) son
tecnologías con dificultad 0,4–0,6 calibradas con las medidas de M11, y
marcarlas `craft` bajaría su dificultad a 0,16–0,24 (la cota de
`ideas-are-conceived` es tres ideas por persona-año): sería un cambio de
comportamiento grande sin que el plan lo pida. El plan dice «recetas»: los
primeros nodos receta del plan son los de 13d (`stone_boiling`, `flatbread`),
y «nada declarado e inerte» impide declarar un nivel que nadie tiene. Por eso
el mecanismo se prueba con tests que marcan un nodo real como `craft` durante
un test y lo devuelven (`src/sim/__tests__/craft-tier.test.ts`, 15 tests). **La
medición de comportamiento pasa a los commits de 13d.**

**Cómo se verificó** (contenedor Linux en la nube, sustituto esbuild/shim de
vitest; no se ejecutó `npm test` ni `npm run e2e`).

- Tests primero: `craft-tier.test.ts` falló por import inexistente
  (`tierOf`, `difficultyOf`); ahora pasa (15 tests). Cubren: el multiplicador se
  aplica al craft y no a la técnica (y es lo que divide la tirada de
  concepción: la razón de probabilidades es exactamente 1/0,4); `chat`
  enseña un craft y no una técnica; `greet` no enseña; ambas direcciones;
  prerrequisitos; cero tiradas sin craft; refinar/heredar/olvidar.
- Hashes SHA-256 del registro de checkpoint (el script de 13a, con
  `config.knowledge.craftDifficulty` borrado del registro porque el campo
  nuevo forma parte de la config por diseño) para `band`, `century` y
  `phase13a` en los ticks 0, 180, 500 y 1500: **12/12 coinciden** con los de
  13a (`hashes-before.json` = `hashes-after.json`, `cmp` sin diferencias).
- `headless --scenario band|hearths|craft`: todas las líneas coinciden con las
  de antes de este commit salvo `steps/s` y `ms`.
- `tsc --noEmit` limpio. Suite completa con el sustituto: 159 archivos, 1.115 tests (1.100 de base + 15 nuevos), todos pasan (`unit-full.log`; el mismo test lento `earthwork-checks` supera los 5 s en esta máquina).
- Artefactos: `artifacts/verification/m15-phase13b-20261006/`.

**Qué queda abierto.** La premisa del plan («se enseña también en `chat`; hoy
solo en los modos largos») no coincide con el código: `SocialSystem.converse`
no enseña técnicas en ningún modo (comparte noticias, creencias y un lugar); las
técnicas viajan por `doTeach`, `doAsk`, `hearthLesson` y la observación. Lectura
conservadora adoptada: los crafts se enseñan en `chat`, `interests` y `deep` (no
en `greet`) y las técnicas siguen como estaban. Ver «Dudas abiertas», 5.

## 13d — `stone_boiling`: caldo (2026-10-06, comportamiento medido)

Primer commit de contenido de 13d. Es un cambio de comportamiento declarado: el
nodo existe en `TECHS`, así que puede concebirse, enseñarse y usarse.

**Qué hay.** `stone_boiling`, `tier: 'craft'`, dispositivo, edad
`upper_palaeolithic`, requiere `cooking` y `leatherwork`, dificultad 0,5 (0,2
efectiva), habilidad `cook`, prototipo `{ flint: 1, sticks: 2 }`, refinamiento
máximo 2, tres chispas (hacer algo con huesos a mano; hambre con piel y comida
reciente; ganas de variedad), todas de hacer, de objeto manejado o de querer.
Receta `broth` en la hoguera (`ingredients: { bone: 2 }`, `keep: 2`, 100 ticks).
Ítem `broth` añadido al final de `Item.ts`, sin entrar en ningún plan de
aparición. Es comida de grasa y proteína, sin carbohidrato, y no está en
`SICKENS`. `prove()` siembra `eat:broth` en la creencia de quien prueba el
primer caldo, para que el puntuador de comida lo tome por comida (mismo papel
que el asado). Textos en `src/i18n/es/tech.ts`.

**Por qué `craft`.** Es una receta de la hoguera: variante del asado, no una
herramienta nueva. Sin ningún nodo existente que lo fuera (duda 6), este es el
primero.

**Tests.** `src/sim/__tests__/craft-nodes.test.ts` (9): declaración, dificultad
0,4, receta, ítem, chispas, enseñanza por `chat`, prueba y creencia, y un caldo
hecho de punta a punta en una hoguera.

**Medida.** Los informes `band`, `hearths` y `craft` de antes y después
coinciden en fila final (vivos 31/31, 42/42, 13/13) y en estado de checks
(ninguno cambia; fallos 2, 6 y 6 en ambos lados). En carreras cortas nadie
descubre técnicas, así que esa medida no ve el nodo. Para verlo se siembran dos
fundadores por banda con el nodo (`exercise.ts`, 2 bandas, 10000 pasos, hoguera
colocada en el paso 300): el nodo se enseña (14 y 15 lecciones, 20 y 22
portadores al final) y el recuento de población no se hunde (25 a 30 y 25 a 32
frente a 25 a 29 y 25 a 33 antes). **Pero casi no se cocina caldo** (0
`crafted_broth`): el hueso escasea (24 cosechados, y la aguja y el pico de
asta lo consumen), y solo en 43 de ~4000 muestras alguien lleva dos a la vez. Con
huesos servidos cada 100 pasos el mismo escenario hace 255 caldos, así que el
camino funciona y el límite es el suministro de hueso. Un cambio de
suministro (por ejemplo `bone` 1 más grasa 1) queda para el propietario.

**No se corrió** la cohorte de 20 semillas; queda para la máquina del
propietario. Los números anteriores de supervivencia son de carreras cortas con
caos por divergencia del RNG: no son atribuibles al nodo.

**Verificación:** sustituto esbuild/shim de vitest y página servida por esbuild
en un contenedor Linux en la nube, no `npm test` ni Vite.

**Capturas:** `artifacts/screenshots/m15-phase13d-stone_boiling-2026-10-06/`.

## 13d — `flatbread`: torta, y Cocina se abre (2026-10-06, comportamiento medido)

**Qué hay.** `flatbread`, `tier: 'craft'`, dispositivo, edad `mesolithic`
(Epipaleolítico; Shubayqa 1, hace unos 14.400 años), requiere `cooking` y
`grinding`, dificultad 0,45 (0,18 efectiva), habilidad `cook`, prototipo
`{ flint: 1, sticks: 2 }`, tres chispas de hacer, de objeto manejado (`meal`) y de
querer. Receta `flatbread` en la hoguera: `meal: 1` → `flatbread: 1`, 90 ticks,
sin horno. Ítem `flatbread` al final de `Item.ts` (nutrición 38 entre `meal` 34
y `bread` 42; carbohidrato; caduca a los 2400 ticks, el pan del horno no;
no enferma). La prueba del primer pan siembra `eat:flatbread` por el mismo
camino que el caldo.

**Cocina se abre.** `WEBS.kitchen` (puerta `cooking`), `cooking.opens =
'kitchen'`, y `stone_boiling` lleva `web: 'kitchen'`. Ya hay dos nodos con
efecto, que es lo que pide la regla de 13a. `techsOfWeb('kitchen')` es
`stone_boiling`, `flatbread`. La etiqueta «Cocina» está en `i18n/es/tech.ts`.
La expectativa de `tech.test.ts` sobre `SUB_WEBS` pasa de tres redes a cuatro: es
el cambio que el plan declara, no un test debilitado. `TechWeb.ts` (13c, otro
agente) lee `SUB_WEBS` y mostrará la red nueva sin que yo lo toque.

**Por qué `craft`.** Es una receta de la hoguera. `bread` (el horno, requiere
`farming`) sigue siendo una técnica de la red principal.

**Tests.** 7 más en `craft-nodes.test.ts`: declaración, apertura de Cocina,
receta, ítem, chispas, enseñanza por `interests`, y una torta horneada de punta a
punta.

**Medida.** `band`, `hearths` y `craft` coinciden en fila final (vivos 31/31,
42/42, 13/13) y en estado de checks (ninguno cambia; fallos 2, 6 y 6). Con
siembra de dos fundadores por banda (10000 pasos, dos semillas): se enseña (12 y
13 lecciones, 18 y 21 portadores) y la población no se hunde (semillas a y b, de
25 a 30 y 33 con siembra, a 30 y 29 sin ella, y a 30 y 32 antes del commit; el 29
sin siembra es divergencia del RNG, el nodo concebido en tres ocasiones no se
construyó nunca). **No
se hornea ninguna torta** porque no hay harina: en carreras cortas nadie
construye la muela, y la torta pide `meal`. Con harina servida a los portadores
el mismo escenario hornea 398 tortas, así que el camino funciona; el límite es el
suministro, otra vez. Los números de supervivencia son de carreras cortas con
caos por divergencia del RNG: no son atribuibles al nodo.

**No se corrió** la cohorte de 20 semillas; queda para la máquina del
propietario.

**Verificación:** sustituto esbuild/shim de vitest y página servida por esbuild
en un contenedor Linux en la nube. **Capturas:**
`artifacts/screenshots/m15-phase13d-flatbread-2026-10-06/`.

## 13d — `fire_hardened_spear`: la lanza endurecida (2026-10-06, comportamiento medido)

**Qué hay.** `fire_hardened_spear`, `tier: 'craft'`, `web: 'arms'`, edad
`middle_palaeolithic`, requiere `spear` y `firemaking`, dificultad 0,3 (0,12
efectiva), habilidad `knap`, `refinamiento` máximo 2. Es una **práctica** que se
prueba cazando (`practisedBy: ['hunt']`): no hace ningún ítem nuevo, así que no
tiene prototipo. Tres chispas (cazar con lanza; palo con punta y brasas;
presa escapada).

**El efecto, un término.** `weaponPower(person, tech)` en `Tech.ts` es
`techPower` y, solo para la lanza, `x scaled(person, 'fire_hardened_spear',
HARDENED_SPEAR)` con `HARDENED_SPEAR = 1.25`. Lo leen `weaponOf` y
`weaponItemOf`, que son lo que llaman `doHunt` (`weapon.hunt * weapon.power`) y
`doAttack` (`weapon.damage * weapon.power`), así que ni `ActionSystem` ni el
cerebro cambian. Para quien no sabe el nodo `scaled` es `1 + 0 * ...` y el
poder es exactamente el de antes. El arco y el átlatl no se tocan; un arco
(2,4 de caza) sigue por encima de la lanza endurecida (1,6 x 1,25 = 2,0).

**Por qué `craft`.** Es una variante de su puerta, no un diseño nuevo: se
descubre con facilidad (carbonizar la punta) y se enseña de pasada, que es como
se difundiría un truco así. **Por qué no cambia la edad del plan:** el plan la
pone en el Paleolítico inferior (Clacton, hace unos 400.000 años), pero `spear`
y `firemaking` están en el medio, y el test de edades prohíbe un nodo anterior a
sus requisitos. Se deja en el medio y el `firstKnown` conserva los 400.000 años.

**Tests.** 6 más en `craft-nodes.test.ts`: declaración y red, edad y práctica,
efecto en caza y combate para quien lo sabe, término único (el arco, y quien no
lo sabe, intactos; el refinamiento lo endurece más), chispas y enseñanza por
`chat`.

**Medida.** `band`, `hearths` y `craft` coinciden en fila final (vivos 31/31,
42/42, 13/13) y en checks (ninguno cambia; fallos 2, 6 y 6). Las carreras de
ejercicio sin siembra dan **el mismo resultado antes y después** (25 a 30 y 25 a
29): nadie concibe el nodo. Con siembra de dos fundadores por banda se enseña
(14 y 13 lecciones, 21 portadores) y la población no se hunde (25 a 30 y 33),
pero se caza poco (2 `armed_hunt` por carrera): el efecto se lee pero casi no
se ejerce. Es la caza la que es rara, no el nodo. No hay captura: el nodo no
añade nada visible fuera de la red de tecnología, cuya pantalla es 13c.

**No se corrió** la cohorte de 20 semillas; queda para la máquina del
propietario. **Verificación:** sustituto esbuild/shim de vitest y un servidor
esbuild en un contenedor Linux en la nube.

## 13d — `sling`: la honda (2026-10-06, comportamiento medido)

**Qué hay.** `sling`, `tier: 'craft'`, `web: 'arms'`, edad `neolithic`, requiere
`spear` y `cordage`, dispositivo, dificultad 0,4 (0,16 efectiva), habilidad
`hunt`, prototipo `{ thatch: 2, flint: 1 }`, tres chispas (cazar con sílex en la
mano; trenzar cuerda; presa escapada). Ítem `sling` al final de `Item.ts`: una
mano, `weapon: { damage: 0.2, reach: 1.4, hunt: 1.7, tech: 'sling' }`. Receta
`sling` sin estación: `rope: 1`, `flint: 2`, `keep: 1`.

**Efecto.** `weaponOf` y `weaponItemOf` ya leen cualquier ítem con `weapon`, así
que `doHunt` elige la honda (1,7) antes que la lanza (1,6) y más que el hacha;
el arco (2,4) y el átlatl (2,1) siguen por encima. En una pelea (`damage`) la
lanza (0,55) vale más que la honda (0,2) y es la elegida. Es una arma cara de
fabricar y barata de llevar, de alcance mayor que la lanza.

**Por qué `craft`.** Es una receta de un objeto pequeño cuyo diseño nadie tiene
que descifrar, a diferencia del arco, que es una técnica (un resorte que hay
que entender); y la honda del pastor es el arma a distancia más antigua que hay.

**Munición: lo que no se hizo.** No hay modelo de munición: el arco no lo tiene
(la caza no gasta nada), así que se hizo lo mínimo honesto. El sílex es el coste
de la receta (dos por honda) y no se gasta al cazar. **Tampoco se limita a la
caza menor**: `weaponOf` no sabe qué animal se persigue, y el término vale lo
mismo contra una liebre que contra un jabalí. Ambos huecos están en `bugs.md` y
en `next-steps.md`; arco y átlatl tienen el mismo.

**Arte.** Icono `item/sling` (la bolsa de cuero con una piedra y dos cuerdas) y
mano `held/sling/{S,E}`, en `art/src/props/items.ts` y `held.ts`; el atlas
`public/art/props.*` se regenera con `tools/art/build.ts` (solo cambia el de
`props`; personas, edificios y animales salen idénticos). La hoja
`tools/art/sheet.ts` **no pudo ejecutarse** en este contenedor (falta el binario
nativo de rolldown que carga Vite), así que se revisó recortando el atlas
regenerado: `artifacts/screenshots/m15-phase13d-sling-2026-10-06/`. Se añadió
`sling` a `HeldItemKind`, `HELD_PRIORITY`, `EquipmentAnimation` y `sheet-page.ts`,
y `art.test.ts` exige ahora su mano y su icono.

**Tests.** 8 más en `craft-nodes.test.ts` y 2 en `art.test.ts`: declaración,
valores del arma frente a la lanza y el arco, receta, el arma para quien lo
sabe y nada para quien no, elección en caza y en pelea, chispas, enseñanza y una
honda fabricada de punta a punta.

**Medida.** `band`, `hearths` y `craft` coinciden en fila final (vivos 31/31,
42/42, 13/13) y en checks (ninguno cambia; fallos 2, 6 y 6). Ejercicio sin
siembra, semillas a y b: 25 a 30 y 29 antes; 25 a 30 y 28 después. La
diferencia de b es divergencia del RNG (añadir un nodo cambia el conjunto de
candidatos de `tryConceive`), no es atribuible al arma, que nadie tenía. Con
siembra se enseña (14 y 13 lecciones, 21 portadores), se fabrican hondas (4 en la
semilla b) y la población no se hunde (25 a 30 y 32).

**No se corrió** la cohorte de 20 semillas; queda para la máquina del
propietario. **Verificación:** sustituto esbuild/shim de vitest y página servida
por esbuild en un contenedor Linux en la nube.

## 13d — el check `sub-webs-are-climbed` (2026-10-06)

**Qué hay.** Un bloque en `tools/simcheck.ts`, añadido tras `cooking-spreads`
(donde se registran los checks de conocimiento) y una constante junto a
`FIRE_RIM`; ninguna otra edición del archivo. Solo corre en `hearths` y `craft`.

**Lo que mide, y por qué no lo que el plan decía.** El plan pedía «al final hay
al menos N nodos de sub-red conocidos». No se puede: ninguno de los dos
escenarios dura un año (16000 pasos), y en menos de un año nada se prueba
(`ideas-become-tech` sale n/a por eso). Los nodos de sub-red conocidos al final
son **0 en ambos escenarios en este build**, así que un umbral sobre ellos
fallaría siempre (un check nuevo en rojo, no medido por una causa real). Se
mide entonces la puerta: alguien vivo conoce una técnica con `opens` (`cooking`
en `hearths`, `spear` en `craft`), N = 1. El detalle imprime también cuántos
nodos de sub-red se conocen, para que el día que un escenario más largo o con
nodos sembrados los alcance, el umbral sobre nodos sea un cambio de una línea.

**Falla en el árbol anterior.** Se copió el archivo a un árbol en el commit
anterior a 13a (sin `opens`) y se corrió: en ambos escenarios
`FAIL sub-webs-are-climbed 0 sub-web gates known at the end`. En este árbol:
`PASS ... 1 sub-web gates known at the end (cooking)` y `(spear)`. Salidas en
`artifacts/verification/m15-phase13d-20261006/sub-webs-are-climbed/`
(`*-pre13.txt` y `*-after.txt`).

**Cambios de estado de checks.** Solo el nuevo: n/a (no existía) a PASS en
`hearths` y `craft`. Fallos antes y después: `hearths` 6 y 6, `craft` 6 y 6,
`band` 2 y 2 (los mismos checks). Ningún PASS pasa a FAIL ni a n/a.

**No se corrió** la cohorte de 20 semillas; queda para la máquina del
propietario. **Verificación:** sustituto esbuild/shim de vitest, informes
headless en un contenedor Linux en la nube.

## Dudas abiertas

1. **Cocina no se abre en 13a.** La tabla del plan supone que el asado, `bread` y
   `brewing` son variantes de `cooking`, pero hoy: el asado (fase 3) es una
   receta (`roast_meat`, `roast_fish`), no una técnica, así que no hay nada que
   mudar; `bread` requiere `grinding`, `farming` y `firemaking`, y `brewing`
   requiere `pottery` y `farming`, y **ninguna de las dos requiere `cooking`**,
   ni directa ni transitivamente. Mudarlas rompería la regla «todo nodo de una
   sub-red requiere su puerta», y cambiar sus `requires` sería un cambio de
   comportamiento. Quedan en `main`, y Cocina (0 nodos) no se declara ni se abre.
   13d trae `stone_boiling` y `flatbread` (ambos con `cooking`): ahí hay dos nodos
   y puede abrirse; qué hacer con `bread` y `brewing` (¿añadirles `cooking` como
   requisito, medido?) lo decide el propietario o 13d.
2. **Ropa (`tailoring`, `spinning`, `weaving`)** se queda en `main` hasta la fase
   14, como dice la tabla. Además `spinning` y `weaving` solo requieren
   `cordage`, `spinning` y `basketry`; ninguna requiere `clothing`, así que
   tampoco podrían mudarse a Ropa sin tocar `requires` (`tailoring` sí requiere
   `clothing`).
3. `irrigation` y `pack_animals`/`horse_riding` no existen aún (fases 26 y 35):
   nada que mudar. `arboriculture` (fase 24) y `dog` (fase 23) sí existen y se
   mudaron a Campo y Doma.
4. Los ids de red (`arms`, `field`, `domestication`) son nombres internos
   elegidos aquí; las etiquetas visibles son «Armas», «Campo», «Doma».
5. **El plan dice que hoy enseñan los modos largos de conversación; el código no.**
   `converse` no llama a `teach` en ningún modo. 13b añade la enseñanza de crafts
   en `chat`, `interests` y `deep`; si el propietario quería que además las
   técnicas se enseñaran en los modos largos, es un cambio aparte (medido).
6. **Ningún nodo existente es `craft`** (ver 13b). Si el propietario quiere que
   `bow`/`atlatl`/`sickle`… lo sean, hay que medir el efecto de bajar su dificultad.

7. **Caldo con hueso y grasa (13d).** El plan decía «hueso 2 (o hueso 1 y
   grasa 1) y agua». No hay ítem `fat` ni `water` en el inventario, así que se
   implementó solo `bone: 2`. El agua se da por supuesta en la hoguera.
8. **Cocina y el orden de los commits.** El plan pedía abrir Cocina con
   `stone_boiling`, pero la regla de 13a pide dos nodos con efecto por red. Se
   abre con `flatbread`, en el commit siguiente.
9. **Prototipo de `stone_boiling`.** Con huesos en el prototipo se concibió 9
   veces en 30000 pasos y nunca se construyó; se usan `flint` y `sticks`.
10. **Suministro de hueso.** Ver la medida de 13d: el caldo se enseña pero casi
    no se cocina. ¿Aceptable, o se abre otra fuente de hueso?
11. **Edad de `fire_hardened_spear`.** El plan dice Paleolítico inferior, pero
    el test de edades prohíbe una edad anterior a la de los requisitos
    (`firemaking`, `spear`); se decidirá en su commit.
12. **Torta sin harina.** `flatbread` se enseña pero no se hornea en carreras
    cortas porque `meal` depende de una muela que casi nadie construye. ¿Basta,
    o se quiere una receta de torta con grano o bellota sin moler?
13. **Edad de `fire_hardened_spear`, decidida.** Queda en `middle_palaeolithic`
    (ver la sección de arriba); si se quiere la edad del plan hay que mover
    `spear` y `firemaking` o aflojar el test de edades.
14. **Honda sin munición ni tope de presa.** Ver arriba y `bugs.md`. ¿Se
    quiere un modelo de munición para los tres proyectiles (arco, átlatl,
    honda) en una fase propia?
15. **Honda por encima de la lanza en caza.** Con 1,7 frente a 1,6 la honda
    desplaza a la lanza en una cacería (no a la lanza endurecida, 2,0). Es una
    elección de diseño para que el nodo no sea inerte; el propietario puede
    bajarla.
16. **`sub-webs-are-climbed` mide puertas.** Ver arriba: el plan decía nodos,
    pero con escenarios de menos de un año los nodos conocidos son 0. Para medir
    nodos haría falta un escenario más largo o con nodos sembrados (`startingTech`),
    es decir tocar escenarios, que este encargo no permitía.
17. **Validación pendiente.** La cohorte de 20 semillas de 13d (no se corrió) y
    la decisión sobre `bread`/`brewing` y `cooking` (duda 1) son del propietario.


## 13c — La pantalla: la red se abre y no se mueve (2026-10-06)

**Qué se quería.** Que la red principal (`G`) dibuje solo los nodos de `main`;
que una puerta que el personaje del jugador conoce lleve una marca «conocidos /
total» que abre la misma superposición filtrada por red, con miga de pan y
vuelta con `Escape`; que una sub-red cuya puerta no se conoce no exista para el
jugador; y que el trazado deje de moverse (`docs/bugs.md`, «The tech web's
arrangement shifted…»).

**Qué se hizo.**

- `TechWebLayout.ts`: `layOutWeb(web = 'main', { previous?, members? })`. Una
  red dibuja sus nodos y, si es sub-red, **su puerta como raíz** (nodo `main` ya
  conocido; sin ella las aristas de la red no tendrían de dónde salir). Ningún
  otro nodo de otra red, y `webEdges(members)` solo une nodos de la propia red
  (las aristas compartidas se calculan por red, no se filtran, para que el tope
  de grado no se gaste en aristas que no se dibujan). Es **incremental**: los
  nodos de `previous` que siguen siendo miembros conservan `x, y` exactamente; los
  nuevos se siembran donde los habría sembrado el primer trazado, se relajan con
  los colocados **congelados** (`lockX/lockY` de `GraphLayout`: empujan y tiran,
  pero su resultado se descarta), en orden de `TECHS`, y `settleOverlaps` los
  separa. El primer trazado sigue desplazándose al origen; los siguientes no
  (desplazar movería lo que esto quiere quieto), así que `WebLayout` gana
  `bounds` y `origin` y puede haber coordenadas negativas tras crecer. El
  argumento `previous` no se modifica. `members` solo lo usan los tests para
  simular una tabla que crece.
- `TechWeb.ts`: un trazado por red (`layouts: Map<WebId, WebLayout>`), reutilizado
  mientras no cambie el número de nodos; el digest incluye la red en pantalla y,
  por cada sub-red, si es visible y cuántas conoce el sujeto (aprender una puerta
  cambia la pantalla sin cambiar un solo nodo). `openWeb`/`back`; clic en
  `[data-web]` (marca o miga), `[data-back]`. `Escape` dentro de una sub-red
  vuelve a la principal y llama a `stopImmediatePropagation()`: `main.ts` cierra
  cualquier grafo abierto con la misma tecla «por si acaso» y sin esto el primer
  `Escape` sacaría al jugador de la red entera. El segundo cierra como siempre.
  `main.ts` no se toca.
- **Visibilidad** (`webVisible`): una sub-red es visible si el personaje del
  jugador (`sim.player`; el sujeto si no hay jugador) conoce su puerta. Sin eso no
  hay marca, `openWeb` la rechaza y ningún nombre de sus nodos sale en pantalla:
  `labelOf` sustituye el nombre de una técnica de red oculta por «algo que aún no
  sabes nombrar» en el panel de detalle («se apoya en…» y los ingredientes de las
  chispas). Hoy ninguna técnica `main` apunta a una de sub-red (se comprobó); la
  guardia es para cuando 13d añada nodos.
- **Una puerta desconocida** es un nodo normal de la red principal, con las reglas
  de siempre para lo desconocido (oscuro y sin nombre si le falta algo; con
  nombre si es comprensible), y **sin marca**. La marca solo existe si el
  personaje la conoce.
- La marca es un `<span role="button" data-web>` dentro del botón del nodo (un
  botón dentro de un botón no es HTML válido), con el color de `WEBS[..].color`,
  el nombre de la red y «n / m». `n` cuenta lo que conoce el **sujeto** de la red
  abierta; la visibilidad depende del **observador**. Con el sujeto = jugador (el
  caso normal) es exactamente «conocidos por el personaje del jugador». Un
  margen invisible (`::before`) la hace pulsable con el dedo.
- Miga de pan: fila propia bajo la cabecera, solo en sub-redes: botón «‹ Volver»
  (táctil, 36 px en móvil), «Red principal» (enlace) › nombre de la red (con
  subrayado de su color); la tarjeta lleva una barra superior del color de la
  red. Una sub-red pequeña se encuadra hasta 1,5x (la principal, 1,1x).
- Móvil: la tarjeta se ancla arriba en vez de centrarse. Hallazgo del e2e: en un
  móvil un toque es primero un «hover» que enfoca el nodo, el panel de detalle de
  debajo cambia de alto y una tarjeta centrada se recentra, moviendo la marca
  bajo el dedo antes del clic (el toque caía en una arista SVG). Crece solo hacia
  abajo y no se mueve.
- Cadenas por `t()`: «something you cannot yet name», «Where you are in the
  web», «Open {web}: {known} of {total} known» (`es/ui.ts`); «Back», «Main web»
  y las etiquetas de red ya existían.
- Test existente tocado por diseño (la principal ya no dibuja todo):
  `smoke.spec.ts` «the tech web opens on G…» cuenta `techsOfWeb('main')` en vez de
  `TECHS`; en `techweb.test.ts`, «places every technology exactly once» pasa a ser
  «of the web» (la unión de las redes la comprueba el test nuevo), el test de
  extremos de aristas se hace por red, y el de anillos usa `bow` (ahora en Armas)
  desde el trazado de `arms`.

**Cómo se verificó** (contenedor Linux en la nube, sustituto esbuild/shim de
vitest y página servida con esbuild para Playwright; no se ejecutó `npm test` ni
`npm run e2e`).

- Tests unitarios primero (`techweb-subwebs.test.ts`, 10 tests): 5 fallaban
  (`layOutWeb` ignoraba la red) antes de implementar; ahora pasan. Cubren: la
  principal sin ningún nodo ni arista de sub-red, una sub-red con sus nodos y su
  puerta (todos alcanzables desde la puerta), cada técnica en exactamente una red,
  mismo resultado dos veces en cada red, **los nodos ya colocados conservan sus
  coordenadas exactas al añadir nodos** (en uno y en dos pasos), los nuevos sin
  solapes y deterministas, `previous` intacto, trazados independientes por red y
  `bounds` que contienen todo tras crecer. Nada fija el número ni los miembros
  de las redes.
- e2e nuevo `e2e/tech-subwebs.spec.ts` (5 tests; los e2e se escribieron junto a la
  implementación y no se vieron fallar contra la versión anterior, que no tiene
  marcas: es obvio que (a) fallaría ahí): (a) marca «1 / m», clic, miga, nodos de
  la sub-red y su puerta como raíz, `Escape` vuelve, segundo `Escape` cierra sin
  abrir el menú, botón «Volver» y miga «Red principal» funcionan, y reabrir
  empieza en la principal; (b) la sub-red de una puerta desconocida no tiene marca
  y ninguno de los `data-tech` ni de los nombres de sus nodos está en el HTML ni
  en el texto de la superposición, y toda arista acaba en un nodo dibujado; (c) un
  clic derecho en un terreno vacío abre el menú radial con la red cerrada
  (control) y **no** lo abre sobre la red (principal ni sub-red), el panel del HUD
  no cambia, y al cerrar el mismo clic vuelve a ser del mundo; (d) las posiciones
  de todos los nodos son idénticas antes y después de aprender las puertas con la
  red abierta, tras entrar en una sub-red y volver, y tras cerrar y reabrir; (e)
  capturas, con el móvil comprobando que «Volver» cabe en pantalla y mide ≥ 30 px.
  Dos pasadas seguidas: 5/5 y 5/5.
- Subconjuntos de `smoke.spec.ts`: `-g "tech web"` 5/5, `-g "Escape opens the menu"`
  1/1, `-g "Spanish"` 2/2.
- `tsc --noEmit` limpio. Suite completa con el sustituto
  (`JOBS=2 node /home/claude/work/harness/unit.mjs`): **159 archivos, 1.110 tests,
  0 fallos** (1.100 de 13a + 10 nuevos; un test supera los 5 s en esta máquina
  lenta, `earthwork-checks`, ajeno).
- **Aviso del entorno:** el servidor de la arnés de Playwright devuelve 404 a
  `/favicon.ico` y `guardErrors` lo cuenta como error de consola, así que con la
  configuración de la arnés tal cual incluso el test «Escape opens the menu» (que
  no toca nada mío) falla en esa línea. Las pasadas de arriba se hicieron con una
  copia de la configuración y del servidor que responde 204 a `/favicon.ico` (copia
  fuera del repositorio; no se commitea). No es un cambio del juego.
- Capturas en `artifacts/screenshots/m15-phase13c-subwebs-2026-10-06/` (1280x800;
  la 4, 390x844 móvil como el test existente), vistas una a una:
  `1-main-web-gate-mark.png` (red principal con la marca «Weapons 1 / 2» en la
  lanza), `2-sub-web-breadcrumb.png` (Armas abierta: «‹ Back · Main web › Weapons»,
  barra y raíz de color), `3-sub-web-spanish.png` (la misma en español, con el
  detalle de «El arco»), `4-sub-web-phone.png` (móvil con Armas abierta, botón
  «Back» a la vista).
- **Pendiente del propietario:** añadir `e2e/tech-subwebs.spec.ts` a la lista del
  script `e2e` de `package.json` (COMMON.md prohíbe tocarlo aquí).

**Qué queda abierto.** Ver «Dudas abiertas de 13c» abajo.

### Dudas abiertas de 13c

1. **El bug de `bugs.md` queda arreglado a medias, y lo digo en su anotación.**
   El mecanismo está (un nodo con sitio no se mueve cuando llega otro, probado),
   pero el estado del trazado vive en la página: no se guarda entre sesiones ni se
   fija en el repositorio. Si alguien retoca `MAX_PUSH`, `heat` o `AT_REST` de
   `GraphLayout`, el primer trazado de cada red cambia en la siguiente carga, y lo
   que sí queda quieto es lo que ya estaba abierto. Fijarlo entre versiones pediría
   guardar las posiciones (localStorage o un archivo versionado); no se hizo por no
   inventar una persistencia que el plan no pide.
2. **El e2e (d) no puede añadir una técnica a la tabla en caliente**, así que
   demuestra que aprender no mueve nada; que añadir nodos no mueve los previos lo
   demuestra el test unitario (la tabla no crece en ejecución).
3. **Marca para un sujeto distinto del jugador.** Se cuenta lo que sabe el sujeto
   y se decide la visibilidad con lo que sabe el observador (el jugador). La lectura
   literal del plan («conocidos por el personaje del jugador») coincide con la
   mía cuando el sujeto es el jugador. Si se prefiere contar siempre lo del jugador,
   es cambiar una línea en `gateMark`.
4. **La puerta como raíz de la sub-red** es una decisión mía (el plan no dice qué
   dibuja la sub-red): sin ella las aristas hacia la puerta no existirían y la
   sub-red sería un conjunto flotante. Cuenta como nodo de la red principal, no
   entra en los «n conocidas».
5. Las sub-redes con un nodo que requiere técnicas de `main` distintas de la
   puerta (p. ej. `sling` requerirá `cordage`) no dibujan esa otra técnica: se
   explica en el panel de detalle («se apoya en…»), no con una arista.

## 13d — corrección del check: cuenta nodos, no puertas (2026-10-06, revisión de integración)

**Qué se quería.** Que `sub-webs-are-climbed` mida lo que dice el plan: nodos
de sub-red conocidos al final de `hearths` y `craft`.

**Por qué se cambia.** La primera versión (commit anterior) exigía una puerta
conocida. La puerta es una técnica de `main`, y `craft` arranca con la lanza
sabida: el check pasaba en cualquier build con una sub-red declarada. `AGENTS.md`
lo dice así: un check que tranquiliza y no detecta nada es peor que ninguno. La
justificación de entonces («ningún escenario dura un año») tampoco era exacta:
16.000 pasos son 66,7 días, 1,67 años de 40 días.

**Qué se hizo.** N = 1 nodo de sub-red conocido por alguien vivo. n/a si nadie
conoce una puerta, o si la corrida dura menos de un año; FAIL si hay puerta, ha
pasado un año y no hay nodos.

**Resultado.** `hearths`: FAIL, 1 puerta (`cooking`), 0 nodos; 7/140 fallos
(antes 6). `craft`: FAIL, 1 puerta (`spear`), 0 nodos; 7/140 (antes 6). `band`
no corre el check: 2/137, igual. Es un hallazgo del mundo, no del check: las
recetas se enseñan pero nadie las concibe desde cero en ese plazo (ver
`bugs.md`). No se ha ajustado ninguna constante.

**Queda abierto.** Decisión del propietario: alargar el escenario, sembrar una
receta en los fundadores de `craft`, o dar una fuente de hueso y de harina. La
duda 16 de arriba queda sustituida por esta sección.

## Integración y verificación conjunta (2026-10-06)

**Qué se hizo.** 13c se trajo sobre la rama de 13b y 13d (`m15/phase13`); el
único conflicto fue este documento. Los dos specs nuevos se añaden al script
`e2e` de `package.json`.

**Cómo se verificó.** Todo en un contenedor Linux en la nube, sin `npm
install` posible: los tests unitarios corren en un sustituto de vitest
(esbuild más un shim con el `expect` de vitest) y Playwright contra una página
servida por esbuild, no por Vite. **No se ha ejecutado `npm test`, `npm run
e2e`, `npm run sim:check:all` ni ninguna cohorte de semillas.**

- Typecheck (`tsc --noEmit`): limpio.
- Unitarios: 161 archivos, 1.156 tests, todos pasan (base antes de la fase:
  158 archivos). Un test de `earthwork-checks` supera los 5 s en esta máquina.
- E2e, lista completa del script: 86 de 89 pasan. Los tres que fallan
  (`freshwater` «continental river…», `geographic-terrain`, `water-depth`)
  fallan igual en `master` (`8aba05f`) con este mismo sustituto: importan
  módulos sueltos por ruta y el sustituto les da instancias de clase distintas
  de las del juego. No tocan nada de esta fase; hay que verlos pasar con Vite.
- Headless: `band` 2/137 fallos (igual que antes); `hearths` y `craft` 7/140
  (antes 6): el único cambio es `sub-webs-are-climbed`, en rojo a propósito.

**Capturas.** `artifacts/screenshots/m15-phase13-integrada-2026-10-06/`: red
principal con las marcas de Cocina y Armas, sub-red Armas con sus cuatro
nodos, la misma en español y en móvil.

**Pendiente antes de dar la fase por cerrada.**
1. `npm run verify` real en la máquina del propietario.
2. Cohorte de 20 semillas de 13d (coste declarado: 3 puntos o menos).
3. Las decisiones de «Dudas abiertas» y el hallazgo de `sub-webs-are-climbed`.
