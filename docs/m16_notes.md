# M16 — Notas diferidas durante M15

## Hierro: sensibilidad y calibración (2026-10-08)

- La difusión entre pueblos cambia al ampliar el catálogo: 40c pasaba,
  40d midió 0,65 frente a <0,6, 40e volvió a pasar y 40f mide 0,81.
  Investigar `people-knowledge.test.ts` y el mecanismo de contacto/aprendizaje
  antes de ajustar tasas o aserciones. El catálogo es una hipótesis de
  sensibilidad, no una causa adicional aislada en este pase.
- `sim:check` conserva los fallos previos `cravings-steer-the-diet` y
  `perf-budget`; no se atribuyen al arado ni a las recetas de hierro.
- Las cargas cortas prueban extracción, recetas y siembra/cosecha suministradas.
  Queda medir suministro autónomo, adopción de herramientas/arado, costes y
  excedente económico. Las cohortes y escenarios largos siguen diferidos;
  ejecutar esas mediciones solo con la autorización indicada en AGENTS.md.
- El tiro reserva dos cabezas del ganado abstracto del corral. No hay aún
  individuos domésticos con especie, sexo/edad y animación de yunta.

Detalle funcional y resultados: [m15_phase40_iron.md](m15_phase40_iron.md).

### 2026-10-09 — Tras implementar el motor compacto de banda

Medición corta reproducible: `tools/compact-food-rates.ts`, informe
`m15_compact_food_rates_20261009.json`: raciones por jornada productiva, no por
habitante ni por jornada con viaje. Conserva n/a estacional y contexto real;
no usarla como pronóstico por bioma. Calibración pendiente de LOD paso 4:
reservas/ingesta, flujo de leche (el reloj de hambre infantil no mide calorías
retiradas), agua y fuentes por estación, con negativos contra el detallado.
Las cohortes y matriz pesada permanecen diferidas hasta autorización expresa;
los fallos craft/delta y difusión ya documentados no se convierten en pases.

### 2026-10-09 — Tras cerrar la implementación de frontera (fase 34)

ComarcaOffmapRuntime alimenta desde artículos realmente debitados y trabajo sobre nodos, comparte demografía y conocimiento y conserva JSON parcial. Medir correspondencia por estación y agua antes de calibrar el 25 % de trabajo, buffer de dos días y cuotas iguales. Integrar trabajo agrícola, procesamiento y construcción fuera del mapa con los ledgers ya existentes; los cultivos actuales sí envejecen. La fauna sigue un calendario por tick para respetar su stagger; medir y reducir el coste de varias comarcas/años en el paso de LOD, sin convertir la observación de una pose en FPS. Ejecutar la cohorte con mapa de fission-happens y la puerta anual de sequía solo cuando se autoricen esas mediciones. Los controles cortos de mecanismo pasan; no sustituyen esas cohortes. Mantener las dos aserciones heredadas de correspondencia/difusión y los fallos craving/perf visibles hasta investigar su causa.

### 2026-10-09 — Tras cerrar la funcionalidad de transporte (fase 35)

- El ticket abstracto avanza cuerpos, provisiones, deterioro y encuentros de viajeros. Integrar residentes/ecología de destino y LifeSystem.daily/nacimientos/lactancia sin doble autoridad ni doble stock.
- Admitir avance en bloque cruzando la llegada: nueve steps de origen para ruta de ocho dejan el ledger en 9 y el destino en 8. El juego llama advancePeoples después de cada step; esa cadencia es ahora contrato explícito, no una solución del avance arbitrario.
- La tabla carece de preserving/secadero/pemmican pese a lo afirmado por el plan de fase 15. Se mide deterioro de bayas contra avellanas en tránsito; no se calibra suministro autónomo ni se añade aún un peso económico al consenso.
- Cohorte migrants de veinte semillas, sim:check:all y puerta anual lod-matches-detail diferidas por AGENTS.md. No atribuir mejora económica a mecanismos focales.
- Suite completa: difusión con contacto sostenido conserva su fallo (0,68 frente a <0,6; la referencia inicial era 0,81). Craft/delta pasa en este build sin ajustar su prueba; no afirmar que se resolvió el mecanismo de correspondencia. sim:check mantiene los fallos de cravings y perf.
