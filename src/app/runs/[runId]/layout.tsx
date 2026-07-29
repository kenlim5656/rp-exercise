import { notFound } from "next/navigation";
import { getRun, getStages, getLeads } from "@/lib/runs";
import { LiveRunStepper } from "@/components/LiveRunStepper";
import { CopilotPanel } from "@/components/CopilotPanel";
import { LiveScorecard } from "@/components/LiveScorecard";
import { LiveStageProgress } from "@/components/LiveStageProgress";
import { StageActions } from "@/components/StageActions";

export const dynamic = "force-dynamic";

function statusBadgeClass(status: string) {
  switch (status) {
    case "completed":
      return "badge-completed";
    case "running":
      return "badge-running";
    case "awaiting_approval":
      return "badge-awaiting";
    case "failed":
      return "badge-failed";
    default:
      return "badge-pending";
  }
}

export default async function RunLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) notFound();
  const [stages, leads] = await Promise.all([getStages(runId), getLeads(runId)]);

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-6 pt-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{run.original_filename}</h1>
          <p className="text-sm text-muted-foreground">
            {run.row_count_raw ?? "?"} raw rows &middot; {run.row_count_sanitized ?? "?"} sanitized primary rows
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(run.status)}`}>
          {run.status}
        </span>
      </div>
      <LiveScorecard
        runId={runId}
        initialData={{
          primaryLeads: leads.filter((l) => l.is_duplicate_primary === 1).length,
          flagged: leads.filter((l) => l.needs_review).length,
          tier1: leads.filter((l) => (l.final_tier || l.deterministic_tier) === "tier1").length,
          tier2: leads.filter((l) => (l.final_tier || l.deterministic_tier) === "tier2").length,
          tier3: leads.filter((l) => (l.final_tier || l.deterministic_tier) === "tier3").length,
          humanReview: leads.filter((l) => l.routing_decision === "human_review").length,
          salesQueue: leads.filter((l) => l.routing_decision === "sales_queue").length,
          nurture: leads.filter((l) => l.routing_decision === "nurture").length,
          selfServe: leads.filter((l) => l.routing_decision === "self_serve_newsletter").length,
        }}
      />
      <div className="mt-2">
        <LiveRunStepper runId={runId} initialStages={stages} />
      </div>
      {/* Side-by-side: main content + copilot */}
      <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-6 py-6">
        <main className="min-w-0 flex-1">{children}</main>
        <aside className="hidden w-[340px] shrink-0 lg:flex lg:flex-col lg:gap-4">
          <LiveStageProgress runId={runId} initialStages={stages} />
          <CopilotPanel runId={runId} />
          <StageActions runId={runId} />
        </aside>
      </div>
      {/* Mobile: copilot as bottom button */}
      <div className="lg:hidden">
        <CopilotPanel runId={runId} mobile />
      </div>
    </div>
  );
}
