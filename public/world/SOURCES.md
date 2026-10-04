# Fuentes de los mapas

Los ficheros `earth-present.bin` y `earth-12000-bce.bin` guardan 96 × 48
muestras, en centros separados por 3,75°. Se generan con
`npm run world:build`; la herramienta reduce las fuentes a 32.268 bytes por
mapa y no necesita acceso a red en tiempo de juego.

La rejilla se guarda de oeste a este, con centros de longitud desde −178,125°
hasta 178,125°, y de norte a sur. NOAA sirve longitudes 0–360°; el generador las
normaliza a −180–180° antes de asignarlas. El clima Beck y las capas Natural
Earth se muestrean en esos mismos centros. El 2026-10-04 se regeneraron ambos
binarios para corregir un desfase previo de 180° del relieve y longitudes
climáticas recortadas al borde del raster. Ver
[contrato de coordenadas](../../docs/m15_phase29_atlas_alignment.md).

## Relieve

- NOAA NCEI, **ETOPO 2022, 60 arc-second, global, Ice Surface**, superficie
  global de elevación y batimetría en metros. Se solicitan 4.608 puntos de la
  malla de 1 minuto, centrados en las regiones del juego. NOAA permite el uso
  y redistribución libres para fines privados, académicos y comerciales.
  [Guía de ETOPO 2022](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/docs/1.2%20ETOPO%202022%20User%20Guide.pdf)
  · DOI: [10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74).

## Clima

- Beck, H. E. et al. (2018), **Present and future Köppen-Geiger climate
  classification maps at 1-km resolution**, *Scientific Data* 5:180214. El
  juego toma la clase más próxima de la rasterización presente de 0,5°
  (1980–2016), publicada por los autores en Figshare. El artículo y los mapas
  se distribuyen bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/);
  los datos bibliográficos bajo CC0.
  [Artículo y licencia](https://doi.org/10.1038/sdata.2018.214)
  · [Datos de los autores](https://doi.org/10.6084/m9.figshare.6396959).

## Aguas y recursos

- Los ríos y lagos proceden de los vectores físicos 1:110m de Natural Earth
  (ríos, líneas de lago y lagos). Sus datos se dedican al
  [dominio público](https://www.naturalearthdata.com/about/terms-of-use/).
  Las líneas y polígonos se rasterizan a las regiones del juego.
- Las regiones de antepasados silvestres y minerales son semillas aproximadas
  escritas en `src/sim/world/WorldFeatureSeeds.ts`, no puntos arqueológicos de
  precisión. La bibliografía de cada semilla sigue pendiente.

## Límites de esta entrega

`earth-12000-bce.bin` aplica un nivel del mar de −60 m al mismo relieve. Usa
la clasificación climática presente como aproximación: esta fuente no contiene
el clima de hace 12.000 años. Los mapas se guardan como muestras, no como una
representación histórica detallada de cada yacimiento.
