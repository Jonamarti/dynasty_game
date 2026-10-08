# Ríos terrestres (2026-10-08)

Las partidas cartográficas terrestres usan [Natural Earth, Rivers + lake centerlines 1:10m](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/), de dominio público. Archivo fuente: [ne_10m_rivers_lake_centerlines.zip](https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_rivers_lake_centerlines.zip). SHA-256 de la descarga usada: `ded71b01870855ccfe19b51f2ec14c9bb48fae23c0e9f3c11974d426433b5c38`.

`tools/worlddata/rivers.ts` lee atributos DBF y polilíneas SHP, conserva la clase River, simplifica con tolerancia de 0,003 grados y redondea coordenadas a cinco decimales. `src/data/earthRivers.json` contiene 1.201 ríos y 151.137 puntos, unos 2,8 MB de JSON antes de compresión. Es una simplificación cartográfica, no un levantamiento de cada orilla. Un índice espacial compartido consulta segmentos cercanos por casilla; no se descarga nada durante la partida.

`npm.cmd run world:build` regenera geometría y banderas regionales desde la misma fuente. Puede usar `WORLD_DATA_RIVERS_ZIP` para una copia offline; los demás inputs y opciones siguen en `tools/worlddata/run.ts`. Las banderas gruesas sirven al selector/buscador de comienzos, las trazas al mapa local. Los lagos conservan su fuente y tratamiento anteriores.

Anchura y profundidad son aproximaciones para jugar. `scalerank` da una clase de anchura global: la rasterización cubre como mínimo una huella de casilla para evitar cursos invisibles. Los cursos principales tienen un núcleo que supera la profundidad permitida para nadar; los menores conservan márgenes someros y vados periódicos. No se afirma que cada ancho corresponda a una medición en metros. Cambiar la resolución no cambia la clase física del río, salvo el mínimo necesario para representarlo.

En mapas aleatorios se mantiene la red de drenaje sembrada: la anchura depende del caudal acumulado, en una escala canónica fija, y los meandros usan ruido determinista de escala local con extremos compartidos. Ninguno de estos cambios consume RNG de la simulación. Los mundos clásicos sin mapa conservan su generación.

El atlas de hace 12.000 años reutiliza estos cursos modernos, como aproximación explícita. La digitalización no garantiza dirección aguas abajo y el DEM del juego sigue siendo grueso: no es una simulación hidráulica ni una reconstrucción paleogeográfica. Los terrenos de partidas ya guardadas no se repintan; los cambios se ven al generar nuevos mapas/ventanas.
