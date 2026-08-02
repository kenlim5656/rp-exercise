import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export const STAGE_ORDER = ["analyze", "sanitize", "match", "enrich", "crm", "score", "route", "followup", "log"] as const;
export type StageKey = (typeof STAGE_ORDER)[number];
export type StageStatus = "pending" | "running" | "completed" | "failed" | "awaiting_approval";

export interface RunRow {
  id: string;
  created_at: string;
  updated_at: string;
  original_filename: string;
  status: string;
  current_stage: string;
  row_count_raw: number | null;
  row_count_sanitized: number | null;
  notes: string | null;
  raw_csv: string | null;
}

export interface RunStageRow {
  run_id: string;
  stage_key: StageKey;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  output_path: string | null;
  output_json: string | null;
  error_message: string | null;
}

export async function createRun(originalFilename: string): Promise<RunRow> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: `INSERT INTO runs (id, created_at, updated_at, original_filename, status, current_stage)
            VALUES (?, ?, ?, ?, 'created', 'analyze')`,
      args: [id, now, now, originalFilename],
    });
    for (const stage of STAGE_ORDER) {
      await tx.execute({
        sql: `INSERT INTO run_stages (run_id, stage_key, status) VALUES (?, ?, 'pending')`,
        args: [id, stage],
      });
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return (await getRun(id))!;
}

const RUN_COLS = "id, created_at, updated_at, original_filename, status, current_stage, row_count_raw, row_count_sanitized, notes";

export async function getRun(runId: string): Promise<RunRow | undefined> {
  const db = getDb();
  const result = await db.execute({ sql: `SELECT ${RUN_COLS} FROM runs WHERE id = ?`, args: [runId] });
  return result.rows[0] as unknown as RunRow | undefined;
}

export async function listRuns(): Promise<RunRow[]> {
  const db = getDb();
  const result = await db.execute(`SELECT ${RUN_COLS} FROM runs ORDER BY created_at DESC`);
  return result.rows as unknown as RunRow[];
}

export async function updateRun(runId: string, fields: Partial<Omit<RunRow, "id" | "created_at">>): Promise<void> {
  const db = getDb();
  const entries = Object.entries({ ...fields, updated_at: new Date().toISOString() });
  const setClause = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value ?? null);
  await db.execute({ sql: `UPDATE runs SET ${setClause} WHERE id = ?`, args: [...values, runId] });
}

export async function getStages(runId: string): Promise<RunStageRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM run_stages WHERE run_id = ? ORDER BY rowid`,
    args: [runId],
  });
  return result.rows as unknown as RunStageRow[];
}

export async function getStage(runId: string, stageKey: StageKey): Promise<RunStageRow | undefined> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM run_stages WHERE run_id = ? AND stage_key = ?`,
    args: [runId, stageKey],
  });
  return result.rows[0] as unknown as RunStageRow | undefined;
}

export async function setStageStatus(
  runId: string,
  stageKey: StageKey,
  status: StageStatus,
  extra: { outputPath?: string; errorMessage?: string } = {},
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const startedAt = status === "running" ? now : null;
  const completedAt = status === "completed" || status === "failed" ? now : null;

  await db.execute({
    sql: `UPDATE run_stages SET
       status = ?,
       started_at = COALESCE(?, started_at),
       completed_at = COALESCE(?, completed_at),
       output_path = COALESCE(?, output_path),
       error_message = ?
     WHERE run_id = ? AND stage_key = ?`,
    args: [status, startedAt, completedAt, extra.outputPath ?? null, extra.errorMessage ?? null, runId, stageKey],
  });

  if (status === "completed") {
    const idx = STAGE_ORDER.indexOf(stageKey);
    const next = STAGE_ORDER[idx + 1];
    await updateRun(runId, { current_stage: next ?? stageKey, status: next ? "processing" : "completed" });
  } else if (status === "failed") {
    await updateRun(runId, { status: "failed" });
  } else if (status === "awaiting_approval") {
    await updateRun(runId, { status: "awaiting_approval", current_stage: stageKey });
  } else if (status === "running") {
    await updateRun(runId, { status: "processing", current_stage: stageKey });
  }
}

export async function setStageOutput(runId: string, stageKey: StageKey, json: unknown): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE run_stages SET output_json = ? WHERE run_id = ? AND stage_key = ?`,
    args: [JSON.stringify(json), runId, stageKey],
  });
}

export async function getStageOutput<T = unknown>(runId: string, stageKey: StageKey): Promise<T | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT output_json FROM run_stages WHERE run_id = ? AND stage_key = ?`,
    args: [runId, stageKey],
  });
  const row = result.rows[0] as unknown as { output_json: string | null } | undefined;
  if (!row?.output_json) return null;
  return JSON.parse(row.output_json) as T;
}

// ---------------------------------------------------------------------------
// leads
// ---------------------------------------------------------------------------

export interface LeadRow {
  run_id: string;
  lead_id: string;
  raw_json: string | null;
  sanitized_json: string | null;
  dedup_group_id: string | null;
  is_duplicate_primary: number;
  dedup_conflict_flag: number;
  cohort: string | null;
  matched_customer_id: string | null;
  clay_json: string | null;
  crm_json: string | null;
  is_eu: number;
  consent_verified: string | null;
  eu_consent_flag: string | null;
  deterministic_tier: string | null;
  deterministic_reasons_json: string | null;
  deterministic_review_flag: number;
  deterministic_review_reason: string | null;
  llm_score: number | null;
  llm_rationale: string | null;
  score_divergence: number | null;
  scores_aligned: number | null;
  score_divergence_flag: number;
  final_tier: string | null;
  routing_decision: string | null;
  needs_review: number;
  review_reasons_json: string | null;
  review_status: string;
  review_actor: string | null;
  review_at: string | null;
  followup_json: string | null;
  followup_executed_json: string | null;
  account_id: string | null;
  pql_score: number | null;
  role: string | null;
  event_summary_json: string | null;
}

const LEAD_COLUMNS = [
  "run_id", "lead_id", "raw_json", "sanitized_json", "dedup_group_id",
  "is_duplicate_primary", "dedup_conflict_flag", "cohort", "matched_customer_id",
  "clay_json", "crm_json", "is_eu", "consent_verified", "eu_consent_flag",
  "deterministic_tier", "deterministic_reasons_json", "deterministic_review_flag",
  "deterministic_review_reason", "llm_score", "llm_rationale", "score_divergence",
  "scores_aligned", "score_divergence_flag", "final_tier", "routing_decision",
  "needs_review", "review_reasons_json", "review_status", "review_actor", "review_at",
  "followup_json", "followup_executed_json",
  "account_id", "pql_score", "role", "event_summary_json",
] as const;

export async function upsertLeads(runId: string, leads: Array<Partial<LeadRow> & { lead_id: string }>): Promise<void> {
  const db = getDb();
  const placeholders = LEAD_COLUMNS.map(() => "?").join(", ");
  const updateClause = LEAD_COLUMNS.filter((c) => c !== "run_id" && c !== "lead_id")
    .map((c) => `${c} = COALESCE(excluded.${c}, ${c})`)
    .join(", ");

  const sql = `INSERT INTO leads (${LEAD_COLUMNS.join(", ")}) VALUES (${placeholders})
     ON CONFLICT(run_id, lead_id) DO UPDATE SET ${updateClause}`;

  const BATCH_SIZE = 80;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const stmts = batch.map((row) => {
      const merged = { ...row, run_id: runId, lead_id: row.lead_id };
      const values = LEAD_COLUMNS.map((c) => (merged as Record<string, unknown>)[c] ?? null) as import("@libsql/client").InValue[];
      return { sql, args: values };
    });
    await db.batch(stmts, "write");
  }
}

export async function getLead(runId: string, leadId: string): Promise<LeadRow | undefined> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM leads WHERE run_id = ? AND lead_id = ?`,
    args: [runId, leadId],
  });
  return result.rows[0] as unknown as LeadRow | undefined;
}

export function leadDisplayFields(l: LeadRow): { email: string; company: string; title: string } {
  let email = "";
  let company = "";
  let title = "";
  if (l.sanitized_json) {
    try {
      const s = JSON.parse(l.sanitized_json);
      email = s.email_normalized || s.email || "";
      company = s.company || "";
      title = s.job_title || "";
    } catch {}
  }
  return { email, company, title };
}

export async function getLeads(runId: string): Promise<LeadRow[]> {
  const db = getDb();
  const result = await db.execute({ sql: `SELECT * FROM leads WHERE run_id = ?`, args: [runId] });
  return result.rows as unknown as LeadRow[];
}

export async function getReviewQueue(runId: string): Promise<LeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM leads WHERE run_id = ? AND needs_review = 1 ORDER BY lead_id`,
    args: [runId],
  });
  return result.rows as unknown as LeadRow[];
}

// ---------------------------------------------------------------------------
// accounts (v3 PQL/AQL)
// ---------------------------------------------------------------------------

export interface AccountRow {
  id: string;
  run_id: string;
  domain: string;
  name: string | null;
  employee_count: number | null;
  industry: string | null;
  funding_stage: string | null;
  tech_stack_json: string | null;
  plan_tier: string;
  aql_score: number | null;
  fit_score: number | null;
  usage_score: number | null;
  aql_status: string;
  posthog_json: string | null;
  routing_decision: string | null;
  followup_json: string | null;
  followup_executed_json: string | null;
  created_at: string;
}

const ACCOUNT_COLUMNS = [
  "id", "run_id", "domain", "name", "employee_count", "industry",
  "funding_stage", "tech_stack_json", "plan_tier", "aql_score", "fit_score",
  "usage_score", "aql_status", "posthog_json", "routing_decision",
  "followup_json", "followup_executed_json", "created_at",
] as const;

export async function upsertAccounts(accounts: Array<Partial<AccountRow> & { id: string; run_id: string; domain: string }>): Promise<void> {
  const db = getDb();
  const placeholders = ACCOUNT_COLUMNS.map(() => "?").join(", ");
  const updateClause = ACCOUNT_COLUMNS.filter((c) => c !== "id" && c !== "run_id")
    .map((c) => `${c} = COALESCE(excluded.${c}, ${c})`)
    .join(", ");

  const sql = `INSERT INTO accounts (${ACCOUNT_COLUMNS.join(", ")}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updateClause}`;

  const BATCH_SIZE = 80;
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    const stmts = batch.map((row) => {
      const values = ACCOUNT_COLUMNS.map((c) => (row as Record<string, unknown>)[c] ?? null) as import("@libsql/client").InValue[];
      return { sql, args: values };
    });
    await db.batch(stmts, "write");
  }
}

export async function getAccounts(runId: string): Promise<AccountRow[]> {
  const db = getDb();
  const result = await db.execute({ sql: `SELECT * FROM accounts WHERE run_id = ?`, args: [runId] });
  return result.rows as unknown as AccountRow[];
}

export async function getAccount(runId: string, accountId: string): Promise<AccountRow | undefined> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM accounts WHERE run_id = ? AND id = ?`,
    args: [runId, accountId],
  });
  return result.rows[0] as unknown as AccountRow | undefined;
}

export async function getAccountLeads(runId: string, accountId: string): Promise<LeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM leads WHERE run_id = ? AND account_id = ?`,
    args: [runId, accountId],
  });
  return result.rows as unknown as LeadRow[];
}

export async function recordReviewAction(input: {
  runId: string;
  leadId: string;
  action: "approve" | "reject";
  reason?: string;
  actor: string;
}): Promise<void> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: `INSERT INTO review_actions (id, run_id, lead_id, action, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, input.runId, input.leadId, input.action, input.reason ?? null, input.actor, now],
    });
    await tx.execute({
      sql: `UPDATE leads SET review_status = ?, review_actor = ?, review_at = ? WHERE run_id = ? AND lead_id = ?`,
      args: [input.action === "approve" ? "approved" : "rejected", input.actor, now, input.runId, input.leadId],
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
