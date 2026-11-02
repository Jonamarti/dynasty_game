## 2026-11-02 — 0.16.25-alpha: shelters require physical entry

- Fixed autonomous `shelter` actions that could credit a completed walled hut while the NPC remained on its wall/doorway tile. Covered interiors now use the same `isUnderRoof` predicate as sleeping and warmth; open windbreaks retain their existing proximity rule.
- Added four deterministic regression cases in `m16-shelter-interior-arrival.test.ts` and registered them in the fast unit gate.
- No RNG, seed, save, or baseline changes. CI must compare all scenario matrices with the existing inherited reds; the correction is not automatically accepted if other checks regress.

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

