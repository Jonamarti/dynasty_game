# M15 phase 14c — pockets on worn garments

`ItemDef.garment.pocket` adds a small, item-class-limited carrying allowance to
the owned garment in its canonical worn slot. The first pocket garments are
the sewn tunic (4), fur coat (2), toggled coat (4), and linen tunic (4). A
packed garment grants no room, and a stale slot without an owned garment grants
none. Pockets accept only items whose existing `ItemClass` is `small`.

Pocket capacity extends the existing aggregate load and the existing per-item
limit for small objects. It does not assign any stack to a particular pocket.
Inventory remains the only contents ledger, so checkpoints retain pocket room
by retaining the worn item and its ownership. The Kit load display already
reads aggregate capacity and reflects it without a separate pocket panel.

Changing clothes runs the normal carry reconciliation. If taking off a pocket
or replacing it with a smaller one leaves too many items, excess is dropped at
the person's feet as a real pile. Losing ownership of the last garment copy
clears its stale equipment reference before reconciliation, with the same
conservation behavior. Wearing a packed copy is not itself a pocket: the worn
reference must match the garment's declared body slot and the person must still
own it.

Focused simulation coverage is in `src/sim/__tests__/garment-pockets.test.ts`:
capacity gates, small-only acceptance, ownership loss, smaller-pocket swaps,
takeoff through the committed action, overflow conservation, and checkpoint
restoration. `e2e/garment-pockets.spec.ts` captures the Kit showing a worn linen
tunic and its increased load limit in
`artifacts/screenshots/m15-phase14c-garment-pockets-2026-10-11/`.

This adds carrying capacity only. It does not track which particular item sits
inside which physical pocket, protect pocket contents from spoilage, or add
creature-specific capacity and wear to garments; those need a separate item
ownership model.

The pocket allowance represents small sewn or tied pouches attached to clothing, as specified by the plan. Existing firstKnown dates identify the clothing technology, not an independently established date for these attached pouches; this slice adds no new historical dating claim.

## Verificación — 2026-10-11

Typecheck pasa. La regresión focal de ropa, carga y checkpoints termina 48/48 en siete archivos; el navegador focal comprueba vestir, capacidad 6/14, retirada, capacidad 4/10 y conservación de cinco sílex entre inventario y suelo. Sus dos capturas se inspeccionaron en la carpeta fechada de esta entrega.

La suite unitaria completa (285 archivos, 2.062 casos) dio 2.052 correctos, nueve fallidos y uno omitido en 506 s. Siete fallos reproducen los mecanismos heredados: correspondencia compacta, actividad del contador de comida, diggers, difusión, tributo, conspiración y sed. El octavo era la premisa antigua de toggled_coat que no esperaba pocket: 4; actualizada conforme al plan, esa aserción original y los otros focales pasan. El noveno fue un timeout de continuidad del guardado en 15.000 ms bajo ejecución concurrente. La misma prueba, con idénticas aserciones y límite, pasa aislada en 9,83 s. No se repite ni se describe como verde la suite completa.

El chequeo normal de una semilla mantiene cravings-steer-the-diet y perf-budget (2/147). No se ejecutan cohortes, generations/century ni sim:check:all; no se afirma mejora de economía ni supervivencia. Informes en artifacts/verification/m15-14c-heat-2026-10-11/. Los intentos iniciales interrumpidos no cuentan como ejecuciones completas.

El navegador completo terminó 157/159 en 12,8 min. El fallo de niebla de smoke.spec.ts:326 es el antecedente ya medido; el de bolsillos era una carga inicial de cinco sílex antes de vestir, que la reconciliación bare-handed reducía correctamente a tres. La preparación coloca los dos adicionales después de vestir y añade una retirada real: la focal pasa sin cambiar las capacidades esperadas. No se repite la lista completa después del arreglo. Las capturas históricas generadas por la lista amplia se restauraron desde Git; sólo las dos capturas nuevas de esta entrega se incorporan al commit.
