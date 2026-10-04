# M15 — Simulación por visión y evolución compacta del mundo

Decisión del propietario, 2026-10-03. Es el apartado de diseño de la fase 32,
incluido el LOD dentro de la comarca que antes quedaba fuera de M15. **Todavía
no está implementado**: `Simulation.step()` actual ejecuta todos los NPC vivos,
y la niebla limita presentación y selección, no el trabajo de simulación.

## 1. Qué determina el detalle

El centro es el **NPC seleccionado vivo**. Si la selección es un edificio,
recurso u otro objeto, se conserva como centro el personaje controlado. Sin
personaje disponible no se activa una comarca entera por defecto. El adaptador
en `main.ts` entrega un identificador a la simulación; `src/sim/` no lee el DOM,
la cámara ni el renderer. Seleccionar no concede acceso a estado privado:
`Knowledge` sigue determinando qué puede mostrar la interfaz.

Solo reciben simulación completa los individuos dentro de la visión efectiva
de ese centro. El radio procede de la misma función de visión que usa el juego,
incluidos los modificadores realmente implementados. Una banda rival no se
activa entera porque uno de sus integrantes haya entrado en el círculo. La
misma regla se aplica a nuestra banda y a los animales. Zoom, resolución y
posición de cámara no amplían la zona de AI detallada.

Los chunks y spatial hashes aceleran la búsqueda de candidatos; **no** autorizan
simular todos los habitantes del chunk. Se filtra después por visión real.
Puede conservarse un objeto materializado en caché al salir para evitar costes
de creación repetidos, pero deja de recibir AI detallada en cuanto sale del
radio. Esa caché no es una segunda corona de simulación completa.

| Nivel | Unidad y ámbito | Trabajo |
|---|---|---|
| 0, detalle | NPC y fauna visibles, dentro de la comarca activa | Necesidades, AI, movimiento, acciones, combate y percepción por paso |
| 1, compacto con identidad | Individuos y bandas relevantes fuera de vista, también en la misma comarca | Agendas y eventos con fecha; necesidades, producción y demografía por intervalos; sin puntuar cada verbo ni buscar rutas por NPC cada paso |
| 2, agregado | Pueblos lejanos sin interacción individual inmediata | Cohortes de población, técnicas, economía, cultura y relaciones entre pueblos; actualización estacional y eventos intermedios |

El nivel depende de distancia y relevancia, no de ser aliado o enemigo. Un
rival cercano se simula completamente cuando se ve; uno fuera de vista conserva
identidad y evolución compacta. Las personas conocidas no pierden su nombre,
familia, historia ni deudas aunque su pueblo pase al agregado.

## 2. Bandas fuera de vista: personas que siguen existiendo

La carga ejecutable de fase 28 ya reconstruye mundos independientes desde
checkpoints JSON, sin generación ni corrientes adicionales; véase
[m15_phase28_loader.md](m15_phase28_loader.md). La transferencia de autoridad
y el scheduler compacto siguen pendientes: cargar una copia no autoriza a
avanzar dos dueños sobre las mismas personas.

La primera entrega de fase 28 aporta `PersonRecord`, `HouseholdRecord` y
`BandRecord` como snapshots v1 serializables del estado propio completo;
véase [m15_phase28_records.md](m15_phase28_records.md). Todavía no son agendas
compactas ni sustituyen entidades del roster. Las relaciones externas tienen
codecs JSON propios en [m15_phase28_social.md](m15_phase28_social.md), unidos
por el roster coordinado. [IdSpace](m15_phase28_ids.md) asigna los diez
namespaces de entidades/eventos y reservas de bandas/manadas por mundo, con
checkpoint JSON. Transferencia de autoridad y `ComarcaSim` siguen por construir en las fases
28 y 32. El registro compacto objetivo conserva identidad, parentesco,
edad, rasgos, habilidades, conocimientos y recuerdos; necesidades y lesiones;
hogar y pertenencia; inventario, equipo, órdenes y progreso pendiente.
Cada registro tiene fecha del último avance y estado de su stream aleatorio.

Se sustituye el recorrido detallado por una **agenda compacta**, por ejemplo
obtener alimento, construir, cuidar, viajar, comerciar o participar en una
incursión. La agenda consume recursos y tiempo y produce eventos concretos:
comida agotada, obra completada, nacimiento, muerte, aprendizaje o llegada.
Las tasas deben salir del modelo detallado medido, no de regalar supervivencia
a quien quedó fuera de la pantalla. Carga, herramientas, clima, cuidados y
conservación siguen afectando a lo que una banda puede hacer.

La actualización ordinaria puede ser diaria, con eventos de plazo más corto
cuando hacen falta. Una persona que se dirige al círculo visible necesita un
trayecto compacto alcanzable y una llegada fechada: no puede esperar al siguiente
día y aparecer de golpe al lado del jugador. El scheduler adelanta las llegadas,
urgencias y contactos necesarios antes de resolver el próximo paso visible.

Las posiciones de viaje lejano pueden ser aproximadas; el punto de entrada y
la continuidad de un individuo que acaba de salir de vista deben ser coherentes
con la última posición y con el terreno. Se conserva el destino y el progreso
de una orden, una obra o una investigación al cambiar de nivel.

## 3. Pueblos lejanos: evolución propia y relaciones

`PeopleSim` mantiene por pueblo:

- Cohortes por edad y sexo, hogares o distribución familiar, nacimientos,
  mortalidad, migraciones y población disponible para cada actividad.
- Recursos, territorio, capacidad de alimento, producción y reservas;
  subsistencia, cultura material, clima y enfermedades relevantes.
- Técnicas, dominio y practicantes, progreso de investigación y registros que
  preservan conocimiento. Conocer una técnica como pueblo no significa que
  todos sus habitantes sepan practicarla.
- Cultura y organización política, normas y relaciones con vecinos, comercio,
  matrimonios, alianzas, tributos, conflictos y paz.
- Individuos persistentes que ya importan al jugador y contingentes en viaje.

El crecimiento sale de nacimientos y muertes, condicionado por alimento,
cuidados, edad, enfermedad y conflicto. No se limita a incrementar un contador
de población. El conocimiento avanza por invención, práctica y transmisión;
lee los mismos requisitos técnicos y recursos que el juego detallado. Puede
estancarse o perder practicantes. No se concede tecnología por fecha, nombre
del pueblo o región histórica.

Los pueblos interactúan entre sí aunque el jugador nunca los haya visto.
Intercambian excedentes y conocimiento, envían migrantes, establecen relaciones
y afrontan conflictos por las causas que usa el modelo de bandas. Cada relación
y transacción tiene una autoridad y un identificador: actualizar ambos extremos
no duplica un intercambio, una baja ni un tributo. Un mundo con espacio y
recursos puede permanecer en paz; los tests de guerra preparan una oportunidad
de conflicto, como el check controlado de esta pasada.

No hacen falta millones de objetos `Person`. Las cohortes mantienen el total;
las identidades se crean de forma determinista cuando son necesarias y quedan
registradas después. Se resta de la cohorte exactamente la población que pasa
a registros individuales. Volver a alejarse no vuelve a sortear sus habilidades,
familias o equipo ni borra las personas que ya hemos conocido.

## 4. Transiciones y una sola autoridad sobre el estado

**Base implementada en fase 28 (2026-10-04):** un motor local puede aparcarse
en un handle opaco y reanudarse una sola vez, conservando el asignador global
y revocando las APIs de ejecución del origen. La transferencia directa revierte
la revocación si la carga falla. Esto conserva el estado completo del motor;
no activa aún los modelos compactos ni las transiciones individuales descritas
abajo. [Contrato y límites](m15_phase28_authority.md).

Cada persona, grupo y recurso se contabiliza **una sola vez**. Pasar de agregado
a registros o de registro a entidad transfiere autoridad, no copia una segunda
población. Primero se avanza hasta la fecha de transición; luego se transfiere
el estado. El camino inverso escribe los cambios reales en el registro y en
el libro local: inventario, obras, heridas, pérdidas, investigación y recuerdos.

El libro de comarca (`TileLedger`) conserva edificios y sus contenidos,
muebles, campos, tierra modificada y agotamiento o regeneración de recursos.
Salir de vista no restaura comida ni congela ecología, hambre o tecnología.
Fauna, vegetación, suelo y estaciones necesitan sus actualizaciones compactas,
además de las humanas.

Una interacción entre niveles entra por un puente de eventos fechados. Una
incursión compacta produce un contingente y un viaje; cuando entra en visión
se materializa ese mismo contingente. Una persona visible que persigue a otra
fuera de vista no obliga a ejecutar toda la banda rival en detalle. Se conserva
la acción y se resuelve el cruce o contacto mediante el puente. Dependencias
como bebés transportados, proyectiles y transferencias no tienen un segundo
scorer autónomo fuera del radio ni se eliminan al cambiar de selección.

Entrar y salir repetidamente debe conservar cantidades, identidades y progreso.
Cambiar selección puede cambiar qué se observa en detalle; no puede usarse
para renovar reservas, acelerar una investigación o evitar una muerte ya
programada. La equivalencia estadística entre modelos se calibra; no se promete
igualdad bit a bit entre una simulación siempre detallada y otra aproximada.

## 5. Tiempo, RNG y velocidades altas

Todos los niveles comparten el reloj de juego. Sus eventos se ordenan por tick
y una clave estable para los empates. El reparto del trabajo compacto depende
del tiempo de simulación y del estado del scheduler, nunca de los FPS. Una
transición o interacción no puede leer un registro atrasado sin actualizarlo.

Los streams nuevos se derivan de la semilla y de identidades estables fuera del
contrato de forks de `Simulation`; se guardan sus estados. Materializar no
repite tiradas. Un replay usa la misma semilla, configuración, órdenes y
cambios de foco. La cámara o los FPS no añaden draws ni cambian los resultados.

En velocidad normal se priorizan fluidez e interacción. A velocidades altas
el propietario acepta menos FPS: se dibujan y actualizan paneles con menor
frecuencia, manteniendo respuesta a pausa y controles. **No** se sustituyen
pasos por un `dt` mayor, se omiten eventos o se degrada la AI visible según la
velocidad. Si la CPU no alcanza la velocidad pedida, se muestra la velocidad
real; reducir los FPS no equivale a haber alcanzado el objetivo de pasos/s.

El loop actual limita pasos por frame y descarta el acumulador al saturarse.
Antes de limitar el dibujo se separan ejecución de pasos, dibujo y actualización
de HUD: bajar FPS sin revisar ese límite puede reducir también el avance real.
La política de frame rate de aceleración es configurable y se mide; 30/15 FPS
son candidatos de prueba, **no una decisión del propietario**.

## 6. Qué medimos y qué debe fallar en una versión rota

La población total del mapa ya no define el presupuesto de detalle. El perfil
debe publicar por separado individuos visibles, registros compactos, pueblos
agregados y eventos, además de población total, velocidad pedida y real.
No se reutiliza como objetivo el coste actual de simular 300 NPC completos.

| Prueba | Evidencia necesaria |
|---|---|
| Trabajo limitado por visión | Instrumentar scorers y ejecutores: cero llamadas detalladas a individuos fuera del radio; cambiar cámara/zoom no amplía el conjunto |
| Mundo fuera de vista activo | En fixtures con causas preparadas ocurren nacimientos/muertes, consumo, investigación y contactos sin enfocar esos pueblos |
| Conservación al cambiar de nivel | Ida y vuelta repetida conserva identidades, población, bienes, heridas, fechas y progreso; no hay doble dueño ni doble transacción |
| Cruce de frontera | Un rival que llega conserva destino y fecha, materializa en terreno válido y puede interactuar; perseguirlo no activa a todos sus vecinos |
| Privacidad | Seleccionar o promover un registro no revela nombres, capacidades o historia que Knowledge no permite |
| Determinismo temporal | Mismos inputs y ticks a distintas velocidades/FPS dan el mismo estado; guardado/carga mantiene pendientes y RNG |
| Correspondencia de modelos | Cohortes equivalentes con detalle, nivel 1 y nivel 2; comparar demografía, reservas, avance técnico e interacciones, además de mecanismos |
| Coste con mundo creciente | Mantener iguales los visibles y aumentar registros/pueblos; medir tiempo por sistema, retraso de eventos, materialización, memoria y guardado |

Los controles negativos deben demostrar que cada prueba detecta perder estado,
congelar un pueblo, permitir un scorer remoto o duplicar una transferencia.
No basta con que una comarca aleatoria sobreviva. Las puertas heredadas
`lod-matches-detail` y `peoples-match-bands` mantienen veinte semillas,
población final media dentro de ±15% y tendencia tecnológica comparable.
Con poblaciones casi extinguidas se informa también de valores absolutos y
extinciones; el cociente aislado no demuestra fidelidad. Los umbrales adicionales
se declaran antes de medir, sin retocarlos para aprobar.

Para rendimiento se cruzan densidad **visible** baja/alta, población compacta
creciente y distintas velocidades. Se miden tanto estado estable como cambiar
de foco a un asentamiento denso, viajes y guerras que cruzan el círculo.
En normal se observan FPS, intervalos largos y latencia de input; en aceleración
se priorizan pasos/s reales y controles con el presupuesto de dibujo reducido.
No se promete que una aglomeración de 300 visibles cueste lo mismo que 30.

## 7. Entregas separadas y dependencias

1. **32a, referencia:** cerrar demografía y medir coste por sistema, actividad
   visible y coste remoto. El harness conserva un modo explícito de referencia
   con todo detallado para calibración; no es el modo normal del juego.
   Primera medida por sistemas entregada el 2026-10-03 en
   [m15_profile_systems.md](m15_profile_systems.md): 30/300 agrupados,
   480 pasos y equivalencia con controles negativos. Demografía, distribución
   y perfil de los modelos compactos continúan pendientes.
2. **32b, registros y compacto local:** completar identidad de fase 28, libros
   y scheduler de nivel 1 con conservación y correspondencia antes de filtrar
   el loop detallado. El recorte aislado que congela los NPC lejanos no se entrega.
3. **32b, activación por visión:** conjunto exacto de activos, puente entre
   niveles, viajes, órdenes e interacciones; integración del foco desde main.
4. **32c, pueblos:** demografía, economía, avance técnico y contactos agregados,
   cada mecanismo en su commit con tests y medidas; después su materialización.
5. **32, integración y coste:** cohortes y perfil de las transiciones; separación
   de dibujo y pasos para aceleración. Guardado definitivo en fase 33.

Cada funcionalidad actualiza este apartado, el plan y el changelog. Cambios de
UI tienen capturas en un hito nuevo. La deuda de supervivencia y los checks
abiertos de la pasada actual se mantienen visibles: este diseño no los arregla
ni declara entregado el LOD. El presupuesto numérico final se fija con el modelo
mixto medido; las antiguas estimaciones de microsegundos no son un benchmark.
