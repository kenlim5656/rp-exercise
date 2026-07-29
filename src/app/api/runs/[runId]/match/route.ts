import { NextResponse } from "next/server";
import { getCohorts, runMatchStage } from "@/lib/stages/match";
import { checkStageDep } from "@/lib/stage-deps";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return NextResponse.json({ cohorts: await getCohorts(runId) });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const depErr = await checkStageDep(runId, "match");
  if (depErr) return NextResponse.json({ error: depErr }, { status: 409 });
  try {
    const result = await runMatchStage(runId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
