# Dynasty — project documentation

Written 2026-09-02, at the end of the M6a pass.

The top-level [README](../README.md) is the pitch and the quick start. This
folder is the working documentation: how the thing is built, what is wrong with
it, what to do next, and why each change was made.

| document | what it answers |
|---|---|
| [architecture.md](architecture.md) | How the simulation is put together, and which rules are load-bearing |
| [bugs.md](bugs.md) | Known defects and rough edges, with how to reproduce each |
| [next-steps.md](next-steps.md) | What to build next, in order, and why that order |
| [optimizations.md](optimizations.md) | Where the time goes, what has been done about it, and what is left |
| [changelog.md](changelog.md) | Every change, with its date and the reason for it |
| [m6_plan_households_sleep.md](m6_plan_households_sleep.md) | The M6a and M6c plans |
| [m6b_plan.md](m6b_plan.md) | M6b — the tech web, research, transmission, weapons, jobs |
| [m8_plan_the_ages.md](m8_plan_the_ages.md) | M8 — the technology ladder from flint to iron, and the mechanisms it needs |
| [m9_plan_words_and_hands.md](m9_plan_words_and_hands.md) | M9 — the social and interface pass: talking, teaching, choosing, and seeing what is on the ground |
| [m7_mov_m9_3_quant_plan.md](m7_mov_m9_3_quant_plan.md) | M7 — routing, and the quantity prompts that shipped alongside it |
| [m11_plan.md](m11_plan.md) | M11 — predation, knowledge by witness, property, inequality, standing between bands, macros, the widened Neolithic and war (phases 0-11, shipped) |
| [m11_block_v_plan.md](m11_block_v_plan.md) | M11 Block V — the owner's notes of 2026-09-22 and everything M11 still owes, commit by commit (phases 12-17) |

If you are an AI agent picking this project up, read
[../AGENTS.md](../AGENTS.md) first — it is shorter and tells you what will
waste your time.

## The shape of the thing in one paragraph

A deterministic, seeded life simulation. One island, three tribes made of
families, and a few dozen people who each score every action they could take and
do the best one. They forage, hunt, build, marry, bear children, teach each other
how to make fire, form opinions of one another from what they personally saw, and
die. The player inhabits one of them, with no extra abilities, and when that
person dies the game hands them an heir. Nothing calls `Math.random()`; the
simulation never imports the renderer; and a headless harness runs exactly the
code the browser runs, roughly four thousand steps a second.
