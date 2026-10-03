# M15 28 — Registros sociales externos

2026-10-03. `persistence/SocialRecords.ts` añade codecs JSON v1 para el estado
social que vive fuera de `Person` y `Band`: opiniones dirigidas de
`RelationshipGraph` y relaciones simétricas/stances de `BandRelations`.

`toRelationshipGraphRecord` / `fromRelationshipGraphRecord` y
`toBandRelationsRecord` / `fromBandRelationsRecord` copian datos simples,
validan estrictamente el tipo, la versión, las claves y los valores, y vuelven
a crear estructuras independientes. Los snapshots mantienen el orden de Map,
que forma parte del comportamiento observable de `knownBy` ante empates y de
las consultas de relaciones. Los métodos de cada grafo permanecen disponibles
tras rehidratar; el codec no recibe personas, bandas, IDs globales ni RNG.

Las pruebas focales pasan por JSON real, ejercitan métodos tras la carga y
comparan snapshots completos del grafo original y el rehidratado después de
las mismas operaciones. Cubren orden de empates y poda por decaimiento,
contacto mantenido solo por stance, independencia en ambas direcciones,
duplicados, IDs y claves fuera de rango, NaN, timestamps/rangos inválidos y
campos desconocidos. Otra prueba conserva self-edges permitidos por la API actual
y verifica la ida y vuelta de los grafos de una simulación viva de dos bandas
tras 500 pasos. El
codec no recibe RNG; una comprobación adicional confirma que no consume IDs de
entidad. Esta entrega no integra un world save ni declara completo el LOD:
`IdSpace` ya tiene asignación/checkpoints por mundo (véase
[m15_phase28_ids.md](m15_phase28_ids.md)), incluido bandas/manadas en v2;
siguen pendientes libros de edificios y recursos, RNG/agendas y la
transferencia coordinada de autoridad descrita en la hoja principal de fase 28.
