"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface EnrichedLead {
  lead_id: string;
  cohort: string;
  clay: {
    identity?: { resolved: boolean; resolved_account_company: string | null } | null;
    firmographics?: { company_size: string | null; industry: string | null; geo: string | null } | null;
    intent?: { intentScore: number; intentTier?: string; surging?: boolean; source?: string } | null;
  };
}

export default function EnrichmentPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [leads, setLeads] = useState<EnrichedLead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/enrich`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? null));
  }, [runId]);

  async function proceedToCrm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/crm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/runs/${runId}/crm`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!leads) return <p className="text-muted-foreground">Loading enrichment...</p>;
  if (leads.length === 0) {
    return (
      <Alert>
        <AlertTitle>Not enriched yet</AlertTitle>
        <AlertDescription>Proceed to enrichment from the cohorts page first.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity resolution, enrichment, intent scoring (4.0)</CardTitle>
          <CardDescription>{leads.length} leads processed via simulated Clay workflows</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={proceedToCrm} disabled={busy}>
            {busy ? "Looking up CRM..." : "Proceed to CRM/MAP Lookup (5.0)"}
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Cohort</TableHead>
                <TableHead>Identity resolved</TableHead>
                <TableHead>Firmographics</TableHead>
                <TableHead>Intent score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>{l.lead_id}</TableCell>
                  <TableCell>{l.cohort}</TableCell>
                  <TableCell>
                    {l.clay.identity ? (
                      <Badge variant={l.clay.identity.resolved ? "default" : "outline"}>
                        {l.clay.identity.resolved ? l.clay.identity.resolved_account_company : "unresolved"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">n/a (work email)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.clay.firmographics
                      ? `${l.clay.firmographics.company_size ?? "?"} / ${l.clay.firmographics.industry ?? "?"} / ${l.clay.firmographics.geo ?? "?"}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {l.clay.intent ? (
                      <Badge variant={l.clay.intent.surging ? "default" : "outline"}>
                        {l.clay.intent.intentScore} {l.clay.intent.surging ? "(surging)" : ""}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
