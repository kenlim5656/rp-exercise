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

export default async function RunOverviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getRun(runId)!;
  const stages = getStages(runId);
  const leads = getLeads(runId).filter((l) => l.is_duplicate_primary === 1);

  const needsReview = leads.filter((l) => l.needs_review).length;
  const nextPage = NEXT_PAGE[run.current_stage] ?? "analysis";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            Status: <span className="font-medium">{run.status}</span> &middot; current stage:{" "}
            <span className="font-medium">{run.current_stage}</span>
          </p>
          <p className="text-muted-foreground">
            {leads.length} primary leads &middot; {needsReview} flagged for human review
          </p>
          <div className="mt-2">
            <Button render={<Link href={`/runs/${runId}/${nextPage}`} />} nativeButton={false}>
              Continue &rarr;
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stage history</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {stages.map((s) => (
              <li key={s.stage_key} className="flex justify-between border-b py-1 last:border-0">
                <span>{s.stage_key}</span>
                <span className="text-muted-foreground">
                  {s.status}
                  {s.error_message ? ` -- ${s.error_message}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
