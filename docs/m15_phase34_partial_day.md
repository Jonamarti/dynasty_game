# Fase 34 — preparar la primera jornada parcial

Esta entrega cubre solo el reloj de la futura transferencia a compacto. No conecta `Simulation`, no cruza el borde, no mueve personas y no afirma equivalencia calibrada.

## Contrato de intervalo

Un `CompactBandRuntime` puede comenzar a ser dueño en cualquier tick. El primer ledger que cierre usa el intervalo que queda entre el tick de transferencia y la siguiente medianoche. Si el día tiene `ticksPerDay` ticks, el runtime deriva la duración de `period.toTick - period.fromTick`; la fracción es esa duración dividida entre `ticksPerDay`. Comenzar justo en una frontera mantiene el día completo.

Las políticas reciben el periodo y `durationFactor` en el contexto. Devuelven demanda, worker-days, agua finita, cuotas de ingesta y trabajo de campo/molino para **ese intervalo**, ya limitado por la duración. No deben aplicar el factor por segunda vez. El runtime valida que la mano de obra de recolección/caza/pesca no supere adultos × fracción, que campo y molienda no superen adultos × ticks disponibles, y que los worker-days no excedan el límite del día. Las cuotas se validan contra la comida y el agua declaradas para el mismo intervalo. `unbounded` se reserva para una fuente realmente ilimitada.

`CompactBandFoodDayInput.durationFactor` es opcional para conservar el comportamiento de los llamadores diarios existentes. El runtime y el calendario lo suministran al liquidar una jornada parcial: el potencial estacional de cada fuente se limita a esa fracción, y sus worker-days también. Las tasas por worker-day siguen siendo entradas medidas; no se generan coeficientes. En agricultura, el crecimiento de `Crop` y la recuperación de `Soil` usan la misma fracción; el trabajo parcial continúa acumulándose en la parcela. Molienda conserva el progreso existente en su objeto de proceso.

## Guardado y continuidad

`CompactBandCalendarRecord` pasa a v2 e incluye `dayStartTick`, el ancla del tramo actual. Permite guardar y restaurar después de varios avances cortos sin convertir la primera jornada en una completa. Lee v1 como un runtime histórico que empezó en una frontera, por lo que deriva el ancla de la medianoche anterior.

`CompactBandRuntimeRecord` conserva su forma v1. `startTick` ya estaba guardado y delimita la primera parcial. `pendingDay.period` guarda el intervalo real en sus campos existentes `fromTick`/`toTick`; la fracción se vuelve a derivar al restaurar y al comprobar el ledger, no se serializa como un segundo valor susceptible de divergir. El runtime rechaza un ancla de calendario que no concuerde con `startTick`. Un registro recién creado sin plan pendiente solo es válido en el tick inicial o en una frontera diaria.

La preparación del día sigue siendo transaccional. Al guardar en mitad del primer tramo, el plan y las cuotas ya preparados sobreviven en el JSON; al guardar justo en el tick de transferencia, la siguiente llamada prepara el tramo una vez. Ningún corte o restore inicia otra jornada.

## Pruebas focales

Las regresiones cubren el rechazo original de una unión a mitad del día, factor de 3/4, límites de potencial y trabajo, escala de cultivo/suelo, ancla persistida en cortes y compatibilidad v1. La continuación desde un snapshot a mitad del tramo produce el mismo estado JSON que la misma continuación sin restaurar.

La siguiente parte de fase 34 sigue siendo el coordinador que aparca la autoridad de origen, crea el mapa vecino con su perfil geográfico, y asigna una sola autoridad a personas y bienes. Esta pieza por sí sola no compacta ni materializa una banda.
