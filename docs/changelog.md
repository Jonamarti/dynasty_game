## 2026-11-02 — 0.16.24-alpha: shelters require physical entry

- Fixed autonomous `shelter` actions that could credit a completed walled hut while the NPC remained on its wall/doorway tile. Covered interiors now use the same `isUnderRoof` predicate as sleeping and warmth; open windbreaks retain their existing proximity rule.
- Added three deterministic regression cases in `m16-shelter-interior-arrival.test.ts` and registered them in the fast unit gate.
- No RNG, seed, save, or baseline changes. CI must compare all scenario matrices with the existing inherited reds; the correction is not automatically accepted if other checks regress.

