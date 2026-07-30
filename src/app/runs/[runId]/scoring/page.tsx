"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [leads, setLeads] = useState<ScoredLead[] | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/score`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? null));
  }, [runId]);

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
                  <TableCell>
                    <Link href={`/runs/${runId}/leads/${l.lead_id}?from=scoring`} className="text-[var(--accent-pipeline)] underline-offset-2 hover:underline">
                      {l.lead_id}
                    </Link>
                  </TableCell>
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
