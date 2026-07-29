"use client";

import { use, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [report, setReport] = useState<SanitizeReport | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/sanitize`)
      .then((r) => r.json())
      .then((d) => setReport(d.report ?? null));
  }, [runId]);

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

        </CardContent>
      </Card>
    </div>
  );
}
