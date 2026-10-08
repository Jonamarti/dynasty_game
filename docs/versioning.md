# Versiones públicas

El campo `version` de `package.json` es la única fuente del número mostrado en
el juego y de la versión npm.

- M15 usa `0.15.0-alpha`; M16 usará `0.16.0-alpha` mientras aún se añaden
  funcionalidades. Al cerrar M16, el plan es pasar a `0.16.0-beta`.
- Las correcciones entre hitos incrementan el parche, por ejemplo
  `0.15.1-alpha`.
- `1.0.0` se reserva para el lanzamiento público.
- Los despliegues muestran `v<versión> (<hash corto>)`. Vite obtiene el hash
  del commit comprobado; `GITHUB_SHA` o `SOURCE_COMMIT` permiten fijarlo en CI.
  Si una compilación desde archivo fuente carece de Git y de ambas variables,
  el menú muestra `unknown` para que la ausencia del identificador sea visible.
- Al cerrar cada hito se crea un tag `v<versión>` en el commit de cierre, nunca
  en cada commit ni despliegue. El plan retroactivo es etiquetar los cierres
  localizables de M1–M15 como `v0.1.0`–`v0.15.0`. M15 aún necesita cerrar la
  calibración final de fase 41.

El changelog del repositorio vive en `docs/changelog.md`; cada cambio registra
la versión y el hito correspondiente para mantener una sola cronología.
