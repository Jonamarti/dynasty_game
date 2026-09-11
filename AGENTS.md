# Instructions for AI agents working on Dynasty

Read this before touching anything. It is short on purpose. Everything here is
either a rule that will break the project if you ignore it, or a shortcut that
will save you an hour.

Deeper documentation lives in [docs/](docs/): architecture, known bugs, next
steps, performance, and a changelog with the reason for every change.

---

## Orientation, in the order that is actually useful

1. `docs/architecture.md` — the rules that hold the design together.
2. `npm run sim:check` — run it before you read any code. Forty-five named
   checks and a world health report in about a second. It tells you more about
   the current state of the game than any file will.
3. `src/sim/core/Simulation.ts` — the spine. Constructor, `step()`, and the
   order the systems run in.
4. `src/sim/ai/Brain.ts` — why anybody does anything.
5. `docs/bugs.md` before you "fix" something that looks broken. It may be known,
   investigated, and deliberately left.

---

## Rules you must not break

**Never call `Math.random()`.** Anywhere. Every draw comes from a seeded `RNG`.
A determinism test is the tripwire.

**Never reorder the RNG forks in `Simulation`'s constructor.** Append new
streams at the end. The fork order is the seed contract; inserting one silently
invalidates every saved seed and every pinned test world.

> **"The end" is not where the comment says it is.** The named fork block ends
> at `recordRng` with a comment inviting you to append after it — but there is a
> **fourteenth, anonymous fork twenty-five lines further down**, the
> `this.rng.fork()` handed to `seedInitialForest`. Appending where the comment
> invites you to consumes the draw that fork expects and silently replants every
> forest in every saved seed. Hoist that fork into the named block first, as its
> own commit, or append genuinely last.

**And forks are not the only way to shift a stream.** `spawnResources`,
`spawnHerds` and `spawnPeople` all draw from **one shared `spawnRng`**, so adding
an entry to the `plan` array in `spawnResources` moves every herd and every
person in every world. That is not a fork-order violation, so **the determinism
test will not catch it** — it compares two runs of the *same* build. Give a new
resource kind its own appended stream and spawn it in its own pass after
`spawnPeople`, or every before-and-after measurement you take is meaningless.

**Never import the renderer or touch the DOM from `src/sim/`.** The headless
harness depends on this, and the harness is the whole feedback loop.

**Every long action needs an interruption check.** If you add anything to
`ActionSystem` that runs for more than a few ticks, it calls
`this.interruption(person, ctx)` and honours the result. A committed person does
not re-plan, so this is the *only* thing that can reach them. Two of the worst
bugs in this project's history were a long action without one.

**And a long action must bank its progress somewhere.** The check is not the
only ceiling: a novice picks up thirty-five points of thirst in about four
hundred ticks, so any single uninterrupted pull longer than that is stopped,
restarted from nothing, and never finishes. Anything above roughly 140
`workTicks` needs its progress stored on the thing being worked on — see
`Building.progress` and `Inscription.progress`. Shrinking the job until it fits
only moves the line.

**Every proximity query goes through a spatial hash.** Never scan an entity
array for "the nearest X".

**If the simulation refuses, stops or abandons something, the UI must say why.**
This is a standing instruction from the project owner. `interruption()` and
`abandon()` between them carry twenty reasons and, as of M6a, every one of them
was telemetry-only — so from inside the game an order just stopped and the
character went back to "thinking". `Simulation.lastRefusal` is the pattern to
extend, not to reinvent. An action whose failure paths are invisible is not
finished. See M6c in `docs/m6_plan_households_sleep.md`.

**Never let the UI read a stranger's private state.** Names, skills, condition
and history all route through `sim/social/Knowledge.ts`. This includes the
entity picker and any new panel.

**Every full-screen overlay needs `[hidden] { display: none; }` in the CSS.**
An author `display` beats the browser's rule for the `hidden` attribute, so a
hidden overlay stays laid out and swallows every click on the game underneath.
This project has now made that mistake four times. Look at `.succession`,
`.newgame`, `.picker` and `.techweb` in `src/style.css`.

**An overlay that redraws every frame cannot be hovered.** Rebuilding
`innerHTML` sixty times a second detaches whatever node the cursor is over
before a hover lands on it, so the panel never responds and nothing throws.
`TechWeb` keeps a digest of what is on screen and redraws only when it changes.

---

## Verifying your work

Four layers, fastest first. `npm run verify` chains them. Run at least the
first three before you claim anything works.

```bash
npm run typecheck      # ~3s
npm test               # unit + determinism             ~1s
npm run sim:check:all  # world health, five scenarios   ~15s
npm run e2e            # Playwright                     ~21s
```

Useful extras:

```bash
npm run sim:check -- --scenario century   # 2 in-game years; the only run that
                                          # says anything about generations
npm run sim:check -- --scenario craft     # the only run in which anything is
                                          # made: its founders start knowing
                                          # three technologies, because working
                                          # one out from nothing takes years and
                                          # every check about crafted goods
                                          # otherwise reports n/a for ever
npm run sim:check -- --scenario scribes   # the only run in which anything is
                                          # written down. Same trick, for the
                                          # same reason: writing sits behind
                                          # marking and stoneworking and no run
                                          # reaches it from nothing
npm run sim:seeds                         # the same scenario across 10 seeds:
                                          # mean survival, collapses, who starved
npm run why -- --person 0 --from 1700 --to 1760   # one person's score table,
                                                  # tick by tick
npm run shots                             # screenshot tour to artifacts/
```

`npm install` needs `--legacy-peer-deps` on this machine.

**If `npm run e2e` dies with `EACCES` before any test runs**, Windows has
reserved Vite's port. `netsh interface ipv4 show excludedportrange protocol=tcp`
lists the reserved ranges — on this machine 5111-5210 swallows the default 5173
— and `DYNASTY_PORT=5399 npm run e2e` moves it out of the way.

### Reading the health report

- **n/a is not a pass.** It means the scenario could not exercise the check. A
  summer run says nothing about shelter; a one-band run says nothing about
  strangers. If your change makes a check go from PASS to n/a, you have probably
  removed the behaviour, not fixed it.
- **Chase the report, not the check.** The population table above the checks is
  where the real story is: watch the `fruit`, `cold` and `store` columns
  together and the winter die-offs are obvious.

---

## Things that will waste your time if nobody tells you

**The `century` scenario is chaotic.** Two runs of different code produce wildly
different worlds, and `population-persists` sits near its threshold. A check
flipping between runs is usually divergence, not your change. Measure the
*mechanism* (telemetry counters, `npm run why`) rather than the end state.

**For anything that touches the food economy, use `npm run sim:seeds`.** One run
cannot tell you whether the world got better. People were once starving beside
storage pits holding fourteen hundred items and *every named check passed*;
across ten seeds the same change showed up as mean survival going from 40% to
59%. Ten seeds takes about fifty seconds.

**But ten seeds cannot resolve a change of under about ten points.** M6b phase 1
measured five variants of one change, none of them aimed at the food economy, at
73.1%, 65.2%, 64.4%, 63.6% and 59.3% — and at one point a *strictly better*
skill-learning rate came out nine points worse than what it replaced, which is
chaos rather than a mechanism. Pass `--seeds 20` (about a hundred seconds) for
anything smaller than the larder fix, and never pick a coefficient because one
ten-seed run liked it.

**Before adding a check, verify it fails on the broken build.** Two checks were
written to guard that larder bug and both were deleted after being measured
against it: withdrawals as a share of deposits is *higher* in the broken world
than the fixed one, and the starvation counts overlap. A check that looks
reassuring and detects nothing is worse than no check, because someone will
trust it.

**Coefficients in `Brain` are calibrated against each other.** Changing one
bias can silently disable a gate somewhere else. When you change a weight, run
`ai-uses-many-actions` and look at the distribution, not just the pass/fail.

**Proximity dominates the scorer.** If a new action never fires, the reason is
almost always that something else is nearer, not that its coefficient is
slightly low. `hunt` scored zero until its weight was raised to nine.

**Do not tune a check until it goes green.** If a check fails, find out whether
the *world* is wrong or the *check* is wrong, and say which in your commit
message. Two legitimate check fixes happened in M6a — `people-in-bounds` was
recomputing a predicate `World.inBounds` already owned, and `animals-flee` was
measuring distance to the wrong person — and both were fixed because the
measurement was wrong, with a comment explaining why.

**Do not ship a comment asserting a cause you have not confirmed.** M6a tried
lowering the courtship gate on a plausible theory, measured no change, and
reverted rather than keeping a change with a false explanation attached.

**e2e specs encode premises that milestones change.** When founding families
landed, three specs failed because "the next person in the list" had stopped
being a stranger and become the player's wife. That is the spec being out of
date, not the game being broken — but check which it is before you edit a test.

**Playwright clicks need the target on screen.** The camera frames the player; a
click outside the canvas never reaches the game and the selection silently stays
put. Snap the camera first (`d.camera.snapTo(x, y); d.camera.following = false`)
— several specs already do.

**Use `?skipIntro=1` in any new e2e spec** unless you are testing character
creation itself.

**Do not create directory junctions into this project from a scratch directory
you intend to delete.** `git worktree remove --force` follows them and will
delete the real `node_modules`.

---

## House style

The code in this project is heavily commented, and the comments explain *why*,
usually with the failure that motivated the design. Match that. A comment that
restates the code is worse than none; a comment that records the bug a line
prevents is the most valuable thing in the file.

Prefer extracting a shared helper over writing a second implementation —
`moveToward`, `linkFamily`, `inheritTraits` and `hitRadiusOf` all exist because
two copies of the same idea drift apart, and the drift always shows up as a
mystifying bug months later.

When you finish a pass, add an entry to `docs/changelog.md` with the date and
the reason for each change, and update `docs/bugs.md` with anything you found
and did not fix.
