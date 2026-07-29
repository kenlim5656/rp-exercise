import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createRun, getRun, listRuns } from "@/lib/runs";
import { stageDir } from "@/lib/paths";
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

  const run = await createRun(file.name);
  const rawDir = stageDir(run.id, "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(rawDir, "original-upload.csv"), buffer);

  await logAction({ runId: run.id, stage: "analyze", action: "file_uploaded", detail: { size_bytes: buffer.length } });

  try {
    await runAnalyzeStage(run.id);
  } catch (err) {
    return NextResponse.json({ run, error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ run: await getRun(run.id) });
}
