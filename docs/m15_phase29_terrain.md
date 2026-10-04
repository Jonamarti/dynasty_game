# M15 29 — Terreno local desde perfiles de comarca

2026-10-04. `createLocalGeography` proyecta un rectángulo global de comarcas
sobre las coordenadas locales de `World`. Muestrea los centros de las baldosas
desde el mismo campo continuo que las comarcas vecinas; consultar el borde
compartido da la misma altura. Congela los límites y conserva los valores de
escala, para que mutar los argumentos después no mueva el terreno.

La Tierra conserva altura relativa al nivel del mar del atlas, convertida con
`WorldConfig.metresPerUnit`, y usa bandas explícitas en metros: playa por debajo
de 10 m, colinas desde 500 m y roca desde 1.500 m. El relieve aleatorio conserva
su escala normalizada, con un factor explícito de 1,8 hacia unidades de World.
Son políticas de adaptación a los seis biomas actuales, no topografía ni
vegetación local reconstruidas. No se aplica la caída radial de la isla.

La humedad es una política regional por bioma aleatorio o grupo Köppen del
atlas: códigos Beck 1–3 tropical, 4–7 árido, 8–16 templado, 17–28 continental,
29–30 polar; cero queda neutral. No representa lluvia ni humedad local medida.
La fertilidad de pradera/bosque sigue esa humedad y no una fórmula de relieve
normalizado aplicada a metros. Así, cambiar la escala de altura no cambia el
suelo terrestre. La textura del suelo es también una aproximación de humedad.

El constructor de World rellena el terreno antes de construir orillas,
componentes caminables, prominencia, suelo y hierba. No consume el RNG recibido
en esta ruta, ni retiene un mapa global dentro de World. El codec de terreno
existente conserva las matrices, sus alias y caches. La ruta sin adaptador
conserva el generador clásico.

La medición regional con 96×48 muestras y factor 1,8 dio:

| Semilla | Relieve mínimo/máximo | Colinas | Roca |
| --- | --- | --- | --- |
| relief-a | −0,563 / 0,932 | 178 | 26 |
| relief-b | −0,403 / 0,837 | 254 | 27 |
| relief-c | −0,510 / 0,835 | 86 | 5 |

Esto demuestra variedad de biomas en esas muestras; no calibra la economía ni
la supervivencia de futuros mapas. Los tests cubren metros/nivel del mar,
categorías regionales de agua que no pintan ríos, continuidad entre parches,
ausencia de draws, codec de terreno, estabilidad de escala y argumentos y
presencia de colinas/roca en las tres semillas.

La generación no localiza ríos ni lagos a partir de flags regionales. La
semántica clásica de orilla sigue permitiendo beber junto a cualquier agua;
por eso la integración geográfica de esta entrega permite solo inspección sin
población. No se ofrece aún una partida en la Tierra o el mapa aleatorio.

Registro visual general de la partida clásica, sin cambio de interfaz: gira
18/18 y 38 imágenes nuevas en
`artifacts/screenshots/m15-phase29-terrain-2026-10-04-pass1/`.
Typecheck y 7/7 pruebas focales pasan. Verificación conjunta de la entrega y
referencias clásicas antes/después:
`artifacts/verification/m15-phase29-local-20261004-pass1/`.
