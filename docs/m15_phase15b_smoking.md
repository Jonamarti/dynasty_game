# M15 phase15b: smoking beside a hearth

Smoking is a real discoverable/refinable technology requiring preserving and
firemaking. Two raw meat/fish plus one stick become two smoked units, at a
completed drying rack whose centre is within three tiles of a completed,
unruined hearth. Daylight and carried torches do not satisfy this condition.
The shared spatial-hash hearth predicate also serves torch ignition.

Orders and menus explain missing fire; work checks it every tick before
banking progress or consuming inputs. Losing the fire banks existing work and
reports no_fire_near; replacing it permits another order to resume the recipe.
The scorer filters fireless racks before choosing distance, and retains the
learned spoils:<raw> demand gate. No new random stream or spawn draw.

Smoked food lasts twice as long as dried food (twenty times raw) and offers
35/23 nutrition instead of dried meat/fish's30/18. These are initial design
values with actual Inventory.spoil/food readers, not a measured survival gain.
Smoking initially stayed in main; pemmican subsequently supplies the second
child and opens Preservation (m15_phase15b_pemmican.md).
Salt, indoor racks and15d remain pending;15c activation and cohorts
remain deferred under the owner's fast-verification instruction.

## Verification

Six mechanism tests cover station-menu reasons, autonomous station choice,
daylight/torch refusal, station-centred distance, fire loss/banked resume and
actual smoked fish output. First four plus preservation/tech/i18n/art:82/82;
then the final six smoking tests passed. Typecheck passed. Single-seed report:
2/147 failures, cravings-steer-the-diet and perf-budget, unchanged named baseline.

Focused browser case passed with a clean exit (1 passed,4.8s). Actual orders
make both foods; Spanish Kit labels and physical rack/hearth are captured in
artifacts/screenshots/m15-phase15b-smoking-2026-10-10/01-ahumado-junto-a-hoguera.png.
Capture inspected. This fixture is not a radial-menu click test.

Negative verification: the same six tests against the preceding commit with
only the new recipe/item/tech tables supplied fail five fire/station guards;
the actual-output test passes. Thus the guard checks detect missing execution,
menu and AI readers, rather than only testing new table entries.
