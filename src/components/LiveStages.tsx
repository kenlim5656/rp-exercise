"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import type { RunStageRow } from "@/lib/runs";

interface RunData {
  stages: RunStageRow[];
  run: { status: string };
}

export function useLiveStages(runId: string): RunStageRow[] | null {
  const [stages, setStages] = useState<RunStageRow[] | null>(null);
  const pathname = usePathname();

  const fetchStages = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const data: RunData = await res.json();
      setStages(data.stages);
    } catch {}
  }, [runId]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages, pathname]);

  useEffect(() => {
    const interval = setInterval(fetchStages, 5000);
    return () => clearInterval(interval);
  }, [fetchStages]);

  return stages;
}
