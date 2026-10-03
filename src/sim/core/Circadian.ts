/**
 * Sleep debt stays physical; the clock changes how strongly it is felt.
 * Midnight adds sleep pressure and midday subtracts it continuously. A tired
 * enough person can still nap, and urgent hunger or danger can still wake them.
 * No RNG, needs mutation, or night/day action assignment belongs here.
 */
export function perceivedFatigue(debt: number, dayFraction: number, amplitude: number): number {
  return Math.max(0, Math.min(100, debt + amplitude * Math.cos(dayFraction * Math.PI * 2)));
}
