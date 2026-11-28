# M16 — CI control, 2026-11-28

Diagnostic-only branch: the runtime, tests, configuration and pinned references are unchanged from master 4ee0b3e1ba333dd62f30515f94bdf3d94a581225. Do not merge this PR as a feature or update a baseline from it without attribution.

Last verified historical master: 593c056f (CI run 41823366162). Subsequent master merges #63, #51 and #42 were not verified by Actions. Compare this control with #65 run 46141479069 and runtime run 46141479055. All four E2E shards passed on #65, but unit failed 3 tests (construction order, starting water, switches-off fingerprints). Matrix 1 aborted because village_with_crafts had 7 survivors versus required 12; matrix 2/3/4 reported regressions. Pinned Node 22.23.3 differed on all three seeds. These observations cannot yet be attributed to #65, which only changes off-map night admission.

Goal: establish whether the same failures reproduce on current master; isolate each regression before integration. No repinning, no relaxed assertions.
