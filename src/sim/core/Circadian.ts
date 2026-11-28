/**
 * Sleep debt stays physical; the clock changes how strongly it is felt.
 * Midnight adds sleep pressure and midday subtracts it continuously. A tired
 * enough person can still nap, and urgent hunger or danger can still wake them.
 * No RNG, needs mutation, or night/day action assignment belongs here.
 */
export function perceivedFatigue(debt: number, dayFraction: number, amplitude: number): number {
  return Math.max(0, Math.min(100, debt + amplitude * Math.cos(dayFraction * Math.PI * 2)));
}

/**
 * Hunger and thirst that make sleep or rest stop immediately.
 * Share this predicate with the chooser; otherwise a tired person can choose
 * the same action that execution will reject, without answering either need.
 * Cold is deliberately excluded: a roof is part of the answer to cold.
 */
export function restNeedInterruption(needs: { thirst: number; hunger: number }): 'thirsty' | 'hungry' | null {
  if (needs.thirst > 45) return 'thirsty';
  if (needs.hunger > 50) return 'hungry';
  return null;
}
