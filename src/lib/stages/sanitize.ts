import { parse } from "csv-parse/sync";
import { sanitizeLeads, type SanitizeReport } from "../pipeline/sanitize";
import { setStageStatus, setStageOutput, getStageOutput, updateRun, upsertLeads } from "../runs";
import { logAction } from "../audit";

export interface SanitizeInstructions {
  notes?: string;
  overrides?: Record<string, unknown>;
}

export { type SanitizeReport };

export async function runSanitizeStage(
  runId: string,
  approved: boolean,
  instructions?: SanitizeInstructions,
): Promise<SanitizeReport> {
  if (!approved) {
    throw new Error("sanitize requires explicit user approval (spec 2.1)");
  }

  const db = (await import("../db")).getDb();
  const result = await db.execute({ sql: `SELECT raw_csv FROM runs WHERE id = ?`, args: [runId] });
  const row = result.rows[0] as unknown as { raw_csv: string | null } | undefined;
  if (!row?.raw_csv) throw new Error("No CSV data available for sanitization");

  const records = parse(row.raw_csv, { columns: true, skip_empty_lines: true, trim: false }) as Record<string, string>[];

  await setStageStatus(runId, "sanitize", "running");
  try {
    const { rows: sanitizedRows, report } = sanitizeLeads(records, instructions);

    const rawById = new Map(records.map((r) => [r.lead_id, r]));

    await upsertLeads(
      runId,
      sanitizedRows.map((srow) => ({
        lead_id: srow.lead_id,
        raw_json: JSON.stringify(rawById.get(srow.lead_id) ?? {}),
        sanitized_json: JSON.stringify(srow),
        dedup_group_id: srow.dedup_group_id || null,
        is_duplicate_primary: srow.is_duplicate_primary === "true" ? 1 : 0,
        dedup_conflict_flag: srow.dedup_conflict_flag === "true" ? 1 : 0,
      })),
    );

    const primaryCount = sanitizedRows.filter((r) => r.is_duplicate_primary === "true").length;
    await updateRun(runId, { row_count_sanitized: primaryCount });
    await setStageOutput(runId, "sanitize", report);
    await setStageStatus(runId, "sanitize", "completed");
    await logAction({
      runId,
      stage: "sanitize",
      action: "sanitize_completed",
      detail: {
        row_count_out: report.row_count_out,
        duplicate_groups_found: report.transformations_applied.duplicate_groups_found,
        duplicate_conflict_groups: report.transformations_applied.duplicate_conflict_groups,
        instructions_applied: report.instructions_applied,
      },
    });
    return report;
  } catch (err) {
    await setStageStatus(runId, "sanitize", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}

export async function getSanitizeReport(runId: string): Promise<SanitizeReport | null> {
  return getStageOutput<SanitizeReport>(runId, "sanitize");
}
