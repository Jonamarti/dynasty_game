# Perfil del juego con 300 humanos — 2026-10-03

`npx vite-node tools/profile-population.ts` abre el juego completo en Chromium,
con AI, renderer y HUD de producción. Usa `profile-4`, mundo por defecto,
1280×800, zoom 2, niebla desactivada y una banda de fundadores naturales.
No teletransporta personas, asigna tareas sintéticas ni detiene sus decisiones.
Cada población usa un navegador nuevo: 10 s de calentamiento y 20 s medidos,
a la velocidad normal de **5 pasos de simulación/s**. Ambos grupos conservaron
exactamente sus 30/300 vivos; había además 70 animales en el mundo.

| Medida | 30 humanos | 300 humanos |
|---|---:|---:|
| Cadencia observada | 59,9 FPS | 52,9 FPS |
| Dibujo canvas, media / p95 | 0,90 / 1,30 ms | 3,38 / 5,00 ms |
| Paso de simulación, media / p95 | 1,13 / 2,00 ms | 20,80 / 41,80 ms |
| Intervalo entre frames, p95 | 18,5 ms | 36,1 ms |
| Frames con intervalo >33,34 ms | 0 / 1.199 | 61 / 1.057 |
| Figuras detalladas dibujadas por frame | 30 | 300 |
| Píxeles retenidos de figuras + tintes | 2,53 MiB | 6,47 MiB |
| Figuras retenidas / expulsiones | 232 / 0 | 712 / 0 |
| Heap JS usado tras GC | 12,75 MiB | 29,92 MiB |
| Suma de working sets de procesos Chromium | 413,53 MiB | 483,09 MiB |
| La misma suma con navegador vacío | 160,85 MiB | 158,01 MiB |

La caché no reserva un megabyte por NPC ni una copia de cada hoja por NPC.
En esta población real, el gesto, aspecto y dirección se comparten entre
personas que coinciden; las 712 figuras incluyen las poses efectivamente usadas
durante esos 30 segundos, **no cuatro poses de recolección forzadas para cada
humano**. La prueba sintética anterior de 500 apariencias únicas sigue siendo
la que mide esa presión deliberada de poses. Los presupuestos siguen en
24 MiB de figuras y 8 MiB de tintes; las hojas son compartidas por el atlas.

El paso de simulación supera el dibujo en coste y provoca pausas perceptibles
aunque solo se ejecute cinco veces por segundo. La AI, búsquedas sociales y
trabajo por tick requieren un perfil propio antes de optimizarlos. Esta prueba
no identifica todavía qué sistema explica el coste y no prueba que 20/60 pasos
por segundo, siglos de historial o otras distribuciones de población rindan igual.

Los FPS son cadencia del bucle observado en Chromium headless 151.0.7922.34
en este equipo; no miden presentación de GPU ni garantizan otro dispositivo.
El tiempo de `Renderer.render` incluye envío JS de dibujos; el HUD queda fuera
de ese cronómetro, pero dentro de la cadencia del juego. El heap se mide por CDP
tras GC y **no contiene todos los píxeles canvas/GPU**. Los working sets sumados
incluyen código, mundo, navegador, GPU y procesos auxiliares, y pueden contar
páginas compartidas varias veces. Estas medidas se solapan: **no se suman**.
No se ha medido VRAM. Hubo cero errores de página.

Informes originales: `artifacts/verification/m15-population-2026-10-03T06-55-44-442Z/`.
Capturas: `artifacts/screenshots/m15-population-2026-10-03T06-55-44-442Z/`.

El override `?profileHumans=300&defaults=1&skipIntro=1&seed=profile-4` solo
existe en desarrollo, acepta enteros 2–1.000 y requiere `skipIntro`; no cambia
las preferencias guardadas. Las familias pueden exceder en una persona el
tamaño solicitado con otras semillas: el instrumento exige el recuento exacto,
y su e2e comprueba fundadores con vínculos familiares, reloj y arte funcionando.
