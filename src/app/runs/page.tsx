import Link from "next/link";
import { listRuns } from "@/lib/runs";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function statusBadgeClass(status: string) {
  switch (status) {
    case "completed":      return "badge-completed";
    case "processing":
    case "running":        return "badge-running";
    case "awaiting_approval": return "badge-awaiting";
    case "failed":         return "badge-failed";
    default:               return "badge-pending";
  }
}

function stageLabel(stage: string) {
  const map: Record<string, string> = {
    analyze: "Analysis",
    sanitize: "Sanitize",
    match: "Cohorts",
    enrich: "Enrichment",
    crm: "CRM/MAP",
    score: "Scoring",
    route: "Routing",
    followup: "Follow-up",
    log: "Logs",
  };
  return map[stage] ?? stage;
}

function stageProgress(stage: string): number {
  const order = ["analyze", "sanitize", "match", "enrich", "crm", "score", "route", "followup", "log"];
  const idx = order.indexOf(stage);
  return idx < 0 ? 0 : Math.round(((idx + 1) / order.length) * 100);
}

export default async function RunsPage() {
  const runs = await listRuns();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Page header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline Runs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {runs.length === 0 ? "No runs yet" : `${runs.length} run${runs.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button render={<Link href="/runs/new" />} nativeButton={false}>
          + New Upload
        </Button>
      </div>

      {runs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--border)] p-16 text-center">
          <div className="text-4xl">📂</div>
          <div>
            <p className="font-medium text-foreground">No runs yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload a lead CSV to start your first pipeline run.</p>
          </div>
          <Button render={<Link href="/runs/new" />} nativeButton={false}>
            Upload leads
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const progress = stageProgress(run.current_stage);
            return (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="group flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-all hover:border-[var(--accent-pipeline)]/40 hover:shadow-lg hover:shadow-[var(--accent-pipeline)]/5"
              >
                {/* File icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] text-lg">
                  📋
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground group-hover:text-[var(--accent-pipeline)]">
                      {run.original_filename}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(run.status)}`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{run.row_count_raw ?? "—"} raw rows</span>
                    {run.row_count_sanitized != null && (
                      <>
                        <span className="opacity-40">·</span>
                        <span>{run.row_count_sanitized} sanitized</span>
                      </>
                    )}
                    <span className="opacity-40">·</span>
                    <span>{new Date(run.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* Progress bar */}
                  {run.status !== "created" && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="score-bar flex-1">
                        <div
                          className="score-bar-fill bg-[var(--accent-pipeline)]"
                          style={{ width: `${progress}%`, opacity: run.status === "completed" ? 1 : 0.7 }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {stageLabel(run.current_stage)}
                      </span>
                    </div>
                  )}
                </div>

                <span className="shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
