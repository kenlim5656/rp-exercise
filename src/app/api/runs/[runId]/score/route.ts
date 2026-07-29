import { NextResponse } from "next/server";
import { runScoreStage } from "@/lib/stages/score";
import { getLeads } from "@/lib/runs";
import { checkStageDep } from "@/lib/stage-deps";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const leads = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
  return NextResponse.json({
    leads: leads.map((l) => ({
      lead_id: l.lead_id,
      deterministic_tier: l.deterministic_tier,
      deterministic_reasons: l.deterministic_reasons_json ? JSON.parse(l.deterministic_reasons_json) : [],
      deterministic_review_flag: !!l.deterministic_review_flag,
      llm_score: l.llm_score,
      llm_rationale: l.llm_rationale,
      score_divergence: l.score_divergence,
      scores_aligned: !!l.scores_aligned,
      score_divergence_flag: !!l.score_divergence_flag,
    })),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const depErr = await checkStageDep(runId, "score");
  if (depErr) return NextResponse.json({ error: depErr }, { status: 409 });
  try {
    await runScoreStage(runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
