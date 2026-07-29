import { NextResponse } from "next/server";
import { listAuditLog } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const rows = listAuditLog(runId).map((r) => ({
    id: r.id,
    stage: r.stage,
    action: r.action,
    entity_ref: r.entity_ref,
    detail: JSON.parse(r.detail_json),
    created_at: r.created_at,
  }));
  return NextResponse.json({ log: rows });
}
