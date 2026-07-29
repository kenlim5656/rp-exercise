import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, setStageStatus, upsertLeads } from "../runs";
import { logAction } from "../audit";
import type { CsvRecord } from "../csv";
import {
  clayFirmographicEnrichment,
  clayIdentityResolution,
  clayIntentScore,
  type IntentScoreResult,
} from "../mocks/clay";
import { getInternalIntentScore } from "../mocks/bigquery";

/** Spec 4.0: identity resolution + firmographic enrichment + intent scoring
 * for the new-user cohort via the simulated Clay workflows, plus the
 * existing-user cohort's intent-score backfill (4.3). */
export async function runEnrichStage(runId: string) {
  await setStageStatus(runId, "enrich", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const outDir = stageDir(runId, "enrich");
    try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* read-only fs */ }

    const newCohort = rows.filter((r) => r.cohort === "new").map((r) => JSON.parse(r.sanitized_json!) as CsvRecord);
    const existingCohort = rows.filter((r) => r.cohort === "existing").map((r) => JSON.parse(r.sanitized_json!) as CsvRecord);

    // 4.1.1 identity resolution -- freemail only, work-domain emails skipped.
    const freemail = newCohort.filter((l) => l.email_type === "freemail");
    const identity = clayIdentityResolution(freemail);
    try { fs.writeFileSync(path.join(outDir, "clay-identity-resolution.json"), JSON.stringify(identity, null, 2)); } catch { /* read-only fs */ }

    // 4.1.2 firmographic enrichment -- only for freemail leads identity resolved to an account.
    const resolvedForEnrichment = freemail.map((lead, i) => ({ lead, resolution: identity.matches[i].data }));
    const enrichment = clayFirmographicEnrichment(resolvedForEnrichment);
    try { fs.writeFileSync(path.join(outDir, "clay-enrichment.json"), JSON.stringify(enrichment, null, 2)); } catch { /* read-only fs */ }

    const identityByLead = new Map(identity.matches.map((m) => [m.data.lead_id, m.data]));
    const enrichmentByLead = new Map(enrichment.matches.map((m) => [m.data.lead_id, m.data]));

    // 4.1.3 intent scoring -- all new-cohort leads.
    const intentScores: Record<string, IntentScoreResult> = {};
    const allEnrichUpdates: Array<{ lead_id: string; clay_json: string }> = [];
    for (const lead of newCohort) {
      const intent = clayIntentScore(lead.email_normalized);
      intentScores[lead.lead_id] = intent;
      const clayJson = {
        identity: identityByLead.get(lead.lead_id) ?? null,
        firmographics: enrichmentByLead.get(lead.lead_id) ?? null,
        intent,
      };
      allEnrichUpdates.push({ lead_id: lead.lead_id, clay_json: JSON.stringify(clayJson) });
    }

    // 4.3 existing cohort -- use internally-recorded intent score if present, else fall back to Clay.
    let existingFromInternal = 0;
    let existingFromClay = 0;
    for (const lead of existingCohort) {
      const internalScore = getInternalIntentScore(lead.email_normalized);
      let clayJson: Record<string, unknown>;
      if (internalScore !== null) {
        existingFromInternal++;
        clayJson = { intent: { intentScore: internalScore, source: "internal" } };
      } else {
        existingFromClay++;
        const intent = clayIntentScore(lead.email_normalized);
        intentScores[lead.lead_id] = intent;
        clayJson = { intent: { ...intent, source: "clay" } };
      }
      allEnrichUpdates.push({ lead_id: lead.lead_id, clay_json: JSON.stringify(clayJson) });
    }
    if (allEnrichUpdates.length > 0) {
      await upsertLeads(runId, allEnrichUpdates);
    }
    try { fs.writeFileSync(path.join(outDir, "clay-intent-scores.json"), JSON.stringify(intentScores, null, 2)); } catch { /* read-only fs */ }

    await setStageStatus(runId, "enrich", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "enrich",
      action: "clay_enrichment_completed",
      detail: {
        new_cohort_count: newCohort.length,
        freemail_count: freemail.length,
        identity_resolved_count: identity.matches.filter((m) => m.data.resolved).length,
        existing_cohort_count: existingCohort.length,
        existing_intent_from_internal: existingFromInternal,
        existing_intent_from_clay: existingFromClay,
      },
    });
  } catch (err) {
    await setStageStatus(runId, "enrich", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
