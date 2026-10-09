# M15 paso 1c — Economía de banda fuera del mapa

2026-10-09. Orden vigente: [m15_simulation_lod.md](m15_simulation_lod.md),
§0.5, revisión del propietario del 2026-10-08. Esta entrega empieza 1c;
no cierra el modelo compacto ni activa la salida del mapa de fase 34.

## Contabilidad diaria

`compact/CompactBandFood.ts` liquida una jornada de una banda en una comarca.
Trabaja en raciones, la unidad de `ComarcaResourceProfile`: nutrición diaria
con la configuración de referencia. No son objetos de inventario.
La población, la demanda, la capacidad real de almacenamiento y el trabajo
asignado a cada fuente se suministran explícitamente.

Cada fuente —recolección, pesca y caza— produce como máximo el menor de su
potencial estacional y las jornadas asignadas multiplicadas por su rendimiento.
La suma de jornadas no puede superar la población. Los requisitos tecnológicos
de cada tasa se comprueban contra las técnicas suministradas por el llamante.
Los rendimientos son entradas obligatorias: el potencial medido no es una tasa
de cosecha y las medidas antiguas de `PeopleMeasured` no aíslan cada fuente.
No hay valores predeterminados que conviertan potencial en comida gratuita.

Primero se consume la producción del día; si falta, se retiran reservas.
El excedente se guarda hasta la capacidad y el resto se registra como pérdida.
El déficit se devuelve con fecha y cantidad; no se borra ni crea comida.
La identidad contable es `reservas iniciales + producción = consumido +
pérdida + reservas finales`. El déficit es `demanda - consumido`.
El estado y los resultados son nuevos objetos; ningún argumento se modifica.
El registro JSON v1 conserva fecha, reservas y capacidad y rechaza corrupción.

## Límites de esta entrega

La contabilidad no avanza cuerpos, concede técnicas, construye almacenes ni
registra personas en una `Simulation`. La autoridad de personas sigue en
`CompactAuthority`. El llamante debe aportar población viva, trabajadores
capaces, demanda y tasas compatibles con sus técnicas y herramientas.
Los campos cultivados necesitan su propia producción medida; `arable` y
`cultivable` no dicen cuántas raciones se cosechan. No hay agricultura inferida.
La pérdida del excedente sin espacio no es deterioro del stock almacenado.

Sigue pendiente conectar el déficit a ingesta finita de los cuerpos, avanzar
demografía y técnicas, aplicar las modificaciones de `TileLedger` y medir
`lod-matches-detail`. El `IntakeModel` antiguo no puede alimentar por encima
de este presupuesto; conectarlos sin ese límite duplicaría la comida.
Las cohortes, `century`/`generations` y la matriz pesada se difieren por
`AGENTS.md`; esta entrega no afirma mejora de supervivencia ni calibración.
