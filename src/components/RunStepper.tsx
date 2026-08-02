import Link from "next/link";
import type { RunStageRow, StageStatus } from "@/lib/runs";

const STEPS: Array<{ key: string; label: string; shortLabel: string; href: (id: string) => string }> = [
  { key: "analyze", label: "Analysis", shortLabel: "1", href: (id) => `/runs/${id}/analysis` },
  { key: "sanitize", label: "Sanitize", shortLabel: "2", href: (id) => `/runs/${id}/sanitize` },
  { key: "match", label: "Cohorts", shortLabel: "3", href: (id) => `/runs/${id}/cohorts` },
  { key: "enrich", label: "Enrichment", shortLabel: "4", href: (id) => `/runs/${id}/enrichment` },
  { key: "crm", label: "CRM/MAP", shortLabel: "5", href: (id) => `/runs/${id}/crm` },
  { key: "score", label: "Scoring", shortLabel: "6", href: (id) => `/runs/${id}/scoring` },
  { key: "route", label: "Routing", shortLabel: "7", href: (id) => `/runs/${id}/routing` },
  { key: "followup", label: "Follow-up", shortLabel: "8", href: (id) => `/runs/${id}/followup` },
  { key: "log", label: "Logs", shortLabel: "9", href: (id) => `/runs/${id}/logs` },
];

function dotStyle(status: StageStatus | undefined) {
  switch (status) {
    case "completed":
      return {
        bg: "bg-[var(--status-completed)]",
        ring: "",
        text: "text-[var(--status-completed)]",
        line: "bg-[var(--status-completed)]",
        icon: "check",
      } as const;
    case "running":
      return {
        bg: "bg-[var(--status-running)]",
        ring: "ring-4 ring-[var(--status-running-dim)]",
        text: "text-[var(--status-running)]",
        line: "bg-[var(--status-running-dim)]",
        icon: "pulse",
      } as const;
    case "awaiting_approval":
      return {
        bg: "bg-[var(--status-awaiting)]",
        ring: "ring-4 ring-[var(--status-awaiting-dim)]",
        text: "text-[var(--status-awaiting)]",
        line: "bg-[var(--status-awaiting-dim)]",
        icon: "pause",
      } as const;
    case "failed":
      return {
        bg: "bg-[var(--status-failed)]",
        ring: "",
        text: "text-[var(--status-failed)]",
        line: "bg-[var(--status-failed-dim)]",
        icon: "x",
      } as const;
    default:
      return {
        bg: "bg-[var(--status-pending)]",
        ring: "",
        text: "text-[var(--status-pending)]",
        line: "bg-[var(--status-pending-dim)]",
        icon: "empty",
      } as const;
  }
}

function DotIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "check":
      return (
        <svg className="h-3 w-3 text-black" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "pulse":
      return <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-black" />;
    case "pause":
      return (
        <svg className="h-2.5 w-2.5 text-black" viewBox="0 0 10 10" fill="currentColor">
          <rect x="2" y="1.5" width="2" height="7" rx="0.5" />
          <rect x="6" y="1.5" width="2" height="7" rx="0.5" />
        </svg>
      );
    case "x":
      return (
        <svg className="h-2.5 w-2.5 text-black" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function RunStepper({ runId, stages }: { runId: string; stages: RunStageRow[] }) {
  const byKey = new Map(stages.map((s) => [s.stage_key, s]));
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex items-center">
          {STEPS.map((step, i) => {
            const stage = byKey.get(step.key as RunStageRow["stage_key"]);
            const style = dotStyle(stage?.status);
            const isLast = i === STEPS.length - 1;
            return (
              <div key={step.key} className="flex items-center" style={{ flex: isLast ? "0 0 auto" : "1 1 0%" }}>
                <Link
                  href={step.href(runId)}
                  className="group flex flex-col items-center gap-1.5"
                >
                  {/* Dot */}
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-all ${style.bg} ${style.ring} group-hover:scale-110`}
                  >
                    <DotIcon icon={style.icon} />
                  </div>
                  {/* Label */}
                  <span className={`text-[0.65rem] font-medium leading-none ${style.text} transition-colors group-hover:text-foreground`}>
                    {step.label}
                  </span>
                </Link>
                {/* Connecting line */}
                {!isLast && (
                  <div className={`mx-1 h-0.5 flex-1 rounded-full ${style.line} self-start mt-3`} />
                )}
              </div>
            );
          })}
          {/* Review queue as a separate item */}
          <div className="ml-4 flex items-center border-l border-[var(--border)] pl-4">
            <Link
              href={`/runs/${runId}/review`}
              className="group flex flex-col items-center gap-1.5"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-copilot)] transition-all group-hover:scale-110">
                <svg className="h-3 w-3 text-black" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-[0.65rem] font-medium leading-none text-[var(--accent-copilot)] transition-colors group-hover:text-foreground">
                Review
              </span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
