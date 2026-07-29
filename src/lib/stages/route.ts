import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, setStageStatus, upsertLeads } from "../runs";
import { logAction } from "../audit";
import { writeCsv, type CsvRecord } from "../csv";
import { routeLead } from "../scoring/routing";
import type { Tier } from "../scoring/deterministic";

/** Spec 7.0: final routing decision per lead, including the EU consent hard
 * gate (5.3) and the human-review queue (7.2 consumes `needs_review`). */
export async function runRoutingStage(runId: string) {
  await setStageStatus(runId, "route", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const outDir = stageDir(runId, "route");
    fs.mkdirSync(outDir, { recursive: true });

    const decisions: CsvRecord[] = [];
    const reviewQueue: Array<Record<string, unknown>> = [];
    const counts: Record<string, number> = {};

    for (const row of rows) {
      const result = routeLead({
        deterministicTier: (row.deterministic_tier as Tier) ?? "tier3",
        deterministicReviewFlag: !!row.deterministic_review_flag,
        deterministicReviewReason: row.deterministic_review_reason,
        scoreDivergenceFlag: !!row.score_divergence_flag,
        scoresAligned: !!row.scores_aligned,
        isEu: !!row.is_eu,
        consentVerified: (row.consent_verified as "verified_in" | "verified_out" | "ambiguous") ?? "ambiguous",
        dedupConflictFlag: !!row.dedup_conflict_flag,
      });

      counts[result.routingDecision] = (counts[result.routingDecision] ?? 0) + 1;

      await upsertLeads(runId, [
        {
          lead_id: row.lead_id,
          routing_decision: result.routingDecision,
          needs_review: result.needsReview ? 1 : 0,
          review_reasons_json: JSON.stringify(result.reviewReasons),
          review_status: result.needsReview ? "pending" : "none",
        },
      ]);

      decisions.push({
        lead_id: row.lead_id,
        deterministic_tier: row.deterministic_tier ?? "",
        routing_decision: result.routingDecision,
        needs_review: String(result.needsReview),
        review_reasons: result.reviewReasons.join(" | "),
      });

      if (result.needsReview) {
        const lead = JSON.parse(row.sanitized_json!) as CsvRecord;
        reviewQueue.push({
          lead_id: row.lead_id,
          email: lead.email_normalized,
          job_title: lead.job_title,
          company: lead.company,
          deterministic_tier: row.deterministic_tier,
          llm_score: row.llm_score,
          reasons: result.reviewReasons,
        });
      }
    }

    writeCsv(path.join(outDir, "routing-decisions.csv"), decisions);
    fs.writeFileSync(path.join(outDir, "review-queue.json"), JSON.stringify(reviewQueue, null, 2));

    await setStageStatus(runId, "route", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "route",
      action: "routing_completed",
      detail: { ...counts, review_queue_size: reviewQueue.length },
    });

    // Spec 8.0: the routing stage is the natural point to also mark the
    // logging stage complete, since every prior stage has already been
    // writing to the audit trail throughout.
    await setStageStatus(runId, "log", "completed", { outputPath: stageDir(runId, "log") });

    return { counts, reviewQueueSize: reviewQueue.length };
  } catch (err) {
    await setStageStatus(runId, "route", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
