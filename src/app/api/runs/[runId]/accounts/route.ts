import { NextResponse } from "next/server";
import { getAccounts, getLeads, getAccountPropensities, leadDisplayFields } from "@/lib/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const accounts = await getAccounts(runId);
  const leads = await getLeads(runId);

  const leadsByAccount = new Map<string, typeof leads>();
  for (const lead of leads) {
    if (!lead.account_id || !lead.is_duplicate_primary) continue;
    if (!leadsByAccount.has(lead.account_id)) leadsByAccount.set(lead.account_id, []);
    leadsByAccount.get(lead.account_id)!.push(lead);
  }

  let propensityMap = new Map<string, import("@/lib/runs").AccountPropensityRow>();
  try {
    propensityMap = await getAccountPropensities(accounts.map((a) => a.id));
  } catch { /* table may not exist */ }

  return NextResponse.json({
    accounts: accounts.map((a) => {
      const acctLeads = leadsByAccount.get(a.id) ?? [];
      const prop = propensityMap.get(a.id);
      return {
        ...a,
        posthog_json: undefined,
        tech_stack_json: undefined,
        lead_count: acctLeads.length,
        propensity: prop ? {
          propensity_score: prop.propensity_score,
          propensity_percentile: prop.propensity_percentile,
          predicted_acv: prop.predicted_acv,
          next_likely_purchase: prop.next_likely_purchase,
          purchase_drivers: JSON.parse(prop.purchase_drivers_json),
          model_source: prop.model_source,
        } : null,
        leads: acctLeads.map((l) => ({
          lead_id: l.lead_id,
          role: l.role,
          pql_score: l.pql_score,
          routing_decision: l.routing_decision,
          deterministic_tier: l.deterministic_tier,
          llm_score: l.llm_score,
          ...leadDisplayFields(l),
        })),
      };
    }),
  });
}
