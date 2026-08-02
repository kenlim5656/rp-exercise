import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, getAccounts, setStageStatus, upsertLeads, upsertAccounts } from "../runs";
import { logAction } from "../audit";
import { writeCsv, type CsvRecord } from "../csv";
import { scoreDeterministic, type DeterministicScoringResult } from "../scoring/deterministic";
import { chunk, scoreLlmBatch, type LeadScore, type LlmScoringContext } from "../scoring/llm";
import { reconcileScores } from "../scoring/reconcile";
import { scorePQL, scoreAQL } from "../scoring/pql";
import { posthogBatchLookup } from "../mocks/posthog";
import { getAccountPropensities } from "../runs";

const BATCH_SIZE = 100;
const CONCURRENCY = 5;

/** Spec 6.0: deterministic tier scoring (6.1) + batched LLM probabilistic
 * scoring (6.2), then reconcile the two (6.3/6.4).
 * v3: Also computes PQL scores per user and AQL scores per account. */
export async function runScoreStage(runId: string) {
  await setStageStatus(runId, "score", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const outDir = stageDir(runId, "score");
    try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* read-only fs */ }

    // ── Phase 1: MQL deterministic + LLM scoring (unchanged from v2) ──
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
        propensity: null,
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

    // ── Phase 2: PQL/AQL scoring (v3) ──
    const accounts = await getAccounts(runId);
    const freshLeads = await getLeads(runId);
    const leadsByAccount = new Map<string, typeof freshLeads>();
    for (const lead of freshLeads) {
      if (!lead.account_id) continue;
      if (!leadsByAccount.has(lead.account_id)) leadsByAccount.set(lead.account_id, []);
      leadsByAccount.get(lead.account_id)!.push(lead);
    }

    // Fetch PostHog telemetry for all account domains
    const domains = accounts.map((a) => a.domain);
    const posthogData = posthogBatchLookup(domains);

    // Score individual PQLs
    const pqlUpdates: Array<{ lead_id: string; pql_score: number; event_summary_json: string }> = [];
    for (const lead of freshLeads) {
      if (!lead.is_duplicate_primary) continue;
      const sanitized = lead.sanitized_json ? JSON.parse(lead.sanitized_json) : {};
      const acctDomain = lead.account_id
        ? accounts.find((a) => a.id === lead.account_id)?.domain
        : null;
      const ph = acctDomain ? posthogData.get(acctDomain) : null;
      const userEvents = ph?.events.filter(
        (e) => e.properties.distinct_id?.toString().includes(lead.lead_id.slice(-6)) || Math.random() < 0.3
      ) ?? [];

      const pqlResult = scorePQL({
        role: lead.role || sanitized.job_title || "",
        industry: sanitized.industry || "",
        companySize: sanitized.company_size || "",
        events: userEvents,
      });

      pqlUpdates.push({
        lead_id: lead.lead_id,
        pql_score: pqlResult.pqlScore,
        event_summary_json: JSON.stringify({ signals: pqlResult.signals, event_count: userEvents.length }),
      });
    }
    if (pqlUpdates.length > 0) {
      await upsertLeads(runId, pqlUpdates);
    }

    // Score AQLs at account level
    const accountUpdates: Array<{
      id: string;
      run_id: string;
      domain: string;
      aql_score: number;
      fit_score: number;
      usage_score: number;
      aql_status: string;
      posthog_json: string | null;
    }> = [];

    for (const account of accounts) {
      const accountLeads = leadsByAccount.get(account.id) ?? [];
      const ph = posthogData.get(account.domain) ?? null;

      const pqlScores = pqlUpdates
        .filter((u) => accountLeads.some((l) => l.lead_id === u.lead_id))
        .map((u) => u.pql_score);
      const avgPql = pqlScores.length > 0 ? pqlScores.reduce((a, b) => a + b, 0) / pqlScores.length : 0;

      const aqlResult = scoreAQL({
        domain: account.domain,
        employeeCount: account.employee_count,
        industry: account.industry,
        fundingStage: account.funding_stage,
        posthog: ph,
        leadCount: accountLeads.length,
        avgPqlScore: avgPql,
      });

      accountUpdates.push({
        id: account.id,
        run_id: runId,
        domain: account.domain,
        aql_score: aqlResult.aqlScore,
        fit_score: aqlResult.fitScore,
        usage_score: aqlResult.usageScore,
        aql_status: aqlResult.aqlStatus,
        posthog_json: ph ? JSON.stringify(ph) : null,
      });
    }
    if (accountUpdates.length > 0) {
      await upsertAccounts(accountUpdates);
    }

    // ── Phase 3: Propensity-based AQL boost (v3-propensity) ──
    let propensityBoosted = 0;
    try {
      const accountIds = accounts.map((a) => a.id);
      const propensityMap = await getAccountPropensities(accountIds);

      const boostUpdates: Array<{ id: string; run_id: string; domain: string; aql_score: number; aql_status: string }> = [];
      for (const upd of accountUpdates) {
        const prop = propensityMap.get(upd.id);
        if (!prop || prop.propensity_percentile < 80) continue;

        const boostedScore = Math.min(100, upd.aql_score + 15);
        const newStatus = boostedScore >= 80 ? "aql_account" : upd.aql_status;
        if (boostedScore !== upd.aql_score) {
          boostUpdates.push({ id: upd.id, run_id: runId, domain: upd.domain, aql_score: boostedScore, aql_status: newStatus });
          propensityBoosted++;
        }
      }
      if (boostUpdates.length > 0) {
        await upsertAccounts(boostUpdates);
      }
    } catch (propErr) {
      console.error("Propensity AQL boost failed (non-fatal):", (propErr as Error).message);
    }

    await setStageStatus(runId, "score", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "score",
      action: "scoring_completed",
      detail: {
        leads_scored: rows.length,
        llm_batches: batches.length,
        divergence_flagged_count: divergenceFlaggedCount,
        accounts_scored: accountUpdates.length,
        aql_qualified: accountUpdates.filter((a) => a.aql_status === "aql_account").length,
        pql_qualified: accountUpdates.filter((a) => a.aql_status === "pql_user").length,
        propensity_boosted: propensityBoosted,
      },
    });
  } catch (err) {
    await setStageStatus(runId, "score", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
