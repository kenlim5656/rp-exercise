import { randomUUID } from "node:crypto";
import { getDb, requireDb } from "./db";

export const STAGE_ORDER = ["analyze", "sanitize", "match", "enrich", "crm", "score", "route", "log"] as const;
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
}

export interface RunStageRow {
  run_id: string;
  stage_key: StageKey;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  output_path: string | null;
  error_message: string | null;
}

export function createRun(originalFilename: string): RunRow {
  const db = requireDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  const insertRun = db.prepare(
    `INSERT INTO runs (id, created_at, updated_at, original_filename, status, current_stage)
     VALUES (?, ?, ?, ?, 'created', 'analyze')`,
  );
  const insertStage = db.prepare(
    `INSERT INTO run_stages (run_id, stage_key, status) VALUES (?, ?, 'pending')`,
  );

  const tx = db.transaction(() => {
    insertRun.run(id, now, now, originalFilename);
    for (const stage of STAGE_ORDER) insertStage.run(id, stage);
  });
  tx();

  return getRun(id)!;
}

export function getRun(runId: string): RunRow | undefined {
  const db = getDb();
  if (!db) return undefined;
  return db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | undefined;
}

export function listRuns(): RunRow[] {
  const db = getDb();
  if (!db) return [];
  return db.prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all() as RunRow[];
}

export function updateRun(runId: string, fields: Partial<Omit<RunRow, "id" | "created_at">>): void {
  const db = requireDb();
  const entries = Object.entries({ ...fields, updated_at: new Date().toISOString() });
  const setClause = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value);
  db.prepare(`UPDATE runs SET ${setClause} WHERE id = ?`).run(...values, runId);
}

export function getStages(runId: string): RunStageRow[] {
  const db = getDb();
  if (!db) return [];
  return db.prepare(`SELECT * FROM run_stages WHERE run_id = ? ORDER BY rowid`).all(runId) as RunStageRow[];
}

export function getStage(runId: string, stageKey: StageKey): RunStageRow | undefined {
  const db = getDb();
  if (!db) return undefined;
  return db.prepare(`SELECT * FROM run_stages WHERE run_id = ? AND stage_key = ?`).get(runId, stageKey) as RunStageRow | undefined;
}

export function setStageStatus(
  runId: string,
  stageKey: StageKey,
  status: StageStatus,
  extra: { outputPath?: string; errorMessage?: string } = {},
): void {
  const db = requireDb();
  const now = new Date().toISOString();
  const startedAt = status === "running" ? now : undefined;
  const completedAt = status === "completed" || status === "failed" ? now : undefined;

  db.prepare(
    `UPDATE run_stages SET
       status = ?,
       started_at = COALESCE(?, started_at),
       completed_at = COALESCE(?, completed_at),
       output_path = COALESCE(?, output_path),
       error_message = ?
     WHERE run_id = ? AND stage_key = ?`,
  ).run(status, startedAt ?? null, completedAt ?? null, extra.outputPath ?? null, extra.errorMessage ?? null, runId, stageKey);

  if (status === "completed") {
    const idx = STAGE_ORDER.indexOf(stageKey);
    const next = STAGE_ORDER[idx + 1];
    updateRun(runId, { current_stage: next ?? stageKey, status: next ? "processing" : "completed" });
  } else if (status === "failed") {
    updateRun(runId, { status: "failed" });
  } else if (status === "awaiting_approval") {
    updateRun(runId, { status: "awaiting_approval", current_stage: stageKey });
  } else if (status === "running") {
    updateRun(runId, { status: "processing", current_stage: stageKey });
  }
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
}

const LEAD_COLUMNS = [
  "run_id",
  "lead_id",
  "raw_json",
  "sanitized_json",
  "dedup_group_id",
  "is_duplicate_primary",
  "dedup_conflict_flag",
  "cohort",
  "matched_customer_id",
  "clay_json",
  "crm_json",
  "is_eu",
  "consent_verified",
  "eu_consent_flag",
  "deterministic_tier",
  "deterministic_reasons_json",
  "deterministic_review_flag",
  "deterministic_review_reason",
  "llm_score",
  "llm_rationale",
  "score_divergence",
  "scores_aligned",
  "score_divergence_flag",
  "final_tier",
  "routing_decision",
  "needs_review",
  "review_reasons_json",
  "review_status",
  "review_actor",
  "review_at",
] as const;

/** Bulk insert-or-update leads for a run. Each item must include lead_id; any
 * other LeadRow field present will be written, others left untouched on
 * conflict (via SQLite's UPSERT `excluded.` semantics only for supplied
 * columns is not supported directly, so we always write full rows -- callers
 * should read-merge if they need partial updates on top of prior stages). */
export function upsertLeads(runId: string, leads: Array<Partial<LeadRow> & { lead_id: string }>): void {
  const db = requireDb();
  const placeholders = LEAD_COLUMNS.map(() => "?").join(", ");
  const updateClause = LEAD_COLUMNS.filter((c) => c !== "run_id" && c !== "lead_id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  const stmt = db.prepare(
    `INSERT INTO leads (${LEAD_COLUMNS.join(", ")}) VALUES (${placeholders})
     ON CONFLICT(run_id, lead_id) DO UPDATE SET ${updateClause}`,
  );

  const tx = db.transaction((rows: Array<Partial<LeadRow> & { lead_id: string }>) => {
    for (const row of rows) {
      const existing = getLead(runId, row.lead_id);
      const merged = { ...existing, ...row, run_id: runId, lead_id: row.lead_id };
      const values = LEAD_COLUMNS.map((c) => (merged as Record<string, unknown>)[c] ?? null);
      stmt.run(...values);
    }
  });
  tx(leads);
}

export function getLead(runId: string, leadId: string): LeadRow | undefined {
  const db = getDb();
  if (!db) return undefined;
  return db.prepare(`SELECT * FROM leads WHERE run_id = ? AND lead_id = ?`).get(runId, leadId) as LeadRow | undefined;
}

export function getLeads(runId: string): LeadRow[] {
  const db = getDb();
  if (!db) return [];
  return db.prepare(`SELECT * FROM leads WHERE run_id = ?`).all(runId) as LeadRow[];
}

export function getReviewQueue(runId: string): LeadRow[] {
  const db = getDb();
  if (!db) return [];
  return db.prepare(`SELECT * FROM leads WHERE run_id = ? AND needs_review = 1 ORDER BY lead_id`).all(runId) as LeadRow[];
}

export function recordReviewAction(input: {
  runId: string;
  leadId: string;
  action: "approve" | "reject";
  reason?: string;
  actor: string;
}): void {
  const db = requireDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO review_actions (id, run_id, lead_id, action, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.runId, input.leadId, input.action, input.reason ?? null, input.actor, now);
    db.prepare(
      `UPDATE leads SET review_status = ?, review_actor = ?, review_at = ? WHERE run_id = ? AND lead_id = ?`,
    ).run(input.action === "approve" ? "approved" : "rejected", input.actor, now, input.runId, input.leadId);
  });
  tx();
}
