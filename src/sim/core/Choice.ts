/**
 * How a scored list becomes one decision.
 *
 * `Brain.score` produces a table sorted best-first and `Brain.think` used to
 * take `scores[0]` and nothing else. That is a defensible way to run a utility
 * scorer and it has two costs this project has now paid both of:
 *
 * **A new verb is born invisible.** M9.5 phase 4a shipped `threaten`, correctly
 * gated and correctly weighted, and it "never once won the argmax against
 * `steal` for the same target"; it did not appear in a full century of a
 * 156-person world until its coefficients were retuned against that one
 * comparison. Under argmax, adding a verb is not adding an option — it is
 * entering a winner-takes-all contest against every verb already tuned, and the
 * only way through is to raise the newcomer until it beats an incumbent
 * outright. That is how a scorer becomes untunable.
 *
 * **And identical people do identical things.** Two foragers standing in the
 * same place with the same needs pick the same bush, for ever, because the
 * scorer is a pure function of state and the state agrees.
 *
 * ## Why a band and not a temperature
 *
 * The obvious answer is a softmax, `exp(score / t)`, and it is the wrong one
 * here. The scores in this game are not commensurate small numbers: `wander` is
 * scored around 0.02 and `hunt` around 9, a spread of nearly three orders of
 * magnitude, and the coefficients that produce them are calibrated against each
 * other rather than against a scale. Any fixed temperature is therefore either
 * so cold it is argmax or so warm that a wander beats a hunt, and there is no
 * value in between that holds across the table.
 *
 * So the rule is relative to the leader instead: **keep every candidate within
 * `spread` of the best score, then draw among those in proportion to score.**
 * It is scale-free, so it behaves the same whether the leader is 0.2 or 20; it
 * is bounded, so nothing outside the band can ever win however unlucky the
 * draw; and it degenerates exactly, so `spread: 0` is the old behaviour to the
 * bit.
 *
 * ## The draw belongs to the caller, and to `think` rather than `score`
 *
 * `Simulation` calls `Brain.score` for the player's character on **every
 * rendered frame**, to show them what their character is inclined to do. A draw
 * taken inside `score` would therefore make what the world does depend on how
 * often somebody looked at it — the same purity rule `techPower` carries, for
 * the same reason. This function is called from `think`, which runs once per
 * think tick, and never from `score`.
 */
import type { RNG } from './RNG.ts';

/** Anything `Brain.score` produces: an id and how much it is wanted. */
export interface Scored {
  id: string;
  score: number;
}

/**
 * The most candidates the band will ever hold.
 *
 * A cap rather than a pure threshold because the band is relative: late in a
 * comfortable day a dozen actions can sit within a few percent of each other,
 * and drawing uniformly across twelve near-ties is not variety, it is a person
 * who cannot make up their mind. Four is enough to break a tie and few enough
 * that the fourth is still recognisably something this person wanted to do.
 */
const MAX_CANDIDATES = 4;

/**
 * Picks one of the best-scoring options, or `undefined` if there are none.
 *
 * `scores` must be sorted descending, which is what `Brain.score` returns —
 * the band is then a prefix and this stays a single short walk rather than a
 * sort. `spread` is the fraction below the leader a score may fall and still be
 * considered: 0 is argmax, 0.15 means "anything within 15% of the best".
 *
 * **Takes exactly one draw when it has a real choice to make, and none at all
 * otherwise.** Both branches are pure functions of the table, so the stream
 * stays deterministic either way — and the no-draw branches are what let
 * `spread: 0` ship without moving a single seed.
 */
export function chooseAmongBest<T extends Scored>(
  scores: readonly T[],
  rng: RNG,
  spread: number
): T | undefined {
  const leader = scores[0];
  // Nothing to choose from, or nothing to choose between.
  if (leader === undefined || spread <= 0 || scores.length === 1) return leader;

  // `score` keeps only positive scores, so the leader is positive and the
  // cutoff is a meaningful fraction of it rather than a sign flip.
  const cutoff = leader.score * (1 - spread);
  let count = 1;
  let total = leader.score;
  while (count < scores.length && count < MAX_CANDIDATES) {
    const next = scores[count]!;
    if (next.score < cutoff) break;
    total += next.score;
    count++;
  }
  // A clear winner is still a clear winner, and it costs no randomness to say
  // so. This is the common case in a pressed person: one need dominates.
  if (count === 1) return leader;

  let roll = rng.next() * total;
  for (let i = 0; i < count; i++) {
    const candidate = scores[i]!;
    roll -= candidate.score;
    if (roll <= 0) return candidate;
  }
  // Floating point only; the loop above accounts for the whole of `total`.
  return scores[count - 1];
}
