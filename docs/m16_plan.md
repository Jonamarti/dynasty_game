# Dynasty — Plan M16 (versión 2)

Fecha: 2026-10-05. Estado: **plan aprobable; no empezar hasta que M15 esté
cerrado y el autor lo indique.**

| Documento | Para qué |
|---|---|
| `docs/m16_plan.md` (este) | qué se hace, en qué orden y cómo se comprueba |
| `docs/m16_bugs.md` | triaje de `bugs.md`, `next-steps.md` y las notas del autor, con identificadores |
| `docs/m16_revision_qa.md` | las revisiones críticas (05-10 y 13-10) que dieron lugar a esta versión |
| `docs/m16_plan_v1.md` | la versión anterior, como registro |
| `docs/m16_room_temp_plan.md` | temperatura exterior e interior; es el punto de partida del carril MUNDO |
| `docs/m16_notes.md` | observaciones de implementación heredadas de M15 |
| **Parte D de este plan** | carriles de trabajo para agentes en paralelo, con las notas N12–N46, la infraestructura de reparto (D7) y una ficha por carril (D8) |

> Las rutas `plan/…` y `diseno/…` que citaban versiones anteriores de este
> plan no existen en el repositorio: los documentos de diseño
> `prevision_npc.md` y `m16_tests_inicio_jugabilidad.md` se quedaron fuera. Si
> el autor los tiene, van a `docs/`; si no, el porqué de cada decisión es el
> que está escrito en cada fase.

Base revisada: `master` en `cf903f7` (M15 fase 29) para las Partes A–C;
**`b88309f` (`0.15.138-alpha`, 2026-10-13) para la Parte D y las
correcciones marcadas «2026-10-13»**. Nada de este plan se ha ejecutado; los
nombres de funciones citados se leyeron en esos commits y pueden haberse
movido.

---

# Parte A — Cómo se trabaja

## A1. Qué es M16

Todas las funcionalidades funcionando, con algoritmos por pulir. **Sigue
siendo alfa** (`0.16.x-alpha`): `AGENTS.md` prohíbe llamar «beta» a ninguna
versión, en la interfaz, un commit o el changelog, hasta que el autor lo diga.
Si un agente cree que el juego está listo para salir de alfa, lo escribe en
`docs/next-steps.md` y no toca la versión.

1. Los NPC miran al futuro y se organizan solos.
2. Dirigir a un personaje es cómodo y descubrir técnicas tiene gracia.
3. Probar el juego es rápido.

## A2. Orden y tramos

Los bloques van numerados en el orden en que se ejecutan.

| Tramo | Bloques | Al terminar el tramo |
|---|---|---|
| **1. Núcleo** | 0 Entrada · 1 Pruebas · 2 Fallos · 3 Control del jugador · 4 Previsión · 5 Asamblea y mando | ya se juega de principio a fin (sigue en alfa); se puede parar aquí |
| **2. Mundo** | 6 Objetos, obras y oficio · 7 Otras bandas | |
| **3. Juego** | 8 Descubrimiento · 9 Modos de partida | |
| **Cierre** | 10 Calibración y cierre | sus fases 10.1 a 10.4 se pasan también al final de cada tramo |

> **Actualización 2026-10-11.** La tabla de carriles de abajo es la original
> (agrupada por bloque). La agrupación vigente para repartir trabajo es la de
> la **Parte D**, que reparte también las notas N12–N46 y las pruebas de
> funcionalidad. Donde difieran, manda la Parte D.

**Carriles en paralelo** (para varios agentes a la vez):

| Carril | Fases | Toca sobre todo |
|---|---|---|
| A | bloque 1 | `tools/`, `package.json` |
| B | bloque 2 | sistemas sueltos, interfaz, arte |
| C | bloque 3 | `ActionSystem`, interfaz |
| D | bloques 4, 5, 7 (en serie, uno tras otro) | `ai/`, `social/`, `BandSystem` |
| E | 6.1, 6.3, 6.5, 9.1 | obras, equipo, habilidades, pertenencia |

A, B y C pueden ir a la vez tras el bloque 0. D no se paraleliza consigo
mismo. E puede ir junto a D salvo 6.2, 6.4 y 6.7, que necesitan la agenda de
4.4.

## A3. Glosario

| Palabra | Significa |
|---|---|
| **Interruptor** | campo booleano de `Config.motivation` que enciende un bloque entero |
| **Línea base** | resultados guardados antes de empezar una fase, para comparar |
| **Mundo de partida** | checkpoint guardado con su receta, desde el que arrancan pruebas |
| **Contador de mecanismo** | `telemetry.count('nombre')` que cuenta cuántas veces ocurre algo |
| **Semillas pareadas** | las mismas 20 semillas corridas con el interruptor apagado y encendido |
| **Penuria** | cuánto se sufrió una necesidad en una estación, recordado por años |
| **Remedio** | cosa (edificio, prenda, práctica) que se ha visto aliviar una necesidad |
| **Cobertura** | cuánto de una necesidad futura está ya resuelto, de 0 a 1 |
| **Necesidad esperada** | penuria prevista para la estación que viene, de 0 a 1 |
| **Propósito** | objetivo de varios días que una persona guarda en su agenda |
| **Agenda** | lista corta de propósitos de una persona |
| **Propuesta** | algo que una persona plantea a varios a la vez en una reunión |
| **Año** | 40 días; cada estación, 10; cada día, 240 pasos (`Config`, `ticksPerDay` y `daysPerSeason`) |

## A4. Protocolo de una fase

Haz esto en cada fase, en este orden. No te saltes pasos.

1. **Lee** `AGENTS.md` entero, la Parte A de este plan y **solo tu fase**.
2. **Comprueba el punto de partida**: `git status` limpio; rama nueva
   `m16/<carril>/<fase>` desde `m16/integracion`, en su worktree (D7).
3. **Guarda la línea base**: lanza el nivel rápido (A6) y guarda la salida en
   `artifacts/verification/m16-<fase>/antes/`.
4. **Comprueba los nombres**: para cada archivo y función que cite tu fase,
   búscalo con `grep`. Si alguno no existe o hace otra cosa, aplica la regla
   de parada (A5, R0).
5. **Escribe primero la prueba** que falla sin tu cambio. Lánzala y confirma
   que falla.
6. **Haz el cambio** siguiendo los pasos de la fase.
7. **Lanza la verificación** de la fase y guarda la salida en `.../despues/`.
8. **Compara** con la línea base. Cualquier check o prueba que pase de
   aprobado a fallido, o de aprobado a `n/a`, se explica o se arregla.
9. **Escribe el diario** (plantilla abajo) en `docs/m16_diario/<carril>.md` (D7).
10. **Actualiza** `docs/changelog.md` y, si queda algo sin resolver,
    `docs/bugs.md`.
11. **Commit** con prefijo `m16:` y una sola funcionalidad.

**Plantilla del diario** (sirve después para la entrada del blog):

```
## M16-<fase> — <título> (<fecha>)
Qué se quería: una frase.
Qué se hizo: dos o tres frases, sin jerga.
Antes y después: los contadores o capturas que lo muestran.
Qué salió distinto de lo esperado.
Qué queda abierto.
Capturas: ruta, si cambió la interfaz.
```

## A5. Reglas

Las de `AGENTS.md` siguen todas en vigor. Estas son las que más se van a
tocar en M16, más las nuevas.

| # | Regla |
|---|---|
| **R0** | **Regla de parada.** Si el plan no coincide con el código, no inventes. Escribe la duda en `docs/m16_dudas.md` (fase, qué esperabas, qué hay), deja la fase y pasa a otra que no dependa de ella |
| R1 | Nunca `Math.random()`. Todo sorteo sale de un `RNG` con semilla |
| R2 | Un flujo RNG nuevo se añade al final de la lista de `Simulation` y se anota en la tabla de `AGENTS.md` en el mismo commit |
| R3 | `src/sim/` no importa el dibujo ni toca el DOM |
| R4 | Toda acción larga comprueba interrupciones y guarda su progreso en la cosa trabajada. Única excepción: la de la fase 3.1 |
| R5 | Toda búsqueda de "lo más cercano" va por un índice espacial; nunca recorras una lista entera de entidades |
| R6 | Si la simulación rechaza, para o abandona algo, la pantalla dice por qué |
| R7 | Todo texto visible pasa por `t()` con su traducción al español en `src/i18n/es/` |
| R8 | La interfaz no lee el estado privado de un desconocido; pasa por `sim/social/Knowledge.ts` |
| R9 | No edites `public/art/` a mano; se genera con `npm run art:build` |
| R10 | Toda capa a pantalla completa lleva `[hidden] { display: none; }` en el CSS y no reconstruye su contenido en cada fotograma |
| **R11** | **Estado nuevo que se guarda.** Una clase nueva que cuelgue de `Person`, `Household` o `Band` se registra en `persistence/EntityRecords.ts` (`constructorEntries`) y lleva una prueba de ida y vuelta: guardar, cargar, comparar. Los datos planos (números, listas, objetos sin clase) se guardan solos, pero la prueba es obligatoria igual |
| **R12** | **Valores diarios.** Lo que se calcula una vez al día se guarda en la persona y **no** se recalcula al cargar una partida |
| **R13** | **Apagado es igual que antes.** Con el interruptor de tu bloque apagado, las semillas `1`, `2` y `3` del escenario `band` a 3.000 pasos dan el mismo checkpoint que la línea base. Hay una prueba para ello desde la fase 1.3 |
| **R14** | **`Brain.ts` solo recibe ganchos.** La lógica nueva va en módulos nuevos (`ai/Lessons.ts`, `ai/Foresight.ts`, `ai/Agenda.ts`, `social/Assembly.ts`, `social/Rivalry.ts`). En `Brain.ts` solo se añade la llamada |
| **R15** | **Un interruptor por bloque**, no por fase: `foresight` (4), `assembly` (5), `objects` (6), `rivalry` (7), `experiment` (8). Las fases 2, 3 y 9 no llevan interruptor |
| **R16** | **Constantes con valor inicial.** Todo umbral de este plan trae un valor inicial. Va a `Config` con ese valor. No lo cambies para aprobar una prueba; se ajustan en el bloque 10 |
| R17 | Antes de fiarte de una prueba o un check nuevo, comprueba que falla sin tu cambio |
| R18 | No borres ni aflojes una prueba o un check existente. Si su premisa ha cambiado, reescríbelo y dilo en el commit |
| R19 | Añadir una acción puntuable cambia todos los mundos. No compares "antes y después" por un check que cambia de lado: usa contadores y semillas pareadas |
| R20 | Veinte semillas no distinguen menos de unos diez puntos de supervivencia. Para decidir algo menor: 40 semillas o un contador |
| **R22** | **Un fallo no se cierra sin prueba de funcionalidad.** Antes de corregir o dar por corregido un fallo de las notas, se escribe una prueba que describe lo que el jugador espera (nombre = capacidad, p. ej. «la hoguera se puede construir»). Si pasa sobre `master`, queda como regresión y no se toca código; si falla, es el fallo vigente. Ver `m16_bugs.md`, sección 8 |
| R21 | La línea base está en rojo. Al 13-10 (`0.15.127`–`0.15.138`): cinco fallos unitarios conocidos (`m16_bugs.md` E12), cuatro checks rojos en `sim:check` de `band` (E13) y la matriz `sim:check:all` roja en los escenarios generales. "Hecho" nunca significa "matriz verde": significa "ningún fallo nuevo sin explicar" |
| **R23** | **Toda clave nueva de `Config` lleva migración de checkpoint.** El codec rechaza campos de más o de menos; sin migración, los guardados del jugador de antes de tu fase no cargan (así pasó con `otherBandThinkInterval`). La migración pone el valor que reproduce el comportamiento anterior, y lleva prueba: un checkpoint sin la clave carga y avanza igual que antes |
| **R24** | **Los carriles no suben la versión.** Ver D7: la versión de `package.json` la sube quien integra, una vez por commit funcional integrado. Un carril que la toca crea un conflicto con todos los demás |
| **R25** | **Ficheros calientes.** `Simulation.ts`, `ActionSystem.ts`, `Brain.ts`, `BandSystem.ts`, `main.ts`, `Renderer.ts`, `Hud.ts` y `ActionCatalog.ts` suman más de 32.000 líneas y casi todas las fases los tocan. En ellos solo se añade un gancho (una llamada a un módulo nuevo del carril) o se cambia la sección que la ficha del carril (D8) le asigna. Lógica nueva, siempre en un fichero propio |
| **R26** | **Un agente, un puerto.** e2e en worktree: `DYNASTY_PORT=54<nn>` con el número del carril (D7), nunca el 5173 (reservado por Windows en esta máquina) |
| **R27** | **Cohortes en cola.** Nunca dos `sim:seeds` a la vez en la misma máquina: compiten por CPU y estropean `perf-budget` y los tiempos de los demás. Las pide quien integra, una tras otra (D7) |

## A6. Niveles de prueba

Hasta que exista la fase 1.6, usa los comandos actuales.

| Nivel | Antes de 1.6 | Desde 1.6 | Cuándo |
|---|---|---|---|
| **Rápido** | `npm run typecheck && npm test` | `npm run check:fast` | en cada cambio |
| **Área** | `npm run sim:check -- --scenario <nombre>` | `npm run check:area -- <área>` | al acabar una fase |
| **Completo** | `npm run verify` | `npm run check:full` | al cerrar un bloque |
| **Cohorte** | `npm run sim:seeds -- --scenario <escenario> --seeds 20` (la forma con banderas; la posicional es la que escondía el fallo T8) | igual | solo en las puertas de bloque, y en cola (R27) |

En PowerShell usa `npm.cmd` al pasar opciones (ver `AGENTS.md`).

## A7. Cómo se mide una puerta de bloque

1. Mismas 20 semillas con el interruptor apagado y encendido.
2. Se comparan **contadores de mecanismo**, semilla a semilla.
3. Una mejora cuenta si se da en 14 o más de las 20 semillas.
4. Se anota la supervivencia, pero no decide.
5. Se mide el coste con `npm run profile:systems`: el paso no puede costar
   más de un 10 % más que la línea base del bloque.
6. Mundo de medida: uno normal (`band` o `century`), nunca `lean`.

---

# Parte B — Las fases

Plantilla de cada fase: **Objetivo**, **Depende de**, **Archivos**,
**Pasos**, **Pruebas**, **Hecho cuando**, **Cuidado**.

## Bloque 0 — Entrada

### 0.1 Foto de cierre de M15

**Objetivo:** saber exactamente de dónde se parte.

**Pasos:**
1. Anota el commit de cierre de M15.
2. Lanza y guarda en `artifacts/verification/m16-baseline/`: `npm run
   typecheck`, `npm test`, `npm run sim:check:all -- --verbose`, `npm run
   e2e`, `npm run profile:systems`.
3. Lanza `npm run sim:seeds -- band 20` y `npm run sim:seeds -- century 20`.
4. Abre `docs/m15_plan.md` y `docs/m15_status_*.md` y rellena esta tabla en
   `docs/m16_baseline.md`:

| Fase de M15 | ¿Entró? | Estado leído el 13-10 (confirmar al cierre) | Afecta en M16 a |
|---|---|---|---|
| 12 luz y noche | | 12a–12f entregadas (luz, lectores, noche, antorchas, calor local) | 5.2 (reunión al anochecer) |
| 14 ropa por capas | | catálogo, bolsillos, desgaste, remiendo y curtido entregados; sin calibrar | 4.2 (remedios contra el frío) |
| 15 conservación | | 15a, 15b, 15d entregadas; **15c apagada** (las conservas no se comen en invierno) | 4.5 (secar y ahumar): con 15c apagada, guardar no tiene coste de deterioro |
| 16 interiores y muros | | 16a–16f entregadas (casa interior, hogar interior, lechos, lámparas, confort) | 7.3 (fortificar); N45 |
| 26e zanjas hondas, riego | | riego de canal ×1,25 sin calibrar; zanja defensiva propuesta por NPC; rodeo en incursiones | 6.6 |
| 32 LOD | | **decisión del autor: no hay compactos dentro del mapa**; solo al salir de él | 4.4: la agenda no necesita forma resumida dentro del mapa |
| 33 guardar y cargar | | entregada; E5 (compartición de objetos) abierta | ninguna bloqueante |
| 34–35 migración entre comarcas | | entregadas (salir, explorar, migrar, viajes, transporte); E6/E7 abiertas | 5.8: D-7 queda resuelta (emigrar es viajar de verdad) |
| 36 noticias | | entregada (noticias por contacto, caravanas, incursiones a destinos conocidos) | 7.2 |
| 41 calibración | | **abierta**: `lean` 4,5 %, `generations` 6 %, `recovered` 0 | bloque 10: parte de esas cifras (`m16_bugs.md` §9) |

5. En `docs/m16_baseline.md` escribe: número de pruebas, lista de checks
   fallidos por escenario, supervivencia y colapsos de `band` y `century`,
   y milisegundos por paso con 30 y 300 personas.

**Hecho cuando:** existe `docs/m16_baseline.md` con la tabla completa.

### 0.2 Triaje definitivo

**Objetivo:** que `docs/m16_bugs.md` refleje el cierre de M15.

**Pasos:**
1. (Hecho: el triaje ya vive en `docs/m16_bugs.md`.) Solo se edita
   el del repo.
2. Para cada entrada con etiqueta **V**: intenta reproducirla. Si no se
   reproduce, márcala "resuelta en M15" con el commit; si se reproduce, ponle
   A, B, C o D.
3. Recorre los apartados de `docs/bugs.md` con fecha posterior al 4 de
   octubre de 2026 y añade cada entrada abierta con su etiqueta.
4. Para cada entrada A14 a A1, confirma que sigue abierta.

**Hecho cuando:** ninguna entrada tiene etiqueta V.

### 0.3 Decisiones del autor

**Objetivo:** no bloquearse a mitad de una fase. Si el autor no ha
contestado al llegar a la fase, se aplica la propuesta y se anota.

| ID | Pregunta | Propuesta por defecto | La necesita |
|---|---|---|---|
| D-1 | En asamblea, ¿la respuesta de cada uno es fija por umbral o lleva azar? | fija, para que la vista previa de "usar autoridad" sea verdad | 5.3 |
| D-2 | Habilidad como llave: ¿basta un maestro presente o cada trabajador necesita el nivel? | basta un maestro; los demás ayudan y aprenden | 6.5 |
| D-3 | En "Se mantiene vivo", ¿el personaje huye de un ataque? | no cambia: no huye; el aviso de 3.2 lo cubre | 3.2 |
| D-4 | ¿Qué enseña la red de una técnica aún no descubierta? Hoy enseña nombre e ingredientes que faltan cuando se cumplen sus requisitos | nombre sí; ingredientes solo los ya cumplidos | 8.0 |
| D-5 | Al casarse entre bandas, ¿a qué banda pertenece la pareja? | a la del hogar donde pasan a vivir | 9.1 |
| D-6 | Presupuesto de rendimiento: ¿cuánta gente y a qué velocidad debe ir fluido? | 300 personas a velocidad normal | 1.7 |
| D-7 | Si M15 cierra sin migración entre comarcas, ¿emigrar es escindir la banda dentro del mapa? | sí, como banda nueva | 5.8 |
| D-8 | Un objeto suelto de alguien de tu banda, ¿se puede coger sin que sea robo? | sí si está en suelo común; no si está en una casa o almacén ajeno | 6.3 |
| D-9 | ¿Qué fases de M15 quedan fuera de su cierre? | las que no hayan entrado según 0.1 | 0.1 |
| D-10 | ¿Qué tasa de extinción se acepta en cada modo de partida? | Fácil hasta 10 %, Normal hasta 40 %, los duros sin límite | 9.4 |
| D-11 | Opción de reducir destellos y vibración | sí, en ajustes | 3.2 |

### 0.4 Normas

**Pasos:** en `AGENTS.md`, cambia el prefijo de commit a `m16:`, enlaza este
plan y copia las reglas R0 y R11 a R27. Pon la versión a `0.16.0-alpha` en el
mismo commit que el primer cambio de M16 (regla de versiones de `AGENTS.md`).
Si el autor aprueba D-20, cambia también en `AGENTS.md` la regla de versión y
changelog por commit para los carriles. Sustituye la sección «Until M15 is
finished, do not run the heavy verification» por la tabla A6 y R27: con M15
cerrado deja de valer, pero las cohortes siguen yendo en cola.

### 0.5 Infraestructura de reparto

Ver **D7**. Va sola, antes que cualquier carril. Las decisiones D-11 a D-20
están en **D3** y se contestan en 0.3 junto con las de arriba.

## Bloque 1 — Pirámide de pruebas

Sin interruptor. No cambia la simulación.

### 1.1 Medir tiempos

**Pasos:**
1. Para cada escenario de `SCENARIOS` en `tools/simcheck.ts`, mide segundos
   y pasos por segundo corriéndolo solo.
2. Mide `npm test` y `npm run e2e`.
3. Escribe la tabla en `docs/m16_tiempos.md`, ordenada de más lento a más
   rápido, en la máquina del autor.

**Hecho cuando:** la tabla existe y dice qué tres cosas se llevan más tiempo.

### 1.2 Arreglos de herramientas (T1 a T5)

Una entrada, un commit. Receta común: reproducir, entender la causa,
arreglar, comprobar.

| Entrada | Pasos concretos |
|---|---|
| T1 | Lanza `npm run sim:check -- --scenario tiny`. Compara cómo arranca el escenario ahí y en `tools/scenarios.ts`. El fallo es de la herramienta: 0 pasos significa que no se ejecutó |
| T2 | En `.github/workflows/`, quita `continue-on-error` de los pasos de prueba **después** de arreglar T3 |
| T3 | Para `band.test.ts`, `herding.test.ts`, `determinism.test.ts`, `grazing.test.ts`: mide cada uno solo. Si tarda de verdad más de 5 s, ponle un tiempo límite explícito con comentario; no cambies el límite global |
| T4 | Playwright aprueba y no sale. Revisa `playwright.config.ts`, apartado `webServer`: el servidor debe pertenecer a la ejecución y cerrarse con ella |
| T5 | En `e2e/screenshots.spec.ts`, la gira `tour` espera `.pausemenu [data-act="resume"]`. Arregla el selector y añade al menos una comprobación por captura (que lo que se fotografía está en pantalla) |

**Hecho cuando:** `npm test` y `npm run e2e` terminan solos con código 0 dos
veces seguidas.

### 1.3 Línea base comparable y prueba de "apagado es igual"

**Archivos:** `tools/scenarios.ts`, `tools/simcheck.ts`,
`src/sim/persistence/CheckpointRecords.ts`.

**Pasos:**
1. Añade a `tools/scenarios.ts` la opción `--json <ruta>`: escribe por
   escenario los checks aprobados, fallidos y `n/a`.
2. Crea `tools/baseline-diff.ts` (`npm run baseline:diff -- antes.json
   despues.json`): lista lo que cambió de aprobado a fallido, de aprobado a
   `n/a` y al revés. Sale con código 1 si hay alguno de los dos primeros.
3. Crea la prueba `src/sim/__tests__/switches-off.test.ts`: para las
   semillas `1`, `2`, `3` del escenario `band`, corre 3.000 pasos con todos
   los interruptores de M16 apagados, saca `toCheckpointRecord(sim)` y
   compara su huella con la guardada en `fixtures/switches-off.json`.
4. Añade `npm run baseline:pin` para regenerar esas huellas. Solo se lanza
   cuando una fase **sin** interruptor (bloques 2, 3, 9) cambia el mundo a
   propósito, y se dice en el commit.

**Hecho cuando:** la prueba pasa, y falla si cambias a mano una constante de
`Brain.ts`.

### 1.4 Mundos de partida

**Objetivo:** arrancar pruebas desde un mundo ya vivido.

**Archivos:** `src/sim/core/Simulation.ts` (`fromCheckpointRecord`),
`src/sim/persistence/CheckpointRecords.ts` (`toCheckpointRecord`).

**Pasos:**
1. Crea `tools/fixtures.ts` con una lista de recetas:

```
{ nombre, escenario, semilla, pasos, minimoVivos, descripcion }
```

2. `npm run fixtures:build` corre cada receta. Si al final hay menos
   personas vivas que `minimoVivos`, **falla con un mensaje claro**; no
   guardes un mundo muerto.
3. Guarda cada mundo en `fixtures/worlds/<nombre>.json`. Esa carpeta va en
   `.gitignore`: se commitea la receta, no el mundo.
4. Junto a cada mundo guarda su **clave**: huella de la receta, de
   `CHECKPOINT` versión y de la lista ordenada de nombres de campo de la
   configuración.
5. Crea `loadWorld(nombre, cambios)` en `tools/fixtures.ts`: si el fichero
   no existe o su clave no coincide con la actual, lo regenera; luego llama
   a `Simulation.fromCheckpointRecord` y aplica `cambios` a `sim.config`
   (para encender un interruptor sobre un mundo guardado).
6. Recetas iniciales (todas sobre mundos normales, nunca `lean`):

| Nombre | Receta | Para qué |
|---|---|---|
| `tras_primer_invierno` | configuración de `band`, 10.800 pasos (45 días: pasa el primer invierno), mínimo 6 vivos | previsión |
| `banda_con_refugio` | `hearths`, hasta el final, mínimo 8 | asamblea, obras |
| `aldea_con_oficios` | `labour`, hasta el final, mínimo 12 | mando, oficio |
| `dos_bandas_enfrentadas` | `conflicts`, hasta el final, mínimo 10 | otras bandas |
| `jefatura_con_excedente` | `polity`, hasta el final, mínimo 12 | mando, autoridad |

7. Prueba `fixtures.test.ts`: cargar dos veces el mismo mundo y avanzar 200
   pasos da el mismo checkpoint.

**Hecho cuando:** los cinco mundos se generan, y borrar uno hace que
`loadWorld` lo regenere solo.

**Cuidado:** la configuración se valida con igualdad exacta de campos
("unknown or missing fields"). Añadir un campo a `Config` invalida los
mundos guardados; por eso la clave incluye los nombres de campo.

**Cuidado (2026-10-13, bloqueante):** `hearths`, `porters`, `scribes` y
`conquest` meten en su `setup` claves que el codec de checkpoint **no admite**
(`m16_bugs.md` E10; la auditoría de fase 30 las normalizaba a mano). La receta
`banda_con_refugio` sobre `hearths` fallará al guardar. Antes de 1.4: o el
codec acepta esas claves (con migración, R23), o las recetas se montan sobre
escenarios cuyo `setup` sea guardable. Compruébalo con
`toCheckpointRecord(sim)` sobre cada escenario de la tabla antes de escribir
`tools/fixtures.ts`. Y recuerda E7: un mundo de partida no se avanza en bloque
a través de una llegada entre comarcas.

### 1.5 Escenarios de época

**Pasos:**
1. Añade a la interfaz `Scenario` de `tools/simcheck.ts` dos campos
   opcionales: `world?: string` (nombre de mundo de partida) y
   `areas?: string[]`.
2. En `runScenario`, si hay `world`, arranca con `loadWorld`.
3. **Añade** escenarios nuevos al lado de los antiguos; no sustituyas
   ninguno. Nombre: el antiguo más `-desde`, por ejemplo `labour-desde`.
4. Marca los antiguos equivalentes con `slow: true` **solo cuando** el nuevo
   lleve dos semanas dando los mismos checks aplicables.
5. Etiqueta todos los escenarios con sus áreas: `prevision`, `asamblea`,
   `objetos`, `bandas`, `descubrimiento`, `jugador`, `base`.

**Hecho cuando:** hay al menos un escenario `-desde` por mundo de partida y
corre en menos de un tercio de los pasos del original.

### 1.6 Niveles de ejecución

**Pasos:** en `package.json` añade:
- `check:fast`: `typecheck` y `vitest run`.
- `check:area`: `tools/scenarios.ts --area <área>` (añade esa opción: corre
  solo los escenarios con esa área).
- `check:full`: lo que hoy hace `verify`, más los escenarios `slow`.
- `verify` se queda como alias de `check:full`.

### 1.7 Rendimiento fuera de la matriz

**Depende de:** D-6.

**Pasos:**
1. Saca `perf-budget` de la matriz: que informe y no juzgue (ya hay una marca
   para ello, `markMatrixRun`; comprueba cómo se usa).
2. Crea `npm run perf`: corre `profile:systems` tres veces con 30 y 300
   personas y da la mediana.
3. Anota en `docs/m16_baseline.md` el presupuesto acordado.

### 1.8 Normas

**Pasos:** escribe en `AGENTS.md` la tabla de A6 y la regla: "no lances el
nivel completo ni cohortes salvo que tu fase lo pida".

**Puerta del bloque 1:** `check:fast` en menos de dos minutos; cada área en
menos de cinco; la tabla de tiempos de 1.1 repetida con la mejora.

## Bloque 2 — Fallos de corrección

Sin interruptor. Cada fase cambia el mundo a propósito: tras cada una,
`npm run baseline:pin` y dilo en el commit.

**Receta común:**
1. Lee la entrada en `docs/bugs.md` (busca el título con `grep`).
2. Escribe una prueba que reproduzca el fallo. Confírmalo.
3. Arregla la causa, no el síntoma.
4. La prueba pasa. Nivel rápido. Nivel de área si toca conducta.
5. Mueve la entrada de `bugs.md` a `changelog.md`.

| Fase | Entrada | Dónde mirar | Qué hacer | Prueba |
|---|---|---|---|---|
| 2.1 | A1 | `Simulation.observePlaces`, `knowledge/SeasonLore.ts` | Anotar "sin fruto" solo si el arbusto está fuera de su fase de fruto (`bushPhase`); un arbusto vaciado en temporada no cuenta | un arbusto recogido hasta el suelo en verano, visto dos veranos, no se aprende como estéril |
| 2.2 | A2, N9 | `BandSystem.dropStaleSites`, `STALE_SITE_DAYS` | (a) No retirar obras cuyo proponente es el jugador. (b) Toda retirada deja un aviso con motivo (R6): rótulo en el sitio y línea en el registro del proponente | obra del jugador sin tocar 10 días sigue ahí; obra de NPC retirada deja aviso |
| 2.3 | A3, N6 | `social/PlaceMemory.ts`, `render/Renderer.ts` (capa de niebla) | (a) Al ver una casilla, borrar los recuerdos de lo que ya no está en ella: edificios, árboles, pilas, manadas. (b) No dibujar en la niebla obras sin terminar. (c) Revisar una a una las clases de entidad recordadas y anotar el resultado | talar un árbol a la vista y alejarse: no se vuelve a dibujar |
| 2.4 | A4, N8 | `core/Carry.ts` (`canTake`, `itemCapacityFor`), `ActionSystem` (motivo `hands_full`) | Reproducir: manos vacías, un hatillo equipado, otro en el suelo. Si el límite es por objeto y no por manos, o se permite llevar el segundo o el motivo mostrado dice la verdad ("ya llevas uno") | la reproducción |
| 2.5 | A5 | `ai/ActionCatalog.ts` (`case 'pile'`), `Simulation.takeFromPile` | Recoger exige estar al alcance; si no, primero se camina, como el resto de verbos | pila lejana: el personaje camina antes de recibir nada |
| 2.6 | A6, N7 | `art/src/` (generadores de edificios), `docs/m15_art_contract.md` | Las dos imágenes comparten ancla y proyección oblicua; regenerar con `npm run art:build` y revisar con `npm run art:sheet` | `art.test.ts` y una captura con el tejado puesto y quitado |
| 2.7 | A7 | getter de alarma animal (busca `alarmedUntil`) | El signo solo mientras la alarma está vigente | unitaria |
| 2.8 | A8 | `core/Earth.ts`, órdenes de obra de tierra | Si el agua aísla casillas pendientes, se trabajan desde la orilla alcanzable o la obra se da por cerrada con aviso | foso junto al borde del mapa |
| 2.9 | A9 | `doHunt`, `armourOf`, `doChop` | Los tres efectos leen `techPower` y el alcance del arma | tres unitarias, una por efecto |
| 2.10 | A10 | `ai/ActionCatalog.ts` (`personActions`) | `teach` y `discuss` se ofrecen siempre; es la acción la que rechaza, como ya hace `ask` | el menú sobre un desconocido no cambia según lo que sabe |
| 2.11 | A11 | `Brain`, puntuación de `talk` | No empezar a hablar con una necesidad ya pasada de la línea (`pressedByNeed`), como hacen `play`, `tend` y `tame` | contador de charlas cortadas por sed |
| 2.12 | A12 | `render/Floaters.ts` | Campo opcional `followId` | visual |
| 2.13 | A13 | resultado de 0.1 | Para cada uno de los fallos nuevos del equipamiento que sigan abiertos: buscar la causa con `npm run why` y contadores. No tocar pesos | informe por fallo |
| 2.14 | A14 | `social/Defence.ts` (ayuda a un atacado), `WildlifeSystem` | Quien ve a un depredador morder a alguien de su banda responde como ante un agresor humano | un lobo muerde a un niño con un adulto a la vista |
| 2.15 | N16, N40 | `Building.progress`, `BandSystem` (`gather_for_site`), verbo «trabajar en» de `ActionCatalog` | Prueba primero (`m16-hearth-buildable`, `m16-work-on-fetches-materials`). Si falla: «trabajar en» una obra sin materiales manda a acarrearlos al montón de la obra y solo luego construye | las dos pruebas |
| 2.16 | N18 | `Equipment.ts`, `Carry.equipContainer`, `ui/Hud.ts` (pestaña de equipo), `armourOf` | Prueba primero (`m16-equip-unequip-all`). Si falla: ruta de equipar y quitar para cada objeto con hueco, con motivo si se niega (R6) | la prueba |
| 2.17 | N21, N44 | `Brain` (búsqueda de comida y de agua), `social/PlaceMemory.ts` | Pruebas primero (`m16-hungry-searches-farther`, `m16-water-between-lakes`). Si fallan: una conducta de explorar más lejos cuando una necesidad alta no tiene candidata, en módulo nuevo (R14), sin leer lo que no se conoce | las dos pruebas, más un contador `explore_for_need` |
| 2.18 | N32 | `render/Renderer.ts`, `ActionCatalog` (cavar barro) | Señal visible de las casillas de orilla con barro; el menú explica por qué no se puede cavar en otra | `m16-mud-shore-markers` y captura |
| 2.19 | N34, N36 | `World.biomeAt`/`isWater`, `MovementSystem.nudge`, `Simulation` (cambio de comarca), `ui/FamilyTree`/`TribeTree`, `WorldGeography.ts` | Pruebas primero (`m16-map-edge-silent`, `m16-scout-roundtrip`). Si falla: fuera de límites no es agua; al cambiar de comarca las vistas leen la banda del jugador; «bajo el mar» solo si la comarca vecina lo es | las dos pruebas |
| 2.20 | N38 | `ActionCatalog`, `Building.ts` (`bedding`) | El jugador puede usar y quitar la cama de su banda | `m16-bedding-player-use` |
| 2.21 | N39 | capa nocturna de `Renderer.ts`; `World.FLOOD_LIMIT`; ríos de M15 29–31 | Prueba primero (`m16-no-sudden-flood`) con la semilla que lo reproduzca; si no hay semilla, pedirla al autor y dejar la prueba en `skip` con el motivo. Color: la capa nocturna no cambia el terreno el segundo día | la prueba |
| 2.22 | N45, K6 | `Renderer.drawBuildingArt`, `drawBuildingSprite`; `Simulation.placementRefusal` | (a) Sin anillo ni banderín para `def.furniture` ni `def.station`. (b) Según D-16: una estación de exterior solo se coloca donde `territoryOwnerAt` es la banda; si no, motivo (R6) | `m16-furniture-unbannered`, `m16-outdoor-furniture-territory`; captura de un interior amueblado |
| 2.23 | N46, K7 | `main.ts` (`candidatesAt`) | (a) Mirar personas, animales y balsas **antes** del cortocircuito de agua; el agua solo gana si no hay nadie bajo el clic. (b) La casilla del clic se calcula como la calcula `World` (truncar), en un helper compartido con el renderer, no con `Math.round` | `m16-select-on-shore` |
| 2.24 | E5 | `persistence/` (grafo de objetos), `world-state-peoples.test.ts` | Encontrar el primer nodo distinto tras guardar/cargar (el evento `share_food` que en la partida original ya es una referencia) y restaurar la compartición | `m16-load-keeps-sharing` |
| 2.25 | E6, E7 | `ComarcaOffmapRuntime`, `CompactAdvance.ts`, `WorldState.advancePeoples` | (a) Reproducir el `RangeError` con `frontierGeography()`, `peoplePerBand: 6`, semilla `repro-scout-cross`; acotar la ración devuelta a la pedida **en el coordinador**, no en el cuerpo. (b) Avance en bloque: partir el lote en la llegada, o rechazarlo con motivo | el `RangeError` reproducido y corregido; `m16-block-advance-across-arrival` |
| 2.26 | E8 | `social/Amends.ts` y exigencias; transferencia de objetos encendidos (`m15_phase12d_torches.md`) | Un contrato único de transferencia que lleve el combustible; las rutas automáticas lo usan | una antorcha encendida entregada como reparación sigue encendida o se apaga con motivo; nunca queda una ranura sin dueño |
| 2.27 | E9 | `Brain.ts` (vestir, curtir, retirar por calor), `ToolEquipment.ts` | Comparar con la edad de vestir propia (`LifeStage`), no con `1` día. Decidir con D-18 qué hace un cuidador con un niño | `m16-infants-cannot-dress` |
| 2.28 | E12 | los cuatro ficheros de prueba rojos | **No arreglar tocando umbrales.** Para cada uno: ¿la premisa cambió (se reescribe, R18) o el mundo está mal (se anota con su mecanismo)? `polity` y `determinism` primero: su fallo es de un contador o un caso concreto, no de una tasa | informe por prueba en el diario |
| 2.29 | E14 | `tools/art` (`art:sheet`, sección `dig`) | La hoja de contactos termina; la sección `dig` dibuja algo o se omite con motivo | `npm run art:sheet` con código 0 |

Las fases 2.3 y 2.4 se amplían con N12 (la memoria del mapa se actualiza por lo
visto al pasar, no solo por lo que se hace en la casilla) y N20 (prueba de
conservación de objetos al recoger).

**Correcciones del 2026-10-13 a las fases de arriba** (causas leídas en el
código, `m16_bugs.md` §1d; la prueba sigue decidiendo):

- **2.2** es un arreglo pequeño: `Building.playerPlaced` ya existe y se guarda;
  `dropStaleSites` solo tiene que respetarlo y dejar el aviso.
- **2.3 / N12:** los «trozos negros» son de `FogReveal` (presentación), no de
  `PlaceMemory`. Decisión D-17 antes de tocar nada.
- **2.4 / N8:** la causa es el límite por objeto del hatillo (`hand.perArms`
  1) y un menú que pregunta por la cuenta agregada; además `takeFromPile` corta
  con `break` (K3). El menú debe llamar a `canTake` por objeto (K4).
- **2.15 / N16, N40:** `doBuild` abandona con `site_needs_materials` cuando el
  trabajador no lleva nada útil; falta la rama «ir a buscarlo». Probablemente
  N16 y N40 son el mismo fallo.
- **2.17 / N44:** antes de escribir la conducta «explorar por necesidad»,
  descartar K2 (orillas dulces fantasma en el borde): si es eso, el arreglo es
  del mundo (2.19), no de la IA. Incluye también E2 (`go_home` gana al hambre)
  y E3 (alejarse del agua).
- **2.19 / N34, N36:** incluye K1, K2 y K8 con el predicado `outsideIsSea`
  (§10 de `m16_bugs.md`), que deja la isla clásica bit a bit igual. Para N36,
  la prueba comprueba `currentIdentity` tras cada viaje.

**Cuidado con 2.11 y 2.14:** cambian conducta. Mide con contadores, no con
supervivencia.

**Puerta del bloque 2:** línea base nueva guardada como
`docs/m16_baseline_2.md`; ninguna entrada A abierta sin motivo escrito.

## Bloque 3 — Control del jugador

Sin interruptor: solo afecta al personaje dirigido, y las pruebas sin
jugador no cambian. Comprueba R13 igualmente.

### 3.1 En "Tú diriges", las necesidades avisan y no interrumpen

**Archivos:** `ai/Autonomy.ts`, `systems/ActionSystem.ts` (`interruption`,
`pressedByNeed`, `workLimit`), `core/Simulation.ts` (`autonomy`),
`ui/Hud.ts`, `main.ts` (`reportInterruptions`).

**Pasos:**
1. Pasa al contexto de `ActionSystem` un dato nuevo: `directControl`, cierto
   solo para la persona que es el jugador y solo si `sim.autonomy ===
   'manual'`.
2. En `interruption()`: si `directControl`, no devuelvas ningún motivo de
   **necesidad** (sed, hambre, frío, cansancio). Los demás motivos siguen:
   manos llenas, recurso agotado, objetivo desaparecido, suelo que cede.
3. En las comprobaciones de "¿es sensato empezar?" (`pressedByNeed`), lo
   mismo: con `directControl` no se rechaza por necesidad.
4. Avisos: tres niveles por necesidad, calculados con las mismas líneas que
   ya usa el juego.

| Nivel | Cuándo | Texto |
|---|---|---|
| aviso | pasa la línea de trabajo (`workLimit`) | "Tiene hambre" |
| serio | pasa la línea de peligro de `Autonomy.ts` | "Tiene mucha hambre" |
| crítico | la salud ya está bajando por esa necesidad | "Se está muriendo de hambre" |

5. Los avisos van en una franja propia **debajo** de la barra superior (la
   barra no tiene sitio; entrada B19). Cada aviso aparece una vez por nivel
   y se queda mientras dure.
6. No cambies nada de "Se mantiene vivo" ni de "Actúa solo".

**Pruebas:**
- unitaria: jugador en `manual` con sed 95 sigue talando; un NPC con sed 95
  para; el jugador en `urgent` para como hoy.
- unitaria: jugador en `manual` con las manos llenas sí para.
- e2e: una orden larga con hambre alta termina, y la franja muestra el aviso.

**Hecho cuando:** las tres pruebas pasan y R13 se cumple.

**Cuidado:** las consecuencias no se tocan. Se puede morir de sed
trabajando; para eso está el nivel crítico.

### 3.2 Aviso de ataque

**Depende de:** D-3, D-11.

**Archivos:** `social/Vulnerability.ts` (`fightingPower`, `vulnerabilityOf`),
`social/Defence.ts` (`assailantOf`), `ui/Settings.ts`, `src/style.css`.

**Pasos:**
1. En la simulación, expón para el jugador `threatNow`: de 0 a 1. Para un
   agresor humano, `vulnerabilityOf(jugador, agresor)`. Para un animal,
   busca cómo se mide hoy su daño (en `WildlifeSystem` o `SpeciesDef`) y
   llévalo a la misma escala; si no hay medida, R0.
2. Intensidad del aviso: `1 − (1 − amenaza) × (salud / 100)`. Con amenaza 0
   y salud 100 da 0; sube si sube la amenaza o baja la salud.
3. En la interfaz: una capa con borde rojo cuya opacidad es la intensidad y
   que pulsa a **un ciclo por segundo** como máximo. Vibración: desplazar el
   lienzo unos píxeles, proporcional a la intensidad, solo al recibir un
   golpe.
4. Ajuste "Reducir destellos y vibración": sin pulso ni vibración; borde
   fijo.
5. El ataque no interrumpe la acción en "Tú diriges".

**Pruebas:** unitaria de la fórmula con cuatro casos (conejo y salud 100;
oso y salud 100; humano y salud 100; humano y salud 20); e2e con captura.

**Cuidado:** R10 para la capa. Nunca más de tres destellos por segundo.

### 3.3 Ingrediente "haber trabajado pasando frío"

**Archivos:** `knowledge/Tech.ts` (rutas con `{ kind: 'saw', what: 'cold'
}`), `knowledge/Synthesis.ts` (`NOTED_OCCASIONS`, `SAW_WORDS`),
`ActionSystem` (dónde se anota la parada por frío), `src/i18n/es/`.

**Pasos:**
1. Añade la ocasión `worked_cold` a `NOTED_OCCASIONS` y sus palabras a
   `SAW_WORDS` con traducción.
2. Anótala exactamente en dos momentos: cuando un NPC para por frío (el
   mismo instante en que hoy se anota `cold`), y cuando el jugador en
   `manual` **habría** parado por frío y no para.
3. En las rutas de `Tech.ts` que usan `saw: cold`, cambia a `saw:
   worked_cold`.

**Pruebas:** la prueba existente `spark-ingredients-are-real` pasa; R13 se
cumple (los NPC anotan lo mismo y en los mismos momentos).

**Puerta del bloque 3:** una sesión de juego del autor de 15 minutos en "Tú
diriges" sin ninguna interrupción por necesidad.

## Bloque 4 — Previsión

Interruptor: `motivation.foresight`, apagado.

### 4.0 Ensayo de viabilidad

**Objetivo:** saber cuánto de duro es el mundo sin planificador antes de
invertir. Es un experimento; **no se fusiona**.

**Pasos:**
1. En una rama desechable, haz que `BandSystem.planBuildings` no pida nada
   (deja la asignación de proponentes).
2. Corre `band` y `century` a 20 semillas con y sin ese cambio.
3. Anota: extinciones, muertes por frío, metros de techo por persona al
   empezar cada invierno, comida guardada.
4. Escribe el resultado en `docs/m16_viabilidad.md`.

**Hecho cuando:** el documento dice una de tres cosas:

| Resultado | Qué se hace |
|---|---|
| menos del 30 % de mundos extinguidos | seguir con el bloque tal cual |
| entre 30 % y 70 % | seguir, y la puerta 4.9 exige recuperación tras el primer invierno |
| más del 70 % | parar y avisar al autor: hace falta decidir qué saben los fundadores |

### 4.1 Penuria por estación

**Objetivo:** que cada persona recuerde cuánto sufrió en cada estación. No
cambia ninguna decisión.

**Archivos:** `entities/Person.ts` (`chronic`), `knowledge/SeasonLore.ts`
(como modelo), `systems/LifeSystem.ts` (donde se llama a
`beliefs.inherit`), `persistence/EntityRecords.ts`.

**Pasos:**
1. Crea `src/sim/ai/Lessons.ts` con la clase `Lessons`. **No uses
   `Beliefs`**: solo tiene 48 huecos.
2. Dentro, `hardship`: por impulso (`hunger`, `thirst`, `warmth`, `safety`) y por
   estación, guarda `{ nivel, años }`. `nivel` es de 0 a 1; `años` es
   cuántos años distintos se ha registrado.
3. Cada día, acumula en un contador de la estación el valor de
   `person.chronic[impulso]` (ya existe y ya se usa para mudar el
   campamento).
4. Al cambiar de estación: `media = contador / días`. Actualiza el nivel:
   `nivel = nivel + (media − nivel) × 0,5`. Suma un año. Pon el contador a
   cero.
5. Añade `person.lessons = new Lessons()` y regístrala (R11).
6. Herencia: donde se llama a `beliefs.inherit(0.6, …)`, haz lo mismo con
   las lecciones, a 0,5 del nivel de los padres y con `años = 0`.
7. Muestra la penuria del personaje propio en el inspector (R8: solo la
   propia o la de quien se conoce bien).

**Pruebas:** tras un invierno con frío crónico alto, `hardship.warmth.winter`
es mayor que 0; un hijo nace con la mitad; ida y vuelta de guardado.

**Hecho cuando:** las pruebas pasan y R13 se cumple.

### 4.2 Remedios aprendidos por su efecto

**Objetivo:** que se sepa qué alivia cada necesidad por haberlo vivido,
visto u oído. No cambia decisiones todavía.

**Archivos:** `systems/NeedsSystem.ts` (donde se escribe `warm:hearth`),
`systems/KnowledgeSystem.ts` (`tryObserve`), `social/Conversation.ts`.

**Pasos:**
1. En `Lessons`, `remedy`: por impulso y por identificador de remedio,
   guarda `{ valor, confianza, fuente, día }`. Identificadores:
   `building:<id>`, `item:<id>`, `practice:<id>`. Se construyen del dato; no
   hay tabla escrita a mano.
2. **Vivido** (confianza +0,25 por vez, hasta 1):
   - calor: en `NeedsSystem`, allí donde se calcula el abrigo efectivo,
     cuando la persona tiene frío y está bajo un edificio con abrigo,
     apunta `warmth` y `building:<id>` con el valor de abrigo. Haz lo mismo
     con la prenda puesta. Deja como está la escritura de `warm:hearth` en
     `Beliefs`.
   - comida: al sacar comida de un almacén teniendo hambre, apunta `hunger`
     y `building:<id>`.
3. **Visto** (confianza +0,1): quien tiene frío por encima de 50 y ve a
   alguien bajo techo con menos frío que él aprende ese remedio. Usa el
   mismo punto del código en que ya se aprende al ver comer (`tryObserve`).
4. **Contado** (confianza +0,05): en las conversaciones largas que ya
   transmiten noticias de comida, transmite el remedio de mayor confianza
   del que habla. Aprovecha para transmitir también el saber de las
   estaciones (entrada B21).
5. Olvido: la confianza baja 0,1 por año sin refuerzo.

**Pruebas:** dormir bajo un cortavientos con frío enseña
`building:windbreak`; quien solo lo ve lo aprende con menos confianza; no
existe ninguna lista de remedios escrita a mano (prueba que recorre
`BUILDINGS` y comprueba que cada edificio con abrigo puede aprenderse).

### 4.3 Cobertura y necesidad esperada

**Archivos:** `ai/Drives.ts` (como modelo), nuevo `ai/Foresight.ts`.

**Pasos:**
1. `cobertura(persona, impulso)`, de 0 a 1:
   - `warmth`: superficie de techo utilizable por su banda dividida por el
     número de miembros, con tope 1. Usa la misma medida de superficie que
     ya usa `planBuildings` (extráela a una función compartida).
   - `hunger`: comida guardada en almacenes que puede usar, dividida por
     `weeklyFoodNeedPerPerson × 5` (una estación son diez días), contando a
     quienes dependen de ella; tope 1.
   - `safety`: 0 por ahora (bloque 7).
2. `cercanía(díasHasta, horizonte)`: `1 − díasHasta / horizonte`, entre 0 y
   1. Horizonte inicial: 20 días (dos estaciones) para todos; 4.7 lo hace
   personal.
3. `esperada(persona, impulso)`: para cada estación futura dentro del
   horizonte, `penuria × cercanía × (1 − cobertura) × previsión`, y se toma
   el máximo. `previsión` vale 1 hasta 4.7.
4. Se calcula una vez al día y se guarda en la persona (R12).
5. Inspector: muestra las tres cifras del personaje propio.

**Pruebas:** con almacén lleno, la esperada de hambre es 0; a 25 días del
invierno es 0, a 5 días es alta; guardado y carga conservan el valor.

### 4.4 Agenda de propósitos

**Objetivo:** que una necesidad esperada se convierta en trabajo que se
interrumpe y se retoma.

**Archivos:** nuevo `ai/Agenda.ts`; `ai/Brain.ts` (apartado "Building",
donde se elige `site` y se puntúan `build`, `haul`, `dig`, `chop`,
`gather_for_site`); `BandSystem.planBuildings` (función que busca solar);
`BandSystem.dropStaleSites`.

**Pasos:**
1. `Propósito`: `{ id, impulso, remedio, paraQuién, prioridad, díaCreado,
   díaLímite, obraId, estado }`. Dato plano en `person.agenda`.
2. Límite por edad: adulto 3; adolescente 1; niño 0. "Adolescente": quien
   aún es `isChild` pero ya tiene 12 años o más. Comprueba en
   `entities/Person.ts` y `entities/LifeStage.ts` a qué edad se deja de ser
   niño; si la adultez llega antes de los 12, R0.
3. **Nacimiento**, una vez al día: si `esperada ≥ 0,25` para un impulso, no
   hay propósito abierto para él y queda hueco:
   1. Elige el remedio conocido con mayor `valor × confianza` que la persona
      pueda intentar (para un edificio: que alguien de su banda sepa
      levantarlo).
   2. Si su banda ya tiene una obra sin terminar de ese remedio, **se une**:
      se añade a `backers` de esa obra.
   3. Si no, coloca la obra ella misma como proponente, con la función de
      buscar solar que hoy usa `planBuildings` (extráela, no la copies). Una
      persona no propone más de una obra a la vez.
   4. Si no conoce ningún remedio, no nace propósito. Lo trata el bloque 8.
4. **Tirón**: en `Brain`, las acciones de obra ya solo puntúan para
   proponente y respaldos, así que el propósito las habilita sin cambiar esa
   regla. Añade dos cosas solo para obras ligadas a un propósito propio:
   - el umbral de comodidad baja de 0,45 a 0,25;
   - se suma `prioridad × 0,6` a la puntuación.
5. `prioridad = esperada × confianza del remedio`, recalculada cada día.
6. **Retomar**: no hay que hacer nada especial. El progreso está en la obra
   (R4); el propósito sigue en la agenda y vuelve a tirar.
7. **Abandono**: pasó `díaLímite` (fin de la estación temida); la obra ya no
   existe; la cobertura llegó a 1. Al abandonar, se quita de `backers`.
8. `dropStaleSites`: una obra con algún propósito vivo no cuenta como
   abandonada.
9. Fabricación a medias de un NPC (entrada B7): si lo fabricado es parte de
   un propósito, guarda el progreso como ya se hace con el trabajo ordenado
   (`person.resume`).
10. Inspector: lista de propósitos del personaje propio.

**Pruebas (mundos montados a mano, sin azar):**
- nace un propósito con esperada 0,5 y remedio conocido;
- se une a una obra existente en lugar de abrir otra;
- con hambre 90 come; al bajar el hambre vuelve a la obra sin orden;
- un niño no tiene agenda;
- ida y vuelta de guardado.

**Cuidado:** R14. La prueba `ai-uses-many-actions` debe seguir contando un
número parecido de verbos.

### 4.5 Guardar como práctica que se descubre

**Depende de:** 4.3, 4.4. Es la propuesta "Guardar para el invierno sin
programarlo" de `next-steps.md`.

**Archivos:** `knowledge/Tech.ts`, `knowledge/Synthesis.ts` (`Ingredient`,
`satisfies`, `describeIngredient`), `ui/TechWeb.ts`, `ai/Brain.ts`
(apartado "Store and withdraw").

**Pasos:**
1. Nuevo tipo de ingrediente `{ kind: 'remembers', impulso, estación }`: se
   cumple si la persona tiene penuria mayor que 0,2 de ese impulso en esa
   estación. Añádelo a `satisfies`, a `describeIngredient` con su
   traducción, y a las pruebas que recorren ingredientes.
2. Nueva técnica `provisioning`, de tipo práctica, sin requisitos. Rutas:
   - recordar hambre de invierno, llevar comida en las manos, y ser verano u
     otoño;
   - haber visto un almacén vacío (`store_empty`) y recordar hambre de
     invierno.
3. Efecto (ningún nodo puede quedar inerte): solo para quien la conoce y con
   el interruptor encendido,
   - `forage`, `pick` y `hunt` suman `esperada(hunger) × 0,5` cuando la
     persona no tiene hambre: recoge más de lo que come;
   - `store` de comida deja de valer 0,35 fijo y vale `0,35 + esperada(hunger)
     × 1,5`.
4. Quien no la conoce se comporta como hoy.
5. Se enseña y se copia con lo que ya existe; no añadas otro canal.

**Pruebas:** `techs-have-effects` y `spark-ingredients-are-real` pasan; quien
conoce la práctica y recuerda hambre guarda más que quien no, en el mismo
mundo montado a mano.

### 4.6 Retirar del planificador el refugio, el hogar y el almacén

**Objetivo:** que esas tres cosas nazcan solo de propósitos. El resto del
planificador **se queda** hasta 6.7.

**Inventario de lo que pide hoy `planBuildings`:**

| Rama | La sustituye | Fase |
|---|---|---|
| refugio (el más barato o el mejor) | propósito de `warmth` | 4.6 |
| hogar | propósito de `warmth` (remedio `building:hearth`) | 4.6 |
| almacén o granero | propósito de `hunger` | 4.6 |
| puestos de trabajo | propósito de objeto | 6.7 |
| montón de compost, campo, trampa, cercado, pozo | propósito de producción | 6.7 |

**Pasos:**
1. Con el interruptor encendido, salta las tres primeras ramas.
2. Conserva la asignación de proponente a obras sin dueño y la retirada de
   obras paradas.
3. El límite de dos obras a la vez (`MAX_SITES`) y el tope de estructuras
   por miembros dejan de aplicarse a las obras nacidas de propósitos: las
   limita la cobertura.
4. Prueba nueva `every-design-has-a-proposer`: recorre `BUILDINGS` y, para
   cada edificio, exige que lo pida una rama viva del planificador o que
   sea remedio aprendible de algún impulso. Si alguno queda huérfano, falla
   con su nombre.

**Pruebas:** la anterior; una banda con frío recordado y sin planificador
levanta un cortavientos; una banda sin recuerdo no levanta nada.

**Cuidado:** los checks `bands-dont-overbuild`, `building-starts-small`,
`projects-find-backers` y `shelter-answers-cold` van a cambiar. Mira qué
miden antes de darlos por rotos (R18).

### 4.7 Rasgo de previsión y horizonte

**Archivos:** `core/Simulation.ts` (lista de flujos RNG), `AGENTS.md`
(tabla), `systems/LifeSystem.ts` (herencia de rasgos).

**Pasos:**
1. Añade el flujo `foresightRng` **al final** de la lista y su fila en la
   tabla de `AGENTS.md` (R2). **No añadas el rasgo a `TRAITS`.**
2. `person.foresight`, de 0 a 1: fundadores, gaussiana de media 0,5 con la
   misma dispersión que los demás rasgos; hijos, media de los padres más un
   ruido del mismo flujo.
3. `previsión = 0,5 + foresight` (entre 0,5 y 1,5).
4. Horizonte en días:

| Quién | Horizonte |
|---|---|
| adolescente | 10 (una estación) |
| adulto sin nadie a su cargo | 20 |
| adulto con hijos a su cargo | 40 (un año) |
| en el último tercio de su vida (comprueba qué edad usa el código para la vejez), o `foresight` mayor que 0,8 | 80 |

5. Se sortea siempre, esté el interruptor encendido o no; solo se usa si
   está encendido.

**Pruebas:** dos hermanos con la misma historia y distinto rasgo crean el
propósito en días distintos; R13 se cumple.

### 4.8 Ver una obra y sumarse

**Pasos:**
1. En la pasada diaria de la agenda, cada persona mira las obras sin
   terminar de su banda dentro de su radio de visión (índice espacial, R5).
2. Si la obra es un remedio que conoce para un impulso con `esperada ≥
   0,12` y tiene hueco en la agenda, se une como en 4.4.
3. Si no conoce el remedio y tiene curiosidad alta, se acerca a mirar:
   comprueba si ayudar en una obra exige conocer la técnica. Si no lo
   exige, ayudar ya enseña (trabajar al lado enseña más rápido, entrada O3
   de `next-steps.md`) y basta con dejarle unirse. Si lo exige, R0.

**Pruebas:** un NPC con frío recordado se une a una obra de refugio que
nadie le propuso.

### 4.9 Puerta del bloque 4

Según A7, sobre `tras_primer_invierno` más 12.000 pasos y sobre `century`.

| Contador | Se espera con el interruptor encendido |
|---|---|
| techo por persona al empezar el segundo invierno | mayor en 14 de 20 semillas |
| comida guardada por persona al empezar el invierno | mayor en 14 de 20 |
| muertes por frío en el segundo invierno | no mayores |
| propósitos abandonados sobre creados | menos de la mitad |
| obras nacidas de propósitos y terminadas | más de cero en 18 de 20 |
| coste por paso | no más de un 10 % |

Si no se cumple, no se afinan constantes: se anota y decide el autor.

## Bloque 5 — Asamblea y mando

Interruptor: `motivation.assembly`, apagado. Necesita `foresight` encendido
para medir.

### 5.0 Inventario de lo que ya existe

**Objetivo:** no crear un tercer mecanismo. **No se escribe código.**

**Pasos:** lee y resume en `docs/m16_asamblea.md`, con una tabla por
mecanismo (quién propone, a quién, cómo se decide, qué azar hay, qué pasa
al aceptar):

| Mecanismo actual | Dónde |
|---|---|
| proponer una obra a un vecino | `Brain` (`propose`), `social/Persuasion.ts` (`support`) |
| mudar el campamento por voto | `BandSystem.considerRelocation` |
| incursión por rencor y por necesidad | `BandSystem.considerRaid`, `considerNeedRaid` |
| órdenes y sorteo de obediencia | `Simulation.command`, `social/Authority.ts` (`standingOver`, `orderCost`) |
| reparto de trabajo del jefe | `BandSystem.directWork` |
| enseñar | `teach` en `ActionSystem` |
| guerra, paz y sometimiento | `BandSystem.considerStance`, `considerSubmission` |

**Hecho cuando:** la tabla está completa y dice, para cada uno, qué paso
sustituirá la asamblea.

### 5.1 Modelo de datos

**Archivos:** nuevo `social/Assembly.ts`.

**Pasos:**
1. `Propuesta`: `{ id, tipo, proponenteId, bandaId, día, asunto,
   asistentes, respuestas, usóAutoridad, forzados, estado }`.
   - `tipo`: `obra`, `incursión`, `mudanza`, `enseñanza`, `emigración`.
   - `respuestas`: por persona, `{ sí, motivo, margen }`.
   - `estado`: `en marcha`, `cumplida`, `abandonada`, `rechazada`.
2. Se guardan en `band.decisions`, las 50 últimas.
3. Prueba de ida y vuelta (R11).

### 5.2 Reunir

**Archivos:** `ai/ActionCatalog.ts`, `ai/Brain.ts`, `systems/ActionSystem.ts`
(`EARSHOT`, valor 16), `social/Authority.ts`.

**Pasos:**
1. Acción nueva `convene`. Quien la lanza se queda quieto; cada adulto o
   adolescente de su banda a menos de `EARSHOT` casillas recibe `llamadoPor
   = { id, hasta }` durante 60 pasos. Para el jefe, el alcance es 24.
2. Acción nueva `gather_round` para el llamado. No uses `attend`, que es de
   los banquetes. Puntúa:
   `(0,2 + opinión/100 × 0,5 + vínculo + autoridad + curiosidad × 0,2) ×
   (1 − urgencia máxima de sus necesidades)`.
   Nunca si una necesidad ya pasó la línea de trabajo.
3. Quien acude se coloca a 2 o 3 casillas del que convoca, mirando hacia
   él, en pose de descanso. No hay pose de sentado; no toques el arte.
4. **Reunión ya hecha**: si hay 4 o más adultos de la banda a 6 casillas o
   menos, cuentan como presentes sin llamar.
5. Cuándo convoca un NPC: tiene algo que proponer (una obra propia con
   menos respaldos de los que hacen falta, una enseñanza) y es la primera o
   la última cuarta parte del día (usa `time.dayFraction`), o ya hay
   reunión hecha.
6. Freno: quien no es jefe no puede convocar más de una vez cada 3 días; el
   jefe, una al día. Convocar y que nadie diga sí resta renombre.

**Pruebas:** con buena opinión acuden; con una necesidad urgente no; un
jefe reúne desde más lejos.

### 5.3 Decidir

**Depende de:** D-1.

**Pasos:**
1. Extiende `Persuasion.support` con dos términos, solo con el interruptor
   encendido:
   - necesidad: la **esperada** del oyente para el impulso que la propuesta
     alivia, en lugar de su necesidad de este instante;
   - conformidad: `(síes − noes) / asistentes × 0,15`, contando solo a los
     que ya han contestado.
2. Orden de respuesta: de más cerca a más lejos del que propone; a igual
   distancia, por identificador. **Sin sorteo.**
3. Dice sí si `apoyo ≥ persuadeAt` (campo que ya existe, valor 0,5).
   `margen = apoyo − persuadeAt`. `motivo`: el término de mayor peso.
4. Al decir sí: obra, propósito "para la banda" y entrada en `backers`;
   enseñanza, se queda a escuchar; incursión y mudanza, ver 5.7.
5. Con el interruptor encendido, los NPC proponen en reunión. El uno a uno
   se queda solo para cuando no hay nadie más cerca.

**Pruebas:** misma situación, mismo resultado, dos veces; el indeciso se
inclina con la mayoría.

### 5.4 Carisma o autoridad

**Archivos:** `social/Authority.ts` (`standingOver`), `social/Events.ts`,
`BandSystem.directWork`.

**Pasos:**
1. Solo el jefe. Al usar autoridad, cada asistente que dijo no y sobre el
   que `standingOver(jefe, oyente) ≥ 0,5` pasa a aceptar como **forzado**.
2. Coste por forzado: su opinión del jefe baja 6; se emite el suceso
   `coerced` (añádelo a `Events.ts` con sus palabras y traducción); su
   trabajo en esa obra rinde al 70 %.
3. Desgaste: `band.authorityStrain` sube 1 por forzado y baja 0,2 al día.
   El umbral de alcance es `0,5 + strain × 0,02`.
4. Memoria de negativas (entrada B9): el jefe no vuelve a proponer lo mismo
   a quien le dijo no hasta pasados 5 días. Mira si `proposalCooldowns` ya
   sirve.
5. Reparto de la obra aceptada (entrada B10): `directWork` elige primero a
   quien dijo sí; después a quien no tiene oficio o lo tiene afín; a un
   forzado con otro oficio, al final.
6. Un jefe NPC usa autoridad si faltan brazos y la esperada del impulso
   supera 0,5; el umbral baja con su agresividad y su apego a la tradición.

**Pruebas:** forzar a tres baja tres opiniones y sube el desgaste; con
desgaste alto alcanza a menos gente.

### 5.5 Enseñar a varios (nota N1)

**Pasos:**
1. Propuesta de tipo `enseñanza` con una técnica que el proponente conoce.
2. Extrae de `teach` la función que calcula lo que aprende un alumno en una
   sesión. Aplícala a cada asistente que se quede, cumpla los requisitos y
   no la conozca. **No escribas otra fórmula.**
3. La sesión dura lo que una lección actual y es interrumpible (R4).

**Pruebas:** tres alumnos aprenden en una sesión lo que hoy aprende uno.

### 5.6 Pantallas

**Archivos:** nuevos `ui/ProposalPanel.ts` y `ui/DecisionsPanel.ts`;
`social/Knowledge.ts`; `src/style.css`.

**Pasos:**
1. **Pantalla de la propuesta** (cuando propone el jugador):
   - lista de asistentes con su postura;
   - el **motivo** solo de quien el jugador conoce bien (pregunta a
     `Knowledge.ts` por el grado de trato; de `known` hacia arriba). Del
     resto, solo la postura (R8);
   - casilla "Usar autoridad" si el personaje es jefe: recalcula con la
     misma función de 5.3 y 5.4 y enseña quién pasaría a aceptar y cuánta
     opinión costaría;
   - recuento de brazos por cada vía y botón de confirmar.
2. **Pantalla "Decisiones de la banda"**: las propuestas de la banda del
   jugador **a las que su personaje asistió**. Cada una: qué, quién, cuándo,
   síes y noes, forzados y estado. Aquí se ve también cuándo rechazan al
   jefe (entrada B11).
3. R6, R7 y R10.

**Pruebas:** e2e de la casilla (la lista cambia y el resultado confirmado
coincide con la vista previa); captura de ambas pantallas.

### 5.7 Mudanza e incursión por asamblea

**Pasos:**
1. `considerRelocation`: conserva cuándo se plantea y quién propone. Cambia
   solo el voto: los que votan son los asistentes a la reunión.
2. `considerRaid` y `considerNeedRaid`: conserva el motivo y el objetivo.
   Cambia solo quién forma la partida: los que dicen sí en la reunión.
3. El jefe puede usar autoridad también aquí.

**Pruebas:** las que ya existen para mudanza e incursión, adaptadas (R18).

### 5.8 Emigrar (nota N3)

**Depende de:** D-7 y de lo que diga 0.1 sobre las fases 34–35 de M15.

| Situación | Qué se hace |
|---|---|
| hay migración entre comarcas | tres vías: con todos (propuesta aceptada por mayoría), con los que digan sí, o solo desde el menú del mapa |
| no la hay | las mismas tres vías, pero el destino es otro punto del mismo mapa y quienes se van forman una banda nueva |

**Pasos comunes:**
1. Menú de carga antes de salir: usa `ui/TransferPanel.ts`. El límite es lo
   que pueden acarrear quienes se van, más animales y trineos.
2. Lo que no cabe se queda y sigue siendo de la banda de origen.
3. Banda nueva: mira cómo se crea hoy la banda de los desterrados y reutiliza
   ese camino para pedir el identificador.

### 5.9 Puerta del bloque 5

| Contador | Se espera |
|---|---|
| días desde que nace una obra hasta tener respaldos suficientes | menos en 14 de 20 semillas |
| propuestas por banda y estación | más de una |
| alumnos por sesión de enseñanza | más de uno de media |
| forzados sobre asistentes | menos del 20 % (si es más, la autoridad sale demasiado barata) |
| coste por paso | no más de un 10 % |

## Bloque 6 — Objetos, obras y oficio

Interruptor: `motivation.objects`, apagado.

### 6.1 Despejar el solar (nota N5)

**Archivos:** `Simulation.placementRefusal` (hoy solo mira terreno y otros
edificios), `entities/Building.ts` (cómo guarda el silo su fase de cavado:
`earth`, `earthDone`), `Brain` (dónde se trata `unDug`).

**Pasos:**
1. Al colocar una obra, calcula qué hay en sus casillas: árboles y nodos de
   recurso. Guárdalo en `site.clearing`.
2. Fase previa "despejar", igual que el silo tiene "cavar": la obra no está
   lista hasta que `clearing` está vacío.
3. Los árboles se quitan con `chop`; la madera va al montón de la obra y
   cuenta como material entregado si la obra la pide. Las piedras se quitan
   con el verbo de recolección que ya tengan.
4. Un campo sembrado no se despeja: se rechaza la colocación con su motivo.
5. El cursor de construcción enseña cuántos árboles y piedras hay que
   quitar.
6. Al elegir solar, un NPC prefiere terreno limpio.

**Pruebas:** obra sobre dos árboles no avanza hasta talarlos; con el
interruptor apagado, todo como hoy.

### 6.2 Querer un objeto e ir a por sus materiales (entradas B6 y B15)

**Depende de:** 4.4.

**Pasos:**
1. Amplía `Lessons.remedy` con tres usos: `carry` (lleva más), `work:<habilidad>`
   (trabaja más rápido) y `protect` (protege). Se aprenden por efecto: al
   usar un contenedor, una herramienta o una prenda, o al ver a otro usarlo.
2. Propósito de tipo `objeto`: nace si la persona conoce el remedio, no
   tiene el objeto y tiene hueco. `prioridad = valor × confianza × 0,5`.
3. Cómo lo cumple, por este orden:
   1. hay uno suelto que puede coger (6.3);
   2. sabe fabricarlo: va a por los ingredientes. Reutiliza la búsqueda de
      materiales que ya existe para las obras (`gather_for_site`);
   3. necesita un puesto de trabajo que no existe: propósito de obra.
4. Un objeto propio soltado para liberar las manos se recuerda (dónde) y da
   un propósito de recuperarlo.

**Pruebas:** quien sabe hacer un hatillo y no tiene va a por mimbre y lo
fabrica; el escenario `craft` produce más hachas y lanzas que en la línea
base.

### 6.3 Equipar, y coger lo útil que se ve (notas N8 y N11)

**Depende de:** D-8.

**Archivos:** `entities/Equipment.ts` (`SLOTS`), `core/Carry.ts`
(`equipContainer`), `social/Property.ts` (`mayTakeFromPile`), `ui/Hud.ts`
(sección "Equipment").

**Pasos:**
1. Regla: un objeto con hueco de equipo solo hace efecto equipado. Repasa
   contenedores, prendas y armas y anota cuáles ya lo cumplen.
2. Jugador: equipar y quitar desde la pestaña del equipo, con motivo si no
   se puede (R6).
3. NPC: al coger o fabricar un objeto con hueco libre, se lo equipa.
4. Un NPC con propósito de ese objeto que ve uno suelto lo coge si
   `mayTakeFromPile` lo permite. Si no lo permite, no lo coge por esta vía.

**Pruebas:** alguien fabrica un hatillo y lo deja; otro de la banda que sabe
qué es y no tiene se lo equipa; uno de otra banda no.

### 6.4 Investigar un objeto desconocido (nota N11)

**Archivos:** `knowledge/Synthesis.ts` (`Idea`), `systems/KnowledgeSystem.ts`.

**Pasos:**
1. Acción nueva `examine` sobre un objeto visible, suelto o puesto en otro.
2. La elige quien no conoce la técnica del objeto y tiene curiosidad
   (`curiosityNeed`) y lo inmediato cubierto. Dura 40 pasos, interrumpible.
3. Efecto:
   - si cumple los requisitos de la técnica: crea o avanza una `Idea` con
     `insight +0,15` y la historia "examinó un <objeto>". Por examen solo no
     pasa de 0,6; el resto exige prototipo, como siempre;
   - si no los cumple: no aprende la técnica; solo aprende para qué sirve
     el objeto si lo ha visto en uso (6.2).
4. Una vez por persona, tipo de objeto y día.
5. Vale igual para objetos de otra banda.

**Pruebas:** tres exámenes suben el `insight` a 0,45; el cuarto en el mismo
día no cuenta; sin los requisitos, nada.

### 6.5 La habilidad permite o bloquea (nota N10)

**Depende de:** D-2.

**Archivos:** `entities/Building.ts` (`BuildingDef`), `entities/Recipe.ts`,
`entities/Person.ts` (`skills`, de 0 a 100).

**Pasos:**
1. Campo opcional `minSkill` en edificios y recetas, con la habilidad que
   ya usan.
2. Valores iniciales:

| Cosa | Habilidad mínima |
|---|---|
| cortavientos, pozo de almacén, hogar, trampa | 0 |
| choza de barro | 15 |
| granero | 25 |
| casa larga | 35 |

3. Regla: la obra solo avanza si entre quienes trabajan en ella en ese
   momento hay alguien con el nivel. Los demás ayudan a su ritmo y ganan
   habilidad.
4. Si nadie de la banda llega al nivel, quien la quiera no la propone; y si
   la coloca el jugador, el cursor lo dice (R6).
5. Pruebas de guarda:
   - `every-gate-is-reachable`: para cada cosa con mínimo mayor que 0 existe
     otra con mínimo 0 que entrena la misma habilidad;
   - en un mundo recién creado, todo fundador puede hacer lo de mínimo 0.

**Cuidado:** hoy la banda que pierde a sus constructores no se recupera
(entrada B20). Mide cuántas obras quedan paradas por falta de maestro.

### 6.6 El relieve y las zanjas en el camino (nota N4, entrada B17)

**Depende de:** la fase 26e de M15, según 0.1.

| Si 26e entró | Si no |
|---|---|
| el coste de camino ya cuenta zanjas y pendientes: haz que los NPC lo usen para decidir entre rodear y cruzar, y añade la obra pequeña "rampa" | haz solo el punto 1 y deja el resto anotado |

**Pasos:**
1. `Brain.proximityBonus` mide en línea recta. Para el mejor candidato de
   cada acción (solo el mejor, por coste), sustituye la distancia recta por
   la del camino si entre medias hay una casilla no caminable o con mucha
   pendiente.
2. Rodear o cruzar lo decide el coste del camino; no añadas una regla
   aparte.
3. Rampa: obra de tierra de una casilla que suaviza la pendiente. Se
   propone cuando un camino muy usado cuesta más del doble que la línea
   recta.

### 6.7 El resto del planificador

**Depende de:** 4.4, 6.2.

**Pasos:**
1. Producción como remedio: comer de una trampa, de un campo o de un rebaño
   enseña `hunger` y `building:<id>`; beber de un pozo, `thirst`.
2. Puesto de trabajo: lo pide el propósito de objeto (6.2).
3. Montón de compost: remedio de `hunger` aprendido al cosechar más en
   tierra abonada.
4. Con `foresight` y `objects` encendidos, `planBuildings` ya no pide nada.
5. La prueba `every-design-has-a-proposer` de 4.6 debe seguir pasando.

### 6.8 Puerta del bloque 6

| Contador | Se espera |
|---|---|
| objetos fabricados "para uno mismo" | más que en la línea base en 14 de 20 |
| objetos sueltos recogidos por NPC | más de cero |
| obras paradas por falta de maestro | menos del 20 % de las abiertas |
| edificios de cada tipo levantados sin planificador | ninguno a cero que antes no lo estuviera |

## Bloque 7 — Otras bandas

Interruptor: `motivation.rivalry`, apagado.

### 7.1 Cohesión en el ataque (nota N2)

**Archivos:** `entities/Person.ts` (`raidingBandId`, `raidingUntil`),
`ai/Drives.ts` (presión de hogar).

**Pasos:**
1. Mientras `raidingUntil` esté vigente, la presión de hogar se multiplica
   por 0,4 **si** la persona ve al menos a un compañero de partida que
   sigue adelante.
2. Moral: cada vez que piensa, mira qué parte de los compañeros a la vista
   huye o vuelve. Si es la mitad o más, se da por terminada su incursión y
   vuelve.
3. Si no ve a ningún compañero, la presión de hogar es la normal.
4. Contadores: `raid_held`, `raid_broke`.

**Pruebas:** partida de cuatro: nadie se vuelve por goteo; si dos huyen,
los otros dos se vuelven.

### 7.2 Percibir la desventaja

**Archivos:** nuevo `social/Rivalry.ts`; `social/Knowledge.ts`;
`social/Memory.ts`.

**Pasos:**
1. Por persona y banda conocida, cuatro cifras con `{ valor, confianza,
   día, fuente }`:

| Eje | Cómo se estima |
|---|---|
| gente | individuos distintos de esa banda vistos en los últimos 40 días |
| fuerza | armados vistos, incursiones sufridas de esa banda, defensas vistas |
| riqueza | almacenes y rebaños suyos vistos, banquetes suyos a los que se asistió |
| técnica | objetos y edificios suyos vistos cuya técnica no se conoce |

2. Lo propio se estima igual, con lo que la persona sabe de su banda.
3. `brecha = (ellos − nosotros) / (ellos + nosotros)`, de −1 a 1, por eje.
4. Contado: en conversación larga se pasa la cifra de mayor confianza, a la
   mitad de confianza. La confianza baja 0,02 al día.
5. La banda no tiene vista propia: cuenta la del jefe.
6. `cobertura(safety)` de 4.3 pasa a leer la brecha de fuerza.

**Pruebas:** quien sufre una incursión cree más fuerte al rival; quien no
ha visto a nadie no tiene cifra.

### 7.3 Responder

**Objetivo:** que la brecha creída alimente los decisores que **ya
existen**. No se crea ninguno nuevo.

| Respuesta | Decisor existente | Qué se le pasa |
|---|---|---|
| armarse | propósito de objeto (6.2) con remedio `protect` | brecha de fuerza |
| fortificar | propuesta de obra de tierra (5.3) | brecha de fuerza; resuelve la entrada B3 |
| copiar | `examine` (6.4), preguntar, casarse fuera | brecha de técnica |
| aliarse o hacer la paz | `considerStance` | brecha de fuerza frente a un tercero |
| someterse | `considerSubmission` | la fuerza **creída** por el jefe en vez de la real |
| golpear primero | `considerRaid` | brecha pequeña y creciente; agresividad |
| irse | `considerRelocation` | el miedo crónico, que ya lee |

**Pasos:**
1. Función `respuesta(jefe, otraBanda)` en `Rivalry.ts`: devuelve un peso
   por respuesta según las brechas, la relación actual y el talante (7.4).
2. Cada decisor lee su peso, y solo con el interruptor encendido.
3. Un contador por respuesta elegida.

### 7.4 Talante de banda (entrada B12)

**Pasos:**
1. `Band.strangerRegard` hoy se sortea al fundar y no se mueve. Con el
   interruptor encendido, cada día se acerca un 2 % a un objetivo: media de
   los rasgos de sus miembros, rasgos del jefe con peso doble, y lo vivido
   (incursión sufrida, baja; matrimonio o trueque con extraños, sube).
2. Etiqueta para el panel, calculada y no guardada: agresiva, defensiva,
   comerciante o independiente, según umbrales sobre el talante y las
   respuestas elegidas en el último año.

### 7.5 Puerta del bloque 7

Sobre `dos_bandas_enfrentadas` y el escenario `conquest`.

| Contador | Se espera |
|---|---|
| incursiones deshechas por goteo | menos que en la línea base |
| respuestas distintas elegidas entre semillas | al menos cuatro de las siete |
| obras defensivas propuestas tras una incursión | más de cero |

## Bloque 8 — Descubrimiento

Interruptor: `motivation.experiment`, apagado.

### 8.0 Qué enseña la red

**Depende de:** D-4. **Va antes que todo lo demás del bloque.**

Hoy, `ui/TechWeb.ts` enseña el nombre de un nodo y qué ingredientes faltan
en cuanto se cumplen sus requisitos. Con eso las rutas ya están a la vista
y "descubrir" es leer la red.

**Pasos (con la propuesta por defecto):** en un nodo aún no concebido,
enseña el nombre y los ingredientes **ya cumplidos**; de los que faltan,
solo cuántos son.

### 8.1 Experimentar (jugador)

**Archivos:** `ai/ActionCatalog.ts`, `systems/KnowledgeSystem.ts` (dónde se
concibe una idea), `knowledge/Synthesis.ts` (`sparkFires`, `sparkStatus`).

**Pasos:**
1. Flujo `experimentRng` al final de la lista (R2).
2. Acción `experiment`, 60 pasos, interrumpible.
3. Al terminar, construye el mismo "aviso" (`Notice`) que usa el sorteo
   diario y recorre las técnicas cuyos requisitos cumple:
   - si alguna ruta se cumple entera: concibe la idea con probabilidad 0,8;
   - si ninguna, pero alguna ruta tiene la mitad o más: da una **pista
     vaga**: el tipo del ingrediente que falta ("algo que llevar en las
     manos", "un lugar", "una estación"), nunca cuál;
   - si no, nada.
4. Límites: una pista por técnica y día. Uno de cada tres intentos gasta
   una unidad de lo que se lleva en las manos.

**Pruebas:** con la ruta completa, 8 de cada 10 intentos conciben (con
semilla fija); 20 intentos seguidos no revelan ningún nombre de ingrediente.

### 8.2 NPC que experimentan

**Depende de:** 4.4.

**Pasos:**
1. Propósito de tipo `explorar`. Nace si hay un impulso con `esperada ≥
   0,25` y **ningún remedio conocido**, o si la curiosidad es alta y lo
   inmediato está cubierto. Uno por persona.
2. Qué hace: elige, con `experimentRng`, un tipo de objeto o un lugar que
   **conoce** y con el que no ha experimentado en 10 días; va, lo coge y
   lanza `experiment`. **No lee la tabla de rutas.**
3. Si concibe una idea, gana renombre.
4. Contador de experimentos y de ideas por esta vía.

**Cuidado:** el check `ideas-are-conceived` tiene un techo de 3 ideas por
persona y año. No lo subas.

### 8.3 Señales

**Pasos:** comprueba si al concebir una idea ya sale un rótulo y una línea
de crónica. Si sale, añade solo el rótulo de la pista ("intuye algo").

### 8.4 Puerta del bloque 8

| Contador | Se espera |
|---|---|
| ideas por persona y año | bajo el techo de 3 |
| pasos hasta la primera técnica de un jugador guiado por una prueba que conoce la ruta | menos de la mitad que esperando el sorteo |
| personas con propósito de explorar | menos del 15 % de los adultos |

## Bloque 9 — Modos de partida

Sin interruptor: son configuraciones de partida nuevas.

### 9.1 Pertenencia a la banda (entrada B14)

**Depende de:** D-5.

**Archivos:** `Simulation.mergeHouseholds`, `BandSystem.considerAdoption`,
todo lo que lee `bandId`.

**Pasos:**
1. Antes de cambiar nada, lista con `grep` todo lo que lee `person.bandId`
   y clasifícalo: jefatura, destierro, propiedad, eras, relaciones.
2. Al casarse entre bandas, quien se muda al hogar del otro pasa a la banda
   de ese hogar.
3. Una persona o familia sin banda viable (menos de 3 adultos) puede pedir
   unirse a otra: reutiliza `considerAdoption`.
4. Prueba por cada lector de la lista del paso 1.

### 9.2 Cuatro modos

**Archivos:** `ui/NewGame.ts`, `core/Difficulty.ts`.

**Pasos:**
1. Los modos son **ajustes de partida nueva**. No cambies la configuración
   por defecto, que usan las pruebas: un solo flujo reparte recursos,
   manadas y personas, y cambiarla movería todos los mundos.

| Modo | Tu grupo | Recursos | Otras bandas |
|---|---|---|---|
| Fácil | banda de 10 | abundantes | una, de buen trato |
| Normal | banda de 8 a 12 | normales | dos |
| Difícil | tu familia (4 o 5) | normales | dos |
| Muy difícil ("Desnudo en el mundo") | tú solo | escasos | dos |

2. Comprueba que la creación de personas admite una banda de una sola
   persona; si no, R0.
3. Ningún modo concede técnicas.
4. Sin tutorial.

### 9.3 Puerta del bloque 9

**Depende de:** D-10. A 20 semillas por modo y 4 años (38.400 pasos):
informe de extinción y de cuántos mundos tienen nietos. Solo juzgan los
límites acordados en D-10.

## Bloque 10 — Calibración y cierre

Las fases 10.1 a 10.4 se pasan también al acabar cada tramo.

| Fase | Qué se hace |
|---|---|
| 10.1 Encendido | Interruptores de uno en uno y en este orden: `foresight`, `assembly`, `objects`, `rivalry`, `experiment`. Semillas pareadas en `band` y `century`. Se anota cada salto |
| 10.2 Balance | Las entradas C de `docs/m16_bugs.md`, de una en una, con el autor decidiendo cada palanca |
| 10.3 Puertas nuevas | Con fundadores que no saben nada, la puerta pasa a ser extinción y recuperación desde el segundo invierno. Reescribir los checks que miden otra cosa (R18) |
| 10.4 Rendimiento | `npm run perf` con 30 y 300 personas frente a la línea base; decidir qué se recorta |
| 10.5 Interruptores | Para cada uno: encendido por defecto o retirado. El código muerto del lado que pierde se borra. `npm run baseline:pin` |
| 10.6 Histórico | De `docs/m16_diario/`, un resumen por bloque con antes y después: es el material del blog y de LinkedIn |

---

# Parte C — Fuera de M16

- Propiedad familiar y reparto del suelo, abierto por una técnica.
- Sistemas político-económicos como combinación de reglas.
- Cuaderno del jugador entre partidas (descartado por ahora).
- Rediseño visual de la red de técnicas.
- Pose de sentado y demás arte nuevo.
- Todo lo marcado D en `docs/m16_bugs.md`, incluida E17 (lo que el modelo
  compacto no hace: recién nacidos, partos, frío, `KnowledgeLedger` en la
  instantánea) y las puertas del mundo de pueblos (`farming-spreads`,
  `states-arise`), salvo lo que arregle 16.4.

---

# Parte D — Carriles de trabajo por funcionalidad (2026-10-11)

Esta parte reorganiza el trabajo para que **varios agentes lo aborden a la
vez**, cada uno en su propio worktree, sin pisarse. Incorpora las notas N12 a
N46 (`m16_bugs.md`, secciones 1b y 1c), las entradas E y K de las secciones 9
y 10, y las pruebas de funcionalidad (secciones 8 y 11 de ese mismo fichero).
No sustituye a las fases de la Parte B: las **ordena y reparte**, y define las
fases nuevas 11 a 17.

## D1. Cómo se reparte

- Un carril = una funcionalidad con **ficheros propios**. Un agente por carril.
- Rama por carril y fase: `m16/<carril>/<fase>`. Un commit por funcionalidad
  (`m16:`).
- **Ficheros compartidos** (varios carriles los tocan; cambios pequeños, solo
  añadir, rebase antes de cada commit): `entities/Building.ts` (tabla
  `BUILDINGS`), `knowledge/Tech.ts`, `ai/ActionCatalog.ts`, `ui/Hud.ts`,
  `src/i18n/es/*`. `Brain.ts` solo recibe ganchos (R14) y lo toca únicamente
  el carril CEREBRO. **Sustituido el 2026-10-13 por D7**: esta lista se
  quedaba corta (no incluía `Simulation.ts`, `ActionSystem.ts`, `main.ts` ni
  `Renderer.ts`) y «rebase antes de cada commit» no basta con nueve carriles.
- Los interruptores siguen siendo uno por bloque (R15). Las fases nuevas 11 a
  17 **no llevan interruptor** si no cambian el mundo sin jugador, y llevan el
  del bloque 6 (`objects`) o 7 (`rivalry`) cuando lo cambian.
- R22 manda: **la primera tarea de cada carril es su ola 0** (pruebas de
  funcionalidad, `m16_bugs.md` sección 8). Su resultado fija qué fases de fallo
  hay que hacer de verdad.

## D2. Carriles

Tabla revisada el 2026-10-13 con N45, N46 y las entradas E/K de
`m16_bugs.md` §9–10. La ficha completa de cada carril (qué toca, qué no, en
qué orden, cuándo ha terminado) está en **D8**.

| Carril | Puerto e2e | Qué es | Fases | Notas y entradas | Ficheros propios | Depende de |
|---|---|---|---|---|---|---|
| **HERR** | 5401 | Herramientas de prueba, persistencia, infraestructura de reparto | 0.5, 1.1 a 1.8, 2.24, 2.28 | T1–T10, E5, E10–E13, E15, E16 | `tools/`, `package.json` (scripts), CI, `persistence/` | nada; **0.5 va antes que cualquier otro carril** |
| **MUNDO** | 5402 | Mundo físico: borde, comarcas, agua, costa, clima, temperatura, biomas | 2.19, 2.21, 2.25, 15.1, 15.2, 15.3 y las entregas de `m16_room_temp_plan.md` | N26 N33 N34 N36 N39, E1 E6 E7 E18 E19, K1 K2 K8 | `core/World.ts`, `core/Earth.ts`, `sim/world/*`, `TimeManager.ts`, `NeedsSystem.ts` | D-15 para el clima |
| **CARGA** | 5403 | Capacidad, peso, equipo, transferencias | 2.4, 2.16, 2.26, 2.27, 6.3, 12.1 | N8 N11 N18 N19 N20, E8 E9, K3 K4 | `core/Carry.ts`, `core/ToolEquipment.ts`, `entities/Equipment.ts`, `entities/ItemWeights.ts` (nuevo), `Person.ts` (capacidad) | nada; 6.3 necesita el gancho de `BrainHooks` (0.5) |
| **OBRAS** | 5404 | Construir: solar, materiales, habilidad, destruir, rotar, refugios, aforo | 2.2, 2.15, 2.20, 2.22 (b), 6.1, 6.5, 14.1, 14.2, 14.3 | N5 N9 N10 N16 N24 N25 N27 N38 N40 N43 N45 (regla) | `Building.ts`, `BandSystem` (solo obras: `dropStaleSites`, `planBuildings` en lo que toca a solares), `Simulation.placementRefusal`, `Recipe.ts`, `HouseInterior.ts` | D-13 para 14.3; D-2 para 6.5; D-16 para 2.22 (b) |
| **PERCEPCION** | 5405 | Qué se ve, qué se recuerda y cómo se dibuja | 2.3, 2.6, 2.18, 2.22 (a), 2.29 | N6 N7 N12 N32 N45 (bandera), E4 E14, K6 | `social/PlaceMemory.ts`, `render/*` salvo lo de UI, `art/src/`, `tools/art` | D-17 para N12 |
| **UI** | 5406 | Menús, selección, vistas, rótulos, cola, avisos | 2.12, 2.23, 3.1, 3.2, 11.1 a 11.5 | N13 N17 N30 N31 N35 N46, E21 E22, K5 K7 | `ui/*`, `main.ts`, `render/Floaters.ts`, `ActionCatalog` (estructura de menús) | 11.3 espera a 13.x; 3.1 y 11.1 comparten reglas de interrupción |
| **TECNICA** | 5407 | Técnicas, descubrimiento, enseñanza, medicina, materiales | 5.5, 6.4, 8.x, 16.1, 16.2, 16.4; la caña de 15.3 | N1 N11 N28 N29 N42, E18 (caña), E20 | `knowledge/*`, `KnowledgeSystem.ts`, acción `tend` | 5.5 espera a la asamblea; 16.4 espera a D-4 |
| **FAUNA** | 5408 | Animales | 2.7, 2.14, 17.1 | N41 | `WildlifeSystem.ts`, `entities/Animal.ts`, `AnimalAttack.ts`, `social/Defence.ts` (solo 2.14) | nada |
| **CEREBRO** | 5409 | IA, bandas, mando (**en serie**) | 2.11, 2.17, 4.x, 5.x, 6.2, 6.7, 7.x, 13.1, 13.2, 9.x | N2 N3 N14 N15 N21 N22 N23 N37 N44, E2 E3 E23 | `ai/*`, `social/*` salvo `Defence`, `BandSystem` salvo obras | orden de bloques de la Parte B; es el camino crítico |
| *integración* | 5410 | Fusionar, subir versión, fijar líneas base, cohortes | — | — | `docs/changelog.md`, `package.json` (`version`), `fixtures/` | todos |

Los carriles HERR, MUNDO, CARGA, OBRAS, PERCEPCION, UI y FAUNA **pueden correr
todos a la vez** tras el bloque 0. TECNICA corre aparte salvo 5.5. CEREBRO es
la cadena larga: no se paraleliza consigo misma.

## D3. Decisiones nuevas (D-11 a D-15) para el autor

Cada una con su propuesta por defecto; si no hay respuesta, se usa esa.

| # | Decisión | Por defecto | Afecta |
|---|---|---|---|
| D-11 | Nombre y regla del edificio centro de la tribu (N23). «Hogar» ya significa el hogar de una familia (`Household`) y, en español, la hoguera (N16) | «estandarte» (en inglés *banner*); la hoguera pasa a llamarse «hoguera» en español; el id interno `hearth` no cambia | 13.1, 2.15 |
| D-12 | El peso (N19): ¿sustituye a los huecos o se suma? | se suma: el tope de huecos sigue, y se añade un tope de peso por objeto (`ItemDef.weight`); el peso máximo sale de fuerza, edad y salud | 12.1 |
| D-13 | Refugios sin madera (N27, N43) | **refugio de ramas** (sin barro ni madera; palos; 2 plazas; abrigo entre el cortavientos y la choza de barro) y la **choza de barro** actual pasa a: sin madera, más palos, menos barro, 3 plazas, abrigo menor que hoy pero mayor que el cortavientos. Las cifras exactas son parámetros de diseño (R16), no medidas | 14.3 |
| D-14 | Jugar como otro NPC (N22) | permitido en fácil y normal; desactivado en los modos duros; configurable al empezar | 9.2 |
| D-15 | `m16_room_temp_plan.md` excluye «lluvia nueva» y biomas gráficos. El clima de N26 los introduce | el clima se hace **después** de la entrega física de temperatura, como fase 15.1 aparte, y levanta esa exclusión solo para esta fase | 15.1 |
| D-16 | ¿Qué es un mueble «de exterior» (N45) y qué es el territorio de una banda? | de exterior = diseño con `station: true` que no es `furniture` (horno, telar, molino, secadero…). Se coloca solo donde `territoryOwnerAt(x, y)` es la banda; si la banda aún no tiene territorio, a ≤ 8 casillas de un edificio terminado suyo | 2.22 (b) |
| D-17 | La niebla vista (N12): ¿guardar `FogReveal` en la partida o reconstruirlo? | reconstruirlo de la memoria de lugares del personaje al cargar y al cambiar de observador (sin campo nuevo en el guardado); una casilla vista y lejana queda **atenuada**, nunca negra | 2.3 |
| D-18 | ¿Desde qué edad se viste un niño solo, y quién viste a los menores? | se viste solo desde la etapa «niño» de `LifeStage`; antes no se le viste, y su abrigo es el de quien lo lleva en brazos, como hoy. Un cuidador que viste a otro es funcionalidad nueva, fuera de M16 | 2.27 |
| D-19 | Elegir comarca (E21, E22): ¿la tarjeta de costa promete orilla y se pronostica el agua por celda? | la tarjeta dice «costa: puede no haber orilla alcanzable» y no se pronostica nada (medir antes de hablar es el coste que la tarjeta evita) | UI, sin fase propia; una línea en 11.5 |
| D-20 | `AGENTS.md` manda subir la versión y escribir `changelog.md` **en cada commit**. Con nueve carriles a la vez, eso es un conflicto en cada fusión | los carriles escriben su entrada en `docs/changelog.d/<fecha>-<carril>-<fase>.md` y no tocan la versión; quien integra sube la versión y vuelca los fragmentos en `changelog.md` en el commit de fusión. **Cambia una regla de `AGENTS.md`: necesita el sí del autor** | D7 |

**D-7 queda resuelta** por M15: las fases 34–35 entraron, así que emigrar es
viajar de verdad entre comarcas, no escindir la banda dentro del mapa.

## D4. Fases nuevas

Plantilla igual que la Parte B. Los números de línea no son contrato; los
nombres de función se comprueban con `grep` (A4, paso 4).

### Bloque 11 — Interfaz (carril UI)

**11.1 Cola de acciones del jugador (N17).** *Archivos:* `ActionSystem` (cola
por persona), `ui/Hud.ts`. *Pasos:* 1) cola corta (máx. 5) por persona,
guardada en `Person` (R11, R12); 2) mayús+clic añade al final, clic normal
sustituye; 3) al terminar o abandonar una acción pasa a la siguiente salvo
`under_attack` o necesidad pasada de línea, que la vacían **con aviso** (R6);
4) la cola se ve y se puede vaciar. *Pruebas:* tres acciones en cola se
ejecutan en orden; una interrupción vacía la cola con motivo; ida y vuelta de
guardado. *Cuidado:* el jugador dirigido de la fase 3.1 ya tiene reglas
propias de interrupción; no las dupliques.

**11.2 Submenú de pensar (N13).** *Archivos:* `ui/*`, `ActionCatalog`. Agrupar
las acciones mentales (pensar, discutir, enseñar…) en un submenú. Solo cambia
la presentación. *Prueba:* e2e que abre el submenú y ejecuta una; los ids de
acción no cambian.

**11.3 Vista de otras bandas (N30).** *Depende de:* 13.x. Vista aparte con las
relaciones entre bandas; la de tribu muestra solo la propia. Todo pasa por
`social/Knowledge.ts` (R8). *Prueba:* un desconocido no aparece en la vista de
tribu y su ficha no revela habilidades.

**11.4 Antepasados en la vista de familia (N31).** Casilla «mostrar
antepasados» con desplazamiento. El rediseño de la red de técnicas sigue
fuera (D9 de `m16_bugs.md`); esto es solo la casilla. *Prueba:* un árbol de
cuatro generaciones muestra todos los antepasados con la casilla y no sin ella.

**11.5 Rótulo del objetivo de la acción (N35).** Cada acción larga dice su
objetivo: «cavando barro», «recogiendo grosellas», «proponiendo choza de
barro». Traducir `propose` y los verbos que aún salgan sin pasar por `t()`
(`npm run i18n:soak`). *Pruebas:* `i18n.test.ts` y un test que recorre los
verbos del catálogo y exige un objetivo no vacío.

### Bloque 12 — Peso (carril CARGA)

**12.1 Peso de los objetos (N19, D-12).** *Depende de:* 2.4 (la conservación
al recoger debe estar probada antes). *Archivos:* `Item.ts`, `Carry.ts`,
`Person.ts`, `MovementSystem.speedOf`. *Pasos:* 1) el peso de cada objeto en
una **tabla aparte**, `entities/ItemWeights.ts` (id → kg), con una prueba que
exige un peso para todo id de `ITEMS` — no un campo nuevo en cada fila de
`ITEMS`, porque TECNICA y MUNDO añaden filas a la vez y editar las ~150
existentes es un conflicto seguro (paja ≪ carne < hierro); 2) peso máximo = función de
`vigour`, edad y `health`; 3) por encima del máximo la persona no se mueve y
debe soltar algo; entre el 70 % y el 100 % se mueve más despacio; 4) la ficha
enseña peso y máximo (R6: si no se mueve, dice por qué). *Pruebas:* cinco de
paja caben y cinco de hierro no, con el mismo hueco; un niño y un adulto tienen
máximos distintos; con el interruptor `objects` apagado `Carry` se comporta
como antes (R13). *Cuidado:* es un cambio de economía; mide por contador, no
por supervivencia.

### Bloque 13 — Bandas y relaciones (carril CEREBRO)

**13.1 Estandarte, centro de la tribu (N23, D-11).** Edificio desbloqueable
por técnica al que los NPC vuelven tras alejarse mucho; al trasladarlo se muda
el centro de la banda. *Depende de:* 5.7 (la mudanza ya existe). *Archivos:*
`Building.ts`, `Tech.ts`, `BandSystem.considerRelocation`. *Pasos:* 1)
tecnología y edificio; 2) el centro de la banda pasa a ser el estandarte si
existe; 3) la presión de hogar (`ai/Drives.ts`) apunta a él; 4) mudarlo es un
acto del jefe con aviso. *Pruebas:* sin estandarte nada cambia (R13); con él,
quien se aleja vuelve; trasladarlo mueve el centro.

**13.2 Cariño por los bebés de la propia tribu (N37).** Relación inicial 15
hacia un bebé de la propia banda; +1 cada vez que se juega con él, con tope.
*Archivos:* módulo de relaciones de `social/` (busca el nombre exacto) y la
acción `play`. *Prueba:* tras N juegos la relación sube N; un bebé de otra
banda no recibe el 15. *Cuidado:* cambia el trato a niños en todos los mundos;
mide por contador.

### Bloque 14 — Construcción (carril OBRAS)

**14.1 Destruir edificios propios (N24).** Opción en el menú construir; el
edificio se desmonta durante un tiempo y devuelve parte de los materiales. Solo
edificios de la banda del jugador. *Prueba:* destruir devuelve materiales,
libera las casillas y los ocupantes salen. R6 si se niega (alguien dentro, obra
en curso).

**14.2 Rotar al colocar (N25).** Orientación en la colocación; la huella
(`houseForFootprint`) y el interior real (`HouseInterior.ts`) la respetan; se
guarda en el edificio (R11). *Prueba:* un edificio rotado tiene la huella y la
puerta giradas; ida y vuelta de guardado.

**14.3 Refugios sin madera (N27, N43, D-13).** *Depende de:* D-13, 6.5.
*Archivos:* `Building.ts` (`BUILDINGS`), `Recipe.ts`, `Tech.ts`. *Pasos:* 1)
regla: antes del enmangado ninguna obra ni herramienta pide madera; 2) refugio
de ramas y choza de barro rebalanceados según D-13; 3) **ocupación**: se cuenta
cuánta gente hay en cada edificio (durmiendo o resguardada) y no se supera su
aforo; el sobrante busca otro refugio o lo propone; 4) el abrigo de cada
refugio se mide con `local-heat.test.ts` como modelo. *Pruebas:*
`every-design-has-a-proposer` sigue en verde; ninguna receta anterior al
enmangado lleva madera; el aforo se respeta; el abrigo cumple cortavientos <
refugio de ramas < choza de barro < casa. *Cuidado:* el abrigo actual de la
choza está calibrado contra todo lo demás (el autor señala que no motiva a
mejorar); toca `ai-uses-many-actions`.

### Bloque 15 — Mundo físico (carril MUNDO)

**15.1 Clima (N26, D-15).** Lluvia, sol, nubes, tormenta, granizo; cada uno
con efectos en NPC (frío, humedad, daño), cosechas, arbustos y edificios; barro
donde llueva sobre tierra. *Depende de:* las entregas de
`m16_room_temp_plan.md` (clima reproducible) y D-15. *Pasos:* 1) estado del
tiempo por comarca, determinista, con un `RNG` nuevo al final de la lista
(R2); 2) efectos uno a uno, cada uno con su contador; 3) el barro como recurso
de construcción fuera de ríos y lagos. *Pruebas:* mismo resultado con la misma
semilla; el granizo daña cultivo y edificio; lluvia sostenida crea barro solo
en tierra. *Cuidado:* un tiempo nuevo cambia todos los mundos; interruptor
propio.

**15.2 Orilla gradual (N33).** Alrededor del agua, casillas de marisma, arena,
barrizal o piedras; de ahí se saca arena, piedras pequeñas y agua. *Archivos:*
`WorldGeography.ts`, `LocalGeography.ts`, `World.ts`. *Prueba:* ninguna casilla
de agua toca tierra seca sin al menos una casilla de orilla; las casillas de
barro de N32 salen de aquí. Cambia el mapa en todas las semillas:
`baseline:pin` y dilo en el commit. *Cuidado:* la orilla nueva es un recurso
nuevo; por la regla de `AGENTS.md` sobre `spawnRng`, sus depósitos salen de
un flujo propio añadido al final y se colocan en una pasada **después** de
`spawnPeople`. Depende de 2.19 (el perímetro ya no es orilla).

**15.3 Agua, pesca y biomas duros (E18, E19; pendientes del autor del
08-10).** *Archivos:* `World.ts`, `LocalGeography.ts`, `GeographicResources.ts`,
`Habitat.ts`; la caña, con TECNICA. *Pasos:* 1) bancos de peces
proporcionales al agua: ancho del cauce y fracción de mar en la comarca, en
vez del tope de 150 que satura cualquier comarca con agua; 2) marisqueo:
recolección a mano en casillas de orilla somera (cangrejo, marisco), sin
herramienta; 3) la pesca de verdad pide zonas de concentración y una técnica
nueva, **caña**, que tenga efecto en el mismo pase (regla de no declarar
contenido inerte); revisar cómo encajan `fishing`, red y `fish_trap`; 4)
bioma `desert` en el mapa local con su hábitat (pocas manadas, nada de
bayas) y agua del subsuelo (`well` ya existe) y de plantas; 5) tundra más
dura por hábitat, no por un multiplicador. *Pruebas:* un riachuelo da menos
bancos que un río ancho y que una costa; un desierto local no tiene 17
manadas; marisquear funciona sin herramienta y pescar en zona de
concentración necesita la caña. *Cuidado:* cambia mapas y economía; nuevo
flujo RNG al final (D7) y medición por contador, nunca por supervivencia de
una semilla.

### Bloque 16 — Técnica y medicina (carril TECNICA)

**16.1 Domesticación sin precondición ficticia (N28, N29).** *Archivos:*
`knowledge/Tech.ts`, `Synthesis.ts`, `KnowledgeSystem`. *Pasos:* 1) el
pastoreo y la doma de cada especie se descubren intentando domar a un animal
salvaje de esa especie (ingrediente nuevo: «intentó domar un X»), no
«construyendo pastoreo»; 2) si la especie no existe en el mapa no hay
ingrediente, y la técnica se alcanza por contacto con otra banda o comarca,
sin quedar bloqueada para siempre; 3) prueba `every-gate-is-reachable`.
*Pruebas:* domar un lobo en un mundo con lobos habilita la doma de perros; en
un mundo sin lobos no se declara una técnica inalcanzable (regla
`no-declared-but-inert`).

**16.2 Curar exige material (N42).** Tratar a un herido gasta plantas
medicinales y un vendaje o cataplasma. *Archivos:* acción `tend`, `Item.ts`.
*Punto de partida (leído el 13-10):* `ITEMS.herbs` (milenrama) ya existe y
`tend` ya la gasta para un envenenamiento o una herida que supura
(`Body.dress`, `Body.soothe`). Lo nuevo es el vendaje (objeto con receta y
efecto en el mismo pase) y exigir ambos para las heridas abiertas.
*Pruebas:* sin plantas o sin vendaje la acción se rechaza con motivo (R6); con
ellos, el herido mejora y se gastan. *Cuidado:* la entrada C11 dice que nadie
cuida a los heridos; no empeorarlo (medir `tend` antes y después).

**16.4 Materiales y prototipos fieles a la historia (E20).** *Depende de:* D-4
y 8.0 (qué enseña la red). *Archivos:* `knowledge/Tech.ts` (prototipos),
`Item.ts`, `ResourceNode.ts`. *Pasos:* 1) recorrer los prototipos de `TECHS` y
anotar, para cada uno, el material con que lo hicieron los primeros humanos
según la fuente del nodo (`firstKnown`); 2) donde no coincide, proponer el
material correcto en una tabla del diario **antes** de cambiar nada, y que el
autor la apruebe; 3) añadir solo los materiales que algún prototipo aprobado
use (piedras de distinto tipo, arcilla para tablillas…), cada uno con su
fuente en el mapa. Empieza por `writing` (hoy pide `flint`, y solo 4 de 959
regiones tienen cereal y sílex juntos, lo que bloquea la rama del Estado).
*Pruebas:* `every-gate-is-reachable`; todo material nuevo tiene al menos un
consumidor y una fuente. *Cuidado:* no tocar tasas ni umbrales de difusión
para hacer pasar `people-knowledge` (E12): este es el arreglo que el autor
pidió en su lugar.

### Bloque 17 — Fauna (carril FAUNA)

**17.1 Huida y ataque ante humanos (N41).** Según especie y estado (domado,
cría, hambriento), el animal huye, ataca o ignora a un humano que se acerca.
*Archivos:* `WildlifeSystem.ts`, `entities/Animal.ts`. *Punto de partida
(leído el 13-10):* los animales **ya** huyen (`fleeX`/`fleeY` en
`WildlifeSystem`), los depredadores ya muerden (`AnimalAttack.ts`) y
`Animal.temperament` existe. Paso 0: inventariar en el diario qué dispara hoy
la huida y el ataque; esta fase amplía ese mecanismo, no crea otro. *Pasos:*
1) distancia de huida por especie, modulada por `temperament`; 2) depredadores y presas con cría pueden atacar; 3) los domados
no huyen del dueño. *Pruebas:* un ciervo huye a la distancia fijada; un lobo
con crías ataca; un perro domado no huye. Los tiempos de animación son
observaciones: no leen `lastRunAt` para decidir (regla de `AGENTS.md`).

## D5. Orden de olas

Revisado el 2026-10-13. Una ola no empieza hasta que la anterior está
**fusionada** en `m16/integracion`, no solo terminada en su rama.

| Ola | Qué | Quién | Salida |
|---|---|---|---|
| **0a** | Bloque 0 (0.1–0.4): foto de cierre, triaje sin etiquetas V, decisiones del autor | integración (un solo agente) | `docs/m16_baseline.md`; D-1…D-20 contestadas o con su valor por defecto |
| **0b** | **0.5, infraestructura de reparto (D7)** | HERR, solo | un commit que deja preparados ganchos, ficheros de idioma, cola, puertos y la rama de integración. **Nadie más empieza antes** |
| **1** | Pruebas de funcionalidad (`m16_bugs.md` §8 y §11) de cada carril, sin tocar código de juego | todos los carriles a la vez | informe «pasa / falla» por prueba; las que pasan quedan como regresión |
| **2** | Fallos baratos de causa ya leída: 2.2, 2.4 (+K3, K4), 2.15, 2.19 (+K1, K2, K8), 2.22 (a), 2.23, 2.27, 2.29 y las etiquetas de 11.5 (K5). Bloque 1 hasta 1.3 | OBRAS, CARGA, MUNDO, PERCEPCION, UI, HERR | cada uno con su prueba en verde; quien integra fija la línea base tras cada fusión que cambie el mundo |
| **3** | El resto del bloque 2 (2.1, 2.3, 2.5–2.14, 2.16–2.18, 2.20, 2.21, 2.24–2.26, 2.28); bloque 1 desde 1.4; 3.1, 3.2, 11.2, 11.4 | todos; CEREBRO empieza aquí con 2.11 y 2.17 | `docs/m16_baseline_2.md` (puerta del bloque 2) |
| **4** | Funcionalidades sin dependencias: 11.5, 12.1, 14.1, 14.2, 15.2, 16.2, 17.1, 2.22 (b); CEREBRO, bloque 4 | UI, CARGA, OBRAS, MUNDO, TECNICA, FAUNA, CEREBRO | un diario por fase |
| **5** | Con dependencias: 14.3, 15.1, 15.3, 16.1, 16.4, 11.1, 6.x, 13.x, 11.3; CEREBRO, bloques 5 y 7 | según D2 | puertas de bloque (A7), en cola (R27) |
| **6** | Bloques 8 y 9; después el 10 | TECNICA (8), CEREBRO (9), integración (10) | cierre |

**Camino crítico:** CEREBRO 4 → 5 → 7 → 9, con 6.2, 6.4 y 6.7 colgando de la
agenda (4.4). Todo lo demás cabe en paralelo a esa cadena. Si hay que recortar,
se recorta fuera de ella; un retraso en CEREBRO retrasa M16 entero.

## D6. Qué comprueba el agente al terminar un carril

1. Todas las pruebas de su sección 8 pasan o tienen motivo escrito.
2. `npm run typecheck && npm test`, y un `sim:check` de una semilla (las
   restricciones de AGENTS.md sobre verificación pesada siguen vigentes hasta
   que el autor las levante).
3. R13: con el interruptor apagado, el checkpoint de las semillas 1, 2 y 3 no
   cambia.
4. Diario (`docs/m16_diario/<carril>.md`), fragmento de changelog
   (`docs/changelog.d/`, D-20) y `bugs.md` actualizados.
5. El commit dice: «Cambia el mundo: sí/no; interruptor: <nombre> o ninguno;
   flujo RNG nuevo: <número> o ninguno».

## D7. Infraestructura de reparto (fase 0.5, carril HERR, ola 0b)

**Objetivo:** que nueve agentes trabajen a la vez sin pisarse. Las versiones
anteriores del plan decían «cambios pequeños, solo añadir, rebase antes de
cada commit» y daban por compartidos cinco ficheros. Medido el 13-10: los
ocho ficheros calientes de R25 suman 32.073 líneas y casi todas las fases
tocan al menos tres; la versión de `package.json` se sube en cada commit
funcional; y `changelog.md`, la tabla de flujos RNG de `AGENTS.md` y las
huellas de `switches-off` son un solo fichero cada uno. Sin esta fase, cada
fusión es un conflicto.

**Un solo commit, sin cambiar la simulación** (R13 y `determinism` bit a bit):

| # | Qué se crea | Para qué |
|---|---|---|
| 0.5.1 | Rama `m16/integracion` desde el cierre de M15. Cada carril trabaja en `m16/<carril>/<fase>` en su worktree: `git worktree add ../dynasty-<carril> -b m16/<carril>/<fase> m16/integracion` | un sitio al que fusionar que no es `master` |
| 0.5.2 | Dependencias por worktree: `npm ci --legacy-peer-deps` dentro de cada uno. **Nunca** una unión de directorio al `node_modules` principal: `git worktree remove --force` la sigue y borra el real (`AGENTS.md`). En M15 los worktrees sin dependencias acabaron ejecutando `tsc`/`vitest` del checkout principal, lo que mezcla versiones | que `npm test` funcione en el worktree |
| 0.5.3 | Puertos: la columna «Puerto e2e» de D2. `DYNASTY_PORT` fuera de 5111–5210 | e2e en paralelo sin `EACCES` ni Vites huérfanos compartidos |
| 0.5.4 | Un fichero de idioma por carril: `src/i18n/es/m16-<carril>.ts`, vacíos, ya registrados en `src/i18n/es/index.ts`. `i18n.test.ts` ya falla si una clave está en dos ficheros | que nadie edite `actions.ts` o `data.ts` a la vez |
| 0.5.5 | `src/sim/ai/BrainHooks.ts`: lista de puntuadores extra que `Brain.scoreActions` llama al final, vacía. Cada carril registra los suyos desde su propio módulo y detrás de su interruptor | R14 sin que CEREBRO sea el embudo de CARGA (6.3), OBRAS (6.5) o FAUNA (2.14) |
| 0.5.6 | `src/sim/systems/VerbRegistry.ts`: mapa id → manejador que el `switch` de `ActionSystem` consulta en su rama por defecto, vacío. Un verbo nuevo de M16 se registra desde el módulo de su carril, con su etiqueta en `ACTION_LABELS` (lo exige `m16-every-verb-has-a-label`) | que `ActionSystem.ts` (7.246 líneas) no lo editen cinco carriles |
| 0.5.7 | `docs/m16_diario/` con un fichero por carril y `docs/changelog.d/` (D-20) | sin conflictos en el diario ni en el changelog |
| 0.5.8 | Registro de flujos RNG: una tabla en este plan (abajo). Un carril que necesita un flujo lo pide a integración, que le da el siguiente número; se fusionan en orden de número y la fila de `AGENTS.md` la añade quien fusiona | que el orden de los `fork()` no dependa del orden de llegada de las ramas |
| 0.5.9 | `docs/m16_cola.md`: cola de cohortes (R27) y de `baseline:pin` | una cohorte a la vez; cada huella nueva atribuible a una sola fusión |

**Registro de flujos RNG** (se rellena al asignar; el 26 es el siguiente libre
tras `redOchreRng`, el 25 de la tabla de `AGENTS.md` — confírmalo con `grep
"fork()" src/sim/core/Simulation.ts` antes de asignar):

| # | Flujo | Carril | Fase |
|---|---|---|---|
| 26 | (reservado) `weatherRng` | MUNDO | 15.1 |
| 27 | (reservado) `shoreRng` | MUNDO | 15.2 |
| 28 | (reservado) `fishSpotRng` | MUNDO | 15.3 |

**Quién toca qué en los ficheros calientes** (R25). Fuera de su sección, un
carril solo añade una llamada a un gancho.

| Fichero | Dueño de cada sección | Los demás |
|---|---|---|
| `Simulation.ts` (7.419) | MUNDO: montaje del mundo, viajes, orillas; OBRAS: `placementRefusal`, `removeBuilding`, muebles; CARGA: `takeFromPile`, `handOver`, `dropItem`; HERR: entradas de persistencia | gancho |
| `ActionSystem.ts` (7.246) | OBRAS: `doBuild` y verbos de obra; CARGA: recoger, equipar, soltar; TECNICA: `doTend`, enseñar; UI: `interruption` para 3.1 y 11.1 | `VerbRegistry` |
| `Brain.ts` (5.363) | CEREBRO | `BrainHooks` |
| `BandSystem.ts` (2.615) | OBRAS: `dropStaleSites`, asignación de solares; CEREBRO: lo demás | — |
| `main.ts` (2.775) | UI | — |
| `Renderer.ts` (2.531) | PERCEPCION; MUNDO añade la capa del tiempo (15.1) en un método propio | — |
| `Hud.ts` (2.405) | UI. Un panel nuevo de otro carril va en `ui/panels/<carril>.ts` y UI lo monta | — |
| `ActionCatalog.ts` (1.719) | UI: estructura de menús (11.2 va en la ola 3, **antes** de que los demás añadan verbos en la 4); cada carril añade los `case` de sus verbos | — |
| `World.ts` | MUNDO | — |
| `Building.ts` (`BUILDINGS`) | OBRAS; CEREBRO añade la fila del estandarte (13.1) | solo filas nuevas al final |
| `Item.ts` (`ITEMS`) | CARGA para lo de capacidad; filas nuevas de TECNICA (vendaje, caña) y MUNDO (marisco) al final | el peso va en `ItemWeights.ts` (12.1) |
| `Tech.ts` | TECNICA; CEREBRO añade la técnica del estandarte (13.1) | solo filas nuevas al final |

**Cómo se fusiona** (quien integra, en cada ola):
1. Primero las ramas que **no** cambian el mundo, en cualquier orden.
2. Después las que lo cambian, **de una en una**: fusionar, `npm run
   baseline:pin`, nivel rápido, commit con la versión subida (R24) y el
   fragmento de changelog volcado. Así cada cambio de huella tiene un solo
   responsable.
3. Las de flujo RNG nuevo, en orden de número.
4. Si una fusión rompe la prueba de otro carril, se devuelve la rama al carril
   que fusionó el último; nunca se arregla la prueba ajena en la integración.

**Hecho cuando:** dos agentes de prueba, en dos worktrees, añaden cada uno un
verbo vacío por `VerbRegistry`, una clave de idioma y un puntuador nulo por
`BrainHooks`; se fusionan sin conflicto; `determinism` y R13 siguen igual.

## D8. Ficha de cada carril

Es lo que recibe el agente al arrancar, junto con `AGENTS.md`, la Parte A y
D7. Plantilla del encargo:

```
Eres el agente del carril <CARRIL> de M16 de Dynasty.
Lee AGENTS.md, docs/m16_plan.md Parte A, D7 y tu ficha en D8, y en
docs/m16_bugs.md solo las filas de tus notas y entradas.
Trabajas en el worktree ../dynasty-<carril>, rama m16/<carril>/<fase>,
puerto DYNASTY_PORT=<puerto>. No toques los ficheros de "No toca".
Tu ola actual es <n>. Haz solo sus fases, en el orden de la ficha.
Si el plan no coincide con el código: R0, docs/m16_dudas.md, y sigue con
la siguiente fase de tu ficha que no dependa de esa.
Al terminar cada fase: D6, y deja la rama lista para integrar.
```

### HERR — herramientas, persistencia, reparto

- **Orden:** 0.5 (sola, ola 0b) → pruebas de ola 1: `m16-load-keeps-sharing`
  → 1.1, 1.2 (T1–T5, más E15 y E16), 1.3 → 2.28 (E12) → 1.4 (tras resolver
  E10) → 1.5–1.8 → 2.24 (E5).
- **No toca:** nada de `src/sim/` salvo `persistence/` y los ganchos vacíos
  de 0.5.
- **Hecho cuando:** puerta del bloque 1; `npm test` y `npm run e2e` terminan
  solos dos veces seguidas en Windows sin Vite huérfano; los cinco fallos de
  E12 tienen cada uno su veredicto escrito (premisa o mundo).
- **Riesgo:** «arreglar» E12 relajando un umbral. Prohibido (R18).

### MUNDO — borde, agua, comarcas, clima

- **Orden:** ola 1: `m16-map-edge-silent`, `m16-edge-is-not-shore`,
  `m16-scout-roundtrip`, `m16-scout-identity`, `m16-no-sudden-flood`,
  `m16-block-advance-across-arrival` → ola 2: 2.19 (K1, K2, K8, E1 con
  `outsideIsSea`) → ola 3: 2.21, 2.25 → ola 4: 15.2 → ola 5: entregas de
  `m16_room_temp_plan.md`, 15.1, 15.3.
- **Ficheros propios:** `core/World.ts`, `core/Earth.ts`, `sim/world/*`,
  `TimeManager.ts`, `NeedsSystem.ts`.
- **No toca:** `Brain.ts` (si 2.19 no basta para N44, se lo pasa a CEREBRO
  con la prueba), `ui/*`.
- **Interruptor:** ninguno para 2.x (cambian el mundo a propósito: lo dice el
  commit); `weather` propio para 15.1 (D-15); 15.2 y 15.3 cambian mapas: van
  al final de su ola, de una en una.
- **Hecho cuando:** la isla clásica queda bit a bit igual tras 2.19; en mapas,
  ninguna casilla del perímetro es orilla sin agua dentro del mapa.
- **Riesgo:** cambiar `biomeAt` globalmente. No: ver §10 de `m16_bugs.md`.

### CARGA — capacidad, peso, equipo

- **Orden:** ola 1: `m16-pickup-second-bundle`, `m16-pickup-conserves-items`,
  `m16-equip-unequip-all`, `m16-pickup-rest-of-pile`,
  `m16-pickup-menu-matches-action`, `m16-infants-cannot-dress` → ola 2: 2.4
  (N8, N20, K3, K4), 2.27 → ola 3: 2.16, 2.26 → ola 4: 12.1 → ola 5: 6.3
  (`m16-npc-equips-bundle`, por `BrainHooks`).
- **Ficheros propios:** `core/Carry.ts`, `core/ToolEquipment.ts`,
  `entities/Equipment.ts`, `entities/ItemWeights.ts`.
- **No toca:** filas existentes de `ITEMS` (el peso va aparte).
- **Interruptor:** `objects` para 12.1 y 6.3; 2.x sin interruptor.
- **Hecho cuando:** ningún objeto desaparece al recoger (suelo + inventario
  constante para todo el catálogo); el menú y la acción niegan por lo mismo y
  con el mismo texto.

### OBRAS — construir

- **Orden:** ola 1: `m16-hearth-buildable`, `m16-work-on-fetches-materials`,
  `m16-player-sites-not-dropped`, `m16-bedding-player-use`,
  `m16-outdoor-furniture-territory` → ola 2: 2.2, 2.15 → ola 3: 2.20 → ola 4:
  14.1, 14.2, 2.22 (b) → ola 5: 6.1, 6.5, 14.3.
- **Ficheros propios:** `Building.ts`, `Recipe.ts`, `HouseInterior.ts`, la
  sección de obras de `BandSystem` y de `Simulation` (D7).
- **No toca:** `Brain.ts` (6.5 se engancha por `BrainHooks`).
- **Decisiones:** D-2 (6.5), D-13 (14.3), D-16 (2.22 b).
- **Hecho cuando:** «Trabajar en» una hoguera recién colocada termina sola
  (busca, acarrea, construye); ninguna obra del jugador desaparece sin aviso;
  `every-design-has-a-proposer` sigue en verde.
- **Riesgo:** 14.3 toca el abrigo de la choza, calibrado contra todo lo
  demás: `ai-uses-many-actions` antes y después.

### PERCEPCION — ver, recordar, dibujar

- **Orden:** ola 1: `m16-fog-forgets-removed`, `m16-mud-shore-markers`,
  `m16-furniture-unbannered` → ola 2: 2.22 (a), 2.29 → ola 3: 2.3 (con D-17),
  2.6 (arte: generadores, `art:build`, `art:sheet`), 2.18 (tras 2.19 de
  MUNDO: el barro del borde desaparece con K1).
- **Ficheros propios:** `social/PlaceMemory.ts`, `render/*` (salvo
  `Floaters.ts`, de UI), `art/src/`.
- **No toca:** `public/art/` a mano (R9).
- **Hecho cuando:** un árbol talado no reaparece en la niebla; una casilla
  vista nunca vuelve a negro (D-17); el tejado y las paredes coinciden en la
  captura.

### UI — menús, selección, vistas

- **Orden:** ola 1: `m16-select-on-shore`, `m16-every-verb-has-a-label` →
  ola 2: 2.23, etiquetas de 11.5 (K5) → ola 3: 2.12, 3.1, 3.2, 11.2, 11.4 →
  ola 4: 11.5 completa (objetivo de la acción; tarjeta de costa de D-19) →
  ola 5: 11.1 (después de 3.1), 11.3 (después de 13.x).
- **Ficheros propios:** `ui/*`, `main.ts`, `render/Floaters.ts`.
- **Hecho cuando:** se puede seleccionar a cualquiera que esté dibujado; no
  queda ningún verbo en inglés en la partida en español (`i18n:soak`); toda
  capa nueva tiene `[hidden] { display: none; }` y no se redibuja en cada
  fotograma.

### TECNICA — técnicas, descubrimiento, medicina

- **Orden:** ola 1: pruebas de 16.1 y 16.2 → ola 4: 16.2 → ola 5: 16.1, 16.4
  (tras D-4), la caña de 15.3 con MUNDO, 6.4 (tras la agenda) → ola 6: 8.x;
  5.5 cuando exista la asamblea.
- **Ficheros propios:** `knowledge/*`, `KnowledgeSystem.ts`, `doTend`.
- **Hecho cuando:** ninguna técnica queda inalcanzable por la fauna de un mapa
  (`every-gate-is-reachable`); toda técnica, material y objeto nuevo tiene
  efecto en el mismo pase.

### FAUNA — animales

- **Orden:** ola 1: pruebas de 2.7, 2.14 y 17.1 → ola 3: 2.7, 2.14 → ola 4:
  17.1 (empieza por el inventario de la huida actual).
- **Ficheros propios:** `WildlifeSystem.ts`, `entities/Animal.ts`,
  `AnimalAttack.ts`; `social/Defence.ts` solo para 2.14.
- **Regla:** `lastMealAt`, `lastAttackAt` y `lastRunAt` son observaciones de
  animación; ninguna decisión los lee (`AGENTS.md`).

### CEREBRO — IA, bandas, mando (en serie)

- **Orden:** ola 1: `m16-hungry-searches-farther`, `m16-water-between-lakes`
  → ola 3: 2.11, 2.17 (después de que MUNDO fusione 2.19: K2 puede ser la
  causa de N44), con E2 y E3 → ola 4: bloque 4 → ola 5: bloques 5 y 7, 6.2
  (con E23), 6.7, 13.1, 13.2 → ola 6: bloque 9.
- **Ficheros propios:** `ai/*`, `social/*` salvo `Defence.ts`, `BandSystem`
  salvo obras.
- **Hecho cuando:** puertas de los bloques 4, 5 y 7 (A7), medidas en cola.
- **Riesgo:** es el camino crítico; no acepta trabajo de otros carriles en
  `Brain.ts`: lo que otros necesiten va por `BrainHooks`.
