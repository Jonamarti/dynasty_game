# M15 29 — Una raíz de mundo para la partida clásica

2026-10-04. `WorldState` es la raíz usada por `main.ts` para crear la partida y
reconstruirla desde los ajustes iniciales. Tiene su `IdSpace`, su geografía
`legacyIsland` y la `Simulation` detallada actual. Cada reconstrucción previa
al inicio crea una raíz nueva y actualiza las referencias que ya actualizaba
main: renderer, selección, creación de personaje, cámara y HUD. El getter de
desarrollo `__dynasty.worldState` sigue la raíz viva, igual que `__dynasty.sim`.

El constructor solo ofrece el modo clásico. No crea un mapa global, no deriva
la semilla inicial ni añade forks; entrega su asignador al constructor normal
de Simulation. El harness mantiene Simulation independiente. La fachada
geográfica real/aleatoria del hito anterior no se convierte aún en un terreno
local jugable. Los libros de comarcas abandonadas, los pueblos, el scheduler y
las transiciones requieren su integración posterior; esta raíz no ofrece una
segunda API para transferir autoridad ni copias ejecutables del motor.

Tres semillas comparan checkpoints JSON completos antes y después de 180 ticks,
con varias fronteras diarias y posesión del jugador. La comparación incluye
objetos, terreno, roster, libros, reloj, IDs y todos los RNG persistidos; no se
limita a supervivencia o posiciones. Otra prueba verifica que reconstruir crea
asignadores independientes y no modifica el mundo previo. La regresión de
navegador existente de ajustes/Begin comprueba identidad raíz/motor/asignador
antes y después, y que realmente se reemplaza la raíz.

El control negativo sustituye la semilla inicial dentro del constructor:
fallan los tres casos de igualdad completa. Tras restaurarlo pasan los cuatro
casos. Una primera repetición arrancó antes de terminar esa inyección y también
vio la semilla incorrecta; su log se conserva como worldstate-injection-overlap,
separado de worldstate-stable. No es una regresión de la implementación final.

Typecheck limpio y suite conjunta de 984/984 unitarios en 136 archivos. El tour
general pasa 1/1 y deja 13 capturas, con la inicial revisada, sin cambio de UI:
`artifacts/screenshots/m15-phase29-worldstate-2026-10-04-pass1/`.
Evidencia: `artifacts/verification/m15-phase29-geography-20261004-pass1/`.
La primera suite de navegador pasa 73/74 y falla esperando Resume en el caso
del picker de una persona sola; se conservan log, contexto y traza. No se
atribuye ese timeout a una causa sin aislarla ni se cambian sus aserciones.
La repetición estable completa pasa 74/74 con exit 0, incluido ese caso.
Build de producción también pasa; conserva el aviso de bundle mayor de 500 kB.

Ambas matrices completas terminan con exit 1: los mismos 108 fallos en 27
escenarios. La comparación termina con exit 0 y coincide en orden de escenarios,
recuento de pases, recuento de checks aplicables y lista ordenada de fallos.
No compara las métricas de cada check ni su aplicabilidad individual; excluye
throughput. `comparison.json` y `compare-matrices.ps1` conservan el alcance
exacto de la medida. La matriz sigue roja; no se declara recuperado el balance.

La fase 29 sigue abierta. Siguiente entrega: aplicar perfiles regionales al
terreno y a las pasadas de recursos, conservando el modo clásico; después
selección de mundo y lugar de inicio. Siguen pendientes fuentes completas,
paleoclima y banco del modelo de pueblos de 29d. No se declara cerrado LOD,
guardado global ni balance.
