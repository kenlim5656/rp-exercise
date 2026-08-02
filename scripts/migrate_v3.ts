import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("TURSO_DATABASE_URL is not set");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
  console.log("v3 migration: adding accounts table and PQL/AQL columns to leads...\n");

  // 1. Create accounts table
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        domain TEXT NOT NULL,
        name TEXT,
        employee_count INTEGER,
        industry TEXT,
        funding_stage TEXT,
        tech_stack_json TEXT,
        plan_tier TEXT DEFAULT 'free_developer',
        aql_score INTEGER,
        fit_score INTEGER,
        usage_score INTEGER,
        aql_status TEXT DEFAULT 'unqualified',
        posthog_json TEXT,
        routing_decision TEXT,
        followup_json TEXT,
        followup_executed_json TEXT,
        created_at TEXT NOT NULL
      )
    `);
    console.log("  accounts table created (or already exists)");
  } catch (err) {
    console.log("  accounts table:", (err as Error).message);
  }

  // 2. Create indexes
  try {
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_accounts_run ON accounts(run_id)`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(run_id, domain)`);
    console.log("  accounts indexes created");
  } catch (err) {
    console.log("  accounts indexes:", (err as Error).message);
  }

  // 3. Add new columns to leads table
  const newColumns = [
    { name: "account_id", type: "TEXT" },
    { name: "pql_score", type: "INTEGER" },
    { name: "role", type: "TEXT" },
    { name: "event_summary_json", type: "TEXT" },
  ];

  for (const col of newColumns) {
    try {
      await client.execute(`ALTER TABLE leads ADD COLUMN ${col.name} ${col.type}`);
      console.log(`  added leads.${col.name} (${col.type})`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        console.log(`  leads.${col.name} already exists — skipping`);
      } else {
        console.error(`  ERROR adding leads.${col.name}:`, msg);
      }
    }
  }

  console.log("\nv3 migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
