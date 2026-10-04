# M15 28 — Reconstruir una Simulation sin generar otro mundo

2026-10-04. El checkpoint coordinado ya tiene una fábrica
`Simulation.fromCheckpointRecord(input)` que valida e hidrata una copia propia
antes de reconstruir los sistemas. No utiliza el camino de generación del
constructor, no crea entidades, no expande la semilla ni hace forks nuevos.

El cargador debe conservar reloj, reglas, asignadores y todas las identidades
de las corrientes retenidas. Roster, objetos, cadáveres, jugador, sucesión,
relaciones y normas comparten sus referencias canónicas dentro del mundo
cargado, sin compartir estado mutable con el original ni con otra carga.

Reconstruir índices espaciales y scratch es seguro; recalcular técnicas,
templos, permisos o cooldowns antes de su siguiente frontera diaria no lo es.
Los callbacks sociales deben apuntar a la nueva Simulation. Los contextos de
acción y nacimiento se crean sobre ella cuando avanza, conservando sus reglas
y su asignador. La intención de teclado se limpia: un input de presentación
anterior no es una orden que deba quedar pulsada al cargar.

Esta fábrica crea un mundo independiente. La transferencia de un motor local
se realiza por el [protocolo de autoridad](m15_phase28_authority.md), que conserva
el asignador compartido y revoca al origen. La materialización individual entre
niveles sigue pendiente. Tampoco añade almacenamiento de partidas, controles de
guardar/cargar ni un scheduler compacto/LOD. Todos los NPC vivos siguen
recibiendo el loop detallado.

Cinco pruebas comparan checkpoints JSON completos antes y después de avanzar
original y copia: una tala con progreso bancado; la frontera diaria con un
nacimiento real; sucesión pendiente y posesión del heredero; callbacks de
creencias y reputación; y la lista de sabotajes conservada incluso tras una
ruina. Comprueban independencia entre dos cargas, rechazos de corrupción y
ausencia de generación, draws, forks y asignación de IDs al hidratar.

La comparación usa el formato JSON persistido en ambos lados: JSON normaliza
`-0` a `0`. No normaliza ni excluye otros datos, corrientes RNG, IDs o libros.
Un control negativo aislado borra solo la lista de sabotajes del cargador y
hace fallar la regresión por el campo ausente; no se modifica el código de
producción para ejecutar ese control. `negative.config.ts` y
`omit-cache.setup.ts` conservan la inyección reproducible.

La matriz de salud se informa separadamente: la referencia ya falla y no
puede declararse verde por cargar un mundo correctamente. Este paso no cambia
coeficientes ni agendas de un mundo generado.

Verificación estable: typecheck limpio, 963/963 unitarios en 133 archivos y
74/74 e2e. Los primeros fallos (Map retenido tras refresco, comparación de
`-0` antes de JSON y navegación durante edición) se conservan separados de los
logs estables; no se declaran pases.
La matriz de 27 escenarios conserva 108 fallos antes/después, sin diferencias
en checks aplicables, recuentos de pases y listas ordenadas de fallos. No se
compararon métricas individuales ni throughput. `comparison.json` conserva
ambas referencias; la matriz sigue roja.

Evidencia de esta pasada: `artifacts/verification/m15-phase28-loader-20261004-pass1/`.
Registro visual general sin cambio de UI:
`artifacts/screenshots/m15-phase28-loader-2026-10-04-pass2/`.
