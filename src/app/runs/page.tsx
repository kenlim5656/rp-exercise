import Link from "next/link";
import { listRuns } from "@/lib/runs";
import { Button } from "@/components/ui/button";

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

export default async function RunsPage() {
  const runs = await listRuns();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <Button render={<Link href="/runs/new" />} nativeButton={false}>New upload</Button>
      </div>

      {runs.length === 0 ? (
        <p className="text-muted-foreground">No runs yet. Upload a lead file to get started.</p>
      ) : (
        <div className="table-enhanced overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">File</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Current stage</th>
                <th className="px-4 py-3 text-left">Rows (raw / sanitized)</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-[var(--border)] last:border-0 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/runs/${run.id}`} className="font-medium hover:underline" style={{ color: "var(--accent-pipeline)" }}>
                      {run.original_filename}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{run.current_stage}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {run.row_count_raw ?? "-"} / {run.row_count_sanitized ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(run.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
