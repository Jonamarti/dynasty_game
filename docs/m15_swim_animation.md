# M15 phase 17: swimming animation

The real `swim` action uses four generated crawl strokes (`n0`–`n3`) while its
actor is moving through a swim-depth tile. MovementSystem continues to decide
routes, water entry, exits, fatigue and skill gains. The animation adds no
movement or swimming mechanics.

`swimmingPose` observes only the swimmer's alive flag, public action, action
clock, position and the world tile's public swim-depth classification. It does
not inspect private details of another entity. Its four frames use the
simulation `actionTicks` clock and bounded render interpolation; pausing leaves
the stroke phase fixed. Rendering does not mutate the actor, world or RNG.

The E2E test issues a real swim order through a five-tile water strip, verifies
the actor enters swim water with the real `swim` action, and captures each
generated frame while simulation time is paused. Captures:
`artifacts/screenshots/m15-swim-animation-2026-10-13/`.

The source geometry is in `art/src/people/rig.ts`; regenerate the people sheet
with `npm run art:build -- people`. Manifest coverage includes all four poses.
