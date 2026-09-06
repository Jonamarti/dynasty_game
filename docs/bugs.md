# Known bugs and rough edges

As of 2026-09-02. Everything here is real and reproducible; nothing here is
speculative. Fixed defects are in [changelog.md](changelog.md).

## Reported from play, 2026-09-02 — fixed

Five defects reported by the project owner after M6a. **All five are fixed**;
the diagnosis is section M6c of
[m6_plan_households_sleep.md](m6_plan_households_sleep.md) and the fixes are in
[changelog.md](changelog.md). Regression tests are in
`src/sim/__tests__/orders.test.ts`.

Four of the five were one root cause: the simulation never told the player why
an order stopped. `interruption()` returns eight reasons and `abandon()` a dozen
more, and all of them were telemetry counters only. They now reach a floater and
the panel's action line.

One thing worth carrying forward from that pass: **the berries-versus-flint
asymmetry was not eliminated, and cannot be by tuning.** The interruption
thresholds are absolute need levels, so whether a job is ever interrupted
depends on how long it runs — berries are stripped in 148 ticks and never cross
the line, flint takes 416 and always does. What was fixed is the *consequence*:
interrupted orders are now set aside and picked back up, so the job gets done
either way. If someone later wants the rule itself to be uniform, that is a
redesign of `interruption`, not a coefficient change.

## Fixed in M6b phase 1

### The longhouse was never buildable

`BUILDINGS.longhouse` was gated behind `requiresTech: 'carpentry'` while
`'carpentry'` was not a member of `TECHS`, so nothing could ever satisfy the
gate. The best shelter in the game was unbuildable for its entire existence and
sat permanently in `lockedDesigns()`, which is exactly how it stayed invisible:
a locked design looks like content you have not reached yet. `carpentry` is a
real technology now, and `tech.test.ts` asserts every `requiresTech` in
`BUILDINGS` names one.

## Open — behaviour

### The island supports a population, but only just

**Was the biggest open problem; substantially fixed 2026-09-02.**

`npm run sim:seeds` measures this properly — a single `century` run is too
chaotic to read. Across ten seeds, mean survival over two in-game years went
from **40% to 59%** when the larder gate was fixed, and the two seeds that
collapsed outright (one to two survivors) stopped collapsing. Details in
[changelog.md](changelog.md).

What remains, and it is a different problem from the one that was fixed:

- **Deaths have shifted to adults** — 99 adults against 40 infants across ten
  seeds. Distribution is no longer the constraint; total food is.
- **Redistribution cannot help further.** The `feed` behaviour measurably moves
  deaths from infants to adults without changing the total, which is what you
  would expect: handing food around does not create any.
- The levers left are supply-side — forage density, hunting yield (currently a
  garnish, see below), or a slower birth rate — and each is a design decision
  rather than a tuning one.

Do not attempt to fix this by tuning `interruption()` thresholds or the scorer's
food weights. That ground has been covered and the numbers are in the changelog.

### Hunting is rare

`hunts-succeed-and-fail` reports **n/a** on most scenarios — "too few strikes to
tell". A 3,000-step band run produces about three kills. The chain works end to
end (`people-eat-meat` passes, meat is taken and eaten), but wild meat is a
garnish rather than a food source.

Causes, both deliberate and both probably overtuned:

- A fresh deer is faster than a person and re-alarms whenever a hunter comes
  within its notice radius, so a hunt only ends once stamina is drained.
- Herds are sparse relative to berry bushes, and `Brain` searches only
  `sightRadius * 1.5` for a quarry.

### Courtship nearly stopped after founding families landed

Over two in-game years the `century` scenario went from 177 courtships to
around 8. This was investigated and is **not** the courtship gate — lowering
`opinion > 5` to `> 0` changed the number not at all, and that change was
reverted rather than shipped with a comment asserting a cause the data
contradicted.

The actual cause appears to be demographic: a world founded from married
couples has almost no unmarried adults in it, so there is nobody to court until
the founding children grow up. Marriages still happen (10 over two years) and
births still happen, so this may be correct behaviour rather than a defect —
but it has not been confirmed, and it deserves a look before anyone tunes
courtship.

### Winter still kills the unlucky

Exposure is a leading cause of death in a long run. Bands build more shelter
than they used to (the planner counts floor area now, not roofs), but a band
that loses its builders in one bad season does not recover.

### Exile never fires in practice

`exiled` is 0 across every scenario. The threshold is −28 average opinion with
a quorum of four, and M6a raised the starting point for outsiders from −14 to
−6, so a stranger now has further to fall. Deeds should still dominate, but the
mechanism is currently untested by any run in the suite.

## Open — measurement

### Ten seeds cannot resolve a change of under about ten points

Found during M6b phase 1, and it changes how the food economy should be
measured from here on. Four variants of one change, none of which touched the
food economy deliberately, produced ten-seed mean survivals of 73.1%, 65.2%,
64.4%, 63.6% and 59.3%. At one point a **strictly better** skill-learning rate
measured nine points *worse* than the version it replaced, which cannot be a
mechanism.

Twenty seeds is tighter: 65.7% before the phase against 64.6% after it.

The practical rule: `npm run sim:seeds` at its ten-seed default is only good for
changes the size of the larder fix, which moved 40% → 59%. For anything smaller
pass `--seeds 20`, and never tune against a single ten-seed figure — that is how
you ship a coefficient chosen by noise and a comment asserting a cause the data
does not support.

### Older-child starvation may have risen, and nobody has confirmed it

Over twenty seeds, starvation among children older than five went from 9 to 27
across the phase-1 changes, while infant deaths (80 → 77) and adult deaths (195
→ 195) did not move. That is a large relative change on a small count and it may
well be noise on the same scale as everything above, but it is the one number in
the cohort that moved in a direction worth checking. It has not been
investigated.

## Open — interface

### The panel's work bar is the only thing patched between rebuilds

`Hud.refreshPerson` patches the action line, the need bars, the score table and
the work bar. Everything else in the panel is only correct because the cache key
(`selectionKey`) happens to change. The key now folds in `inventory.version` and
whether a work bar exists; anything else that changes without changing the key
will go stale the same way the Kit tab did. If a future action mutates a pack
many times per tick, the key should become a throttle rather than a raw counter.

### `Camera.following` is public and the tests set it directly

Three e2e specs snap the camera to an off-screen target and set
`camera.following = false` to stop the frame loop dragging the view back. It
works and is honest about what it is doing, but it is a test reaching into
render state.

## Traps that bit during M6a and will bite again

### An author `display` beats the browser's rule for `hidden`

A full-screen overlay styled `display: grid` stays laid out when its `hidden`
attribute is set, and silently swallows every click on the game underneath. The
project had already learned this once — `.succession` carries a comment about
it — and M6a reintroduced it twice, in `.newgame` and `.picker`, which broke
sixteen e2e tests at once with a message about an invisible div intercepting
pointer events.

**Every overlay needs an explicit `[hidden] { display: none; }` rule.**

### `git worktree remove --force` follows directory junctions

Creating a junction from a scratch worktree to the project's real
`node_modules`, then removing the worktree, deletes the real `node_modules`.
Recovering costs an `npm install --legacy-peer-deps`. Do not link into the
project from a directory you intend to delete.

### Two definitions of "in the world"

`simcheck` hand-wrote `person.x > width - 1` while `World.inBounds` uses
`x < width`. Someone standing at x=127.6 on a 128-wide map, on a walkable tile
the movement system had just approved, was reported as having escaped the
island. The check now asks the world. Do not recompute a predicate the
simulation already owns.
