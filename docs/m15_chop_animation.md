# M15 fase 17 — El golpe de tala

2026-10-03. Cuatro poses `c0`–`c3`: preparar, levantar, golpear y recuperar.
Las generan `art/src/people/rig.ts` para las cinco edades, ambos sexos y tres
direcciones horneadas; oeste es el reflejo de este. Los pies quedan plantados,
ropa y guantes siguen al brazo y la herramienta sigue el ancla de la mano.
Las hojas se reconstruyeron con `npm.cmd run art:build`; `art:sheet` produce
`artifacts/art/contact-chop.png`, revisada visualmente.

El selector exige una persona viva trabajando en un árbol en pie, con progreso
real en el tronco y objetivo alcanzado. Talar guarda trabajo en el árbol y no
usa el temporizador de una cosecha: el gesto no depende de un timer positivo.
Un timer positivo de preparación, viaje, muerte, cancelación, desaparición o
caída del árbol quitan el gesto. Comparte con cavar/recolectar la fracción de
reloj acotada y el paso de dos ticks por pose, sin draws ni escrituras en el motor.

Cuatro pruebas del selector y una de anclas cubren esos límites; los tres
archivos de arte/gestos pasan 26/26. La prueba de navegador ordena talar por
`sim.order`, avanza hasta que empiece el trabajo y conserva pausa, reloj,
necesidades, inventario, progreso y RNG durante cada render. Verifica cuatro
composiciones distintas, herramienta correcta y cancelación. Espera los 140ms
de gracia del movimiento antes de comprobar las poses estacionarias.

Typecheck limpio, suite conjunta 940/940 en 128 archivos y 73/73 e2e.
Capturas de los cuatro golpes, imagen del golpe revisada:
`artifacts/screenshots/m15-chop-2026-10-03-final/`.
Quedan gestos de fabricación y otras familias de trabajo; esto no completa
toda la fase 17. La matriz de simulación sigue roja y se informa por separado.
