import { NextResponse } from "next/server";
import { runEnrichStage } from "@/lib/stages/enrich";
import { getLeads } from "@/lib/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const leads = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1 && l.clay_json);
  return NextResponse.json({
    leads: leads.map((l) => ({ lead_id: l.lead_id, cohort: l.cohort, clay: JSON.parse(l.clay_json!) })),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    await runEnrichStage(runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
