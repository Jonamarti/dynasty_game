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

## Ingesta finita de personas — 2026-10-09

`CompactBandIntake` reparte presupuestos explícitos de comida y agua entre IDs
reales. `CompactBody` pide el alivio de su tabla medida después de actualizar
necesidades; el callback devuelve como máximo esa petición y la cuota restante.
Sin comida aumenta el hambre; sin una fuente de agua aumenta la sed. Una fuente
ilimitada necesita declaración explícita. No se concede alivio sin `IntakeModel`.

La fecha es `floor((tick - 1) / ticksPerDay)`. Abrir de nuevo el mismo día se
rechaza; el registro JSON conserva cuotas y consumos a mitad de jornada. Sin
callback se conserva el comportamiento anterior del cuerpo compacto.
Pruebas focales de ingesta y cuerpos: 20/20; typecheck limpio. Hito visual sin
cambio de UI: `artifacts/screenshots/m15-band-intake-2026-10-09T-01/`.

## Demografía con identidades y parentesco — 2026-10-09

`advanceCompactBandLife` ejecuta `LifeSystem.daily` después de que todos los
cuerpos alcanzan la frontera diaria. Cada persona usa su stream persistido;
no se vuelve a envejecer la misma fecha. La comprobación exige los objetos
canónicos de `peopleById` y los IDs originales. Los muertos siguen en el archivo.
Los nacimientos reciben IDs de `IdSpace`, nombre con las mismas tablas,
parentesco, hogar, relaciones, crónica traducida y stream compacto derivado.
La concepción necesita la lectura real de `roofTonight` suministrada por el
llamante; no se inventa un techo a partir de pertenecer a un hogar.
Tres pruebas cubren nacimiento, sincronización y conservación por JSON.
Hito sin cambio de UI: `artifacts/screenshots/m15-band-life-2026-10-09T-01/`.

## Técnicas en personas vivas — 2026-10-09

`CompactBandKnowledge` usa el mecanismo estacional medido de `PeopleKnowledge`
con la población real por sexo y edad. La unión técnica se reconstruye en cada
estación; solo sirve como vista, no es memoria omnisciente. Una adquisición se
concede a un practicante vivo que posee individualmente sus prerequisitos.
Cuando muere el último portador desaparece de la vista. Prerequisitos repartidos
entre personas no crean un aprendiz ficticio. Los contactos y materiales de
la región se suministran explícitamente. RNG y KnowledgeLedger persisten;
repetir la estación se rechaza. Ocho pruebas pasan, incluidos estados técnicos
malformados. Hito: `artifacts/screenshots/m15-band-knowledge-2026-10-09T-01/`.

## Cultivo con las reglas detalladas — 2026-10-09

`CompactBandFarming` guarda parcelas reales `Crop`/`Soil`, semillas pagadas y
trabajo parcial de siembra/cosecha. Recupera el suelo una vez por día aunque
varias parcelas compartan su objeto. Crecimiento, fertilidad, agotamiento,
ploughYieldFactor y rendimiento usan las fórmulas existentes. `Soil.isPlotSpent`
es el mismo predicado por promedio que llama ahora `ActionSystem`: una baldosa
pobre no veta una parcela sana. Los costes de siembra/cosecha se exportan desde
`Field` para evitar dos tablas. No aparecen parcelas a partir de `arable`.
`takeEdibleGrain` retira solo excedente tras reservar semillas; su nombre indica
el destino, no que el grano crudo sea alimento. La molienda es un paso separado.
Cinco pruebas nuevas más farming detallado: 27/27. Hito sin cambio de UI:
`artifacts/screenshots/m15-band-farming-2026-10-09T-01/`.

## Molienda: el grano necesita procesamiento — 2026-10-09

`CompactBandProcessing` ejecuta `RECIPES.groats`: tres granos pagados por una
harina, en un molino completo de la banda, con un adulto que conoce molienda.
Coste y habilidad son los de `ActionSystem.doCraft`; el trabajo se banca por
practicante y cada lote practica la habilidad. Una ausencia devuelve razón
explícita (`no_grain`, `no_station`, `no_practitioner`, `working`). JSON conserva
existencias y horas, y la fecha no se puede repetir. El grano crudo no alimenta.
La nutrición exacta de harina se convierte a raciones de referencia;
`CompactBandFood.supplementalRations` la contabiliza aparte de fuentes silvestres,
con el mismo almacenamiento, déficit y conservación. El perfil de arbustos no
limita una cosecha que ya pagó semillas y trabajo. Cuatro pruebas de molienda
más dos de comida suplementaria; conjunto de cuatro módulos: 28/28 pasan.
Hito: `artifacts/screenshots/m15-band-processing-2026-10-09T-01/`.

## Oferta compartida por comarca — 2026-10-09

`advanceCompactBandProductionDay` liquida juntas las bandas que ocupan una
misma comarca. Por fuente suma trabajo elegible, reparte proporcionalmente
el menor de ese trabajo y el potencial, y llama al ledger de cada banda.
La suma no puede gastar dos veces la reposición de un arbusto, banco o manada.
El reparto es una política explícita; no modifica las tasas de rendimiento.
Bandas sin trabajadores o sin prerequisitos no reciben producción. Todos los
ledgers deben cerrar la misma fecha/estación; IDs duplicados se rechazan.
El orden de entrada no cambia los resultados y los argumentos no se mutan.
Siete pruebas pasan. El motor de una banda recibe este resultado mediante
su política de oferta; el coordinador del borde deberá reunir todas las
bandas de cada comarca antes de repartir, como parte del paso 2.
Hito: `artifacts/screenshots/m15-band-production-2026-10-09T-01/`.
