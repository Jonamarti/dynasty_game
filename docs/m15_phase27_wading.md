# M15 27b — Vadear y secarse

2026-10-05. El agua de menos de `world.wadeDepth` es caminable. Las regiones
de paso y las orillas incluyen esos bajíos; se puede beber estando en ellos.
El fondo excavado o elevado vuelve a comprobar la caminabilidad. Una casilla
caminable de agua sigue sin aceptar una casa ni una obra de tierra seca; los
emplazamientos de orilla mantienen su regla propia.

El paso por un bajío se reduce a 0,4 y refresca `Person.wet` a `world.wetTicks`
(120 por defecto). La humedad añade frío mientras se seca; un hogar encendido
cercano reduce el contador cuatro veces más deprisa. El inspector explica la
humedad dentro de la puerta de conocimiento de la condición, y actualiza el
aviso sin reconstruir el panel. Texto completo en inglés y español.

El terreno y su codec incluyen la segunda rejilla de componentes de paso que
usará la natación. Esa API de rutas es una base de navegación; la ejecución y
los permisos de nadar se entregan en 27d. Las modificaciones del fondo invalidan
también sus componentes. Los registros conservan las matrices, el estado de
invalidación y sus alias; no regeneran el mundo al cargarlo.

Este paso cambia los mundos clásicos: la caminabilidad altera la colocación
inicial y los destinos. No se ha añadido ningún fork ni una entrada al plan
compartido de recursos. La comparación de coste usa el código anterior y las
mismas veinte semillas en los 28 escenarios clásicos, sin comparar partidas de
distintas versiones como si mantuvieran sus individuos y posiciones.

Pruebas focales de paso, humedad, secado, emplazamientos, relieve, costa y
registros. Captura y prueba de actualización del inspector:
`artifacts/screenshots/m15-phase27-wading-2026-10-05-pass2/02-wading-condition.png`.
Los resultados conjuntos y las cohortes se registran al terminar la fase.
