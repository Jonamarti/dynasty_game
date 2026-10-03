# M15 28 — Registro inerte de terreno

2026-10-03. `persistence/WorldRecords.ts` añade `WorldTerrainRecord` v1 para
el estado de las casillas que pertenece a `World`: relieve generado y excavado,
prominencia, humedad, fertilidad innata, bioma, transitabilidad, hierba,
regiones conectadas y orillas. El libro de suelo conserva textura, humus,
nutrientes y el orden del conjunto de recuperación diaria, además de los
contadores de edición y la configuración necesaria para que sigan funcionando
los métodos del terreno.

`toWorldTerrainRecord` copia datos a arrays JSON independientes. Tras JSON,
`fromWorldTerrainRecord` valida forma, versión, dimensiones, longitudes, valores,
índices, etiquetas/tamaños de región y orillas duplicadas; después restaura los
prototipos `World` y `Soil` sin llamar a sus constructores. Los arrays se copian,
`soil.fertility` apunta al mismo array canónico que `World.fertility`, y los
métodos de terreno/suelo pueden continuar trabajando. No se genera otro mapa,
no hay draws RNG, asignación de IDs ni registro en `Simulation`.

El decoder exige el esquema completo de `WorldConfig` v1, comprueba que sus
dimensiones coincidan con el sobre y aplica rangos seguros a los parámetros que
leen los métodos de terreno. Valida arrays densos y representables exactamente
como Float32, etiquetas Int32, bioma/transitabilidad, tamaños y topología de
regiones mediante un flood fill independiente. La lista de orillas se conserva
como caché histórica: las ediciones actuales de terreno no la recalculan, así
que no se deriva de nuevo al cargar.

Las pruebas focales comprueban ida/vuelta JSON exacta del libro, prototipos y
alias, métodos reales después de hidratar, independencia en ambas direcciones y
controles negativos para versión, forma, longitud, bioma, índices, regiones y
duplicados. El módulo solo cubre terreno y suelo. Edificios, nodos, árboles,
campos, animales, pilas y otros objetos que `Simulation` mantiene siguen fuera;
este codec no aplica un mundo a una simulación ni completa guardado/carga o LOD.
Typecheck y 4/4 pruebas focales pasan. La interfaz no cambia; se conserva un
registro visual general del hito en
`artifacts/screenshots/m15-world-records-2026-10-03-pass1/` (tour y capturas
adicionales 18/18, imagen inicial revisada). La matriz previa ya tiene 104
fallos entre 27 escenarios y se compara por separado al cerrar la integración.
