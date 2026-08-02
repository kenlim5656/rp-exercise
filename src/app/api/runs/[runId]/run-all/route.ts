import { NextResponse } from "next/server";
import { getStages, type StageKey } from "@/lib/runs";
import { runSanitizeStage } from "@/lib/stages/sanitize";
import { runMatchStage } from "@/lib/stages/match";
import { runEnrichStage } from "@/lib/stages/enrich";
import { runCrmStage } from "@/lib/stages/crm";
import { runScoreStage } from "@/lib/stages/score";
import { runRoutingStage } from "@/lib/stages/route";
import { runFollowupStage } from "@/lib/stages/followup";

const PIPELINE: Array<{
  key: string;
  run: (runId: string) => Promise<unknown>;
}> = [
  { key: "sanitize", run: (id) => runSanitizeStage(id, true) },
  { key: "match", run: runMatchStage },
  { key: "enrich", run: runEnrichStage },
  { key: "crm", run: runCrmStage },
  { key: "score", run: runScoreStage },
  { key: "route", run: runRoutingStage },
  { key: "followup", run: runFollowupStage },
];

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const stages = await getStages(runId);
  const byKey = new Map(stages.map((s) => [s.stage_key, s.status]));

  if (byKey.get("analyze") !== "awaiting_approval" && byKey.get("analyze") !== "completed") {
    return NextResponse.json(
      { error: "Analysis must be completed or awaiting approval before running the full pipeline." },
      { status: 409 },
    );
  }

  const results: Array<{ stage: string; status: string; error?: string }> = [];

  for (const step of PIPELINE) {
    const current = byKey.get(step.key as StageKey);
    if (current === "completed") {
      results.push({ stage: step.key, status: "skipped" });
      continue;
    }
    try {
      await step.run(runId);
      results.push({ stage: step.key, status: "completed" });
    } catch (err) {
      results.push({ stage: step.key, status: "failed", error: (err as Error).message });
      return NextResponse.json({ results, error: `Pipeline stopped at ${step.key}: ${(err as Error).message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, results });
}
