import { NextResponse } from "next/server";
import { runRoutingStage } from "@/lib/stages/route";
import { getLeads, leadDisplayFields } from "@/lib/runs";
import { checkStageDep } from "@/lib/stage-deps";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const leads = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
  return NextResponse.json({
    leads: leads.map((l) => ({
      lead_id: l.lead_id,
      ...leadDisplayFields(l),
      final_tier: l.final_tier,
      deterministic_tier: l.deterministic_tier,
      routing_decision: l.routing_decision,
      needs_review: !!l.needs_review,
      review_reasons: l.review_reasons_json ? JSON.parse(l.review_reasons_json) : [],
    })),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const depErr = await checkStageDep(runId, "route");
  if (depErr) return NextResponse.json({ error: depErr }, { status: 409 });
  try {
    const result = await runRoutingStage(runId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
