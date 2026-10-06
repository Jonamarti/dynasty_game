# M15 fase 13 — Sub-redes de tecnología

Plan: [m15_plan.md](m15_plan.md), «Fase 13». Una sección por entrega.

## 13a — Datos y reubicación (2026-10-06, bit-idéntica)

**Qué se quería.** Dar a cada técnica una red (`web`) y a cada puerta la red que
abre (`opens`), y mudar a su sub-red lo que ya existe y es variante de su
puerta, cambiando solo `web`. La simulación no lee `web`, así que no cambia.

**Qué se hizo (`src/sim/knowledge/Tech.ts`).**

- `WebId = 'main' | 'arms' | 'field' | 'domestication'`; `WebDef { id, label,
  gate, color }`; `WEBS: Record<WebId, WebDef>` (incluye `main`, con `gate:
  null`); `SUB_WEBS: WebDef[]` (las que tienen puerta, en orden).
- `TechDef.web?: WebId` (opcional; ausente = `'main'`, así las ~50 técnicas que
  no se mueven no ganan una línea) y `TechDef.opens?: WebId`. Se lee con
  `webOf(tech)`; `techsOfWeb(web)` da las técnicas de una red en el orden de
  `TECHS`.
- Solo se declaran las redes que se abren ahora (regla «nada declarado e
  inerte»). Ropa, Conservación, Fuego, Tierra y Metal no existen todavía como
  `WebId`, y ninguno de sus nodos se movió.
- Etiquetas por `t()`: `Main web`/`Weapons` nuevas en `src/i18n/es/tech.ts`
  (`Field` y `Taming` ya tenían español); `src/i18n/tables.ts` las registra.
  `TechWeb.ts` no se toca: la red principal sigue dibujando todos los nodos
  (la pantalla es 13c).

| red | puerta (`opens`) | color | nodos mudados |
|---|---|---|---|
| `main` | — | `#9aa4b2` | todo lo demás |
| `arms` (Armas) | `spear` | `#c9694b` | `bow`, `atlatl` |
| `field` (Campo) | `farming` | `#8fb35a` | `composting`, `sickle`, `calendar`, `arboriculture` |
| `domestication` (Doma) | `taming` | `#c9a34b` | `herding`, `dairying`, `wool`, `dog` |

**Cómo se verificó** (en un contenedor Linux en la nube, con el sustituto
esbuild/shim de vitest; no se ejecutó `npm test` ni `npm run e2e`).

- Tests primero (`tech.test.ts`, «the sub-webs»): fallaban por import
  inexistente; ahora pasan. Comprueban que toda puerta está en `main`, que todo
  nodo de una sub-red requiere su puerta directa o transitivamente, que ninguna
  sub-red tiene menos de dos nodos, que todo `web`/`opens` apunta a `WEBS`, y que
  cada puerta tiene `opens` igual a su red y ningún otro nodo lo tiene.
- Hashes SHA-256 de `JSON.stringify(toCheckpointRecord(sim))` (script
  `classic-hashes.ts`, el de la fase 29 con semilla `phase13a` y un tick más) para
  las semillas `band`, `century` y `phase13a` en los ticks 0, 180, 500 y 1500:
  **12/12 coinciden** antes y después (`hashes-before.json` = `hashes-after.json`,
  `cmp` sin diferencias).
- `tsx tools/headless.ts --scenario band|hearths|craft` antes y después: todas
  las líneas coinciden salvo las de tiempo (`steps/s`, `ms`). Fallos de base,
  idénticos antes y después: `band` 2/137 (`cravings-steer-the-diet`,
  `perf-budget`); `hearths` y `craft` conservan sus fallos de siempre
  (`perf-budget` siempre en esta máquina lenta).
- `tsc --noEmit` limpio. Suite completa con el sustituto: 158 archivos, 1.100 tests (1.094 de base + 6 nuevos), todos pasan (`unit-full.log`; un test supera los 5 s en esta máquina lenta, `earthwork-checks`, ajeno a esta fase).
- Artefactos: `artifacts/verification/m15-phase13a-20261006/`.

## Dudas abiertas

1. **Cocina no se abre en 13a.** La tabla del plan supone que el asado, `bread` y
   `brewing` son variantes de `cooking`, pero hoy: el asado (fase 3) es una
   receta (`roast_meat`, `roast_fish`), no una técnica, así que no hay nada que
   mudar; `bread` requiere `grinding`, `farming` y `firemaking`, y `brewing`
   requiere `pottery` y `farming`, y **ninguna de las dos requiere `cooking`**,
   ni directa ni transitivamente. Mudarlas rompería la regla «todo nodo de una
   sub-red requiere su puerta», y cambiar sus `requires` sería un cambio de
   comportamiento. Quedan en `main`, y Cocina (0 nodos) no se declara ni se abre.
   13d trae `stone_boiling` y `flatbread` (ambos con `cooking`): ahí hay dos nodos
   y puede abrirse; qué hacer con `bread` y `brewing` (¿añadirles `cooking` como
   requisito, medido?) lo decide el propietario o 13d.
2. **Ropa (`tailoring`, `spinning`, `weaving`)** se queda en `main` hasta la fase
   14, como dice la tabla. Además `spinning` y `weaving` solo requieren
   `cordage`, `spinning` y `basketry`; ninguna requiere `clothing`, así que
   tampoco podrían mudarse a Ropa sin tocar `requires` (`tailoring` sí requiere
   `clothing`).
3. `irrigation` y `pack_animals`/`horse_riding` no existen aún (fases 26 y 35):
   nada que mudar. `arboriculture` (fase 24) y `dog` (fase 23) sí existen y se
   mudaron a Campo y Doma.
4. Los ids de red (`arms`, `field`, `domestication`) son nombres internos
   elegidos aquí; las etiquetas visibles son «Armas», «Campo», «Doma».
