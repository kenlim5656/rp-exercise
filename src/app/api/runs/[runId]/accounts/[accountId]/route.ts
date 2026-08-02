import { NextResponse } from "next/server";
import { getAccount, getAccountLeads, getAccountPropensity, leadDisplayFields } from "@/lib/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string; accountId: string }> }) {
  const { runId, accountId } = await params;
  const account = await getAccount(runId, accountId);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const leads = await getAccountLeads(runId, accountId);
  const posthog = account.posthog_json ? JSON.parse(account.posthog_json) : null;

  let propensity = null;
  try {
    const prop = await getAccountPropensity(accountId);
    if (prop) {
      propensity = {
        propensity_score: prop.propensity_score,
        propensity_percentile: prop.propensity_percentile,
        predicted_acv: prop.predicted_acv,
        next_likely_purchase: prop.next_likely_purchase,
        purchase_drivers: JSON.parse(prop.purchase_drivers_json),
        model_source: prop.model_source,
        model_version: prop.model_version,
      };
    }
  } catch { /* table may not exist */ }

  return NextResponse.json({
    account: {
      ...account,
      posthog: posthog,
      posthog_json: undefined,
      propensity,
      tech_stack: account.tech_stack_json ? JSON.parse(account.tech_stack_json) : null,
      tech_stack_json: undefined,
    },
    leads: leads
      .filter((l) => l.is_duplicate_primary)
      .map((l) => ({
        lead_id: l.lead_id,
        role: l.role,
        pql_score: l.pql_score,
        routing_decision: l.routing_decision,
        deterministic_tier: l.deterministic_tier,
        llm_score: l.llm_score,
        needs_review: !!l.needs_review,
        event_summary: l.event_summary_json ? JSON.parse(l.event_summary_json) : null,
        followup: l.followup_json ? JSON.parse(l.followup_json) : null,
        ...leadDisplayFields(l),
      })),
  });
}
