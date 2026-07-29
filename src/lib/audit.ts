import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, requireDb } from "./db";
import { stageDir } from "./paths";

// Any detail_json key matching one of these is stripped before it's ever
// written to the audit trail. This is a safety net, not the primary
// control -- callers should only ever pass counts/ids/enums/scores in
// `detail` to begin with (see the 8.3 spec: "ensure that PII is not included
// in the actual log but can be linked back to the record").
const PII_KEY_PATTERN = /email|first_?name|last_?name|company|job_?title|phone|address|website/i;

function scrubDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (PII_KEY_PATTERN.test(key)) {
      console.warn(`[audit] stripped potential-PII key "${key}" from audit detail`);
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export type StageKey = "analyze" | "sanitize" | "match" | "enrich" | "crm" | "score" | "route" | "review" | "log";

export interface LogActionInput {
  runId: string;
  stage: StageKey;
  action: string;
  entityRef?: string; // typically a lead_id -- never an email/name
  detail?: Record<string, unknown>;
}

/**
 * Records one audit-trail entry: a uuid + ISO timestamp, dual-written to the
 * SQLite audit_log table (queryable by the app) and to
 * data/runs/<id>/08_log/audit-log.jsonl (the simulated BigQuery
 * streaming-insert sink, satisfying spec 8.1 "store in a bq (simulated)
 * table"). detail is PII-scrubbed; entity_ref is how the 8.3 "link back to
 * the record" drill-down resolves to the full lead row.
 */
export function logAction(input: LogActionInput): { id: string; createdAt: string } {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const detail = scrubDetail(input.detail ?? {});

  const db = requireDb();
  db.prepare(
    `INSERT INTO audit_log (id, run_id, stage, action, entity_ref, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.runId, input.stage, input.action, input.entityRef ?? null, JSON.stringify(detail), createdAt);

  const logDir = stageDir(input.runId, "log");
  fs.mkdirSync(logDir, { recursive: true });
  const bqRow = {
    insertId: id,
    tableId: "pipeline_audit_log",
    rows: [{ id, run_id: input.runId, stage: input.stage, action: input.action, entity_ref: input.entityRef ?? null, detail, created_at: createdAt }],
  };
  fs.appendFileSync(path.join(logDir, "audit-log.jsonl"), JSON.stringify(bqRow) + "\n");

  return { id, createdAt };
}

export interface AuditLogRow {
  id: string;
  run_id: string;
  stage: string;
  action: string;
  entity_ref: string | null;
  detail_json: string;
  created_at: string;
}

export function listAuditLog(runId: string): AuditLogRow[] {
  const db = getDb();
  if (!db) return [];
  return db.prepare(`SELECT * FROM audit_log WHERE run_id = ? ORDER BY created_at DESC`).all(runId) as AuditLogRow[];
}
