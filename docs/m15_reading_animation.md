# M15 phase 17 — reading an inscription

`read` now uses four quiet attention frames while the reader adds real work to
an inscription. It reuses the generated pondering poses (`o0`–`o3`), so this
small extension adds no duplicate art cells or sprite bytes.

The selector observes only the reader's life state, current action, movement,
and `workedTicks`. It does not inspect the record, its author, its contents,
or the reader's literacy and technology knowledge. Rendering does not advance
reading work or alter RNG.

The focused unit test covers the four frames and confirms the private record
and knowledge fields are never read. Typecheck passed; the focused animation
file passed 73/73, and the full suite passed 2,307 tests across 315 files with
one skipped. The browser spec starts a real `read` order on an inscription
and captures its four rendered frames under
`artifacts/screenshots/m15-reading-animation-2026-10-14/`. Playwright reported
1/1 passed, then remained in teardown and was interrupted.

This is one additional phase 17 action family; it does not close the phase.
