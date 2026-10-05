# M15 phase 27d: swimming and drowning

Swimming connects land regions through contiguous swim-depth water. It is a
slow travel mode: a swim tile costs six times the corresponding land movement
cost, and movement itself runs at one sixth speed. Deep water remains
untraversable on foot. Swimmers learn the appended `swim` skill from successful
steps; new people begin at zero without drawing from their seeded RNG stream.

The swimming gate requires empty hands, no shoulder load, and no baby in arms.
A basket equipped on the back is allowed when all carried items fit its accepted
classes and capacity. Cold or fatigue at `config.world.drownAt` makes a swim
unsafe. Cold and fatigue accumulate faster while swimming, and crossing that
threshold while in swim-depth water deterministically kills the person with
cause `drowned`.

Player orders and AI routes use the same pathfinder and gate. Failed orders and
manual movement refusals report a translated reason. Any travel crossing swim
water, including autonomous drink and food trips, checks the ordinary
interruption rules every tick. The trip exempts the need it is meant to answer
(thirst for drink, hunger for edible harvests), while other urgent needs stop
it visibly and send the swimmer toward the nearest dry bank in the connected
swim region. The emergency trip does not re-trigger its own interruption and retains an
active commitment until reaching the bank, so a scheduled NPC decision cannot
replace the retreat mid-water. A
drowned person's body is placed at the nearest shore found through the
shore spatial hash. Swimming is legal only for empty hands and basket-stowed
cargo; water entry is not treated as a way to shed an illegal load.

The ground menu enables `Walk here` across swim-connected regions for a safe
swimmer even when the clicked destination is dry land. Its hand-load refusal
uses the same cargo gate as issuing the order; the explicit `Swim here` option
continues to require a swim-depth destination.

The `shallows` health scenario verifies the negative drowning control for
wading-depth water, fish harvests in shallow water, and a successful crossing
of swim-depth water through `drowned_shallows`, `harvest_fish_shallows`, and
`swim_tile_steps` telemetry respectively. Unit and browser tests cover cargo
gates, RNG preservation, manual and ordered movement, autonomous drink
interruption, hunger exemption while gathering across water, dry-island menu
gates, drowning, corpse placement, and earth edits while swimming.

The dated UI capture showing the hand-load refusal is
`artifacts/screenshots/2026-10-05/m15-phase27d-swimming/01-swim-hand-load-refusal.png`.
