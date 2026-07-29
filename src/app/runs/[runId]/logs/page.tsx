"use client";

import { use, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LogEntry {
  id: string;
  stage: string;
  action: string;
  entity_ref: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export default function LogsPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [record, setRecord] = useState<unknown>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/runs/${runId}/logs`)
      .then((r) => r.json())
      .then((d) => setLog(d.log ?? null));
  }, [runId]);

  async function viewRecord(entryId: string) {
    const data = await fetch(`/api/runs/${runId}/logs/${entryId}/record`).then((r) => r.json());
    setRecord(data);
    setOpen(true);
  }

  if (!log) return <p className="text-muted-foreground">Loading audit log...</p>;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Audit log (8.0)</CardTitle>
          <CardDescription>
            {log.length} actions logged. Every entry is PII-free by construction; use &quot;View record&quot; to
            resolve the entity_ref back to the full lead for compliance review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</TableCell>
                  <TableCell>{entry.stage}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{JSON.stringify(entry.detail)}</TableCell>
                  <TableCell className="text-right">
                    {entry.entity_ref && (
                      <Button size="sm" variant="outline" onClick={() => viewRecord(entry.id)}>
                        View record
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Linked record</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(record, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
