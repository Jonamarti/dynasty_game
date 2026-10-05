# M15 phase 27c: fishing in the shallows

Fishing spots are placed on walkable shallow-water tiles by the existing
`fishRng` stream. `spawnFish` samples the eligible contour directly and places
the configured number of nodes; rejecting random land tiles made fish counts
fall as the wade-depth band narrowed. The pass still runs after people are
spawned, and no RNG fork was added or moved.

The ordinary harvest action works on a shoal because its tile is walkable and
belongs to a land region. A spear increases a fish pull by 1.5× only when the
person owns it and it is fitted in either hand. The forage tool setup preserves
that fitted spear for fish; carrying a spear in the pack alone has no effect.
Netting remains a separate multiplier and can stack with harpooning.

`spear-fishing.test.ts` compares three otherwise identical first pulls: bare
hands, a spare spear in the inventory, and a fitted spear. The bare and spare
results must match, and the fitted spear must catch more. This negative control
guards the in-hand condition as well as the bonus.

The `shallows` scenario explicitly orders one fisher to a shoal so the shallow
catch check measures the harvest path independently of AI preference, and
orders another person across a swim-connected land boundary. Its
`people-on-land` check permits an empty-handed person on a swim-depth tile,
while still rejecting deep water, rock, or a swimmer carrying loose items.
`shallows-checks.test.ts` exercises these as real-position controls, checks the
actual swim-crossing event, and confirms a fatigued person survives on a shoal.
It also changes the swim-depth predicate in a negative control; the same
threshold-fatigued person then drowns and fails the shallow-death invariant.
See the scenario and its counters in `tools/simcheck.ts`.
The `regions-stay-true` check independently recomputes both land partitions
and the mixed land-and-swimmable-water graph; a swim-only split with unchanged
component-size totals still fails the check.

The browser capture performs an actual ordered harvest on a shallow fish node
with a fitted spear, checks that the person receives fish and remains in the
shoal, then opens the spear node in the tech web and verifies its harpoon
summary. The paused captures are saved in
`artifacts/screenshots/m15-phase27-fishing-2026-10-05/`.
`npm.cmd exec -- playwright test e2e/fishing.spec.ts --reporter=line` passes
with `DYNASTY_PORT=5399` on this Windows setup.
