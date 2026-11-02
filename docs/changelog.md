## 2026-11-02 — M16 0.16.24-alpha — memoria de manadas por especie

- Corregida la selección de presas a partir de memoria lejana: un recuerdo `herd:deer` solo permite buscar ciervos, no otra especie que hoy ocupe la misma casilla.
- Se conserva la búsqueda de presas visibles, el radio y la necesidad de proximidad del recuerdo. Sin nuevos draws RNG ni cambios de formato de partidas.
- Regresión: `m16-remembered-herd.test.ts` se ejecuta en `check:fast`; comparar matrices y cohorte frente al mismo `master` antes de integrar. No modificar la baseline ni dar por corregida #18 sin evidencia del escenario real.

