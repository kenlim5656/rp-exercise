import { notFound } from "next/navigation";
import { getRun, getStages } from "@/lib/runs";
import { RunStepper } from "@/components/RunStepper";
import { CopilotPanel } from "@/components/CopilotPanel";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

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
  const stages = await getStages(runId);

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{run.original_filename}</h1>
          <p className="text-sm text-muted-foreground">
            {run.row_count_raw ?? "?"} raw rows &middot; {run.row_count_sanitized ?? "?"} sanitized primary rows
          </p>
        </div>
        <Badge variant="outline">{run.status}</Badge>
      </div>
      <div className="mt-4">
        <RunStepper runId={runId} stages={stages} />
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 py-6">{children}</div>
      <CopilotPanel runId={runId} />
    </div>
  );
}
