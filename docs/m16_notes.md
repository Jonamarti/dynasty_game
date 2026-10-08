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
