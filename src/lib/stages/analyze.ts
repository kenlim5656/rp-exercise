import fs from "node:fs";
import path from "node:path";
import { PYTHON_SCRIPT_PATH, stageDir } from "../paths";
import { runPythonJson } from "../python-bridge";
import { getRun, setStageStatus, updateRun } from "../runs";
import { logAction } from "../audit";

export interface AnalysisReport {
  meta: { input_file: string; row_count: number; column_count: number; generated_at: string };
  columns: Array<{ name: string; dtype: string; null_count: number; null_pct: number; distinct_count: number }>;
  duplicates: { exact_email_dupes: number; normalized_email_dupes: number; sample_groups: unknown[] };
  anomalies: Record<string, unknown>;
  recommendations: Array<{ field: string; issue: string; proposed_fix: string; affected_rows: number }>;
}

/** Spec 1.1/1.2: run the pandas analyze script and surface the anomaly
 * report. Ends in `awaiting_approval` (not `completed`) -- sanitize (2.1)
 * only proceeds once the user approves. */
export async function runAnalyzeStage(runId: string): Promise<AnalysisReport> {
  const run = getRun(runId);
  if (!run) throw new Error(`run ${runId} not found`);

  setStageStatus(runId, "analyze", "running");
  try {
    const inputPath = path.join(stageDir(runId, "raw"), "original-upload.csv");
    const outDir = stageDir(runId, "analysis");
    const report = await runPythonJson<AnalysisReport>(PYTHON_SCRIPT_PATH, [
      "analyze",
      "--input",
      inputPath,
      "--output-dir",
      outDir,
    ]);

    updateRun(runId, { row_count_raw: report.meta.row_count });
    setStageStatus(runId, "analyze", "awaiting_approval", {
      outputPath: path.join(outDir, "analysis-report.json"),
    });
    logAction({
      runId,
      stage: "analyze",
      action: "analysis_completed",
      detail: {
        row_count: report.meta.row_count,
        normalized_email_dupes: report.duplicates.normalized_email_dupes,
        recommendation_count: report.recommendations.length,
      },
    });
    return report;
  } catch (err) {
    setStageStatus(runId, "analyze", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}

export function getAnalysisReport(runId: string): AnalysisReport | null {
  const p = path.join(stageDir(runId, "analysis"), "analysis-report.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
