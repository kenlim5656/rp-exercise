import { NextResponse } from "next/server";
import { getLeads, getAccounts, getRun, getStages, setStageStatus } from "@/lib/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  let stages = await getStages(runId);

  const byKey = new Map(stages.map((s) => [s.stage_key, s]));
  if (byKey.get("analyze")?.status === "awaiting_approval" && byKey.get("sanitize")?.status === "completed") {
    await setStageStatus(runId, "analyze", "completed");
    stages = await getStages(runId);
  }
  const leads = await getLeads(runId);
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

  const tierCounts: Record<string, number> = {};
  for (const l of primary) {
    const tier = l.final_tier || l.deterministic_tier;
    if (tier) tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  const accounts = await getAccounts(runId);
  const accountStats = {
    total: accounts.length,
    aql_qualified: accounts.filter((a) => a.aql_status === "aql_account").length,
    pql_active: accounts.filter((a) => a.aql_status === "pql_user").length,
    customers: accounts.filter((a) => a.aql_status === "customer").length,
  };

  return NextResponse.json({
    run,
    stages,
    summary: {
      total_leads: leads.length,
      primary_leads: primary.length,
      duplicate_leads: leads.length - primary.length,
      cohorts: cohortCounts,
      routing: routingCounts,
      tiers: tierCounts,
      needs_review: needsReviewCount,
      accounts: accountStats,
    },
  });
}
