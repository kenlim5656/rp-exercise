import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const result = await db.execute("SELECT key, value FROM settings");
  const settings: Record<string, string> = {};
  for (const row of result.rows) {
    settings[row.key as string] = row.value as string;
  }
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const entries = Object.entries(body.settings as Record<string, string>);
  const stmts = entries.map(([key, value]) => ({
    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    args: [key, value],
  }));
  if (stmts.length > 0) {
    await db.batch(stmts, "write");
  }
  return NextResponse.json({ ok: true });
}
