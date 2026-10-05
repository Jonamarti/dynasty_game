/** Depth bands share the traversal thresholds, so the pale coast is a useful
 * route cue rather than a second, decorative definition of a shallow. */
export function waterColors(depth: number, wadeDepth: number, swimDepth: number): readonly [string, string] {
  if (depth < wadeDepth) return ['#568b91', '#639da1'];
  if (depth < swimDepth) return ['#306b88', '#397c99'];
  return ['#24506f', '#2b5c7e'];
}
