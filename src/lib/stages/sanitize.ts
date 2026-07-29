import fs from "node:fs";
import path from "node:path";
import { PYTHON_SCRIPT_PATH, stageDir } from "../paths";
import { runPythonJson } from "../python-bridge";
import { setStageStatus, updateRun, upsertLeads } from "../runs";
import { logAction } from "../audit";
import { readCsv } from "../csv";

export interface SanitizeInstructions {
  notes?: string;
  overrides?: Record<string, unknown>;
}

export interface SanitizeReport {
  meta: { input_file: string; row_count_in: number; generated_at: string };
  row_count_out: number;
  transformations_applied: Record<string, number>;
  instructions_applied: string[];
  instructions_notes: string;
  sanitized_csv_path: string;
}

/** Spec 2.1/2.2: user-approval-gated sanitize. Writes the user's free-text
 * instructions/overrides to disk before invoking the script so there's an
 * audit trail of what was asked for vs. applied, then populates the `leads`
 * table for the first time from the sanitized output. */
export async function runSanitizeStage(
  runId: string,
  approved: boolean,
  instructions?: SanitizeInstructions,
): Promise<SanitizeReport> {
  if (!approved) {
    throw new Error("sanitize requires explicit user approval (spec 2.1)");
  }

  setStageStatus(runId, "sanitize", "running");
  try {
    const inputPath = path.join(stageDir(runId, "raw"), "original-upload.csv");
    const outDir = stageDir(runId, "sanitize");
    fs.mkdirSync(outDir, { recursive: true });

    const args = ["sanitize", "--input", inputPath, "--output-dir", outDir];
    if (instructions) {
      const instructionsPath = path.join(outDir, "sanitize-instructions.json");
      fs.writeFileSync(instructionsPath, JSON.stringify(instructions, null, 2));
      args.push("--instructions-file", instructionsPath);
    }

    const report = await runPythonJson<SanitizeReport>(PYTHON_SCRIPT_PATH, args);

    const sanitizedRows = readCsv(path.join(outDir, "sanitized.csv"));
    const rawRows = readCsv(inputPath);
    const rawById = new Map(rawRows.map((r) => [r.lead_id, r]));

    upsertLeads(
      runId,
      sanitizedRows.map((row) => ({
        lead_id: row.lead_id,
        raw_json: JSON.stringify(rawById.get(row.lead_id) ?? {}),
        sanitized_json: JSON.stringify(row),
        dedup_group_id: row.dedup_group_id || null,
        is_duplicate_primary: row.is_duplicate_primary === "True" ? 1 : 0,
        dedup_conflict_flag: row.dedup_conflict_flag === "True" ? 1 : 0,
      })),
    );

    const primaryCount = sanitizedRows.filter((r) => r.is_duplicate_primary === "True").length;
    updateRun(runId, { row_count_sanitized: primaryCount });
    setStageStatus(runId, "sanitize", "completed", { outputPath: path.join(outDir, "sanitized.csv") });
    logAction({
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
    setStageStatus(runId, "sanitize", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}

export function getSanitizeReport(runId: string): SanitizeReport | null {
  const p = path.join(stageDir(runId, "sanitize"), "sanitize-report.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
