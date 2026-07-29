import type { Tier } from "./deterministic";

export type RoutingDecision = "sales_queue" | "nurture" | "self_serve_newsletter" | "suppressed" | "human_review";

const TIER_ROUTE: Record<Exclude<Tier, "suppress">, RoutingDecision> = {
  tier1: "sales_queue",
  tier2: "nurture",
  tier3: "self_serve_newsletter",
};

export interface RoutingInput {
  deterministicTier: Tier;
  deterministicReviewFlag: boolean;
  deterministicReviewReason: string | null;
  scoreDivergenceFlag: boolean;
  scoresAligned: boolean;
  isEu: boolean;
  consentVerified: "verified_in" | "verified_out" | "ambiguous";
  dedupConflictFlag: boolean;
}

export interface RoutingResult {
  routingDecision: RoutingDecision;
  needsReview: boolean;
  reviewReasons: string[];
}

/**
 * 7.1 routing precedence, from the memo + spec 5.3/6.4:
 *   1. Suppression (competitor/disposable/fake) always wins outright.
 *   2. EU consent hard gate (5.3): ambiguous consent on an EU lead forces
 *      human_review regardless of tier, tagged "EU / Consent Verification
 *      Needed".
 *   3. Any deterministic edge-case review flag (6.1) -> human_review.
 *   4. Score divergence beyond the adjustable threshold (6.4) -> human_review.
 *   5. Duplicate-record conflicts flagged during sanitize -> human_review.
 *   6. Otherwise, aligned/clean leads route straight from the memo's tier
 *      rules -- no human step required.
 */
export function routeLead(input: RoutingInput): RoutingResult {
  const reasons: string[] = [];

  if (input.deterministicTier === "suppress") {
    return { routingDecision: "suppressed", needsReview: false, reviewReasons: [] };
  }

  if (input.isEu && input.consentVerified === "ambiguous") {
    reasons.push("EU / Consent Verification Needed");
  }
  if (input.deterministicReviewFlag && input.deterministicReviewReason) {
    reasons.push(input.deterministicReviewReason);
  }
  if (input.scoreDivergenceFlag) {
    reasons.push("Score divergence: deterministic vs. probabilistic");
  }
  if (input.dedupConflictFlag) {
    reasons.push("Duplicate record with conflicting fields");
  }

  if (reasons.length > 0) {
    return { routingDecision: "human_review", needsReview: true, reviewReasons: reasons };
  }

  return { routingDecision: TIER_ROUTE[input.deterministicTier], needsReview: false, reviewReasons: [] };
}
