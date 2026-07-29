import { NextResponse } from "next/server";
import { getLeads, getRun, getStages } from "@/lib/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stages = getStages(runId);
  const leads = getLeads(runId);
  const primary = leads.filter((l) => l.is_duplicate_primary === 1);

  const cohortCounts = { existing: 0, new: 0, unassigned: 0 };
  const routingCounts: Record<string, number> = {};
  let needsReviewCount = 0;
  for (const l of primary) {
    if (l.cohort === "existing") cohortCounts.existing++;
    else if (l.cohort === "new") cohortCounts.new++;
    else cohortCounts.unassigned++;
    if (l.routing_decision) routingCounts[l.routing_decision] = (routingCounts[l.routing_decision] ?? 0) + 1;
    if (l.needs_review) needsReviewCount++;
  }

  return NextResponse.json({
    run,
    stages,
    summary: {
      total_leads: leads.length,
      primary_leads: primary.length,
      duplicate_leads: leads.length - primary.length,
      cohorts: cohortCounts,
      routing: routingCounts,
      needs_review: needsReviewCount,
    },
  });
}
