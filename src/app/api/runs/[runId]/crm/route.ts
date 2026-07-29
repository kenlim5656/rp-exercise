import { NextResponse } from "next/server";
import { runCrmStage } from "@/lib/stages/crm";
import { getLeads } from "@/lib/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const leads = getLeads(runId).filter((l) => l.is_duplicate_primary === 1 && l.crm_json);
  return NextResponse.json({
    leads: leads.map((l) => ({
      lead_id: l.lead_id,
      is_eu: !!l.is_eu,
      consent_verified: l.consent_verified,
      eu_consent_flag: l.eu_consent_flag,
      crm: JSON.parse(l.crm_json!),
    })),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    await runCrmStage(runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
