import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const DATA_ROOT = path.join(PROJECT_ROOT, "data");
export const RUNS_ROOT = path.join(DATA_ROOT, "runs");
export const MOCK_SEED_ROOT = path.join(DATA_ROOT, "mock-seed");
export const DB_PATH = path.join(PROJECT_ROOT, "db", "rp.db");
export const SCHEMA_PATH = path.join(PROJECT_ROOT, "db", "schema.sql");
export const PYTHON_SCRIPT_PATH = path.join(PROJECT_ROOT, "scripts", "lead_pipeline.py");

export function runDir(runId: string): string {
  return path.join(RUNS_ROOT, runId);
}

export const STAGE_DIRS = {
  raw: "00_raw",
  analysis: "01_analysis",
  sanitize: "02_sanitize",
  match: "03_match",
  enrich: "04_enrich",
  crm: "05_crm",
  score: "06_score",
  route: "07_route",
  log: "08_log",
} as const;

export function stageDir(runId: string, stage: keyof typeof STAGE_DIRS): string {
  return path.join(runDir(runId), STAGE_DIRS[stage]);
}
