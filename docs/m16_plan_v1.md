# Dynasty — Plan M16, versión 1 (detallada, antes de la revisión crítica)

Fecha: 2026-10-05. **Sustituida por `plan/m16_plan.md` (versión 2).** Se
conserva como registro: es el texto que revisó el informe
`plan/m16_revision_qa.md`.

Triaje de referencia: `plan/m16_bugs.md`. Diseño: `diseno/prevision_npc.md` y
`diseno/m16_tests_inicio_jugabilidad.md`.

## Reglas

1. Orden: pruebas, fallos, funcionalidades, calibración.
2. Un fallo con etiqueta B no se arregla aparte.
3. Todo cambio de conducta va detrás de un interruptor en
   `Config.motivation`, apagado por defecto.
4. No se afinan pesos para poner un check en verde.
5. Cualquier sorteo nuevo va en un flujo RNG añadido al final (`AGENTS.md`).
6. Un commit por funcionalidad, con prefijo `m16:`, con sus pruebas, su
   entrada en `docs/changelog.md` y lo no resuelto en `docs/bugs.md`.

## Cómo trabajar una fase

1. Lee `AGENTS.md`, las Reglas y solo tu fase.
2. Lanza `npm run typecheck` y `npm test` antes de tocar nada y anota el
   resultado.
3. Sigue los pasos en orden.
4. Lanza la verificación de la fase.
5. Haz el commit.

## Bloque 0 — Entrada

### 0.1 Foto de cierre de M15

Pasos:
1. Anota el commit de cierre de M15.
2. Lanza `npm run typecheck`, `npm test`, `npm run sim:check:all`,
   `npm run e2e`.
3. Guarda las salidas en `artifacts/verification/m16-baseline/`.
4. Escribe `docs/m16_baseline.md` con los recuentos.

Hecho cuando: existe `docs/m16_baseline.md`.

### 0.2 Triaje

Pasos:
1. Recorre `docs/bugs.md` y marca en `plan/m16_bugs.md` lo que haya cambiado.
2. Resuelve las entradas con etiqueta V.
3. Copia el resultado a `docs/m16_bugs.md`.

Hecho cuando: ninguna entrada tiene etiqueta V.

## Bloque I — Pirámide de pruebas

### I.1 Medir
Pasos: cronometrar cada escenario de `tools/simcheck.ts`, la suite de Vitest
y la de Playwright; escribir la tabla en `docs/m16_tiempos.md`.

### I.2 Mundos de partida
Pasos:
1. Crear `tools/fixtures.ts` con un comando `npm run fixtures:build`.
2. Cada mundo de partida es una receta: escenario, semilla, pasos.
3. El comando corre la simulación, llama a `toCheckpointRecord(sim)` y guarda
   el JSON en `fixtures/<nombre>.json`.
4. Crear `loadFixture(nombre)` que llama a `Simulation.fromCheckpointRecord`.
5. Mundos: `tras_primer_invierno`, `banda_con_fuego_y_refugio`,
   `aldea_con_division_del_trabajo`, `dos_bandas_en_guerra`,
   `jefatura_con_excedente`.

Hecho cuando: los cinco existen y cargan.

### I.3 Escenarios de época
Pasos: para cada escenario con `startingTech` y `setup`, crear una variante
que carga un mundo de partida y corre menos pasos. Sustituir el original.

Hecho cuando: la matriz tarda menos de la mitad.

### I.4 Niveles de ejecución
Pasos: añadir a `package.json` los comandos `test:rapido`, `test:area` y
`test:completo`. `verify` pasa a ser `test:completo`.

### I.5 Arreglos de herramientas
T1 a T6 de `plan/m16_bugs.md`.

### I.6 Normas
Actualizar `AGENTS.md`: prefijo `m16:`, qué nivel lanzar y cuándo.

## Bloque II — Fallos de corrección

Una fase por entrada A1–A14 de `plan/m16_bugs.md`. Para cada una: reproducir
con una prueba que falle, arreglar, comprobar que la prueba pasa, commit.

- II.1 A1: en `Simulation.observePlaces`, anotar "vacío" solo si el arbusto
  está fuera de su fase de fruto (`bushPhase`).
- II.2 A2: `dropStaleSites` no retira obras colocadas por el jugador; las
  demás, al retirarse, dejan un aviso.
- II.3 A3: borrar el recuerdo de una cosa cuando el observador ve la casilla
  y la cosa no está; no dibujar obras sin terminar en la niebla.
- II.4 A4: reproducir el error del hatillo y corregir el motivo o el límite.
- II.5–II.14: el resto.

Puerta del bloque: línea base nueva.

## Bloque III — Previsión

### III.1 Instrumentos
Interruptor: ninguno (no cambia decisiones).
Pasos:
1. En `ai/Beliefs.ts`, añadir claves `hardship:<necesidad>:<estación>`.
2. En `NeedsSystem`, cada día, sumar la penuria del día a la clave de la
   estación actual.
3. Añadir `cobertura(persona, necesidad)`: techo propio, comida guardada,
   ropa.
4. Mostrar ambas en el inspector.

Hecho cuando: tras un invierno, las claves de invierno tienen valor.

### III.2 Remedios por efecto
Pasos:
1. Generalizar la escritura de `warm:hearth` en `NeedsSystem` a
   `warm:<edificio>` y `warm:<prenda>`.
2. Añadir `keeps:<almacén>` al sacar comida de un almacén en invierno.
3. Fuente `seen`: quien pasa frío y ve a otro bajo techo aprende
   `warm:<edificio>` con menos confianza.
4. Transmisión al hablar y al contar historias.

### III.3 Necesidad esperada
Interruptor: `motivation.foresight`.
Pasos:
1. Crear `ai/Foresight.ts` con `expectedNeed(persona, necesidad, ctx)`.
2. Fórmula: penuria recordada de la próxima estación × cercanía × (1 −
   cobertura) × previsión.
3. Recalcular una vez al día.

### III.4 Agenda
Interruptor: `motivation.agenda`.
Pasos:
1. Crear `ai/Agenda.ts` con `Purpose { need, remedy, priority, deadline,
   progress, forWhom }`.
2. `Person.agenda: Purpose[]`, máximo 3 adultos, 1 adolescentes, 0 niños.
3. Crear un propósito cuando la necesidad esperada supera un umbral y se
   conoce un remedio.
4. En `Brain`, sumar la prioridad del propósito a las acciones que lo
   avanzan.
5. Abandonar si pasa el plazo.

Hecho cuando: una obra interrumpida por hambre se retoma.

### III.5 Guardar como práctica
Pasos:
1. Añadir la técnica `provisioning` con su chispa.
2. `store` puntúa según la escasez prevista para quien la conoce.

### III.6 Retirar `planBuildings`
Pasos: quitar la rama de refugio, luego la de almacén, luego el resto.

### III.7 Rasgo y horizonte
Pasos: flujo `foresightRng` añadido al final; rasgo heredable; horizonte por
edad.

### III.8 Ver y sumarse
Pasos: quien ve una obra y tiene la necesidad esperada correspondiente puede
puntuar `build`/`haul` sin ser respaldo.

Puerta del bloque: en `tras_primer_invierno`, más techo y más comida
guardada con el interruptor encendido que apagado, a 20 semillas.

## Bloque IV — Asamblea y mando

### IV.1 Reunir
Pasos: acción `convene`; los que oyen puntúan `attend_call`; detección de
reunión ya existente.
Hecho cuando: acude más de la mitad de los que oyen a alguien bien visto.

### IV.2 Proponer a muchos
Pasos: `propose` pasa a dirigirse a todos los presentes; cada oyente decide
con `Persuasion.support` usando la necesidad esperada.

### IV.3 Carisma o autoridad
Pasos: el jefe puede marcar "usar autoridad"; los opuestos a su alcance
aceptan con coste de relación.

### IV.4 Enseñar a muchos
Pasos: `teach` a todos los sentados.

### IV.5 Registro y pantallas
Pasos: `Band.decisions[]`; pantalla de propuesta con casilla y vista previa;
pantalla de decisiones.

### IV.6 Emigrar
Pasos: tres vías y menú de carga.

## Bloque V — Otras bandas

- V.1 Cohesión en el ataque (N2).
- V.2 Creencia de desventaja en cuatro ejes.
- V.3 Respuestas como propósitos de seguridad.
- V.4 Talante de banda calculado.

## Bloque VI — Objetos, obras y oficio

- VI.1 Despejar el solar antes de construir (N5).
- VI.2 Ir a por materiales para lo que uno quiere para sí (B6).
- VI.3 Equipar ropa y contenedores; querer y coger un objeto útil visto (N8,
  N11, B15).
- VI.4 Investigar un objeto desconocido e ingeniería inversa (N11).
- VI.5 La habilidad permite o bloquea obras y tareas (N10).
- VI.6 El relieve y las zanjas en el camino y en la distancia (N4, B17).

## Bloque VII — El jugador

- VII.1 Control directo sin interrupciones; avisos arriba.
- VII.2 Aviso de ataque.
- VII.3 Ingrediente del frío.
- VII.4 Experimentar (jugador).
- VII.5 NPC que experimentan.
- VII.6 Señales de cercanía en la red.

## Bloque VIII — Modos de partida

- VIII.1 Pertenencia a la banda al casarse o unirse (B14).
- VIII.2 Cuatro modos.
- VIII.3 Sin técnicas iniciales.

## Bloque IX — Calibración y cierre

Encender interruptores, medir a 20 semillas, resolver los C, histórico para
el blog.
