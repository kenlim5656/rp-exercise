import { NextRequest, NextResponse } from "next/server";
import { getSanitizeReport, runSanitizeStage, type SanitizeInstructions } from "@/lib/stages/sanitize";
import { checkStageDep } from "@/lib/stage-deps";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const report = await getSanitizeReport(runId);
  if (!report) return NextResponse.json({ error: "sanitize not yet run" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const depErr = await checkStageDep(runId, "sanitize");
  if (depErr) return NextResponse.json({ error: depErr }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { approved?: boolean; instructions?: SanitizeInstructions };

  if (!body.approved) {
    return NextResponse.json({ error: "approval is required to sanitize (spec 2.1)" }, { status: 400 });
  }

  try {
    const report = await runSanitizeStage(runId, true, body.instructions);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
