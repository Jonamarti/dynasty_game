# M15 14c — Wool cloak, 2026-10-10

The `wool_cloak` device requires `wool`, and its ordinary recipe turns two
`wool_cloth` into one cloak. The cloak occupies the existing `cloak` slot and
provides 0.35 warmth while owned and worn. Wearing it replaces a `hide_cape`;
the two cloaks never add warmth together. Taking it off keeps the item.

The generated inventory icon and Spanish item, recipe, technology, and UI
strings ship with the feature. A separate generated cloak variant uses wool's
light natural colour; hide capes keep their darker hide colour.

Verification: typecheck passes; 104 focused tests pass across wool-cloak,
i18n, technology, research, garment recipes and art. Spanish browser e2e
reports 1/1 passed; Playwright's web-server teardown stayed open and was
interrupted after the screenshot was saved. `art:build` and `art:sheet`
complete, and the contact sheet shows both cloaks in front, side and back
views. The Spanish daytime browser capture is
`artifacts/screenshots/m15-phase14c-wool-cloak-2026-10-10/01-manto-de-lana.png`.
