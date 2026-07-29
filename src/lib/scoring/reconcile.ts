import type { Tier } from "./deterministic";

/** Representative point on the same 0-100 scale as the LLM's probabilistic
 * score, one per deterministic tier -- lets 6.3 compare two otherwise
 * incomparable outputs (a categorical tier vs. a continuous score) as a
 * single divergence number. Suppress is excluded: suppression always wins
 * outright and is never reconciled against the LLM score. */
const TIER_MIDPOINT: Record<Exclude<Tier, "suppress">, number> = {
  tier1: 90,
  tier2: 55,
  tier3: 20,
};

/** Adjustable via env var; defaults to 30 points (roughly a full tier-band)
 * per the user's "start with a reasonable value" instruction (spec 6.4). */
export function getDivergenceThreshold(): number {
  const raw = process.env.SCORE_DIVERGENCE_THRESHOLD;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 30;
}

export interface ReconcileResult {
  scoreDivergence: number | null;
  scoresAligned: boolean;
  divergenceFlag: boolean;
}

/**
 * 6.3 compare deterministic + probabilistic scores and append both.
 * 6.4 flag for human review when they diverge by more than the (adjustable)
 * threshold. When they align, the lead routes straight from the memo's tier
 * rules with no human step required (spec 7.0 consumes `scoresAligned`).
 */
export function reconcileScores(deterministicTier: Tier, probabilisticScore: number | null): ReconcileResult {
  if (deterministicTier === "suppress" || probabilisticScore === null) {
    return { scoreDivergence: null, scoresAligned: true, divergenceFlag: false };
  }
  const midpoint = TIER_MIDPOINT[deterministicTier];
  const divergence = Math.abs(probabilisticScore - midpoint);
  const threshold = getDivergenceThreshold();
  const divergenceFlag = divergence > threshold;
  return { scoreDivergence: divergence, scoresAligned: !divergenceFlag, divergenceFlag };
}
