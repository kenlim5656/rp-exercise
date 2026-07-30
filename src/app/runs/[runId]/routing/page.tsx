"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

interface RoutedLead {
  lead_id: string;
  email: string;
  company: string;
  title: string;
  deterministic_tier: string | null;
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
  const [sortKey, setSortKey] = useState<string>("lead_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [routingFilter, setRoutingFilter] = useState<string>("all");

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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

  const filtered = leads.filter((l) => {
    if (tierFilter !== "all" && l.final_tier !== tierFilter) return false;
    if (routingFilter !== "all" && l.routing_decision !== routingFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
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
          <div className="flex flex-wrap gap-2 mb-2">
            {["all", "tier1", "tier2", "tier3"].map((f) => (
              <button
                key={f}
                onClick={() => setTierFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  tierFilter === f
                    ? "bg-[var(--accent)] text-foreground"
                    : "bg-[var(--card)] text-muted-foreground hover:text-foreground border border-[var(--border)]"
                }`}
              >
                {f === "all" ? "All" : f.replace("tier", "Tier ")}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {["all", "sales_queue", "nurture", "self_serve_newsletter", "human_review"].map((f) => (
              <button
                key={f}
                onClick={() => setRoutingFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  routingFilter === f
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
                <SortHead k="final_tier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tier</SortHead>
                <SortHead k="routing_decision" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Routing</SortHead>
                <TableHead>Review reasons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>
                    <Link href={`/runs/${runId}/leads/${l.lead_id}?from=routing`} className="text-[var(--accent-pipeline)] underline-offset-2 hover:underline">
                      {l.lead_id}
                    </Link>
                  </TableCell>
                  <TableCell>{l.email}</TableCell>
                  <TableCell>{l.company}</TableCell>
                  <TableCell>{l.title}</TableCell>
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
