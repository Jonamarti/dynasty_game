# M15 34 — avisos acotados al transferir viajeros

2026-10-10. Cada Simulation limita avisos a 32 entradas. El cruce trasladaba
los avisos del viajero a una cola de destino ya llena sin volver a limitarla;
33 interrupciones hacían que LedgerRecord rechazara el propio guardado.

movePersonLedgers conserva las 32 entradas más recientes tras combinar
interrupciones, insights, llamadas de ayuda y usos observados. Los veredictos
pendientes siguen completos: son estado judicial, no una cola de presentación.
Los avisos trasladados salen de la autoridad de origen y quedan en destino.

La regresión falló antes del arreglo con 33 entradas frente a 32. Tras él
pasan cuatro focales de transferencia/codec; comprueban orden, conservación
del aviso entrante y lectura del ledger JSON de destino. No se amplió el
límite del codec. El fallo largo de 400 ticks aún requiere volver a ejecutar
su caso exacto; esta prueba demuestra el mecanismo de fusión que podía causar
el mismo rechazo. Sin cambio UI ni cohortes/matriz pesada.
