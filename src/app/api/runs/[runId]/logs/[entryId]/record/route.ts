import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLead } from "@/lib/runs";
import type { AuditLogRow } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string; entryId: string }> },
) {
  const { runId, entryId } = await params;
  const db = getDb();
  if (!db) return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  const entry = db.prepare(`SELECT * FROM audit_log WHERE id = ? AND run_id = ?`).get(entryId, runId) as
    | AuditLogRow
    | undefined;
  if (!entry) return NextResponse.json({ error: "log entry not found" }, { status: 404 });
  if (!entry.entity_ref) return NextResponse.json({ error: "log entry has no linked record" }, { status: 404 });

  const lead = getLead(runId, entry.entity_ref);
  if (!lead) return NextResponse.json({ error: "linked record not found" }, { status: 404 });

  return NextResponse.json({
    entry: { id: entry.id, stage: entry.stage, action: entry.action, created_at: entry.created_at },
    lead: {
      ...lead,
      raw_json: lead.raw_json ? JSON.parse(lead.raw_json) : null,
      sanitized_json: lead.sanitized_json ? JSON.parse(lead.sanitized_json) : null,
      clay_json: lead.clay_json ? JSON.parse(lead.clay_json) : null,
      crm_json: lead.crm_json ? JSON.parse(lead.crm_json) : null,
    },
  });
}
