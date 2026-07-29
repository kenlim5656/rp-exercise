import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { stageDir } from "@/lib/paths";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const filePath = path.join(stageDir(runId, "sanitize"), "sanitized.csv");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "sanitized file not found" }, { status: 404 });
  }
  const content = fs.readFileSync(filePath);
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sanitized-${runId}.csv"`,
    },
  });
}
