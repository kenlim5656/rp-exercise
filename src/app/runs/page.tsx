import Link from "next/link";
import { listRuns } from "@/lib/runs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "awaiting_approval") return "secondary";
  return "outline";
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current stage</TableHead>
              <TableHead>Rows (raw / sanitized)</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Link href={`/runs/${run.id}`} className="font-medium hover:underline">
                    {run.original_filename}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{run.current_stage}</TableCell>
                <TableCell className="text-muted-foreground">
                  {run.row_count_raw ?? "-"} / {run.row_count_sanitized ?? "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(run.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
