# M15 29b/33: elegir un mundo generado

El selector inicial ofrece los dos mapas terrestres y un mundo generado con
la semilla de la partida. Cambiar de opción borra la selección y cualquier
confirmación de inicio seco. La elección usa el mismo buscador de agua y
comprobación de costas que los mapas terrestres; al comenzar se instala esa
geografía y se fundan sus pueblos. Ya no requiere parámetros especiales en URL.

Los textos pasan por `t()` y tienen español. Cuando no se proporciona semilla,
la entropía del navegador nombra un RNG privado para elegirla; no hay una
llamada a Math.random ni cambios en los forks de Simulation.

El caso focal de navegador inicia una partida generada desde controles visibles,
comprueba su geografía, semilla y pueblos, y guarda
`artifacts/screenshots/m15-generated-world-choice-2026-10-10T-01/03-generated-world-es.png`.
Sus aserciones terminaron correctamente. El servidor quedó colgado al cerrar
Playwright y se interrumpió; eso no constituye una pasada de la suite e2e completa.
Los primeros intentos fallaron durante recargas del árbol compartido; se repitió
el caso tras estabilizar los cambios.

Esta entrega cierra la opción de selección generada. No completa paleoclima,
selección de comarcas dentro de regiones ni calibración final de M15.
