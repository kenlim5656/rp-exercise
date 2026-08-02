import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, getAccounts, setStageStatus, upsertLeads, upsertAccounts } from "../runs";
import { logAction } from "../audit";
import { writeCsv, type CsvRecord } from "../csv";
import { routeLead } from "../scoring/routing";
import type { Tier } from "../scoring/deterministic";
import { getConfig } from "../scoring/pql_config";

/** Spec 7.0: final routing decision per lead, including the EU consent hard
 * gate (5.3) and the human-review queue (7.2 consumes `needs_review`).
 *
 * v3: Also routes accounts based on AQL status. Enterprise-qualified accounts
 * go to enterprise_sales; existing customers are skipped (safety valve). */
export async function runRoutingStage(runId: string) {
  await setStageStatus(runId, "route", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const accounts = await getAccounts(runId);
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const config = getConfig();
    const outDir = stageDir(runId, "route");
    try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* read-only fs */ }

    const decisions: CsvRecord[] = [];
    const reviewQueue: Array<Record<string, unknown>> = [];
    const counts: Record<string, number> = {};
    const routeUpdates: Array<{
      lead_id: string;
      routing_decision: string;
      needs_review: number;
      review_reasons_json: string;
      review_status: string;
    }> = [];

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

      // v3: AQL override — if the account is AQL-qualified, upgrade to enterprise_sales
      let finalDecision = result.routingDecision;
      const account = row.account_id ? accountById.get(row.account_id) : null;
      if (account && account.aql_status === "aql_account" && finalDecision !== "suppressed") {
        finalDecision = "enterprise_sales" as typeof finalDecision;
      }
      // v3: PQL upgrade — PQL-qualified users in nurture get upgraded to sales_queue
      if (row.pql_score && row.pql_score >= config.thresholds.pql_user_min && finalDecision === "nurture") {
        finalDecision = "sales_queue";
        result.reviewReasons.push("PQL score above threshold — upgraded from nurture to sales");
      }

      counts[finalDecision] = (counts[finalDecision] ?? 0) + 1;

      routeUpdates.push({
        lead_id: row.lead_id,
        routing_decision: finalDecision,
        needs_review: result.needsReview ? 1 : 0,
        review_reasons_json: JSON.stringify(result.reviewReasons),
        review_status: result.needsReview ? "pending" : "none",
      });

      decisions.push({
        lead_id: row.lead_id,
        deterministic_tier: row.deterministic_tier ?? "",
        pql_score: String(row.pql_score ?? ""),
        aql_status: account?.aql_status ?? "",
        routing_decision: finalDecision,
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
          pql_score: row.pql_score,
          llm_score: row.llm_score,
          reasons: result.reviewReasons,
        });
      }
    }

    if (routeUpdates.length > 0) {
      await upsertLeads(runId, routeUpdates);
    }

    // Route accounts
    const accountRouteUpdates: Array<{ id: string; run_id: string; domain: string; routing_decision: string }> = [];
    for (const account of accounts) {
      let acctRouting: string;
      if (account.aql_status === "customer") {
        acctRouting = "existing_customer";
      } else if (account.aql_status === "aql_account") {
        acctRouting = "enterprise_sales";
      } else if (account.aql_status === "pql_user") {
        acctRouting = "self_serve_expansion";
      } else {
        acctRouting = "unqualified";
      }
      accountRouteUpdates.push({
        id: account.id,
        run_id: runId,
        domain: account.domain,
        routing_decision: acctRouting,
      });
    }
    if (accountRouteUpdates.length > 0) {
      await upsertAccounts(accountRouteUpdates);
    }

    try {
      writeCsv(path.join(outDir, "routing-decisions.csv"), decisions);
      fs.writeFileSync(path.join(outDir, "review-queue.json"), JSON.stringify(reviewQueue, null, 2));
    } catch {
      /* read-only fs */
    }

    await setStageStatus(runId, "route", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "route",
      action: "routing_completed",
      detail: {
        ...counts,
        review_queue_size: reviewQueue.length,
        enterprise_accounts: accountRouteUpdates.filter((a) => a.routing_decision === "enterprise_sales").length,
        pql_expansion: accountRouteUpdates.filter((a) => a.routing_decision === "self_serve_expansion").length,
      },
    });

    await setStageStatus(runId, "log", "completed", { outputPath: stageDir(runId, "log") });

    return { counts, reviewQueueSize: reviewQueue.length };
  } catch (err) {
    await setStageStatus(runId, "route", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
