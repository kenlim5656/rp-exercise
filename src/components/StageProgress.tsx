import type { RunStageRow } from "@/lib/runs";

const STAGE_LABELS: Record<string, string> = {
  analyze: "Analysis",
  sanitize: "Sanitize",
  match: "Cohort matching",
  enrich: "Enrichment",
  crm: "CRM / MAP",
  score: "Scoring",
  route: "Routing",
  log: "Logging",
};

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "var(--status-completed)";
    case "running":
      return "var(--status-running)";
    case "awaiting_approval":
      return "var(--status-awaiting)";
    case "failed":
      return "var(--status-failed)";
    default:
      return "var(--status-pending)";
  }
}

export function StageProgress({ stages }: { stages: RunStageRow[] }) {
  const completed = stages.filter((s) => s.status === "completed").length;
  const total = stages.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pipeline progress</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--accent-pipeline)" }}>
          {completed}/{total}
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: "var(--status-completed)" }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        {stages.map((s) => (
          <div key={s.stage_key} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: statusColor(s.status) }}
            />
            <span className="text-xs text-muted-foreground flex-1">{STAGE_LABELS[s.stage_key] ?? s.stage_key}</span>
            <span className="text-[0.6rem] font-medium uppercase tracking-wider" style={{ color: statusColor(s.status) }}>
              {s.status === "awaiting_approval" ? "awaiting" : s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
