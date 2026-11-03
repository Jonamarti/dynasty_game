## 2026-11-03 — M16 0.16.25-alpha — no perder manadas conocidas si un recuerdo está obsoleto

**Problema:** el buscador leía únicamente la manada recordada más cercana; al no quedar una presa de esa especie en la posición recordada, devolvía null aunque existiera otra manada conocida y accesible. La PR #45 aislaba la identidad por especie pero mantenía este bloqueo.

**Causa:** se aplicaba `nearestAny` a la memoria sin comprobar si el recuerdo podía resolverse a una presa viva y compatible antes de elegirlo.

**Cambio:** `findRememberedHerdQuarry` filtra memorias por presas vivas compatibles y alcanzables a través de índices espaciales. Mantiene la prioridad de la presa visible, límites territoriales, distancia, especie y ausencia de nuevos RNG draws. La baseline permanece intacta.

**Verificación:** añadidas pruebas de memoria válida, recuerdo obsoleto con alternativa, especie incompatible y presa inaccesible/fuera de rango; registradas en `check:fast`. **Pendiente GitHub CI y comparación de los cuatro shards** con el master del mismo momento; ninguna regresión nueva se acepta sin análisis. PR #45 se mantiene draft.

## 2026-11-02 — M16 0.16.24-alpha — memoria de manadas por especie

- Corregida la selección de presas a partir de memoria lejana: un recuerdo `herd:deer` solo permite buscar ciervos, no otra especie que hoy ocupe la misma casilla.
- Se conserva la búsqueda de presas visibles, el radio y la necesidad de proximidad del recuerdo. Sin nuevos draws RNG ni cambios de formato de partidas.
- Regresión: `m16-remembered-herd.test.ts` se ejecuta en `check:fast`; comparar matrices y cohorte frente al mismo `master` antes de integrar. No modificar la baseline ni dar por corregida #18 sin evidencia del escenario real.

