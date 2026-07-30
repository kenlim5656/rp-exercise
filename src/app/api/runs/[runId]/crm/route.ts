import { NextResponse } from "next/server";
import { runCrmStage } from "@/lib/stages/crm";
import { getLeads, leadDisplayFields } from "@/lib/runs";
import { checkStageDep } from "@/lib/stage-deps";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const leads = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1 && l.crm_json);
  return NextResponse.json({
    leads: leads.map((l) => ({
      lead_id: l.lead_id,
      is_eu: !!l.is_eu,
      consent_verified: l.consent_verified,
      eu_consent_flag: l.eu_consent_flag,
      ...leadDisplayFields(l),
      crm: JSON.parse(l.crm_json!),
    })),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const depErr = await checkStageDep(runId, "crm");
  if (depErr) return NextResponse.json({ error: depErr }, { status: 409 });
  try {
    await runCrmStage(runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
