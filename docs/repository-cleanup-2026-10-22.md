# Limpieza local de Dynasty — 2026-10-22

## Resultado de la revisión

Petición del propietario: recuperar espacio, integrar desarrollos pendientes y
retirar las ramas y copias de trabajo ya integradas. Base revisada: `master`
en `610d9441` (`0.16.18-alpha`).

- `../dynastyGame-art` era un worktree de este mismo repositorio, limpio y
  detenido en `16355901`, antepasado de `master`. Sus generadores y su
  documentación ya estaban integrados.
- Se retiraron los 38 worktrees adicionales: 22 bajo `.codex/worktrees`,
  cinco bajo `.claude/worktrees`, diez bajo `.wt` y la copia de arte.
  El inventario suma 6.548.620.058 bytes de archivos; la asignación real en
  disco puede ser mayor por el número de archivos pequeños.
- Se eliminó la rama local `m16`, que apuntaba al mismo commit que `master`.
  Queda un único worktree y una única rama local: `master`.
- No se encontró funcionalidad pendiente que hubiera que portar. Los cambios
  locales previos del checkout principal se conservan: notas, capturas y el
  documento de traspaso del 18 de octubre.

## Cómo se comprobó la integración

No bastaba con comprobar antepasados: 22 worktrees tenían commits originales
integrados posteriormente mediante cherry-pick o adaptación. De sus 56 commits
distintos, 51 coinciden por `patch-id` de código, arte, herramientas y E2E con
commits de `master`, excluyendo cambios de documentación y versión.

Los otros cinco se compararon por contenido:

| Original | Integración en master | Diferencia revisada |
| --- | --- | --- |
| `90b08d17` | `a505d9fc` | Consumo atómico de prendas; la integración conserva además la telemetría de procesamiento de alimentos. |
| `6b2d12fd` | `2175baec` | Mismas líneas añadidas y eliminadas; cambia el contexto del parche. |
| `cec09640` | `28122543` | Hogar autónomo; la prueba usa `splice` para respetar la propiedad readonly de los participantes. |
| `c36aee9c` | `24294611` | Hogar interior; los manifiestos y atlas generados reflejan otros elementos ya integrados. Generadores y lógica equivalentes. |
| `fcb642dc` | `52c8febf`, `4fc2b863` | Murallas integradas sobre las obras de tierra actuales, con puerta, conectividad y coste del rodeo en incursiones. |

El worktree `m15-hide-dressing` tenía modificaciones sin commit. Sus cambios
de transferencia física de prendas ya están en el código actual. Sus tres
pruebas sin registrar tienen equivalentes en `garment-condition.test.ts`
(entrega directa y regalo) y `comarca-inventory-transfer.test.ts`
(serialización y restauración). Se conserva igualmente el parche original y
el archivo de pruebas en la recuperación.

## Recuperación conservada en esta máquina

Carpeta: `artifacts/cleanup-2026-10-22/` (ignorada por Git).

- `recovered-assets.zip`: 45.801.048 bytes. Contiene 381 objetos únicos de
  capturas y otros artefactos, el parche binario de los cambios sin commit y
  el archivo de pruebas sin registrar. CRC comprobado.
- `recovery-index.json`: relaciona cada ruta original con su objeto dentro
  del ZIP. Los archivos cuyo contenido ya está en `master` se identifican por
  su blob de Git y no se duplican en el ZIP.
- `original-worktree-history.bundle`: 2.169.217 bytes. Conserva los originales
  de los historiales adaptados; `git bundle verify` pasa. Requiere los
  antepasados que este repositorio ya contiene.
- `audit.json`, `patch-audit.json`, `manual-source-comparison.log` y
  `removed.jsonl`: inventario, equivalencias, comparación manual y registro
  de las retiradas.

Para recuperar un archivo único, buscar su ruta en el índice y extraer del ZIP
la entrada `archivePath` bajo el nombre original. Para uno ya integrado, usar
`git cat-file blob <blob>`. El parche sin commit está en
`patches/m15-hide-dressing.patch` y las pruebas en
`untracked/m15-hide-dressing/src/sim/__tests__/garment-transfer-routes.test.ts`.
Son material histórico: revisar compatibilidad antes de aplicarlo a `master`.

Para examinar un historial original:

```powershell
git bundle list-heads artifacts/cleanup-2026-10-22/original-worktree-history.bundle
git fetch artifacts/cleanup-2026-10-22/original-worktree-history.bundle refs/cleanup-backup/<id>:refs/heads/recovery-<id>
```

## Comprobaciones de limpieza

Antes de retirar cada directorio se validaron la ruta absoluta, el HEAD y su
estado local. Se inspeccionaron recursivamente los directorios: no había
junctions, enlaces de sistema de archivos ni repositorios anidados. Los
artefactos únicos se archivaron antes de ejecutar `git worktree remove`.

Después, `git worktree list` y `git branch --list` sólo muestran el checkout
principal en `master`; `git fsck --connectivity-only --no-dangling` pasa.
Se compacta Git con `git gc` y sus plazos normales de conservación. No se
cambia código ni se ejecuta la simulación por esta limpieza. No se hace push.
