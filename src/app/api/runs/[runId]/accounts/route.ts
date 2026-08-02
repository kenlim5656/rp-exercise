import { NextResponse } from "next/server";
import { getAccounts, getLeads, leadDisplayFields } from "@/lib/runs";

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

  return NextResponse.json({
    accounts: accounts.map((a) => {
      const acctLeads = leadsByAccount.get(a.id) ?? [];
      return {
        ...a,
        posthog_json: undefined,
        tech_stack_json: undefined,
        lead_count: acctLeads.length,
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
