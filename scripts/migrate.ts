/**
 * v2 database migration: adds followup_json and followup_executed_json columns,
 * and inserts the 'followup' stage row for all existing runs.
 *
 * Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/migrate.ts
 */

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  console.log("Running v2 migration...");

  // 1. Add followup columns to leads (ignore if already exists)
  const addColumns = [
    "ALTER TABLE leads ADD COLUMN followup_json TEXT",
    "ALTER TABLE leads ADD COLUMN followup_executed_json TEXT",
  ];

  for (const sql of addColumns) {
    try {
      await db.execute(sql);
      console.log(`✓ ${sql}`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        console.log(`  (skipped — column already exists)`);
      } else {
        console.error(`✗ ${sql}`, err);
        throw err;
      }
    }
  }

  // 2. Insert 'followup' stage row for all existing runs that don't have it yet
  const runs = await db.execute("SELECT id FROM runs");
  let inserted = 0;
  for (const row of runs.rows) {
    const runId = row[0] as string;
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO run_stages (run_id, stage_key, status) VALUES (?, 'followup', 'pending')",
        args: [runId],
      });
      inserted++;
    } catch (err) {
      console.error(`  Failed to insert followup stage for run ${runId}:`, err);
    }
  }
  console.log(`✓ Added followup stage to ${inserted} existing run(s).`);

  console.log("\nMigration complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
