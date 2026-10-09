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

## Calendario y guardados a mitad de jornada

`CompactBandCalendar` es el dueño del reloj y del ledger de una banda.
Liquida una sola vez cada frontera diaria atravesada, en orden, con el
calendario real (`TimeManager`, incluido `startDay`). La fecha del ledger
es la frontera final de la jornada; su estación se lee en `tick - 1`:
el primer día de verano acaba de terminar la producción de primavera.
Las llamadas que no completan una jornada solo adelantan el reloj, sin
producir, consumir ni volver a tirar nada.

El lector de oferta recibe fecha, estación y ticks inicial/final. Debe ser
puro y leer la población, trabajo y tasas que corresponden a esa fecha,
no el estado del mundo al final de una llamada larga. El driver valida
todas las jornadas antes de cambiar el estado vivo. Si el lector falla,
el reloj y las reservas quedan como antes y una repetición no duplica
retiradas. Las llamadas reentrantes se rechazan. Este rollback cubre solo
el estado propio del calendario, no efectos externos de un lector impuro.

El registro JSON v1 compone el snapshot del calendario y el ledger. Rechaza
fechas que no coincidan, versiones desconocidas y campos extra. El stock
no se expone por referencia. El guardado a mitad de día conserva el tick
parcial; al restaurarlo solo se liquida al llegar a la frontera siguiente.
Avanzar por trozos y guardar/cargar produce los mismos informes y estado
que avanzar de una vez. Cinco pruebas cubren estos contratos, incluido
un negativo de estación: usar el día entrante adelantaría la oferta de verano.

Hitos visuales, sin cambio de UI: las dos giras se guardan por separado en
`artifacts/screenshots/m15-compact-band-food-2026-10-09T-01/` y
`artifacts/screenshots/m15-compact-band-calendar-2026-10-09T-01/`.

## Verificación conjunta — 2026-10-09

- TypeScript limpio; 15/15 pruebas nuevas (10 ledger, 5 calendario).
- Techo de potencial eliminado temporalmente: cuatro pruebas iniciales fallan;
  restaurado, vuelven a pasar. Estación de medianoche leída en `boundary`
  en vez de `boundary - 1`: dos pruebas fallan; restaurado, 15/15 pasan.
- Suite completa: 221 archivos; 1.681 pasan, 1 omitida y 2 fallos heredados.
  Correspondencia craft/delta: diferencia de hambre 23,401 frente a ≤15;
  difusión tecnológica: 0,81 frente a <0,6. Son exactamente las cifras
  registradas al cerrar `m15_brain_cost.md`; no se relajaron tolerancias.
- `sim:check` de una semilla: 2/147 fallos, dieta y rendimiento, como al empezar.
- Dos giras 1/1 cada una, 13 capturas por hito. No cambia la UI del producto.
- Cohortes y matriz pesada diferidas; no hay resultado económico calibrado.

Los logs de verificación están en `artifacts/m15-compact-band-tests-20261009.log`
y `artifacts/m15-compact-band-simcheck-20261009.log` (artefactos locales ignorados).
