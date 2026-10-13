# M15 phase 17: inscription carving animation

An active `inscribe` order cycles four generated poses (`i0`–`i3`) while the
carver is at the selected unfinished record and has added real work to it. The
left hand braces the surface as the right hand taps and resets a stone chisel.
The renderer composes a dedicated chisel prop onto the moving hand anchor, so
the tool follows the stroke in front, side and mirrored views.

The selector reads the person's public action, `workedTicks`, target record ID
and position, plus the record's public pending/work progress. It never reads
the inscription's contents, another person's private knowledge or inventory.
The record remains the authority for banked work; rendering does not advance
or change it. Travel, interruption, an absent or finished record, zero banked
progress or death return the normal pose. The simulation and RNG streams are
unchanged.

`art/src/people/rig.ts` generates the four hand strokes and
`art/src/props/held.ts` draws the chisel used only by this visible action.
`npm run art:build` regenerates the people and props sheets. Selector
tests cover frame timing and invalid states; the browser test starts a real
`inscribe` order against an unfinished `Inscription`, checks that painting
leaves real record progress unchanged, and captures four visible frames in
`artifacts/screenshots/m15-inscription-animation-2026-10-13/`.
