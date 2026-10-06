# M15 32a — Línea `DEMOGRAPHY` congelada

Medido el 2026-10-06 sobre `dcc6066` (árbol limpio salvo `docs/notes_for_m15.txt`),
con `npm run sim:seeds -- --scenario <s> --seeds 20`. Salidas completas:
`artifacts/verification/m15-phase32a-demography-2026-10-06/` (local, ignorado por Git; la tabla de abajo es el registro versionado).

Es **la referencia contra la que se calibran `lod-matches-detail` y
`peoples-match-bands`, no un objetivo**: la línea es mala (ver abajo) y se
congela tal cual para que el LOD no se calibre contra una demografía que ya no
existe. No se tocó ningún umbral ni código del juego.

| | `century` (4 años, 40.000 pasos) | `generations` (144.000 pasos) |
|---|---:|---:|
| Supervivencia media | 68,2% | 53,6% |
| Colapsos (<25%) / extinciones | 1/20 / 0/20 | 5/20 / 1/20 |
| Nacidos | 516 | 834 |
| Hijos por mujer fértil | 2,345 | 3,296 |
| Hijos por mujer-año | 0,898 (574,4 mujer-años) | 0,841 (992,0) |
| Mortalidad <1 año | 0,188 (85/452) | 0,148 (119/802) |
| Mortalidad <5 años | 1,000 (213/213, 303 sin seguimiento) | 0,621 (440/709, 125 sin seguimiento) |
| Edad media al morir | 14,9 a (502 muertes) | 13,6 a (949 muertes) |
| Tecnologías medias al final | 4,0 | 8,2 |
| Tiempo | 2.042 s | 6.799 s |

Causas (agrupadas): `century` — inanición 331, exposición 96, asesinato 48,
vejez 14, deshidratación 6, hemorragia 4, infección 3. `generations` —
inanición 608, exposición 145, asesinato 146, vejez 25, deshidratación 12,
infección 7, hemorragia 6.

## Cómo leerlo

- **`century` no sirve para mortalidad <5**: el 1,000 es el de los pocos nacidos
  con cinco años de seguimiento en una corrida de cuatro. `generations` es la
  referencia para <5 y para tendencia tecnológica.
- La inanición es ~65% de las muertes en ambas; la mortalidad infantil sigue
  siendo la deuda de supervivencia abierta (`bugs.md`). Congelar la línea no la
  arregla ni la declara aceptable.
- Las dos son cohortes de una sola configuración con nombres de semilla fijos;
  una diferencia de menos de ~10 puntos entre builds no se resuelve con ellas.
- Coste: ~2 h entre las dos. No son una comprobación de ciclo corto; se repiten
  al cerrar bloque, no por commit.

## Pendiente de 32a

Distribución entre asentamientos, percepción sin wrapper y cohortes de
visibles/compactos/agregados, que necesitan los modelos de 32b/32c.
