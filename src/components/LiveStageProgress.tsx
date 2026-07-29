"use client";

import { useLiveStages } from "./LiveStages";
import { StageProgress } from "./StageProgress";
import type { RunStageRow } from "@/lib/runs";

export function LiveStageProgress({ runId, initialStages }: { runId: string; initialStages: RunStageRow[] }) {
  const stages = useLiveStages(runId);
  return <StageProgress stages={stages ?? initialStages} />;
}
