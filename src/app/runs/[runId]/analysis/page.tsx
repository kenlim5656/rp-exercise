"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AnalysisReport {
  meta: { row_count: number; column_count: number };
  duplicates: { exact_email_dupes: number; normalized_email_dupes: number };
  anomalies: {
    country: { distinct_raw_values: number; suspicious_value_count: number };
    marketing_consent: { distinct_spellings: number };
    email: {
      malformed_count: number;
      competitor_domain_hits: number;
      disposable_domain_hits: number;
      suspicious_fake_hits: number;
      freemail_count: number;
      work_domain_count: number;
    };
    company_website: { missing_count: number; protocol_missing_count: number };
  };
  recommendations: Array<{ field: string; issue: string; proposed_fix: string; affected_rows: number }>;
}

export default function AnalysisPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/analyze`)
      .then((r) => r.json())
      .then((d) => setReport(d.report ?? null));
  }, [runId]);

  async function approveAndSanitize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/sanitize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true, instructions: notes ? { notes } : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/runs/${runId}/sanitize`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!report) return <p className="text-muted-foreground">Loading analysis...</p>;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Data quality analysis (1.1 / 1.2)</CardTitle>
          <CardDescription>
            {report.meta.row_count} rows &middot; {report.meta.column_count} columns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anomaly type</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Duplicate emails (normalized)</TableCell>
                <TableCell className="text-right">{report.duplicates.normalized_email_dupes}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Country: distinct raw spellings</TableCell>
                <TableCell className="text-right">{report.anomalies.country.distinct_raw_values}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Country: junk/suspicious values</TableCell>
                <TableCell className="text-right">{report.anomalies.country.suspicious_value_count}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Marketing consent: distinct spellings</TableCell>
                <TableCell className="text-right">{report.anomalies.marketing_consent.distinct_spellings}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Competitor domain emails</TableCell>
                <TableCell className="text-right">{report.anomalies.email.competitor_domain_hits}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Clearly fake/spam emails</TableCell>
                <TableCell className="text-right">{report.anomalies.email.suspicious_fake_hits}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Freemail vs. work emails</TableCell>
                <TableCell className="text-right">
                  {report.anomalies.email.freemail_count} / {report.anomalies.email.work_domain_count}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Company website missing / no protocol</TableCell>
                <TableCell className="text-right">
                  {report.anomalies.company_website.missing_count} / {report.anomalies.company_website.protocol_missing_count}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Proposed fix</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.recommendations.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.field}</TableCell>
                  <TableCell>{r.issue}</TableCell>
                  <TableCell className="text-muted-foreground">{r.proposed_fix}</TableCell>
                  <TableCell className="text-right">{r.affected_rows}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approve & sanitize (2.1)</CardTitle>
          <CardDescription>Add any additional cleaning instructions before sanitizing, or leave blank to use the defaults above.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. also treat 'n/a' as a placeholder UTM value"
          />
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Sanitize failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={approveAndSanitize} disabled={busy}>
            {busy ? "Sanitizing..." : "Approve & Sanitize"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
