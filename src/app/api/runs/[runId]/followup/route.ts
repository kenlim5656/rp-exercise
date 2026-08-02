import { NextResponse } from "next/server";
import { runFollowupStage } from "@/lib/stages/followup";
import { getLeads, leadDisplayFields } from "@/lib/runs";
import { checkStageDep } from "@/lib/stage-deps";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const leads = (await getLeads(runId)).filter(
    (l) => l.is_duplicate_primary === 1 && l.routing_decision && l.routing_decision !== "suppressed",
  );

  const totalEligible = leads.filter((l) => l.routing_decision !== "self_serve_newsletter").length;
  const totalProcessed = leads.filter((l) => {
    if (!l.followup_json) return false;
    try { return !JSON.parse(l.followup_json).error; } catch { return false; }
  }).length;

  return NextResponse.json({
    total_eligible: totalEligible,
    total_processed: totalProcessed,
    leads: leads.map((l) => ({
      lead_id: l.lead_id,
      routing_decision: l.routing_decision,
      final_tier: l.final_tier,
      deterministic_tier: l.deterministic_tier,
      llm_score: l.llm_score,
      score_divergence: l.score_divergence,
      needs_review: !!l.needs_review,
      ...leadDisplayFields(l),
      followup: l.followup_json ? JSON.parse(l.followup_json) : null,
      executed: l.followup_executed_json ? JSON.parse(l.followup_executed_json) : {},
    })),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const depErr = await checkStageDep(runId, "followup");
  if (depErr) return NextResponse.json({ error: depErr }, { status: 409 });
  try {
    const result = await runFollowupStage(runId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
