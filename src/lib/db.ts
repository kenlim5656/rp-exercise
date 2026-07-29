import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DB_PATH, SCHEMA_PATH } from "./paths";

let instance: Database.Database | null = null;
let initFailed = false;
let readOnly = false;

export function getDb(): Database.Database | null {
  if (instance) return instance;
  if (initFailed) return null;

  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    db.exec(schema);

    instance = db;
    return db;
  } catch {
    // Read-write failed (e.g. Vercel's read-only filesystem). Try read-only
    // with the bundled DB file so the demo data is still queryable.
    try {
      const db = new Database(DB_PATH, { readonly: true });
      instance = db;
      readOnly = true;
      return db;
    } catch {
      initFailed = true;
      return null;
    }
  }
}

export function requireDb(): Database.Database {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db;
}

export function isDbAvailable(): boolean {
  return getDb() !== null;
}

export function isReadOnly(): boolean {
  getDb();
  return readOnly;
}
