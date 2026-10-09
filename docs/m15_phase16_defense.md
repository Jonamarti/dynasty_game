# Defensas del campamento, por niveles — propuesta para la fase 16

Escrito el 2026-10-09, a partir de lo que pidió el propietario tras probar el
juego. **No implementado.** Este documento es la tarea pendiente para cuando
se retome la fase 16 (interiores, muebles y dónde se duerme), porque la
petición original —empalizadas, aviso a intrusos, construcción autónoma por
necesidad, perímetros cerrados— depende de los muros de casa (16b) y encaja
en el mismo bloque de trabajo. No tocar hasta entonces; se anota aquí para no
perder el contexto ni las decisiones de diseño pendientes.

## La petición, resumida

1. Una **empalizada de madera** (palos clavados, como el cercado de los
   animales) como defensa temprana y barata, antes de la muralla de piedra. No
   es una fortificación fuerte: delimita el territorio frente a otras tribus
   ("no paséis por aquí, si lo hacéis hay un problema").
2. Los guardias o vecinos que ven a un intruso le piden que se vaya, con un
   tono **más apremiante** si insiste.
3. Que la **necesidad de construir** la empalizada o la muralla **surja
   sola**, sin que el jugador tenga que ordenarlo: cuando las relaciones con
   otra banda son malas, o hay ataques de fauna salvaje, debería emerger una
   necesidad de protección que un NPC resuelve en parte construyendo un
   cercado.
4. Un **impulso de seguridad** en el estado de ánimo: estar en casa ya ayuda
   algo; pero si hay enemigos *dentro* del perímetro atacando edificios, la
   seguridad no debe estar al máximo aunque haya muro.
5. Un **perímetro cerrado** (anillo completo, o apoyado en un lago o una
   montaña que tapona el hueco) debe dar mucha más seguridad que una simple
   línea de valla suelta.
6. El trabajo de **guardia activo** debe seguir contribuyendo a la seguridad.

## Lo que ya existe (no hay que reinventarlo)

El proyecto ya tiene buena parte de la maquinaria que esta petición necesita.
Antes de diseñar nada nuevo, **léase esto**:

- **`Person.mood.security`** (`src/sim/social/Fear.ts`, M11 fase 14, nota 7
  del propietario) es exactamente el canal de "necesidad de protección": baja
  con sustos reales (ser víctima o testigo de un `assault`/`murder`/`threaten`/
  `theft` de un extraño, `frighten()`), con extraños vistos dentro del
  territorio propio (`sightIntruders`, `FEAR_PER_INTRUDER`), y sube con el
  tiempo (`decayMood`) y con un guardia que echa a alguien
  (`GUARD_REASSURES`, ver más abajo). `fearOf(person)` es la lectura 0-1 que
  todo lo demás usa.
- **El trabajo `guard`** (`src/sim/entities/Job.ts`, M11 fase 15e) ya patrulla
  el territorio de la banda (`PATROL`, `PATROL_REACH` en `Defence.ts`) y ya
  **reasegura** a quien lo ve echar a un intruso (`GUARD_REASSURES`, en
  `ActionSystem.doWarn`). `MEMBERS_PER_GUARD` limita cuántos guardias tiene
  una banda. Esto ya es, en gran parte, el punto 6 de la petición.
- **El aviso a intrusos y el escalado a la fuerza ya existen**
  (`src/sim/social/Fear.ts` y `Defence.ts`, M11 fase 14b): solo alguien por
  encima de `DEFEND_AT` de miedo defiende el territorio; se avisa primero
  (`warn`, el verbo `doWarn` en `ActionSystem.ts`) y solo se golpea si el
  intruso sigue ahí tras `WARN_GRACE` ticks, dentro de `WARN_MEMORY`. Es decir,
  la escalada **mecánica** (de la palabra al golpe) ya está. Lo que **no**
  existe es que el *texto* del aviso cambie de tono entre la primera vez y la
  enésima — hoy es siempre el mismo `threaten` de magnitud 1. Si se quiere que
  se *note* la insistencia, hay que variar el string (ver «Huecos», punto E).
- **El confort y la seguridad nocturna ya leen cuatro términos** (fase 16e,
  ya cerrada: `m15_plan.md`, "Dónde se duerme, y el confort"): el frío, el
  campamento propio, dormir apiñados, el guardia y la casilla reclamada. Si
  esto está realmente implementado como dice el plan, la base del punto 4 de
  la petición (la casa ya da algo de seguridad) ya existe — **hay que
  comprobarlo en el código antes de asumirlo**, porque la fase 38 encontró
  que la 16b (los muros de verdad) no estaba hecha a pesar de que el plan la
  daba por buena. No repetir ese error aquí: verificar, no citar el plan.
- **La muralla de mampostería (`city_walls`) ya existe** (fase 38, cerrada el
  2026-10-09, worktree `m15/phase38-citywalls`): un tech que habilita el
  edificio `city_wall`, un anillo de terraplén de 7×7 con una puerta
  (`EarthworkSpec.gate`, nuevo campo) que `World.setWalkable` bloquea salvo
  esa casilla. Esto es la pieza física que una empalizada de madera debe
  **reutilizar**, no reinventar: mismo mecanismo de anillo y puerta, otro
  material y otro (menor) requisito tecnológico.
- **Nadie construye un terraplén, un foso o una muralla sin que se le
  marque** — limitación conocida y documentada desde la fase 26c y confirmada
  de nuevo al cerrar la 38 (`docs/bugs.md`). Esto es exactamente el punto 3 de
  la petición: hoy no hay decisión autónoma ninguna.

## Huecos reales (lo que falta de verdad)

**A. Los muros de casa de la 16b no están implementados.** El agente que
cerró la fase 38 comprobó el código y no existe `BuildingDef.interior`;
`mud_hut` sigue en 3×3; el check `walls-hold` que el plan da por existente no
está. Esto es un prerrequisito de **toda** la fase 16, no solo de esta
propuesta: sin muros de casa de verdad, ni «dormir en el suelo de casa» ni la
mitad de los términos de confort de 16e pueden estar leyendo lo que el plan
dice que leen. **Antes de tocar nada de este documento, re-verificar 16b.**

**B. Falta un nivel de defensa física barato y temprano.** Hoy solo existe
`city_walls` (mampostería, Calcolítico). Falta una empalizada de madera
(palos), con un requisito tecnológico mucho más bajo (quizá nada, o
`woodworking`/lo que ya haga falta para el cercado de animales), que use el
mismo patrón de anillo+puerta que `city_wall`.

**C. Los muros no alimentan el sistema de seguridad.** `setWalkable` ya
impide el paso, así que un muro cerrado de verdad ya reduce cuántos extraños
llegan a ser "vistos dentro" por `sightIntruders` — pero eso es un efecto
indirecto, no medido, y no da ningún término positivo propio. Falta decidir:
¿basta con que el bloqueo físico reduzca las visitas (y por tanto suba
`mood.security` indirectamente), o hace falta además un término directo
(un sumando nuevo en `mood.add('security', …)`, leído de "duermo o vivo
dentro de un perímeter cerrado")? La petición (punto 4) pide explícitamente
que estar atacado *dentro* del perímetro no dé la seguridad máxima, lo que
apunta a un término propio y no solo indirecto.

**D. No existe decisión autónoma de construir un cercado.** Hace falta un
lector nuevo, con el mismo patrón que 16d (la creencia `rest:<mueble>`
aprendida al dormir o ver dormir): un adulto con `mood.security` bajo
persistente, o con relaciones de banda por debajo de cierto umbral
(`BandRelations`, ya existente desde la fase 39), y que conoce la técnica,
inicia la construcción de una empalizada si la banda no tiene ya una.

**E. No existe la detección de "perímetro cerrado".** Ni con anillo completo
de muro, ni con apoyo en agua o montaña. Esto es lo más caro de diseñar bien:
- La versión simple (anillo de muro sin huecos salvo la puerta) es barata:
  ya se sabe dónde está cada tramo de muro y `World.setWalkable` ya sabe qué
  casillas bloquea; comprobar "cerrado" es ver si el relleno desde dentro del
  campamento se queda contenido (la misma reparación incremental de regiones
  de 16a puede servir de base: si el campamento es su propia región separada
  del resto del mapa, está cerrado).
- La versión con agua/montaña como parte del cierre es mucho más cara: hay
  que decidir si una casilla de agua profunda o una pendiente intransitable
  "cuenta" como parte del perímetro. Probablemente la misma pregunta que la
  región de 16a ya contesta: si esas casillas ya no son caminables, el
  relleno de región ya las trata como límite, así que *puede* que no haga
  falta ninguna detección nueva — un campamento rodeado de muro, agua y
  montaña sin ningún hueco caminable **ya sería su propia región** con la
  maquinaria de 16a, sin escribir una línea de geometría nueva. Esto hay que
  comprobarlo contra el código real de `World.region`, no asumirlo.

**F. El texto del aviso no escala.** Si se quiere que la insistencia se note
(punto 2 de la petición), variar el string de `doWarn` por reincidencia
(primera vez / tras `WARN_GRACE` / tras varias veces) y por temperamento del
que avisa (igual que `CAUGHT_WARN` ya pesa por `fear` y `aggression`): quien
es más agresivo debería sonar más brusco. Esto es cosmético y barato — un
`t()` nuevo con una variante — comparado con A-E.

## Orden de trabajo propuesto dentro de la fase 16

No vinculante; para discutir cuando se retome.

1. **16b (real):** muros y puerta de casa, verificando contra el código y no
   contra el texto del plan.
2. **16g:** empalizada de madera — tech, edificio, reutilizando
   `EarthworkSpec`/`BUILDINGS.city_wall` de la fase 38 con otro material y
   otro requisito. Decidir si `city_walls` pasa a requerir la empalizada o
   quedan como ramas independientes del árbol.
3. **16h:** enganchar el perímetro (empalizada o muralla) a `mood.security`:
   medir primero si el bloqueo indirecto (menos intrusos vistos) ya basta;
   si no, añadir el término directo. Comprobar primero si un recinto cerrado
   por muro+agua+montaña ya cae de la reparación de regiones de 16a antes de
   escribir geometría nueva.
4. **16i:** decisión autónoma de construir el cercado, por el mismo patrón de
   creencia que 16d usa para los muebles.
5. **16j (opcional, podría ir a M16):** variar el texto del aviso por
   reincidencia y temperamento.

## Restricciones de `AGENTS.md` a las que esto está sujeto

- Ninguna tirada nueva de `Math.random`; si alguna pieza necesitara RNG
  propio (por ejemplo, variar qué dice el aviso), usar un stream existente
  apropiado o justificar un fork nuevo, añadido **al final** de la lista de
  `AGENTS.md` con su fila, nunca insertado.
- Cualquier check nuevo (`city-walls-hold-the-gate` ya sienta el precedente
  para una empalizada) debe fallar contra el build sin el nodo antes de
  aceptarse como válido.
- Todo texto nuevo (el aviso, los menús de la empalizada, los rechazos) pasa
  por `t()`, con su español en `src/i18n/es/`.
- Mientras M15 siga abierto: solo verificación rápida
  (`typecheck`, `test`, un `sim:check` de una semilla); nada de `sim:seeds`,
  `century`, `generations` ni `sim:check:all` sin que el propietario lo pida
  por nombre.
- Esta propuesta no se abre como fase hasta que el propietario lo decida
  explícitamente; mientras tanto vive aquí, no en `m15_plan.md`.
