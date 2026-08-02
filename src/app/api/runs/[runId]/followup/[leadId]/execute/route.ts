import { NextResponse } from "next/server";
import { getLead, upsertLeads, leadDisplayFields } from "@/lib/runs";
import { executeHubSpotAction, type HubSpotActionRequest } from "@/lib/mocks/hubspot-actions";
import { logAction } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string; leadId: string }> }) {
  const { runId, leadId } = await params;
  const body = await req.json() as {
    recommendation_index: number;
    action_type: HubSpotActionRequest["action_type"];
    params: Record<string, unknown>;
  };

  const lead = await getLead(runId, leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.followup_json) return NextResponse.json({ error: "No follow-up recommendations generated yet" }, { status: 409 });

  const { email } = leadDisplayFields(lead);
  const followup = JSON.parse(lead.followup_json);
  const hsContact = lead.crm_json ? JSON.parse(lead.crm_json) : null;
  const contactId = hsContact?.hubspot?.id ?? undefined;

  const actionReq: HubSpotActionRequest = {
    action_type: body.action_type,
    contact_email: email || leadId,
    contact_id: contactId,
    params: body.params,
  };

  const result = executeHubSpotAction(actionReq);

  // Persist execution record
  const executed = lead.followup_executed_json ? JSON.parse(lead.followup_executed_json) : {};
  const recKey = `rec_${body.recommendation_index}`;
  executed[recKey] = { ...result, recommendation_index: body.recommendation_index };

  await upsertLeads(runId, [{ lead_id: leadId, followup_executed_json: JSON.stringify(executed) }]);

  await logAction({
    runId,
    stage: "followup",
    action: "hubspot_action_executed",
    entityRef: leadId,
    detail: {
      action_type: body.action_type,
      object_id: result.object_id,
      success: result.success,
      recommendation_index: body.recommendation_index,
    },
  });

  // Suppress unused variable warning
  void followup;

  return NextResponse.json({ ok: true, result });
}
