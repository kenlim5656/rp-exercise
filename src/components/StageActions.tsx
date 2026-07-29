"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface StageAction {
  label: string;
  busyLabel: string;
  endpoint: string;
  method: string;
  nextPage: string;
  hasNotes?: boolean;
  downloadUrl?: string;
  downloadLabel?: string;
}

const STAGE_ACTIONS: Record<string, StageAction> = {
  analysis: {
    label: "Approve & Sanitize",
    busyLabel: "Sanitizing...",
    endpoint: "sanitize",
    method: "POST",
    nextPage: "sanitize",
    hasNotes: true,
  },
  sanitize: {
    label: "Proceed to Matching",
    busyLabel: "Matching...",
    endpoint: "match",
    method: "POST",
    nextPage: "cohorts",
    downloadLabel: "Download sanitized CSV",
  },
  cohorts: {
    label: "Proceed to Enrichment",
    busyLabel: "Enriching...",
    endpoint: "enrich",
    method: "POST",
    nextPage: "enrichment",
  },
  enrichment: {
    label: "Proceed to CRM / MAP",
    busyLabel: "Looking up CRM...",
    endpoint: "crm",
    method: "POST",
    nextPage: "crm",
  },
  crm: {
    label: "Proceed to Scoring",
    busyLabel: "Scoring...",
    endpoint: "score",
    method: "POST",
    nextPage: "scoring",
  },
  scoring: {
    label: "Proceed to Routing",
    busyLabel: "Routing...",
    endpoint: "route",
    method: "POST",
    nextPage: "routing",
  },
};

export function StageActions({ runId }: { runId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const currentStage = pathname.split("/").pop() ?? "";
  const action = STAGE_ACTIONS[currentStage];

  async function proceed() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const opts: RequestInit = { method: action.method };
      if (action.hasNotes) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify({ approved: true, instructions: notes ? { notes } : undefined });
      }
      const res = await fetch(`/api/runs/${runId}/${action.endpoint}`, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/runs/${runId}/${action.nextPage}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    setRunningAll(true);
    setError(null);
    setRunAllProgress("Starting full pipeline...");
    try {
      const res = await fetch(`/api/runs/${runId}/run-all`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRunAllProgress("Pipeline complete!");
      router.push(`/runs/${runId}/routing`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningAll(false);
    }
  }

  const isBusy = busy || runningAll;

  return (
    <div className="card-accent-metrics rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <span className="mb-3 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {runningAll ? "Running pipeline" : "Next step"}
      </span>
      {runningAll && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--status-running)] border-t-transparent" />
          {runAllProgress}
        </div>
      )}
      {!runningAll && action?.hasNotes && (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional cleaning instructions..."
          className="mb-3 min-h-16 text-sm"
        />
      )}
      {!runningAll && action?.downloadLabel && (
        <a
          href={`/api/runs/${runId}/sanitize/download`}
          className="mb-3 inline-block text-xs underline text-muted-foreground hover:text-foreground"
        >
          {action.downloadLabel}
        </a>
      )}
      {!runningAll && action && (
        <Button onClick={proceed} disabled={isBusy} className="w-full">
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {action.busyLabel}
            </span>
          ) : (
            action.label
          )}
        </Button>
      )}
      <Button
        onClick={runAll}
        disabled={isBusy}
        variant="outline"
        className="mt-2 w-full border-[var(--accent-pipeline)] text-[var(--accent-pipeline)] hover:bg-[var(--accent-pipeline)] hover:text-black"
      >
        {runningAll ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Running all stages...
          </span>
        ) : (
          <>
            <svg className="mr-1.5 h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z" /></svg>
            Run All Stages
          </>
        )}
      </Button>
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>Failed</AlertTitle>
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
