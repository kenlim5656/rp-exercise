import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { stageDir } from "@/lib/paths";
import { getLeads } from "@/lib/runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  // Try filesystem first (works in local dev)
  try {
    const filePath = path.join(stageDir(runId, "sanitize"), "sanitized.csv");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sanitized-${runId}.csv"`,
        },
      });
    }
  } catch {
    // Filesystem unavailable (Vercel) — fall through to DB
  }

  // Fall back to generating CSV from DB
  const leads = await getLeads(runId);
  const primaryLeads = leads.filter((l) => l.is_duplicate_primary === 1);
  if (primaryLeads.length === 0) {
    return NextResponse.json({ error: "sanitized file not found" }, { status: 404 });
  }

  const records = primaryLeads
    .map((l) => {
      if (!l.sanitized_json) return null;
      try {
        return JSON.parse(l.sanitized_json) as Record<string, string>;
      } catch {
        return null;
      }
    })
    .filter((r): r is Record<string, string> => r !== null);

  if (records.length === 0) {
    return NextResponse.json({ error: "sanitized file not found" }, { status: 404 });
  }

  const columns = Object.keys(records[0]);
  const csv = stringify(records, { header: true, columns });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sanitized-${runId}.csv"`,
    },
  });
}
