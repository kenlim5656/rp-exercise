"use client";

import { useLiveStages } from "./LiveStages";
import { RunStepper } from "./RunStepper";
import type { RunStageRow } from "@/lib/runs";

export function LiveRunStepper({ runId, initialStages }: { runId: string; initialStages: RunStageRow[] }) {
  const stages = useLiveStages(runId);
  return <RunStepper runId={runId} stages={stages ?? initialStages} />;
}
