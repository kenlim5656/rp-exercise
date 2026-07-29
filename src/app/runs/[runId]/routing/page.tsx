"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface RoutedLead {
  lead_id: string;
  final_tier: string | null;
  routing_decision: string | null;
  needs_review: boolean;
  review_reasons: string[];
}

const DECISION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sales_queue: "default",
  nurture: "secondary",
  self_serve_newsletter: "outline",
  suppressed: "destructive",
  human_review: "destructive",
};

export default function RoutingPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [leads, setLeads] = useState<RoutedLead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await fetch(`/api/runs/${runId}/route`).then((r) => r.json());
    setLeads(d.leads ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${runId}/route`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setLeads(d.leads ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  async function runRouting() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/route`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!leads) return <p className="text-muted-foreground">Loading routing...</p>;

  const counts: Record<string, number> = {};
  for (const l of leads) if (l.routing_decision) counts[l.routing_decision] = (counts[l.routing_decision] ?? 0) + 1;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Routing decisions (7.1)</CardTitle>
          <CardDescription>Final routing per the ICP memo, with the EU consent hard gate and score-divergence review applied</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).map(([decision, count]) => (
              <Badge key={decision} variant={DECISION_VARIANT[decision] ?? "outline"}>
                {decision}: {count}
              </Badge>
            ))}
          </div>
          <div>
            <Button onClick={runRouting} disabled={busy}>
              {busy ? "Routing..." : "Run / re-run routing"}
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

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Routing</TableHead>
                <TableHead>Review reasons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>
                    <Link href={`/runs/${runId}/leads/${l.lead_id}`} className="text-[var(--accent-pipeline)] underline-offset-2 hover:underline">
                      {l.lead_id}
                    </Link>
                  </TableCell>
                  <TableCell>{l.final_tier ?? "-"}</TableCell>
                  <TableCell>
                    {l.routing_decision ? (
                      <Badge variant={DECISION_VARIANT[l.routing_decision] ?? "outline"}>{l.routing_decision}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{l.review_reasons.join(" | ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
