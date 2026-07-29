import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, setStageStatus, upsertLeads } from "../runs";
import { logAction } from "../audit";
import { readCsv, writeCsv, type CsvRecord } from "../csv";
import { bqMatchSignups } from "../mocks/bigquery";

/** Spec 3.0: match sanitized (primary, non-duplicate) leads against the
 * simulated internal signup/customer database and split into the
 * "cohort-existing users" / "cohort-new users" files. */
export async function runMatchStage(runId: string) {
  await setStageStatus(runId, "match", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const leads = rows.map((r) => JSON.parse(r.sanitized_json!) as CsvRecord);

    const { response, matchByEmail } = bqMatchSignups(leads);

    const existing: CsvRecord[] = [];
    const newCohort: CsvRecord[] = [];
    const updates: Array<{ lead_id: string; cohort: string; matched_customer_id: string | null }> = [];
    for (const lead of leads) {
      const match = matchByEmail.get(lead.email_normalized);
      if (match) {
        existing.push(lead);
        updates.push({ lead_id: lead.lead_id, cohort: "existing", matched_customer_id: match.customer_id });
      } else {
        newCohort.push(lead);
        updates.push({ lead_id: lead.lead_id, cohort: "new", matched_customer_id: null });
      }
    }
    await upsertLeads(runId, updates);

    const outDir = stageDir(runId, "match");
    const methodBreakdown = response.rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.match_method] = (acc[r.match_method] ?? 0) + 1;
      return acc;
    }, {});
    try {
      fs.mkdirSync(outDir, { recursive: true });
      writeCsv(path.join(outDir, "cohort-existing.csv"), existing);
      writeCsv(path.join(outDir, "cohort-new.csv"), newCohort);
      fs.writeFileSync(
        path.join(outDir, "match-report.json"),
        JSON.stringify({ bqResponse: response, existing_count: existing.length, new_count: newCohort.length, method_breakdown: methodBreakdown }, null, 2),
      );
    } catch {
      // Filesystem write may fail on read-only filesystem (Vercel) — DB is authoritative
    }

    await setStageStatus(runId, "match", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "match",
      action: "bq_signup_match",
      detail: { matched_count: existing.length, new_count: newCohort.length, method_breakdown: methodBreakdown },
    });
    return { existing_count: existing.length, new_count: newCohort.length };
  } catch (err) {
    await setStageStatus(runId, "match", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}

export function getCohorts(runId: string): { existing: CsvRecord[]; new: CsvRecord[] } {
  try {
    const outDir = stageDir(runId, "match");
    const existingPath = path.join(outDir, "cohort-existing.csv");
    const newPath = path.join(outDir, "cohort-new.csv");
    return {
      existing: fs.existsSync(existingPath) ? readCsv(existingPath) : [],
      new: fs.existsSync(newPath) ? readCsv(newPath) : [],
    };
  } catch {
    return { existing: [], new: [] };
  }
}
