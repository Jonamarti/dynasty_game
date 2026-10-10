# M15 phase15b: a rack inside the house

Drying racks now fit wholly inside completed, unruined house rooms as well as
outside. Only the host-house overlap is exempt: walls, doorway/outside room,
other stations and furnishings still reject placement. Orders and build ghosts
explain another band's house. The hosted rack persists hostId through the
existing building checkpoint contract, and normal station work dries food there.
No new art, random draw or temporary food bonus.

The rack occupies both room tiles when choosing later sleeping surfaces. The
shared spatial-hash house search covers the largest actual house footprint;
it does not scan all houses for a nearby host.

The new short-side approach test exposed a real arrival deadlock: movement
accepted distance0.6 but the one-tile station side required distance0.5. A
person parked at y11.5109 with craft timer0 for1000 ticks. reachBuilding now
accepts the actual movement arrival radius for stations; entry into rooms
continues to require containment. Existing travel interruption remains active.

## Verification

37/37 tests in seven files pass; typecheck passes. Four new tests cover actual
indoor drying/JSON, exterior and overlap/unfinished gates, band ownership, and
both occupied tiles. Before implementation three tests fail; with placement
supplied but old arrival logic, the drying test alone still fails. This confirms
the arrival regression without widening rooms or relaxing its assertion.
Single-seed report retains cravings-steer-the-diet/perf-budget (2/147).

Browser indoor and salt cases passed with clean exit (2 passed,13.0s); final
framed interior case passed again (1 passed,4.7s). Fresh Vite shows current
0.15.36-alpha; inspected capture:
artifacts/screenshots/m15-phase15b-indoor-rack-2026-10-10-final/03-secadero-interior-lejos-del-borde.png.
Salt panel capture now scrolls its actual body:
artifacts/screenshots/m15-phase15b-salt-2026-10-10-final/03-alimentos-salados-desplazados.png.

15b's implemented catalogue now includes indoor/outdoor drying, smoking,
saltmaking, salting and pemmican. The15d comparative scenario/checks and measured
15c default activation remain pending; no claim about winter survival or costs.
