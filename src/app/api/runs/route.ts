import { NextRequest, NextResponse } from "next/server";
import { createRun, getRun, listRuns, updateRun } from "@/lib/runs";
import { runAnalyzeStage } from "@/lib/stages/analyze";
import { logAction } from "@/lib/audit";

export async function GET() {
  return NextResponse.json({ runs: await listRuns() });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing 'file' in form data" }, { status: 400 });
  }

  const csvContent = await file.text();
  const run = await createRun(file.name);

  const db = (await import("@/lib/db")).getDb();
  await db.execute({
    sql: `UPDATE runs SET raw_csv = ? WHERE id = ?`,
    args: [csvContent, run.id],
  });

  await logAction({ runId: run.id, stage: "analyze", action: "file_uploaded", detail: { size_bytes: csvContent.length } });

  try {
    await runAnalyzeStage(run.id, csvContent);
  } catch (err) {
    return NextResponse.json({ run, error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ run: await getRun(run.id) });
}
