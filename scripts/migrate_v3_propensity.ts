import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("TURSO_DATABASE_URL is not set");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
  console.log("v3-propensity migration: adding account_propensity table...\n");

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS account_propensity (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        propensity_score REAL NOT NULL,
        propensity_percentile INTEGER NOT NULL,
        predicted_acv INTEGER NOT NULL,
        next_likely_purchase TEXT NOT NULL,
        purchase_drivers_json TEXT NOT NULL,
        model_source TEXT NOT NULL,
        model_version TEXT NOT NULL,
        last_updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(account_id)
      )
    `);
    console.log("  account_propensity table created (or already exists)");
  } catch (err) {
    console.log("  account_propensity table:", (err as Error).message);
  }

  try {
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_propensity_account ON account_propensity(account_id)`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_propensity_percentile ON account_propensity(propensity_percentile)`);
    console.log("  propensity indexes created");
  } catch (err) {
    console.log("  propensity indexes:", (err as Error).message);
  }

  console.log("\nv3-propensity migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
