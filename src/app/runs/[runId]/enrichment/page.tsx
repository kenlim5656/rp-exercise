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

interface EnrichedLead {
  lead_id: string;
  cohort: string;
  email: string;
  company: string;
  title: string;
  clay: {
    identity?: { resolved: boolean; resolved_account_company: string | null } | null;
    firmographics?: { company_size: string | null; industry: string | null; geo: string | null } | null;
    intent?: { intentScore: number; intentTier?: string; surging?: boolean; source?: string } | null;
  };
}

export default function EnrichmentPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [leads, setLeads] = useState<EnrichedLead[] | null>(null);
  const [sortKey, setSortKey] = useState<string>("lead_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch(`/api/runs/${runId}/enrich`)
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

  if (!leads) return <p className="text-muted-foreground">Loading enrichment...</p>;
  if (leads.length === 0) {
    return (
      <Alert>
        <AlertTitle>Not enriched yet</AlertTitle>
        <AlertDescription>Proceed to enrichment from the cohorts page first.</AlertDescription>
      </Alert>
    );
  }

  const cohorts = Array.from(new Set(leads.map((l) => l.cohort))).sort();

  const filtered = filter === "all" ? leads : leads.filter((l) => l.cohort === filter);

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortKey === "intent") {
      av = a.clay.intent?.intentScore ?? -Infinity;
      bv = b.clay.intent?.intentScore ?? -Infinity;
    } else {
      av = (a as unknown as Record<string, string>)[sortKey] ?? "";
      bv = (b as unknown as Record<string, string>)[sortKey] ?? "";
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity resolution, enrichment, intent scoring (4.0)</CardTitle>
          <CardDescription>{leads.length} leads processed via simulated Clay workflows</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {["all", ...cohorts].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-[var(--accent)] text-foreground"
                    : "bg-[var(--card)] text-muted-foreground hover:text-foreground border border-[var(--border)]"
                }`}
              >
                {f === "all" ? "All" : f}
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
                <SortHead k="cohort" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Cohort</SortHead>
                <TableHead>Identity resolved</TableHead>
                <TableHead>Firmographics</TableHead>
                <SortHead k="intent" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Intent score</SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>
                    <Link href={`/runs/${runId}/leads/${l.lead_id}?from=enrichment`} className="text-[var(--accent-pipeline)] underline-offset-2 hover:underline">
                      {l.lead_id}
                    </Link>
                  </TableCell>
                  <TableCell>{l.email}</TableCell>
                  <TableCell>{l.company}</TableCell>
                  <TableCell>{l.title}</TableCell>
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
