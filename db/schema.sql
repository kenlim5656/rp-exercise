-- RP lead pipeline POC schema. Applied idempotently by src/lib/db.ts on first
-- connection (CREATE TABLE IF NOT EXISTS everywhere). SQLite via better-sqlite3.
--
-- This mirrors the shape a real deployment would split between Postgres (this
-- file, near-verbatim) and Blob storage (the per-stage files under data/runs/).

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',        -- created | processing | awaiting_approval | completed | failed
  current_stage TEXT NOT NULL DEFAULT 'analyze',
  row_count_raw INTEGER,
  row_count_sanitized INTEGER,
  notes TEXT,
  raw_csv TEXT
);

CREATE TABLE IF NOT EXISTS run_stages (
  run_id TEXT NOT NULL REFERENCES runs(id),
  stage_key TEXT NOT NULL,                        -- analyze|sanitize|match|enrich|crm|score|route|followup|log
  status TEXT NOT NULL DEFAULT 'pending',          -- pending|running|completed|failed|awaiting_approval
  started_at TEXT,
  completed_at TEXT,
  output_path TEXT,
  output_json TEXT,
  error_message TEXT,
  PRIMARY KEY (run_id, stage_key)
);

CREATE TABLE IF NOT EXISTS leads (
  run_id TEXT NOT NULL REFERENCES runs(id),
  lead_id TEXT NOT NULL,
  raw_json TEXT,
  sanitized_json TEXT,
  dedup_group_id TEXT,
  is_duplicate_primary INTEGER DEFAULT 1,
  dedup_conflict_flag INTEGER DEFAULT 0,
  cohort TEXT,                                     -- existing | new
  matched_customer_id TEXT,
  clay_json TEXT,
  crm_json TEXT,
  is_eu INTEGER DEFAULT 0,
  consent_verified TEXT,                            -- verified_in | verified_out | ambiguous
  eu_consent_flag TEXT,
  deterministic_tier TEXT,                            -- tier1 | tier2 | tier3 | suppress
  deterministic_reasons_json TEXT,
  deterministic_review_flag INTEGER DEFAULT 0,
  deterministic_review_reason TEXT,
  llm_score REAL,
  llm_rationale TEXT,
  score_divergence REAL,
  scores_aligned INTEGER,
  score_divergence_flag INTEGER DEFAULT 0,
  final_tier TEXT,
  routing_decision TEXT,                              -- sales_queue | nurture | self_serve_newsletter | suppressed | human_review
  needs_review INTEGER DEFAULT 0,
  review_reasons_json TEXT,
  review_status TEXT DEFAULT 'none',                   -- none | pending | approved | rejected
  review_actor TEXT,
  review_at TEXT,
  followup_json TEXT,                                   -- JSON array of LLM-generated follow-up recommendations
  followup_executed_json TEXT,                          -- JSON object tracking which recommendations were executed
  PRIMARY KEY (run_id, lead_id)
);

CREATE TABLE IF NOT EXISTS review_actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  lead_id TEXT NOT NULL,
  action TEXT NOT NULL,                                -- approve | reject
  reason TEXT,
  actor TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  stage TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_ref TEXT,                                      -- typically a lead_id, PII-free
  detail_json TEXT,                                      -- allowlisted, PII-free
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_run ON leads(run_id);
CREATE INDEX IF NOT EXISTS idx_leads_review ON leads(run_id, needs_review, review_status);
CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_log(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_review_actions_lead ON review_actions(run_id, lead_id);
