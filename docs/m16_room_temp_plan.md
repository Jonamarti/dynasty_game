# M16 — Temperatura exterior y calor de habitaciones ocupadas

Fecha: 2026-10-10. Estado: **plan solicitado, sin implementación**.
Destino: M16. Este documento no inicia M16, no cierra M15 y no autoriza por sí
solo las cohortes o mediciones largas restringidas por AGENTS.md.

## 1. Objetivo y resultado observable

La temperatura exterior depende del clima de la comarca, de la hora y de la
posición en el año, con variaciones meteorológicas pequeñas y reproducibles.
El otoño se enfría hacia el invierno; las noches son más frías que las tardes.
El desierto tiene mayor oscilación diaria que un clima templado húmedo. La
tundra tiene una media baja y una caída nocturna perceptible.

Las personas vivas dentro de una habitación aportan calor. Varias calientan
más que una; una habitación pequeña y bien aislada retiene mejor ese aporte.
El calentamiento y el enfriamiento requieren tiempo. Antes de descubrir el
fuego, agruparse bajo techo reduce el frío de forma visible, sin garantizar
confort durante frío intenso ni convertir los cuerpos en una hoguera.

El efecto incluye al jugador. El beneficio físico no depende de tecnología,
creencias, parentesco ni de ejecutar la acción `shelter`: basta estar dentro.

## 2. Alcance y límites

Incluido:

- Temperatura exterior por comarca; perfiles clásico, random y Earth.
- Ciclos diario/anual continuos y meteorología determinista suave.
- Temperatura de una habitación por edificio cerrado, ocupación e inercia.
- Integración con frío/sed, ropa, humedad y fuentes físicas de calor.
- Guardado/carga, transferencia y comarcas aparcadas.
- Lecturas de interfaz traducidas y pruebas de mecanismo.
- Preferencia de IA por refugios ocupados conocidos, en una entrega posterior
  al funcionamiento físico, con límites de conocimiento y acceso.

No incluido: simulación de aire por tile, paredes individuales, viento físico,
lluvia nueva, ventilación mediante puertas animadas, climatización, nuevas
enfermedades por calor, nuevas prendas, biomas gráficos ni producción compacta.
No añadir estos sistemas para completar este plan.

Una temperatura por comarca es la primera resolución. No calcular temperaturas
de todos los tiles del planeta en cada tick. Gradientes de altitud locales y
meteorología espacial continua quedan como ampliaciones, no requisitos ocultos.

## 3. Orientación obligatoria antes de cada implementación

1. Leer AGENTS.md y `docs/architecture.md` del checkout actual.
2. Ejecutar `npm.cmd run sim:check` antes de leer código de simulación.
3. Revisar `docs/bugs.md`, `docs/m16_notes.md` y el estado Git.
4. Leer constructor/`step()` de `src/sim/core/Simulation.ts` y los tramos de
   abrigo/descanso de `src/sim/ai/Brain.ts`.
5. Confirmar la versión de `package.json` y las restricciones vigentes de M15.

La inspección de este plan se hizo sobre `0.15.47-alpha`. `sim:check`, escenario
band/semilla band, terminó con 2/147 fallos: `cravings-steer-the-diet` y
`perf-budget`. Es una referencia histórica, no la línea base del futuro M16.
No relajar sus umbrales ni atribuirlos al clima sin comparación fija.

Archivos existentes a revisar; los números de línea no son contrato:

| Área | Archivos / funciones |
|---|---|
| Calendario | `src/sim/core/TimeManager.ts`: `temperature`, `daylight`, `growth`, `dailyGrowth`, snapshot |
| Necesidades | `src/sim/systems/NeedsSystem.ts`: `update`, `shelterAt`, `thirstDriftPerTick`, `NeedsHooks` |
| Simulación | `src/sim/core/Simulation.ts`: índices espaciales, update de necesidades, nieve, viajeros, carga |
| Edificios | `src/sim/entities/Building.ts`: `BuildingDef`, `BUILDINGS`, estado mutable y ruina |
| Interior real | `src/sim/world/HouseInterior.ts`: `houseInteriorContains`, `houseForFootprint`, `houseInteriorTiles` |
| Geografía | `WorldGeography.ts`, `WorldMap.ts`, `RealWorldMap.ts`, `LocalGeography.ts`, `WorldState.ts` en `src/sim/world/` |
| Ropa y llama | `src/sim/knowledge/Tech.ts`: `warmthFrom`; `src/sim/core/Torch.ts`; lectores actuales de hogueras |
| Cuerpos compactos | `src/sim/compact/CompactAdvance.ts`: `CompactBody.advance` |
| Coordinación compacta | `src/sim/compact/CompactBandRuntime.ts`: `advanceTo` |
| Aparcado real | `src/sim/world/ComarcaOffmapRuntime.ts`, `ComarcaEcology.ts` |
| Persistencia | `src/sim/persistence/WorldObjectRecords.ts`, `GraphRecords.ts`, `CheckpointRecords.ts`, `WorldStateRecords.ts`, `TileLedger.ts`, `SaveFile.ts` |
| UI | `src/ui/Hud.ts`, `src/i18n/` y, si procede, `src/render/Renderer.ts` |
| Pruebas previas | `local-heat.test.ts`, `execution-checkpoints.test.ts`, `live-checkpoint-continuation.test.ts`, `house-interior*.test.ts`, `compact-advance.test.ts`, `comarca-offmap-runtime.test.ts` en `src/sim/__tests__/` |

Leer `docs/m15_phase12e_local_heat.md`: saber hacer fuego ya no da abrigo mágico.
Una casa no es luz de fuego ni protección de depredadores por combustión.

## 4. Decisiones de diseño propuestas

### 4.1 Unidades, calendario y compatibilidad

El nuevo servicio trabaja en °C. El reloj actual trabaja aproximadamente en
[-1, 1]. No reemplazar su getter por grados: rompería necesidades, nieve,
crecimiento, observadores y fixtures que interpretan esa escala.

Introducir una conversión explícita en un único helper. Punto de partida de
diseño: `legacyUnits = (celsius - 10) / 20`; su inversa permite representar la
curva anterior sin cambiar operaciones del modo antiguo. **10 °C y 20 °C son
parámetros de jugabilidad propuestos, no umbrales fisiológicos demostrados.**
Fijar y probar estos valores en la fase 0 antes de conectar necesidades. No
calibrarlos silenciosamente en medio de una entrega de interiores.

No limitar primero la temperatura exterior a [-1, 1]: se perdería el beneficio
de +2 °C en frío intenso. Convertir la temperatura local final y establecer
límites explícitos de tasas de frío/sed en el adaptador, probados por separado.

Mantener días por estación, envejecimiento y fecha inicial. Usar fracción anual
continua `(díaDentroDelAño + fracciónDelDía) / díasPorAño` y el calendario real
de la instancia; jamás codificar 40 como duración obligatoria.

Propuesta para cumplir la referencia al solsticio: primavera empieza en fase
0, solsticio de verano en 0,25 y de invierno en 0,75. La curva climática tiene
un desfase configurable; por defecto 0 para situar allí sus extremos. La curva
antigua tiene extremos 0,375/0,875: conservarlos en el modo de compatibilidad.
No cambiar las etiquetas de estación para hacer encajar una prueba.

En Earth, invertir la fase térmica medio año según hemisferio y reducir la
oscilación anual cerca del ecuador. No inferir metros desde la elevación
normalizada de random: ambos perfiles tienen escalas diferentes.

El cálculo astronómico completo de luz polar queda fuera de esta entrega.
Registrar que `daylight`/`isNight` siguen el modelo existente. La fase diaria
se expresa en hora local del juego; no añadir husos horarios por longitud.

### 4.2 Exterior y perfiles

Nuevo módulo propuesto: `src/sim/core/Climate.ts`; nombres orientativos, no
duplicar helpers existentes si el checkout futuro ya los incorpora.

Contrato de lectura sin efectos secundarios:

```ts
interface ClimateProfile {
  meanCelsius: number;
  annualAmplitudeCelsius: number;
  dailyAmplitudeCelsius: number;
  weatherAmplitudeCelsius: number;
  annualPhaseLag: number;
}
// Recibe identidad/semilla de clima, perfil y calendario explícitos.
// Devuelve siempre el mismo número para los mismos argumentos.
temperatureOutsideAt(/* contexto, tick */): number;
```

Modelo: media + coseno anual + ciclo diario + anomalía meteorológica.
Documentar amplitudes como semiamplitudes: amplitud diaria 7 significa 14 °C
entre mínimo y máximo cuando la anomalía no cambia.

Tabla inicial para fixtures y primera calibración; no datos climáticos reales:

| Perfil | Media °C | Amplitud anual °C | Amplitud diaria °C | Meteorología máxima ±°C |
|---|---:|---:|---:|---:|
| Templado | 12 | 12 | 4 | 2 |
| Desierto cálido | 24 | 8 | 10 | 2 |
| Desierto frío | 7 | 15 | 9 | 2 |
| Tundra | -5 | 12 | 5 | 2 |
| Tropical húmedo | 25 | 2 | 2 | 1 |

La tundra tiene media baja; no afirmar que su oscilación diaria siempre sea
mayor que la de todo clima templado. Para esta jugabilidad se propone 5 frente
a 4. Variaciones costeras/polares posteriores pueden cambiar ese parámetro.

Random: derivar perfil desde bioma y clima regional disponible, con adaptador
único. Earth: tabla explícita de clases Köppen del atlas actual; no adivinar
IDs, comprobar su definición. Diferenciar desierto cálido/frío. Clásico:
perfil templado explícito, sin inventar una latitud terrestre conocida.
Perfiles desconocidos: fallback documentado y test, nunca NaN.

Para el ciclo diario usar dos medias ondas cosenoidales enlazadas: mínimo a
las 05:00, máximo a las 15:00, calentamiento de 10 h y enfriamiento de 14 h.
Valor y pendiente continuos en los enlaces y en medianoche. Es una elección
sencilla de juego; no necesita resolver el amanecer astronómico.

### 4.3 Meteorología reproducible

Generar anomalías acotadas en puntos de tiempo, inicialmente cada dos días
del juego, y enlazarlas con interpolación suave. Una misma función devuelve
el valor anterior/siguiente a partir de semilla raíz + identidad de comarca +
índice temporal + versión del modelo. Incluir el año absoluto: los años no
deben repetir exactamente el mismo tiempo.

Cada punto usa `new RNG(semillaDerivada)`; no `Math.random`, no stream por NPC,
no tirada desde un getter y no forks de Simulation. Esto evita cambiar bosques,
personas o recursos iniciales. Si se elige después un stream con estado, se
debe justificar, persistir y añadir genuinamente al final del bloque de forks,
actualizando AGENTS.md; no es la opción de este plan.

Consultar o visitar una comarca no avanza su tiempo meteorológico. Cachear
perfil y los dos puntos actuales; las cachés se reconstruyen y no son autoridad.
Limitar el tamaño si se consultan muchas comarcas. Identidad y versión del
modelo sí forman parte del estado guardado. El tiempo espacial puede variar
entre comarcas; no se promete continuidad de frentes entre bordes en esta fase.

### 4.4 Interior: modelo simple con memoria térmica

Nuevo módulo propuesto: `src/sim/core/RoomTemperature.ts`. Una temperatura por
edificio completo, no arruinado, con `def.interior`. Reutilizar el predicado de
interior real; margen de abrigo, puerta, pared y mera proximidad no son dentro.

Estado persistido mínimo: temperatura interior y último tick avanzado; perfil
térmico estático versionado en definición/configuración. Inicializar una casa
recién completada a la temperatura exterior de ese momento, sin calor previo
de obra ni salto al confort. Una casa vacía sigue intercambiando con el exterior.

Propuesta de equilibrio para el calor corporal:

```text
aporteBase = gananciaPorOcupante × ocupaciónEquivalente / volumenRelativo
aporteAcotado = min(aporteBase × retención, incrementoCorporalMáximo)
aporteCorporal = min(aporteAcotado, max(0, confortObjetivo - exterior))
objetivoInterior = exterior + aporteCorporal + aporteDeFuego
interiorSiguiente = objetivoInterior
                 + (interiorActual - objetivoInterior) × exp(-dt / tau)
```

`tau` se expresa en fracciones de día y se convierte con `ticksPerDay`; no
segundos de render ni números de ticks independientes del calendario.
El límite de confort afecta sólo al aporte corporal, no elimina el calor
acumulado al instante ni limita artificialmente un fuego.

Punto inicial: máximo corporal +4 °C, confort de 18 °C y `tau` de 0,08 días.
Para una choza pequeña buscar cerca de +1 °C con un adulto, +2–3 °C con cuatro,
y saturación antes de +4 °C. Son objetivos de ajuste, no resultados medidos.
Un niño puede aportar 0,5 equivalentes y un bebé 0,25, usando las categorías
de edad compartidas. No inventar consumo extra de comida por este aporte.

Volumen relativo parte del área interior real, normalizado al área de la
choza de referencia; no usar toda la huella ni afirmar metros cúbicos físicos
cuando el juego no define la altura. Retención/tau explícitos por construcción;
`def.shelter` no equivale automáticamente a conductividad física.

Consultar ocupantes mediante hashes. Puede recorrerse la lista de habitaciones
una vez para actualizar su estado, pero cada consulta de proximidad/contención
parte de un índice espacial. No `people.filter(...)` para cada edificio.
Contar personas de todas las bandas, vivas y presentes. Bebé en brazos cuenta
una vez en la ubicación efectiva del portador, no en una posición desfasada.
No contar fallecidos, viajeros ausentes ni reservas de cama como presencia.

Límites: nada de acumulación en cortavientos, estaciones, almacenes abiertos
o edificios incompletos. Una ruina deja de proporcionar temperatura interior;
repararla reinicia a exterior, salvo que se diseñe y pruebe otro contrato.

### 4.5 Abrigo, fuego y necesidades: evitar doble conteo

Hoy `shelterAt` reduce exposición y añade recuperación; una choza buena ya
puede recuperar frío sola. El nuevo modelo no debe sumar calor humano a esa
recuperación como si ambos fueran fuentes físicas independientes.

Mantener un modo antiguo que ejecute las operaciones actuales sin variarlas.
En modo nuevo, separar lectura ambiental de aislamiento/protección del cuerpo.
Usar un helper compartido para convertir temperatura local y calcular tasas;
la UI lee ese resultado y no implementa una tercera fórmula.

Contrato de integración de fuego:

- Hogueras reales dentro aportan al objetivo de su habitación.
- Para una persona en esa habitación no volver a aplicar íntegramente el mismo
  bonus de hoguera por radio como otra fuente; elegir una ruta explícita.
- Hogueras exteriores mantienen calor directo por proximidad y no calientan
  una casa al otro lado de una pared por estar a menos de tres tiles.
- Antorcha encendida sigue el contrato portátil existente. En esta entrega no
  aporta además al aire de toda la habitación; documentar esa simplificación.
- Una prenda reduce exposición corporal; no calienta el aire ni funciona
  guardada en inventario. No suprimir ropa/humedad/natación para ajustar clima.
- Mantener secado por fuente física, aprendizaje `warm:hearth` y firelight.
  No derivar protección frente a lobos del número de ocupantes.

La sed usa la lectura térmica local elegida en el mismo helper. Actualizar
también previsiones/raciones/observadores que llaman `thirstDriftPerTick`;
no calcular solicitudes compactas con exterior y aplicar deriva con interior.

Nieve debe leer exterior, nunca una habitación. Crecimiento actual está
calibrado con las curvas antiguas: mantenerlo explícitamente en esta primera
entrega. Registrar el límite: nuevo clima de exposición no implica agricultura
climática calibrada. Migrar crecimiento/vegetación requeriría otra fase propia;
no colarlo dentro de este cambio ni asegurar mejoras de economía.

## 5. Orden de actualización y autoridad

Contrato para tick T, detallado y compacto:

1. Tomar las posiciones/presencia canónicas al inicio de la fase de necesidades,
   con índices espaciales actualizados y fuentes encendidas reconciliadas.
2. Resolver ocupación y exterior de T en un snapshot compartido e inmutable.
3. Avanzar cada habitación de T-1 a T **una sola vez**.
4. Aplicar necesidades a todos los cuerpos usando esas mismas lecturas.
5. Muertes y movimiento posteriores afectan la ocupación del tick siguiente.

Si un sistema mata antes de esa fase, esa persona no entra en el snapshot. Si
alguien muere por necesidades dentro, todos reciben aún la misma lectura de T.
No permitir que el primer cuerpo caliente la habitación y el segundo la vuelva
a avanzar: el resultado no debe depender del orden de IDs o del roster.

`CompactBody.advance` recibe una lectura/servicio con fecha; no es dueño de
avanzar la habitación. `CompactBandRuntime.advanceTo` y el coordinador real
`ComarcaOffmapRuntime` deben compartir el snapshot por comarca, incluso entre
bandas. Examinar el callback `ComarcaEcology.advanceTo(..., { onTick })`: no
añadir otra autoridad térmica paralela al callback de cuerpos.

El compacto usa presencia física que realmente conserva el coordinador. No
suponer que todos viven en su `homeBuildingId` cuando sus posiciones son
exteriores. Si se introduce una política de presencia nocturna, debe ser
explícita, guardable y validada como una funcionalidad distinta.

Comarca abandonada: ocupación cero y enfriamiento fechado. Transferencia:
temperatura y fecha viajan con los objetos; origen deja de avanzar al perder
autoridad. Volver no reinicia la casa ni la recalienta gratis. Viajeros en
tránsito usan exterior del contexto de ruta, sin el calor de su casa de origen.

No saltar largos intervalos con `dt` grande suponiendo constante exterior y
ocupación. Primero avanzar tick a tick con helper compartido. Optimizar sólo
después, separando todos los eventos relevantes y probando equivalencia.

## 6. Entregas pequeñas, en orden

Cada entrega funcional: commit independiente `m16:`, incremento de versión
alpha según AGENTS.md, pruebas significativas, actualización de este plan y
changelog. La primera funcionalidad de M16 inicia `0.16.0-alpha` cuando
corresponda; escribir este plan no cambia versión. No implementar varios pasos
sin cerrar sus pruebas y documentar sus límites.

### Fase 0 — Inventario y contrato (2–4 h, documentación/instrumento)

- [ ] Repetir referencia fija y buscar todos los usos de `temperature`,
  `growth`, `dailyGrowth`, `thirstDriftPerTick`, `shelterAt` y calor de fuego.
- [ ] Clasificar cada consumidor: exterior, interior, tasa corporal o crecimiento.
- [ ] Confirmar origen de perfil/semilla en constructor, loader, raíz y aparcado.
- [ ] Fijar parámetros anteriores, modos legacy/nuevo y política de saves viejos.
- [ ] Registrar tabla de consumidores y resultados sin cambiar comportamiento.

Salida: ninguna ruta térmica sin decisión, ningún sistema existente omitido.

### Fase 1 — Servicio exterior puro (4–6 h)

- [ ] Crear perfiles/conversión/curvas/meteorología, con validación de finitud.
- [ ] Adaptadores clásico/random/Earth y pruebas de clases conocidas.
- [ ] Caché descartable acotada; identidad/versionado estables.
- [ ] Mantener el servicio desconectado del comportamiento por defecto.

Salida: mismo contexto/tick da mismo valor sin mutaciones ni RNG compartido;
se cumplen amplitudes, hemisferios y continuidad. Comparar estado/RNG antes y
después de miles de consultas; una prueba de determinismo entre dos builds
iguales no basta para demostrar que no se movió el spawn.

### Fase 2 — Habitación y ocupación (4–6 h)

- [ ] Añadir perfil/estado térmico y helper de avance puro.
- [ ] Resolver presencia por índices y contención real, incluyendo bebés.
- [ ] Actualización compartida por tick, independiente del orden de personas.
- [ ] Tratar completar, arruinar, reparar, salir y habitaciones vacías.
- [ ] Mantenerlo desconectado de necesidades hasta cerrar esta fase.

Salida: una habitación muestra inercia y saturación; varias personas producen
más calor que una; fuera no hay bonus. No añadir el scorer todavía.

### Fase 3 — Persistencia y coordinadores (6–10 h)

- [ ] Inspeccionar codecs genéricos: no asumir que un nuevo campo queda validado
  o migrado porque GraphRecords lo serialice.
- [ ] Guardar temperatura, último tick, modelo/configuración e identidad climática.
- [ ] Validar finitud, rangos de parámetros, tick seguro y coherencia de fecha
  con checkpoint/TileLedger. Rechazar futuros/modelos incompatibles claramente.
- [ ] Saves viejos permanecen en modo legacy. Si se permite convertirlos,
  hacerlo explícitamente a la fecha guardada, inicializando interiores a exterior;
  no afirmar reconstrucción exacta del calor histórico ausente.
- [ ] Conectar snapshot térmico compartido al detallado, compacto y aparcado,
  todavía sin activar las tasas nuevas por defecto.
- [ ] Probar autoridad única, salida/regreso, abandono y avance partido.

Salida: JSON/carga continúa igual que ejecución ininterrumpida y los cuerpos
no son propietarios del avance de casas. Si una ruta no soporta el nuevo modo,
rechazarlo claramente; no sustituir por temperatura legacy silenciosa.

### Fase 4 — Necesidades y fuentes físicas (6–8 h)

- [ ] Introducir modo térmico nuevo y adaptador único de frío/sed.
- [ ] Revisar el doble beneficio de shelter/fuego, manteniendo modo legacy exacto.
- [ ] Conectar previsiones de Brain, deriva compacta/raciones y observadores.
- [ ] Conectar nieve exterior en detallado/aparcado; dejar crecimiento antiguo
  explícito y documentado, con regresiones para no alterarlo por accidente.
- [ ] Añadir escenario corto: sin firemaking, sin ropa cálida ni llama,
  mismo refugio, mismo frío inicial, ocupación 1 frente a 4.

Salida: diferencia corporal comprobada sin cambiar coeficientes de IA/comida;
una noche muy fría sigue pudiendo acumular frío aun con personas agrupadas.

### Fase 5 — UI y evidencia visual (3–5 h)

- [ ] Mostrar exterior y, estando dentro, interior con unidad °C.
- [ ] Panel de casa accesible: explicación del calor corporal y aislamiento.
- [ ] No revelar ocupantes desconocidos, nombres ni temperaturas de casas
  lejanas no observadas; pasar por Knowledge y reglas actuales de paneles.
- [ ] Todos los textos con `t()` y traducción española literal completa.
- [ ] E2E con `?skipIntro=1`, sin errores de consola, captura fechada nueva.
- [ ] Digest si se actualiza panel; no recrear su DOM cada frame.

Salida: el jugador entiende por qué la habitación está menos fría. El decimal
de UI no controla la física; no redondear durante el cálculo de necesidades.

### Fase 6 — Preferencia de IA (3–5 h)

- [ ] Añadir preferencia limitada por refugio conocido/observado más cálido,
  sólo cuando el frío justifica el traslado.
- [ ] Respetar `canUse`, relación, acceso, alcance, conocimiento y urgencias.
- [ ] No usar población privada de edificios como información omnisciente.
- [ ] Evitar oscilación entre casas: mejora mínima e histéresis documentadas.
- [ ] Reutilizar acciones existentes; si aparece acción larga nueva, incluir
  interrupción, progreso bancado y razón visible de rechazo/abandono.

Salida: bajo condiciones controladas prefieren agruparse, pero no abandonan
agua/comida urgente ni invaden edificios ajenos. Revisar distribución de
acciones; no subir un peso a ciegas hasta hacer verde un check.

### Fase 7 — Activación, coste y ajuste (4–8 h)

- [ ] Ejecutar controles del apartado 7 y resolver regresiones propias.
- [ ] Activar modo nuevo para partidas nuevas sólo con rutas completas.
- [ ] Medir coste incremental sobre misma población/mapa y configuración,
  reportando construcción de índices, clima, habitaciones y necesidades.
- [ ] Registrar límites de correspondencia/crecimiento y pendientes reales.
- [ ] No afirmar mejora de supervivencia con una semilla. Mediciones económicas
  o cohortes sólo cuando correspondan y con la autorización vigente.

Estimación total: **32–52 h**, aproximadamente **4–7 jornadas**; hasta 56 h si
persistencia/coordinación requiere adaptar contratos nuevos del futuro M16.
Es esfuerzo estimado, no compromiso de duración ni benchmark. Las cohortes
largas y su análisis no están incluidos.

## 7. Matriz de aceptación y pruebas discriminantes

Crear archivos focales como `climate.test.ts`, `room-temperature.test.ts` y
`room-temperature-continuation.test.ts`; reutilizar fixtures pequeños. No
arrancar mundos enormes para probar una ecuación o un límite de contención.

| Caso | Aserción requerida |
|---|---|
| Año continuo | Sin salto al pasar día/año; probar ticks adyacentes y tolerancia analítica |
| Fases | Extremos en fases configuradas; mismo perfil/ruido cero más frío en invierno que verano |
| Hora | Mínimo/máximo diario correctos; continuidad y pendiente en 05:00, 15:00 y medianoche |
| Desierto | Mayor amplitud diaria que templado; cálido/frío tienen medias distintas |
| Tundra | Media menor y caída nocturna configurada; no exigir máximos polares universales |
| Hemisferio | Misma fecha global, fases anuales opuestas; baja amplitud ecuatorial |
| Meteorología | Acotada, continua, reproducible; distintos años no repiten toda la secuencia |
| Consultas | Número/orden de consultas no cambia RNG, spawn ni estado canónico |
| Ocupación | 4 adultos > 1 > 0 en incremento, mismo exterior/edificio/intervalo |
| Contención | Puerta/pared/margen/exterior no cuentan; incompleta/ruina no retiene |
| Bebés y muerte | Bebé una vez; muertos fuera del snapshot; muerte en fase aplica en T+1 |
| Inercia | No salto térmico al entrar; al salir disminuye gradualmente el exceso |
| Tamaño/aislamiento | Mismos ocupantes, casa mayor se calienta menos; mejor retención pierde menos |
| Saturación | Aporte corporal ≤ máximo; no lleva por sí solo a calor excesivo |
| Sin fuego | Grupo mejora frío del mismo cuerpo respecto a control solo, sin conocimiento ni fuel |
| Frío intenso | Agruparse no garantiza recuperación ni sustituye toda ropa/fuego |
| Fuentes | No doble bonus de hoguera; fuego exterior no calienta a través de pared |
| Ropa/agua | Sólo ropa puesta protege; humedad/natación conservan sus efectos |
| Sed | Tasas/solicitudes detalladas y compactas usan idéntica lectura local |
| Orden | Invertir roster/IDs de actualización no altera lecturas ni necesidades |
| Continuación | 0→N igual a 0→K→JSON/carga→N, con interior no equilibrado |
| Aparcado | Avance compartido entre bandas; salida/regreso no duplica calor ni autoridad |
| Abandono | Casa vacía se enfría; ruina y reparación tienen resultado explícito |
| Legacy | Modo antiguo mantiene huella canónica frente a referencia fija |
| UI/IA | Lecturas explicadas/traducidas; desconocimiento/acceso/urgencias respetados |

Antes de aceptar una prueba nueva, comprobar que detecta el mecanismo roto:

- Desactivar aporte corporal: debe fallar la comparación grupo/solo.
- Sustituir ocupación por cero o uno constante: debe fallar incremento colectivo.
- Usar el margen de shelter como interior: debe fallar el control de exterior.
- Avanzar habitación por cuerpo: debe fallar orden y calentamiento esperado.
- Omitir temperatura persistida: debe fallar continuación fuera de equilibrio.
- Hacer ruido dependiente de consultas: debe fallar consulta/orden/retorno.

Estos negativos pueden ejecutarse con una mutación temporal localizada o con
helpers controlados; restaurar el árbol y guardar evidencia. No añadir un
flag de producción sólo para simular el bug ni dar por discriminante un check
de supervivencia que también pasa con calor corporal desactivado.

Objetivo perceptible inicial: probar una noche controlada de 0,25 días con frío
previo distinto de cero. Buscar aproximadamente 1–3 puntos de diferencia de
frío entre solo/grupo, además de ≥1 °C de diferencia interior. Fijar condiciones
y objetivo antes de ajustar parámetros. Si el techo actual oculta toda la
diferencia, revisar la fórmula de integración, no inflar el calor corporal.
Guardar valores exactos, no sólo PASS. No tratar este objetivo como dato medido.

## 8. Verificación, rendimiento y entrega

En PowerShell usar `npm.cmd` para flags. Comandos rápidos iniciales:

```powershell
npm.cmd run typecheck
npm.cmd test -- --maxWorkers=1 --testTimeout=15000
npm.cmd run sim:check
```

Las suites focales sirven para iterar; la suite completa requiere registrar
comando, archivos, pruebas, fallos y omitidas reales. Baselines fallidos se
presentan separados de regresiones. No declarar verde una ejecución fallida.
Cuando cambie UI ejecutar E2E; usar `DYNASTY_PORT=5399` mediante variable de
entorno PowerShell si el puerto habitual está reservado. Capturar bajo
`artifacts/screenshots/m16-room-temp-<fecha>-<fase>/`, sin sobrescribir.

Aplicar las restricciones de AGENTS.md que existan entonces: mientras M15 siga
abierto no lanzar `sim:check:all`, cohortes 10/20, generations o century por
iniciativa propia. Estar redactado bajo M16 no levanta esas restricciones.
Si después se permite verificación ampliada, hacerla según el contrato vigente
y documentar qué se ha medido; no extrapolar coste de una sonda a FPS reales.

Coste esperado: una actualización por habitación/tick y lecturas climáticas
cacheadas por comarca; trabajo proporcional a personas, habitaciones y
candidatos espaciales, no al producto completo personas×edificios. No prometer
O(P+B) estricto: la densidad de los buckets afecta al número de candidatos.
Guardar pocos escalares por edificio; separar bytes serializados, heap y
memoria de índices. No prometer un porcentaje de coste sin benchmark fijo.

Criterio de rendimiento propuesto: incremento mediano ≤5 % en `step()` sobre
fixture fijo de referencia tras calentamiento, medido en varias repeticiones
con mismo equipo/semilla. Es presupuesto a validar, no resultado. Si excede,
perfilar antes de reducir precisión o cadencia; no cambiar tolerancias para
aprobarlo. Congelar el estado inicial del benchmark porque la nueva IA puede
cambiar recorridos y hacer incomparable el coste total de mundos divergentes.

Cada entrega registra en este documento: commit, versión, estado, pruebas,
negativos y captura si hay UI; también actualiza `docs/changelog.md`.
Incidencias no resueltas van a `docs/bugs.md` y `docs/m16_notes.md`.

## 9. Instrucciones para el modelo que ejecute el plan

Trabajar una fase por vez. Leer la fase actual y sus dependencias; no deducir
que un checkbox de código implica aceptación de comportamiento. Marcar una fase
completa sólo con su salida demostrada. No usar comentarios para afirmar causas
no medidas. No reordenar forks, tocar spawn compartido, importar DOM en sim,
editar `public/art/` manualmente ni eliminar `-alpha`.

Si el código del futuro checkout difiere, actualizar primero el inventario con
las funciones reales y mantener los invariantes; no crear una segunda autoridad
climática porque no se encuentra un nombre propuesto. Las cuestiones rutinarias
se resuelven dentro del alcance; las incompatibilidades se documentan con el
caso concreto. No ampliar el sistema para cerrar una prueba ajena fallida.

Estado de entregas al redactar:

| Fase | Estado | Evidencia |
|---|---|---|
| 0–7 | Pendientes | Sólo análisis e inspección; ningún comportamiento implementado |

## 10. Referencias de diseño

- Petición del propietario: temperatura por hora/año/clima con aleatoriedad,
  desierto/tundra más fríos de noche y calor colectivo perceptible sin fuego.
- [NWS: variación de temperatura](https://www.weather.gov/media/zhu/ZHU_Training_Page/winds/pressure_winds/Temp_Density_Pressure.pdf): respaldo a la oscilación desértica; no proporciona los coeficientes de juego de este plan.
- [NOAA: solsticio y desfase del frío](https://www.nesdis.noaa.gov/news/three-views-of-the-winter-solstice-space): el mínimo térmico real puede llegar después del solsticio; desfase cero es aquí una propuesta de diseño.
- [M15: fuentes físicas de calor](m15_phase12e_local_heat.md).
- [M16: notas pendientes](m16_notes.md).
