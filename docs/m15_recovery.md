# M15 fase 1c — recuperación y ablaciones

Mediciones en curso. Los artefactos completos de estas cohortes están en
`artifacts/m15-1c-*.txt` (carpeta local ignorada por Git).

## `lean`, 20 semillas

| Variante | Supervivencia | Colapsos | DEMOGRAPHY: muertes y causas | HOME: noche cerca / sueño; niño >12 | KIN: defensa observada |
|---|---:|---:|---|---|---:|
| M15 actual, reglas activadas | 50,6% | 4/20 | 698: starvation 533, dehydration 80, exposure 49, murder 22, old age 14 | 67,8% / 8,3%; 23,0% | 0/0 |
| Todas las reglas apagadas | 56,0% | 0/20 | 703: starvation 237, dehydration 215, exposure 51, murder 184, old age 16 | 46,4% / 0%; 57,3% | 0/0 |
| Solo `reachFilter` apagado | 57,2% | 1/20 | 649: starvation 497, dehydration 83, exposure 30, murder 24, old age 15 | 68,8% / 8,4%; 22,7% | 0/0 |
| Solo `nightSleep` apagado | 53,9% | 4/20 | 716: starvation 305, dehydration 57, exposure 318, murder 22, old age 14 | 69,3% / 0%; 30,7% | 0/0 |
| Solo `homePressure` apagado | 61,7% | 5/20 | 559: starvation 435, dehydration 15, exposure 20, murder 74, old age 15 | 56,5% / 5,7%; 31,5% | 0/0 |
| `homePressure` y `reachFilter` apagados | 83,9% | 0/20 | 320: starvation 220, dehydration 12, exposure 25, murder 47, old age 16 | 55,5% / 5,5%; 41,4% | 0/0 |
| Solo `kinDefence` apagado | 50,6% | 4/20 | 698: starvation 533, dehydration 80, exposure 49, murder 22, old age 14 | idéntico al control | 0/0 |
| Fallback de comida fuera del alcance, M15 1d | 56,0% | 1/20 | 671: starvation 511, dehydration 96, exposure 25, murder 25, old age 14 | 68,4% / 8,8%; 22,7% | 0/0 |
| Suprimir `go_home` sobre la línea de trabajo (experimento revertido) | 56,8% | 2/20 | 584: starvation 504, dehydration 7, exposure 21, murder 36, old age 16 | 67,0% / 8,5%; 25,4% | 0/0 |

HOME recoge también distancia diurna, percentiles infantiles y acciones en los
archivos completos. KIN no tuvo ataques infantiles observados en ninguna de
estas tres cohortes; `0/0` es ausencia de muestra, no una defensa aprobada.

## Puerta pendiente

- La regla activada queda por debajo de la puerta `lean` de 60,9%.
- Todas apagadas dan 56,0%, **9,9 puntos por debajo** de la base M13 de 65,9%:
  excede el margen de cinco puntos y viola la regla de ablación. No se debe
  atribuir ese resto a ninguna regla de M13 sin una cohorte individual.
- Apagar solo `reachFilter` mejora 6,6 puntos y reduce los colapsos de 4/20 a
  1/20; es una señal para repetir en `century` y `crowded`, no una explicación
  cerrada ni una calibración de parámetros.
- Apagar solo `nightSleep` reduce la supervivencia 3,3 puntos y cambia la causa
  más fuerte de muerte hacia exposición (318 frente a 49 con las reglas
  activadas). Confirma el mecanismo de frío sin explicar la brecha total.
- Apagar solo `homePressure` mejora la supervivencia 11,1 puntos y reduce las
  muertes por hambre/sed (533/80 a 435/15), aunque las violentas suben de 22 a
  74 y hay 5 colapsos frente a 4. Es consistente con tiempo de recolección
  perdido al volver al campamento, pero requiere medir acciones y repetir otros
  escenarios antes de declararlo causa.
- Apagar `homePressure` y `reachFilter` juntos da 83,9% (0/20 colapsos), un
  efecto combinado muy superior a cada ablación sola. Mecanismo candidato:
  el scorer atrae a la gente al ancla y después filtra recursos lejanos cuando
  aún no está en su umbral de hambre crítica; la combinación podría quitarle
  los recursos que tendría que recorrer para mantener su despensa. La regla de
  reach deja de aplicarse al forraje cuando el hambre ya es urgente, así que el
  detalle necesita instrumentación antes de corregirlo.
- Apagar solo `kinDefence` queda bit-idéntico al control en `lean` y también
  registra 0/0 en KIN. No hubo ataques infantiles que pudieran activar la regla.
- El fallback de alimento elevó la supervivencia 5,4 puntos, pero quedó en
  56,0%, por debajo de la puerta. Las muertes por hambre bajaron 22 (533 a
  511), mientras subieron las de sed de 80 a 96. Se activó 267.795 veces en la
  cohorte. Hay señal sobre la búsqueda, pero no basta para declarar la fase
  recuperada.
- La prueba de ceder `go_home` al superar la línea de trabajo solo elevó la
  supervivencia 0,8 puntos sobre el fallback (56,8%) y produjo 2/20 bandas
  autodestruidas más 0,522 asesinatos intrabanda por 1.000 personas-año. Se
  revirtió y no forma parte del build actual.
- En una comparación diagnóstica separada de 5 semillas, el filtro descartó
  88.722 candidatos en el control y cero cuando `reachFilter` estaba apagado;
  este último dio 58,8% frente a 50,7%. Al apagar también `homePressure`, la
  supervivencia fue 81,4% y las oportunidades accesibles aumentaron a 649.918.
  Estas muestras cortas explican el mecanismo pero no sustituyen las cohortes
  de 20 semillas.
- Faltan las otras nueve ablaciones individuales y las repeticiones en
  `century` y `crowded`. La fase 1c y la fase 1e siguen abiertas.
