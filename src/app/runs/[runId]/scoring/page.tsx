"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ScoredLead {
  lead_id: string;
  deterministic_tier: string;
  deterministic_reasons: string[];
  llm_score: number | null;
  llm_rationale: string | null;
  score_divergence: number | null;
  scores_aligned: boolean;
  score_divergence_flag: boolean;
}

export default function ScoringPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [leads, setLeads] = useState<ScoredLead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/score`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? null));
  }, [runId]);

  async function proceedToRouting() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/route`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/runs/${runId}/routing`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!leads) return <p className="text-muted-foreground">Loading scores...</p>;
  const scored = leads.filter((l) => l.llm_score !== null);
  if (leads.length === 0 || scored.length === 0) {
    return (
      <Alert>
        <AlertTitle>Not scored yet</AlertTitle>
        <AlertDescription>Proceed to scoring from the CRM page first (this calls the Gemini API for probabilistic scoring).</AlertDescription>
      </Alert>
    );
  }

  const divergentCount = leads.filter((l) => l.score_divergence_flag).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Deterministic + probabilistic scoring (6.0)</CardTitle>
          <CardDescription>
            {leads.length} leads scored &middot; {divergentCount} flagged for score divergence (6.4)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={proceedToRouting} disabled={busy}>
            {busy ? "Routing..." : "Proceed to Routing (7.0)"}
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
                <TableHead>Deterministic tier</TableHead>
                <TableHead>LLM score</TableHead>
                <TableHead>Divergence</TableHead>
                <TableHead>Aligned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>{l.lead_id}</TableCell>
                  <TableCell>
                    <Badge variant={l.deterministic_tier === "suppress" ? "destructive" : "outline"}>{l.deterministic_tier}</Badge>
                  </TableCell>
                  <TableCell>{l.llm_score ?? "-"}</TableCell>
                  <TableCell>{l.score_divergence !== null ? l.score_divergence.toFixed(1) : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={l.scores_aligned ? "default" : "destructive"}>{l.scores_aligned ? "aligned" : "diverged"}</Badge>
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
