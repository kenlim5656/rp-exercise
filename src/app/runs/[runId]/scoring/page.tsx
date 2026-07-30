"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function SortHead({
  k,
  sortKey,
  sortDir,
  onSort,
  children,
}: {
  k: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <TableHead className="cursor-pointer select-none" onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </TableHead>
  );
}

interface ScoredLead {
  lead_id: string;
  email: string;
  company: string;
  title: string;
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
  const [sortKey, setSortKey] = useState<string>("llm_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch(`/api/runs/${runId}/score`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? null));
  }, [runId]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
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

  const filtered = leads.filter((l) => {
    if (filter === "all") return true;
    if (filter === "diverged") return l.score_divergence_flag;
    if (filter === "tier1") return l.deterministic_tier === "tier1";
    if (filter === "tier2") return l.deterministic_tier === "tier2";
    if (filter === "tier3") return l.deterministic_tier === "tier3";
    if (filter === "suppress") return l.deterministic_tier === "suppress";
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "llm_score" || sortKey === "score_divergence") {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    }
    const av = (a as unknown as Record<string, string>)[sortKey] ?? "";
    const bv = (b as unknown as Record<string, string>)[sortKey] ?? "";
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

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
          <div className="flex flex-wrap gap-2 mb-4">
            {["all", "tier1", "tier2", "tier3", "suppress", "diverged"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-[var(--accent)] text-foreground"
                    : "bg-[var(--card)] text-muted-foreground hover:text-foreground border border-[var(--border)]"
                }`}
              >
                {f === "all" ? "All" : f === "diverged" ? "Diverged" : f.startsWith("tier") ? f.replace("tier", "Tier ") : "Suppress"}
              </button>
            ))}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="lead_id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Lead ID</SortHead>
                <SortHead k="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Email</SortHead>
                <SortHead k="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Company</SortHead>
                <SortHead k="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Title</SortHead>
                <SortHead k="deterministic_tier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Deterministic tier</SortHead>
                <SortHead k="llm_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>LLM score</SortHead>
                <SortHead k="score_divergence" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Divergence</SortHead>
                <TableHead>Aligned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>
                    <Link href={`/runs/${runId}/leads/${l.lead_id}?from=scoring`} className="text-[var(--accent-pipeline)] underline-offset-2 hover:underline">
                      {l.lead_id}
                    </Link>
                  </TableCell>
                  <TableCell>{l.email}</TableCell>
                  <TableCell>{l.company}</TableCell>
                  <TableCell>{l.title}</TableCell>
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
