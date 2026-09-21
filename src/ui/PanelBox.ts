/**
 * How big the drawing area inside a full-screen graph panel is allowed to be.
 *
 * One helper rather than three copies, because there were three and they were
 * wrong in the same way. `TechWeb`, `FamilyTree` and `TribeGraph` each worked
 * their box out as "the window, less room for the pane beside the canvas, but
 * never smaller than about five hundred pixels" — a floor that made sense when
 * the smallest thing anybody would open the game on was a laptop, and that is
 * *wider than a phone*.
 *
 * On a 390-pixel screen the tech web asked for a 520-pixel viewport inside a
 * card the stylesheet had already capped at `100vw - 12px`, and the arithmetic
 * downstream believed it: `fitToView` divided 520 by the web's natural 1069 and
 * opened at a zoom of 0.49, under the 0.55 at which `.is-far` collapses every
 * node to an unlabelled chip. The owner's report was exactly that — on mobile
 * you get the circles and none of the names — and the cause was a box the panel
 * was never actually given.
 *
 * `AGENTS.md` asks for a shared helper over a second implementation, and this
 * is the third: a fix made in one of these three would otherwise have stayed
 * broken in the other two.
 */

/**
 * The window width below which the stylesheet restacks these panels.
 *
 * Must match the `@media (max-width: 700px)` block in `style.css`. Below it the
 * detail pane sits *under* the canvas instead of beside it, so there is no side
 * pane to subtract and the canvas gets the full width of the card.
 */
export const NARROW_WIDTH = 700;

export function panelBox(
  sidePane: number,
  maxWidth: number,
  maxHeight: number,
  minWidth = 480,
  minHeight = 380
): { width: number; height: number } {
  if (window.innerWidth <= NARROW_WIDTH) {
    // No minimum at all here, deliberately. A floor is what caused the bug:
    // the honest answer on a narrow window is however much room there is, and
    // a panel that asks for more than the card can hold does not get it — it
    // just makes every zoom decision downstream out of a number that was never
    // true. The card is `100vw - 12px` with a pixel of border each side.
    const width = Math.max(200, window.innerWidth - 18);
    // Roughly half the height: the head takes about forty pixels above and the
    // detail pane is capped at `34dvh` below, and both have to fit in the card.
    const height = Math.max(180, Math.min(
      Math.round(window.innerHeight * 0.46),
      window.innerHeight - 210
    ));
    return { width, height };
  }

  // Wide: quantised to a step so an idle drag of the window edge does not
  // rebuild the panel on every intermediate pixel.
  const step = 80;
  return {
    width: Math.max(minWidth, Math.min(maxWidth,
      Math.round((window.innerWidth - sidePane) / step) * step)),
    height: Math.max(minHeight, Math.min(maxHeight,
      Math.round((window.innerHeight - 160) / step) * step)),
  };
}
