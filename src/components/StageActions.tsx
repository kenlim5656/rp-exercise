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
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const currentStage = pathname.split("/").pop() ?? "";
  const action = STAGE_ACTIONS[currentStage];

  if (!action) return null;

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

  return (
    <div className="card-accent-metrics rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <span className="mb-3 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Next step
      </span>
      {action.hasNotes && (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional cleaning instructions..."
          className="mb-3 min-h-16 text-sm"
        />
      )}
      {action.downloadLabel && (
        <a
          href={`/api/runs/${runId}/sanitize/download`}
          className="mb-3 inline-block text-xs underline text-muted-foreground hover:text-foreground"
        >
          {action.downloadLabel}
        </a>
      )}
      <Button onClick={proceed} disabled={busy} className="w-full">
        {busy ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {action.busyLabel}
          </span>
        ) : (
          action.label
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
