"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SanitizeReport {
  row_count_out: number;
  transformations_applied: Record<string, number>;
  instructions_applied: string[];
  instructions_notes: string;
}

export default function SanitizePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<SanitizeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/sanitize`)
      .then((r) => r.json())
      .then((d) => setReport(d.report ?? null));
  }, [runId]);

  async function proceedToMatch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/match`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/runs/${runId}/cohorts`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!report) {
    return (
      <Alert>
        <AlertTitle>Not sanitized yet</AlertTitle>
        <AlertDescription>Go back to the analysis page and approve sanitization first.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Sanitize report (2.1 / 2.2)</CardTitle>
          <CardDescription>{report.row_count_out} clean primary records after dedup</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transformation</TableHead>
                <TableHead className="text-right">Rows affected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(report.transformations_applied).map(([key, count]) => (
                <TableRow key={key}>
                  <TableCell>{key.replaceAll("_", " ")}</TableCell>
                  <TableCell className="text-right">{count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {report.instructions_applied.length > 0 && (
            <p className="text-sm text-muted-foreground">
              User overrides applied: {report.instructions_applied.join(", ")}
            </p>
          )}
          {report.instructions_notes && (
            <p className="text-sm text-muted-foreground">Notes: {report.instructions_notes}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              render={<a href={`/api/runs/${runId}/sanitize/download`} />}
              nativeButton={false}
            >
              Download sanitized CSV
            </Button>
            <Button onClick={proceedToMatch} disabled={busy}>
              {busy ? "Matching..." : "Proceed to Matching (3.0)"}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
