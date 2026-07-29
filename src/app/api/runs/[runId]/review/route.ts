import { NextRequest, NextResponse } from "next/server";
import { getReviewQueue, recordReviewAction, upsertLeads } from "@/lib/runs";
import { logAction } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const queue = (await getReviewQueue(runId)).map((l) => ({
    lead_id: l.lead_id,
    cohort: l.cohort,
    deterministic_tier: l.deterministic_tier,
    llm_score: l.llm_score,
    routing_decision: l.routing_decision,
    review_status: l.review_status,
    review_reasons: l.review_reasons_json ? JSON.parse(l.review_reasons_json) : [],
    lead: l.sanitized_json ? JSON.parse(l.sanitized_json) : null,
  }));
  return NextResponse.json({ queue });
}

/** 7.2 approve/reject a review-queue lead. On reject, the routing decision
 * is overridden to `suppressed` by default rather than mutating the
 * system's original computed decision -- both stay visible in the audit
 * trail (the original via review_reasons/history, the override via
 * routing_decision). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const body = (await req.json()) as { leadId: string; action: "approve" | "reject"; actor: string; note?: string };

  if (!body.leadId || !body.action || !body.actor) {
    return NextResponse.json({ error: "leadId, action, and actor are required" }, { status: 400 });
  }

  await recordReviewAction({ runId, leadId: body.leadId, action: body.action, reason: body.note, actor: body.actor });

  if (body.action === "reject") {
    await upsertLeads(runId, [{ lead_id: body.leadId, routing_decision: "suppressed" }]);
  }

  await logAction({
    runId,
    stage: "review",
    action: `review_${body.action}`,
    entityRef: body.leadId,
    detail: { actor: body.actor },
  });

  return NextResponse.json({ ok: true });
}
