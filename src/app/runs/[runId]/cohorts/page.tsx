"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CsvRow {
  lead_id: string;
  email_normalized: string;
  company: string;
  job_title: string;
  [key: string]: string;
}

function CohortTable({ rows }: { rows: CsvRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead ID</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Title</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 25).map((r) => (
          <TableRow key={r.lead_id}>
            <TableCell>{r.lead_id}</TableCell>
            <TableCell>{r.email_normalized}</TableCell>
            <TableCell>{r.company}</TableCell>
            <TableCell>{r.job_title}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function CohortsPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [cohorts, setCohorts] = useState<{ existing: CsvRow[]; new: CsvRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/match`)
      .then((r) => r.json())
      .then((d) => setCohorts(d.cohorts ?? null));
  }, [runId]);

  async function proceedToEnrich() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/enrich`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/runs/${runId}/enrichment`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!cohorts) return <p className="text-muted-foreground">Loading cohorts...</p>;
  if (cohorts.existing.length === 0 && cohorts.new.length === 0) {
    return (
      <Alert>
        <AlertTitle>Not matched yet</AlertTitle>
        <AlertDescription>Approve sanitization first, then proceed to matching from the sanitize page.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Signup database match (3.0)</CardTitle>
          <CardDescription>
            {cohorts.existing.length} matched existing users &middot; {cohorts.new.length} new users (simulated BQ lookup)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={proceedToEnrich} disabled={busy}>
            {busy ? "Enriching..." : "Proceed to Enrichment (4.0)"}
          </Button>
          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cohort: existing users ({cohorts.existing.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <CohortTable rows={cohorts.existing} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cohort: new users ({cohorts.new.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <CohortTable rows={cohorts.new} />
        </CardContent>
      </Card>
    </div>
  );
}
