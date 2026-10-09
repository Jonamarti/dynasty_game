# M15 fase 34 — política de migración entre comarcas

`ComarcaMigration.ts` es la política pura compartida por la decisión diaria de banda y el verbo `propose` del jugador. No realiza el traslado, no reubica el campamento local ni posee inventarios; el único propietario de una travesía es el coordinador de frontera.

## Contrato

La jerarquía fija de motivos es: falta de agua dulce, hambre crónica, vecino más fuerte hostil, población por encima de la capacidad diaria de la comarca y destierro. `chooseMigrationReason` hace que el orden de entrada no cambie qué motivo explica una salida. La banda vota con presión crónica/currentánea de la necesidad que ese motivo alivia; un adulto con presión ≥0.22 apoya, o con ≥0.14 si su regard por quien propone es ≥12. El proponente cuenta como voto afirmativo. Hace falta mayoría estricta.

El destino debe ser una comarca adyacente presente en `knowledgeOfWorld(proposer)`. `canEnter` solo veta por viabilidad física; nunca añade un lugar desconocido. Si no queda destino conocido, `scoutDirection` ofrece el primer borde adyacente físicamente posible en el orden N/E/S/O, sin leer el contenido de esa comarca. El coordinador registra el conocimiento únicamente cuando vuelve una persona que realmente exploró.

`canFollowMigration` excluye niños, cautivos, gente ya comprometida y necesidades físicas que el motivo no resuelve. Sed elevada no impide salir por falta de agua y hambre elevada no impide salir por hambre; el control normal de frío permanece. La aprobación del grupo es distinta de obedecer una orden: cada seguidor debe pasar por `command`/`follow_me`, que aplica la autoridad normal. El ID de cada viajero es explícito para que una propuesta aprobada no arrastre a todos los habitantes por defecto.

## Límite del motor detallado

`BandSystem` emite una propuesta aprobada al callback de frontera y no cambia `Person.bandId`, IDs de banda, coordenadas de campamento ni inventario. Si el actor no conoce vecinos, pide una exploración en un borde transitable. El coordinador mantiene una sola autoridad sobre roster y bienes, transporta solo inventario portable autorizado y deja edificios, caches y demás estado en el `TileLedger` de origen. El paso de scout requiere completar el retorno/observación; una salida fallida no enseña qué hay al otro lado.

Solo el cruce marcado como migración aprobado provoca una fisión después del traslado de staging: si quedan miembros en origen, la party recibe un ID global nuevo y hereda norms, regard, jefatura y relación positiva con la banda madre; una banda completa que se muda conserva su ID. El viajero ordinario conserva su banda. La regla de standing +60 y el umbral de consenso son decisiones de diseño explícitas, no coeficientes calibrados.\n\nLas pruebas focales cubren prioridad, voto de mayoría, control negativo con agua disponible, veto de destinos desconocidos, y propuesta/salida a scout desde `BandSystem`. El fixture de fisionado usa `Simulation.transferTravellersTo` y el helper real sobre dos rosters: comprueba ID de hija distinto, miembros que quedan en cada lado, conservación exacta de personas y parentesco. La fase permanece abierta hasta que el coordinador marque y dispare solo cruces migratorios, y se validen las puertas `drought`, `the-thirsty-leave` y `fission-happens`.
