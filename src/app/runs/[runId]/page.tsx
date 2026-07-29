import Link from "next/link";
import { getLeads, getRun, getStages } from "@/lib/runs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const NEXT_PAGE: Record<string, string> = {
  analyze: "analysis",
  sanitize: "sanitize",
  match: "cohorts",
  enrich: "enrichment",
  crm: "crm",
  score: "scoring",
  route: "routing",
  log: "logs",
};

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

export default async function RunOverviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = (await getRun(runId))!;
  const stages = await getStages(runId);
  const leads = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);

  const needsReview = leads.filter((l) => l.needs_review).length;
  const nextPage = NEXT_PAGE[run.current_stage] ?? "analysis";

  return (
    <div className="flex flex-col gap-6">
      <Card className="card-accent-pipeline">
        <CardHeader>
          <CardTitle>Pipeline status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Status</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(run.status)}`}>
              {run.status}
            </span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">Stage</span>
            <span className="font-medium">{run.current_stage}</span>
          </div>
          <div className="flex items-baseline gap-6">
            <div>
              <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--accent-pipeline)" }}>
                {leads.length}
              </span>
              <span className="ml-1.5 text-muted-foreground">primary leads</span>
            </div>
            <div>
              <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--status-awaiting)" }}>
                {needsReview}
              </span>
              <span className="ml-1.5 text-muted-foreground">flagged for review</span>
            </div>
          </div>
          <div className="mt-1">
            <Button render={<Link href={`/runs/${runId}/${nextPage}`} />} nativeButton={false}>
              Continue &rarr;
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="card-accent-history">
        <CardHeader>
          <CardTitle>Stage history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="table-enhanced overflow-auto rounded">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">Stage</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Details</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.stage_key} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 font-medium">{s.stage_key}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.error_message ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
