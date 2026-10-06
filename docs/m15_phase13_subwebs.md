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

