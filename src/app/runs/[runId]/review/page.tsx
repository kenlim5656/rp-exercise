"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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

interface ReviewItem {
  lead_id: string;
  cohort: string | null;
  deterministic_tier: string | null;
  llm_score: number | null;
  routing_decision: string | null;
  review_status: string;
  review_reasons: string[];
  lead: { email_normalized?: string; job_title?: string; company?: string } | null;
}

export default function ReviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("lead_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function load() {
    const d = await fetch(`/api/runs/${runId}/review`).then((r) => r.json());
    setQueue(d.queue ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${runId}/review`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setQueue(d.queue ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  async function act(leadId: string, action: "approve" | "reject") {
    setActingOn(leadId);
    try {
      const res = await fetch(`/api/runs/${runId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action, actor: "marketing-ops-user" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Lead ${leadId} ${action}d`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }

  if (!queue) return <p className="text-muted-foreground">Loading review queue...</p>;

  const pending = queue.filter((q) => q.review_status === "pending" || q.review_status === "none");

  const filtered = queue.filter((q) => {
    if (tierFilter !== "all" && q.deterministic_tier !== tierFilter) return false;
    if (statusFilter === "pending" && !(q.review_status === "pending" || q.review_status === "none")) return false;
    if (statusFilter === "approved" && q.review_status !== "approved") return false;
    if (statusFilter === "rejected" && q.review_status !== "rejected") return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortKey === "llm_score") {
      av = a.llm_score ?? -Infinity;
      bv = b.llm_score ?? -Infinity;
    } else if (sortKey === "email" || sortKey === "company" || sortKey === "title") {
      const key = sortKey === "email" ? "email_normalized" : sortKey === "title" ? "job_title" : "company";
      av = a.lead?.[key as "email_normalized" | "job_title" | "company"] ?? "";
      bv = b.lead?.[key as "email_normalized" | "job_title" | "company"] ?? "";
    } else {
      av = (a as unknown as Record<string, string>)[sortKey] ?? "";
      bv = (b as unknown as Record<string, string>)[sortKey] ?? "";
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Human review queue (7.2)</CardTitle>
        <CardDescription>
          {pending.length} pending of {queue.length} total flagged leads. Every reason a lead was routed here is
          shown below, including the EU consent hard rule (5.3) and score-divergence flags (6.4).
        </CardDescription>
      </CardHeader>
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
          {["all", "pending", "approved", "rejected"].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f
                  ? "bg-[var(--accent)] text-foreground"
                  : "bg-[var(--card)] text-muted-foreground hover:text-foreground border border-[var(--border)]"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="lead_id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Lead</SortHead>
              <SortHead k="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Email</SortHead>
              <SortHead k="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Company</SortHead>
              <SortHead k="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Title</SortHead>
              <SortHead k="deterministic_tier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tier / score</SortHead>
              <TableHead>Reasons</TableHead>
              <SortHead k="review_status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Status</SortHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((item) => (
              <TableRow key={item.lead_id}>
                <TableCell>
                  <Link href={`/runs/${runId}/leads/${item.lead_id}?from=review`} className="font-medium text-[var(--accent-pipeline)] underline-offset-2 hover:underline">{item.lead_id}</Link>
                </TableCell>
                <TableCell>{item.lead?.email_normalized ?? "-"}</TableCell>
                <TableCell>{item.lead?.company ?? "-"}</TableCell>
                <TableCell>{item.lead?.job_title ?? "-"}</TableCell>
                <TableCell className="text-sm">
                  {item.deterministic_tier} / {item.llm_score ?? "-"}
                </TableCell>
                <TableCell className="text-xs">
                  {item.review_reasons.map((r) => (
                    <Badge key={r} variant="outline" className="mr-1 mb-1">
                      {r}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell>
                  <Badge variant={item.review_status === "approved" ? "default" : item.review_status === "rejected" ? "destructive" : "secondary"}>
                    {item.review_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingOn === item.lead_id}
                      onClick={() => act(item.lead_id, "approve")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actingOn === item.lead_id}
                      onClick={() => act(item.lead_id, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
