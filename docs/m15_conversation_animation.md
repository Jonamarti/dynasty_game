# M15 phase 17: human conversation animation

While a real `talk` order is active and stationary, the speaker cycles four
open-handed gestures (`l0`–`l3`). The cycle follows the speaker's existing
conversation action clock and render fraction. Movement, an unstarted or ended
conversation, and a dead speaker hide the gesture.

The pose selector reads only the speaker's own public action, timer, ticks and
alive flag. It does not inspect the listener, relationship, conversation mode,
topic, or conversation result. Drawing adds no simulation ticks, RNG draws,
relationship changes, or social events. Held objects keep their normal hand
anchors, so a tool already in hand follows the gesturing arm.

The browser fixture issues a real greeting to an adjacent person, verifies the
conversation remains active while rendering all four poses, and captures them
under `artifacts/screenshots/m15-conversation-animation-2026-10-13/`.
