# M15 28 — Libros de ejecución retenidos

2026-10-03. `LedgerRecords.ts` añade un sobre JSON v1 para el estado retenido
que no pertenece a una persona, hogar, banda, objeto del mundo, reloj o stream
RNG. Es un componente inerte del checkpoint; todavía no carga estos valores en
una `Simulation` viva ni coordina autoridad.

El sobre conserva en un solo tick el jugador y el modo de autonomía, la
sucesión pendiente, avisos de acciones detenidas y usos vigilados, llamadas de
ayuda e ideas, permisos territoriales con su día de caducidad, los eventos ya
contados para feudos, casos pendientes, avistamientos, reserva y fauna inicial
del borde, la secuencia preferida de manadas, normas y consideración de
extraños por banda, y el historial reciente de eventos sociales. Conserva
además el mapa de jefes y los ledgers persistentes de deliberación de
`BandSystem` (avance de asentamientos, consideración de incursiones, escasez,
golpes de estado y tributo) y los nacimientos fraccionarios que
`WildlifeSystem` debe a cada manada. Conserva los conjuntos de tecnologías,
holders y templos que usa el paso actual; aunque se recalculan por día, sus
valores entre fronteras de día todavía gobiernan decisiones y consultas.

Las referencias a personas viajan como IDs. `fromLedgerRecord(record,
peopleById)` las resuelve contra el archivo canónico de `RosterRecords`, para
que el jugador, herederos y testigos de propiedades sigan siendo el mismo
objeto. Se exige esa tabla si el sobre incluye una referencia a persona. Los
dos sellos de avance son tick y día; el día permite validar calendarios no
estándar sin asumir cuántos ticks tiene una jornada. El llamante debe comparar
ambos con el reloj incluido en el checkpoint compuesto.

No se guardan índices reconstruibles ni buffers de paso: hashes espaciales,
cachés de edificios y miembros/nombres/campamentos de `BandSystem`, colecciones
scratch y el presupuesto de rutas de `MovementSystem`. `playerIntent` pertenece a la entrada
del siguiente paso y no a una ejecución ya avanzada. Los hooks entre sistemas
se reconstruyen al crear el motor; este formato no serializa funciones.

Dos pruebas recorren un mundo con calendario de 24 ticks por día y día inicial
7, convierten el sobre mediante JSON, verifican referencias canónicas,
independencia y continuidad de los ledgers; también rechazan versión/campos
desconocidos, días futuros, eventos malformados, personas ausentes y normas
incompletas. El control de eventos duplicados falló en el decoder anterior y
pasa después de rechazar IDs repetidos; evidencia en
`artifacts/verification/m15-phase28-checkpoint-20261003-pass1/duplicate-event-negative.log`
y `ledger-composition-final.log`. No cambia la interfaz. Tour 1/1 y captura
inicial revisada como registro del hito:
`artifacts/screenshots/m15-phase28-ledgers-2026-10-03-pass1/`.
