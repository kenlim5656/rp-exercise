import { analyzeLeadsCsv, type AnalysisReport } from "../pipeline/analyze";
import { getRun, setStageStatus, setStageOutput, getStageOutput, updateRun } from "../runs";
import { logAction } from "../audit";

export type { AnalysisReport };

export async function runAnalyzeStage(runId: string, csvContent?: string): Promise<AnalysisReport> {
  const run = await getRun(runId);
  if (!run) throw new Error(`run ${runId} not found`);

  if (!csvContent) {
    const db = (await import("../db")).getDb();
    const result = await db.execute({ sql: `SELECT raw_csv FROM runs WHERE id = ?`, args: [runId] });
    const row = result.rows[0] as unknown as { raw_csv: string | null } | undefined;
    csvContent = row?.raw_csv ?? undefined;
  }
  if (!csvContent) throw new Error("No CSV data available for analysis");

  await setStageStatus(runId, "analyze", "running");
  try {
    const report = analyzeLeadsCsv(csvContent);

    await updateRun(runId, { row_count_raw: report.meta.row_count });
    await setStageOutput(runId, "analyze", report);
    await setStageStatus(runId, "analyze", "awaiting_approval");
    await logAction({
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
    await setStageStatus(runId, "analyze", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}

export async function getAnalysisReport(runId: string): Promise<AnalysisReport | null> {
  return getStageOutput<AnalysisReport>(runId, "analyze");
}
