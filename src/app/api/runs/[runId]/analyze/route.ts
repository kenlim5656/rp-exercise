import { NextResponse } from "next/server";
import { getAnalysisReport, runAnalyzeStage } from "@/lib/stages/analyze";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const report = await getAnalysisReport(runId);
  if (!report) return NextResponse.json({ error: "analysis not yet available" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const report = await runAnalyzeStage(runId);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
