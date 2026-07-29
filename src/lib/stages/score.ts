import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, setStageStatus, upsertLeads } from "../runs";
import { logAction } from "../audit";
import { writeCsv, type CsvRecord } from "../csv";
import { scoreDeterministic, type DeterministicScoringResult } from "../scoring/deterministic";
import { chunk, scoreLlmBatch, type LeadScore, type LlmScoringContext } from "../scoring/llm";
import { reconcileScores } from "../scoring/reconcile";

const BATCH_SIZE = 100;
const CONCURRENCY = 5;

/** Spec 6.0: deterministic tier scoring (6.1) + batched LLM probabilistic
 * scoring (6.2), then reconcile the two (6.3/6.4). */
export async function runScoreStage(runId: string) {
  await setStageStatus(runId, "score", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const outDir = stageDir(runId, "score");
    try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* read-only fs */ }

    const deterministicResults = new Map<string, DeterministicScoringResult>();
    const llmContexts: LlmScoringContext[] = [];
    const detUpdates: Array<{
      lead_id: string;
      deterministic_tier: string;
      deterministic_reasons_json: string;
      deterministic_review_flag: number;
      deterministic_review_reason: string | null | undefined;
    }> = [];

    for (const row of rows) {
      const lead = JSON.parse(row.sanitized_json!) as CsvRecord;
      const det = scoreDeterministic({
        jobTitle: lead.job_title,
        company: lead.company,
        companySize: lead.company_size,
        industry: lead.industry,
        emailNormalized: lead.email_normalized,
        emailType: (lead.email_type as "freemail" | "work") || "work",
        isCompetitorDomain: lead.is_competitor_domain === "True",
        isDisposableDomain: lead.is_disposable_domain === "True",
        isSuspiciousFake: lead.is_suspicious_fake === "True",
      });
      deterministicResults.set(row.lead_id, det);
      detUpdates.push({
        lead_id: row.lead_id,
        deterministic_tier: det.tier,
        deterministic_reasons_json: JSON.stringify(det.reasons),
        deterministic_review_flag: det.reviewFlag ? 1 : 0,
        deterministic_review_reason: det.reviewReason,
      });

      llmContexts.push({
        lead,
        cohort: row.cohort,
        claySummary: row.clay_json ? JSON.parse(row.clay_json) : null,
        crmSummary: row.crm_json ? JSON.parse(row.crm_json) : null,
        deterministicTier: det.tier,
        deterministicReasons: det.reasons,
      });
    }
    if (detUpdates.length > 0) {
      await upsertLeads(runId, detUpdates);
    }

    const batches = chunk(llmContexts, BATCH_SIZE);
    const llmResults: LeadScore[] = [];
    try { fs.mkdirSync(path.join(outDir, "llm-transcripts"), { recursive: true }); } catch { /* read-only fs */ }

    for (let start = 0; start < batches.length; start += CONCURRENCY) {
      const window = batches.slice(start, start + CONCURRENCY);
      const settled = await Promise.allSettled(window.map((b) => scoreLlmBatch(b)));
      for (let j = 0; j < settled.length; j++) {
        const i = start + j;
        const result = settled[j];
        if (result.status === "fulfilled") {
          llmResults.push(...result.value);
          try {
            fs.writeFileSync(
              path.join(outDir, "llm-transcripts", `batch-${i}.json`),
              JSON.stringify({ batchIndex: i, input: window[j], output: result.value }, null, 2),
            );
          } catch { /* read-only fs */ }
        } else {
          console.error(`LLM batch ${i} failed:`, result.reason);
        }
      }
    }
    try { fs.writeFileSync(path.join(outDir, "llm-scores.json"), JSON.stringify(llmResults, null, 2)); } catch { /* read-only fs */ }

    const llmByLead = new Map(llmResults.map((s) => [s.leadId, s]));
    const combined: CsvRecord[] = [];
    let divergenceFlaggedCount = 0;

    const reconcileUpdates: Array<{
      lead_id: string;
      llm_score: number | null;
      llm_rationale: string | null;
      score_divergence: number | null;
      scores_aligned: number;
      score_divergence_flag: number;
      final_tier: string;
    }> = [];

    for (const row of rows) {
      const det = deterministicResults.get(row.lead_id)!;
      const llm = llmByLead.get(row.lead_id);
      const { scoreDivergence, scoresAligned, divergenceFlag } = reconcileScores(det.tier, llm?.probabilisticScore ?? null);
      if (divergenceFlag) divergenceFlaggedCount++;

      reconcileUpdates.push({
        lead_id: row.lead_id,
        llm_score: llm?.probabilisticScore ?? null,
        llm_rationale: llm?.rationale ?? null,
        score_divergence: scoreDivergence,
        scores_aligned: scoresAligned ? 1 : 0,
        score_divergence_flag: divergenceFlag ? 1 : 0,
        final_tier: det.tier,
      });

      combined.push({
        lead_id: row.lead_id,
        deterministic_tier: det.tier,
        llm_score: String(llm?.probabilisticScore ?? ""),
        llm_rationale: llm?.rationale ?? "",
        score_divergence: String(scoreDivergence ?? ""),
        scores_aligned: String(scoresAligned),
      });
    }
    if (reconcileUpdates.length > 0) {
      await upsertLeads(runId, reconcileUpdates);
    }
    try { writeCsv(path.join(outDir, "combined-scores.csv"), combined); } catch { /* read-only fs */ }

    await setStageStatus(runId, "score", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "score",
      action: "scoring_completed",
      detail: { leads_scored: rows.length, llm_batches: batches.length, divergence_flagged_count: divergenceFlaggedCount },
    });
  } catch (err) {
    await setStageStatus(runId, "score", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
