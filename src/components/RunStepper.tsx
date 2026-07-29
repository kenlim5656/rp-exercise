import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { RunStageRow, StageStatus } from "@/lib/runs";

const STEPS: Array<{ key: string; label: string; href: (id: string) => string }> = [
  { key: "analyze", label: "1. Analysis", href: (id) => `/runs/${id}/analysis` },
  { key: "sanitize", label: "2. Sanitize", href: (id) => `/runs/${id}/sanitize` },
  { key: "match", label: "3. Cohorts", href: (id) => `/runs/${id}/cohorts` },
  { key: "enrich", label: "4. Enrichment", href: (id) => `/runs/${id}/enrichment` },
  { key: "crm", label: "5. CRM/MAP", href: (id) => `/runs/${id}/crm` },
  { key: "score", label: "6. Scoring", href: (id) => `/runs/${id}/scoring` },
  { key: "route", label: "7. Routing", href: (id) => `/runs/${id}/routing` },
  { key: "log", label: "8. Logs", href: (id) => `/runs/${id}/logs` },
];

function variantFor(status: StageStatus | undefined): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "failed":
      return "destructive";
    case "awaiting_approval":
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

export function RunStepper({ runId, stages }: { runId: string; stages: RunStageRow[] }) {
  const byKey = new Map(stages.map((s) => [s.stage_key, s]));
  return (
    <nav className="flex flex-wrap gap-2 border-b bg-muted/30 px-6 py-3">
      {STEPS.map((step) => {
        const stage = byKey.get(step.key as RunStageRow["stage_key"]);
        return (
          <Link key={step.key} href={step.href(runId)}>
            <Badge variant={variantFor(stage?.status)} className="cursor-pointer">
              {step.label}
            </Badge>
          </Link>
        );
      })}
      <Link href={`/runs/${runId}/review`}>
        <Badge variant="outline" className="cursor-pointer">
          Review queue
        </Badge>
      </Link>
    </nav>
  );
}
