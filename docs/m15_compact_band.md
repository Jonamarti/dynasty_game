# M15 paso 1c — Economía de banda fuera del mapa

2026-10-09. Orden vigente: [m15_simulation_lod.md](m15_simulation_lod.md),
§0.5, revisión del propietario del 2026-10-08. Entrega funcional del motor 1c;
no activa la salida del mapa de fase 34 ni declara calibrada la correspondencia.

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

## Límites de las entregas iniciales (food/calendar)

La contabilidad no avanza cuerpos, concede técnicas, construye almacenes ni
registra personas en una `Simulation`. La autoridad de personas sigue en
`CompactAuthority`. El llamante debe aportar población viva, trabajadores
capaces, demanda y tasas compatibles con sus técnicas y herramientas.
Los campos cultivados necesitan su propia producción medida; `arable` y
`cultivable` no dicen cuántas raciones se cosechan. No hay agricultura inferida.
La pérdida del excedente sin espacio no es deterioro del stock almacenado.

En aquellas primeras entregas faltaba conectar el déficit a ingesta finita de los cuerpos, avanzar
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

## Verificación de food/calendar antes del motor — 2026-10-09

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

## Tasas observadas: mecanismo, no pronóstico — 2026-10-09

`ActionSystem` emite nutrición efectivamente retirada y ticks productivos por
fuente solo cuando telemetry está habilitada. Incluye lo comido en la fuente;
la caza cuenta carne llevada, no todo lo que dejó el animal. No consume RNG ni
cambia decisiones. `CompactFoodRateWatch` divide por `RATION_NUTRITION`; los
contadores de nutrición no son raciones. El reparto de tiempo se divide por
ticks de personas vivas de todas las edades, porque también trabajan niños.
`tools/compact-food-rates.ts` reproduce una semilla de diez días y doce personas.

El informe `m15_compact_food_rates_20261009.json` observa 117 persona-días,
11 vivos al final, cinco días de primavera y cinco de verano. Rendimientos por
jornada productiva: recolección 8,846; pesca 11,661; caza 21,505 raciones.
Son jornadas de acción, excluyen viaje/búsqueda y no se aplican por defecto a
todos los habitantes. Cinco muertes de presas son una muestra pequeña; otoño,
invierno y técnicas iniciales no están cubiertos. `n/a` conserva esa ausencia.
No se convierte este informe en coeficientes estacionales ni en un pronóstico.
Quince pruebas focales incluyen conversión, overflow y mundo idéntico con/sin
telemetry. Hito: `artifacts/screenshots/m15-band-food-rates-2026-10-09T-01/`.


## Motor conjunto y contrato de coordinación — 2026-10-09

`CompactBandRuntime` compone el paso 1c fuera de `Simulation`. Tiene una banda,
las personas canónicas y un calendario. Por jornada prepara una sola oferta,
reserva cuotas finitas, avanza todos los cuerpos en orden estable de ID,
liquida el consumo efectivamente aplicado y ejecuta vida diaria después de
sincronizar todos los cuerpos. Al cerrar estación avanza PeopleKnowledge una
vez; devuelve eventos de conocimiento además de los de muerte/nacimiento.

El presupuesto inicial usa el ledger de comida para limitar cuotas. A medianoche
se liquida contra `foodUsed / RATION_NUTRITION`: lo que nadie usó permanece en
reserva, y el excedente de producción se guarda o se registra como pérdida.
`plannedDemand` y `unmetDemand` conservan la demanda original junto al consumo
real. La cuota pagada mide alivio solicitado, no nutrición absorbida después
del clamp del cuerpo; una persona saciada puede desperdiciar parte de ella.

Campos y molienda se preparan sobre clones. Solo tras validar la oferta y las
cuotas se confirman semillas, trabajo y práctica de habilidades. Un fallo del
planificador puro permite repetir sin practicar gratis ni gastar dos veces.
El presupuesto combinado de jornadas de comida y ticks de campo/molienda no
supera los adultos vivos; la oferta debe declarar la población real y técnicas
que todavía sostiene alguien vivo. El hambre y la sed llegan a NeedsSystem y
matan realmente, sin reducción automática de población por fórmula.

El snapshot incluye personas, archivo canónico, hogares, relaciones, IDs,
streams, calendario, reservas/cuotas, conocimiento/vida, cultivos/suelo,
molienda y oferta pendiente. Valida fechas, versiones, configuraciones,
semilla, IDs y la única copia canónica de cada persona. Las cuotas de alguien
que murió durante la jornada permanecen guardadas; el muerto no las consume.
`startTick` permite comenzar en una frontera diaria tardía sin fingir que ese
motor ya había avanzado la partida desde cero. El ledger de conocimiento se
inicializa con la última estación global completada, no con una fecha local.

Las políticas se suministran explícitamente: perfil corregido, tasas medidas,
reparto, agua, trabajo, edificios y contactos. Deben ser deterministas/puras y
leer el roster que recibe el callback; una closure que retenga personas viejas
tras restore no cumple el contrato. La tabla de IntakeModel y estos servicios
externos deben ser equivalentes al restaurar. No hay producción por omitir una
tasa, fuentes de agua inventadas, campos creados de `arable` ni técnicas globales.
El stock inicial debe haber sido extraído de sus inventarios físicos por el
coordinador: estos rations no representan además una segunda pila de objetos.

El coordinador de paso 2 reunirá bandas por comarca antes de llamar producción,
corregirá el perfil con TileLedger y transferirá autoridad/materiales una sola
vez. La creación de un runtime nuevo necesita frontera diaria; el puente tendrá
que resolver la primera jornada parcial sin regalar un día de producción.
Los guardados posteriores ya admiten cualquier tick. Este motor detached no
puede ejecutarse a la vez que Simulation sobre las mismas personas.

Implementación funcional de 1c reunida. La puerta empírica `lod-matches-detail`
y la calibración estacional de oferta siguen en paso 4; la medición corta no
resuelve esos requisitos. No se declara mejora económica. Las cohortes y la
matriz pesada se difieren según AGENTS.md.

Los factores familiares de NeedsSystem se suministran por defecto desde
`CompactBandNeeds`: predicados vivos de lactancia, reloj de hambre infantil y
fatiga de bebé en brazos. El nacimiento/defunción cambia la lectura del mapa
canónico inmediatamente; no se guarda una bandera de leche que sobreviva a su
bebé. Los tests con hungerRate cero mantienen drift cero sin `0 * Infinity`.
Esto comparte el reloj fisiológico, pero **no calibra un flujo de leche** ni
su conversión a presupuesto material: la correspondencia infantil se conserva
como hallazgo pendiente en bugs/M16 y la puerta del paso 4.


## Verificación final del motor — 2026-10-09

- TypeScript limpio; conjunto 1c: 73/73 en doce archivos.
- Suite final completa: 231 archivos, 1.740 pasan, una omitida y dos fallos
  heredados (craft/delta: hambre 23,401 >15; difusión: 0,81 ≥0,6).
  La pasada anterior durante integración tenía dos fallos nuevos; corregidos,
  se repitió la suite completa sobre el estado estable. No quedan esos fallos.
- `sim:check` una semilla: dieta y rendimiento siguen fallando (2/147), como
  al empezar. n/a no se interpreta como pase y no se cambian umbrales.
- Gira final 1/1; trece capturas en
  `artifacts/screenshots/m15-band-runtime-2026-10-09T-01/`, sin cambio de UI.
- Logs: `artifacts/m15-band-phase-final-tests-20261009.log` y
  `artifacts/m15-band-phase-simcheck-20261009.log` (locales ignorados).
- Cohortes/matriz pesada diferidas. No se declara mejora económica ni puerta
  de correspondencia calibrada; las obligaciones de paso 2/4 están arriba.

## Revisión de la unión a mitad de día — Fase 34, 2026-10-09

Sustituye la restricción anterior de crear un runtime solo en frontera diaria:
ahora puede recibir propiedad en cualquier tick. El primer periodo empieza en
startTick y termina a medianoche, con límites de recurso/trabajo/cultivo/suelo
para ese tramo. Policies calculan su propia demanda, agua y cuotas del tramo.
Calendario v2 conserva el ancla y migra v1; duración se deriva del intervalo.
42/42 focales; TypeScript limpio. Sigue sin conectarse la autoridad de Simulation.
[Contrato detallado](m15_phase34_partial_day.md).
