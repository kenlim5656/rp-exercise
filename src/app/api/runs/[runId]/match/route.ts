import { NextResponse } from "next/server";
import { getCohorts, runMatchStage } from "@/lib/stages/match";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return NextResponse.json({ cohorts: getCohorts(runId) });
}

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const result = await runMatchStage(runId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
