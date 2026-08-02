import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { stageDir } from "./paths";

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

export type StageKey = "analyze" | "sanitize" | "match" | "enrich" | "crm" | "score" | "route" | "followup" | "review" | "log";

export interface LogActionInput {
  runId: string;
  stage: StageKey;
  action: string;
  entityRef?: string;
  detail?: Record<string, unknown>;
}

export async function logAction(input: LogActionInput): Promise<{ id: string; createdAt: string }> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const detail = scrubDetail(input.detail ?? {});

  const db = getDb();
  await db.execute({
    sql: `INSERT INTO audit_log (id, run_id, stage, action, entity_ref, detail_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.runId, input.stage, input.action, input.entityRef ?? null, JSON.stringify(detail), createdAt],
  });

  try {
    const logDir = stageDir(input.runId, "log");
    fs.mkdirSync(logDir, { recursive: true });
    const bqRow = {
      insertId: id,
      tableId: "pipeline_audit_log",
      rows: [{ id, run_id: input.runId, stage: input.stage, action: input.action, entity_ref: input.entityRef ?? null, detail, created_at: createdAt }],
    };
    fs.appendFileSync(path.join(logDir, "audit-log.jsonl"), JSON.stringify(bqRow) + "\n");
  } catch {
    // JSONL write may fail on read-only filesystem (Vercel) — DB write above is authoritative
  }

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

export async function listAuditLog(runId: string): Promise<AuditLogRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM audit_log WHERE run_id = ? ORDER BY created_at DESC`,
    args: [runId],
  });
  return result.rows as unknown as AuditLogRow[];
}
