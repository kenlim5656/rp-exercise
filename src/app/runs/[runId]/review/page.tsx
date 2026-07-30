"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Tier / score</TableHead>
              <TableHead>Reasons</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((item) => (
              <TableRow key={item.lead_id}>
                <TableCell>
                  <Link href={`/runs/${runId}/leads/${item.lead_id}?from=review`} className="font-medium text-[var(--accent-pipeline)] underline-offset-2 hover:underline">{item.lead_id}</Link>
                  <div className="text-xs text-muted-foreground">
                    {item.lead?.job_title} @ {item.lead?.company}
                  </div>
                </TableCell>
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
