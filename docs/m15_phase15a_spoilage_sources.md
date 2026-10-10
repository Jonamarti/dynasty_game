# M15 phase 15a: spoilage by source

The midnight sweep now counts estimated dry losses and actual removals by
`carried`, `store`, `site` and `pile`, with per-item and nutrition counters.
Fractional estimates remain fractional: rounding each small stack to zero hid
where the prospective losses lay. Existing per-item counters retain their
old rounding to keep historical reports comparable.

`carried` covers the person's inventory, including hands, worn container and
pockets. It does not pretend to identify which physical copy aged in which
slot; inventory stacks currently share a decay remainder. Site deliveries are
reported separately from usable stored food.

The dry sweep leaves the complete checkpoint byte-for-byte unchanged and
consumes no random draws. Live source totals equal actual removed units.
Both focused tests fail with the new source counters removed and pass with
the instrument. The default spoilRate remains zero.

## Measurement still required

The plan calls for twenty seeds at rates 0.35–1 in lean, century and fishers.
AGENTS.md explicitly defers those cohorts during M15 unless the owner requests
the named measurement. No cohort was run and no cheapest rate, survival change
or default activation is claimed. The instrument is delivered; the empirical
15a gate and 15c activation remain pending.