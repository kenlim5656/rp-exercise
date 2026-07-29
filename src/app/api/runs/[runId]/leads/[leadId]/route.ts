import { NextResponse } from "next/server";
import { getLead } from "@/lib/runs";

export const dynamic = "force-dynamic";

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string; leadId: string }> },
) {
  const { runId, leadId } = await params;
  const lead = await getLead(runId, leadId);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    ...lead,
    raw_json: safeParse(lead.raw_json),
    sanitized_json: safeParse(lead.sanitized_json),
    clay_json: safeParse(lead.clay_json),
    crm_json: safeParse(lead.crm_json),
    deterministic_reasons_json: safeParse(lead.deterministic_reasons_json),
    review_reasons_json: safeParse(lead.review_reasons_json),
    is_duplicate_primary: !!lead.is_duplicate_primary,
    dedup_conflict_flag: !!lead.dedup_conflict_flag,
    deterministic_review_flag: !!lead.deterministic_review_flag,
    scores_aligned: !!lead.scores_aligned,
    score_divergence_flag: !!lead.score_divergence_flag,
    needs_review: !!lead.needs_review,
  });
}
