# M15 phase 14c — Clothing sub-web

The existing `clothing` technology now opens the Clothes web. Its gate keeps
the main-web label **Clothing** (Spanish **Vestido**); the separate sub-web
label is **Clothes** (Spanish **Ropa**), so the door and the destination are
visibly distinct.

The web groups `tailoring`, `spinning`, `weaving`, `foot_wraps`, `leggings`,
`moccasins`, `fur_hat`, `toggles`, `linen_tunic`, and `wool_cloak`. Phase 14c
classifies the four earlier garment recipes `foot_wraps`, `leggings`,
`moccasins`, and `fur_hat` as `craft` nodes. The later clothing craft nodes
retain their existing `craft` tier. `wool` remains in Domestication.

Real material knowledge remains an upstream prerequisite: spinning needs
cordage, weaving needs spinning and basketry, and the wool cloak needs wool.
The web layout filters outside edges from its drawing, so its reachability
check admits an external starting point only when a member's actual `requires`
list names it. No prerequisite was added merely to draw an edge to the gate.

The Spanish browser test opens the gate, checks the localized `Ropa` title and
breadcrumb, verifies the relocated recipe nodes, and captures the opened web
at `artifacts/screenshots/m15-phase14c-clothing-web-2026-10-10/01-red-de-ropa.png`.

Validation: typecheck passed; the focused technology and web-layout files
passed 57/57 tests. The focused Playwright case printed `ok 1` and wrote the
capture, but its local runner stayed in teardown until interrupted. The
parent's separate Playwright regression then completed the clothing-web case
1/1 against the same release state and confirmed the capture.
