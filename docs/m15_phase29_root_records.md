# M15 29 — Persistencia de la raíz del mundo

`WorldStateRecord` envuelve el `CheckpointRecord` de la comarca con la selección
macro que lo originó. Conserva modo geográfico, punto de inicio y extensión en
comarcas. La isla clásica sigue guardando exactamente el checkpoint de
Simulation que ya existía.

Los mapas aleatorios guardan explícitamente la semilla textual y las
dimensiones de la rejilla. Los mapas de la Tierra incluyen la entrada del
atlas, la escala de comarca y una copia JSON de las bandas de altura, clima,
rasgos y nivel del mar. El archivo puede reconstruir el mapa sin buscar el
atlas ni descargar fuentes. La semilla textual de WorldMap se conserva como
identidad canónica; sus campos siguen usando RNG derivados y no consumen ningún
draw de Simulation.

La lectura valida campos exactos, dimensiones, rangos de las celdas, identidad
de la entrada y nivel del mar. Cada lectura crea sus propios mapas, arrays,
Simulation e IdSpace; no comparte datos mutables con el registro ni con la
partida de origen. `fromWorldStateRecord` devuelve una raíz viva cuyo motor se
hidrata mediante el loader de checkpoint ya existente, sin volver a generar el
terreno ni alterar el formato de los checkpoints clásicos.

La ubicación retenida se copia y congela al crear la raíz. La lectura rechaza
un mapa geográfico unido a una partida poblada mientras el agua dulce local no
esté implementada. El envelope verifica el punto y los límites polares, pero no
compara el terreno local guardado con el perfil geográfico original: las
modificaciones del terreno después de crear el mapa son estado legítimo. La
identidad Earth y el relieve original quedan preservados por la copia raster
del registro.

La prueba cubre reanudación determinista en un mapa aleatorio, restauración
Earth offline e independiente, compatibilidad clásica y rechazos de registros
malformados. Esta envoltura no habilita inicios con población en mapas
geográficos; la semántica local de agua dulce sigue siendo la puerta de fase 30.
