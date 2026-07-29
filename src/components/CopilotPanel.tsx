"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function CopilotPanel({ runId }: { runId: string }) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, messages: next }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: res.ok ? data.reply : `Error: ${data.error}` }]);
    } catch (err) {
      setMessages([...next, { role: "assistant", content: `Error: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button onClick={() => setOpen(true)}>Ask copilot</Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">Copilot</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ScrollArea className="h-64 rounded border p-2">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ask about a lead, tier, score, cohort, or anything logged in this run.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`mb-2 text-sm ${m.role === "user" ? "text-foreground" : "text-muted-foreground"}`}>
                <span className="font-medium">{m.role === "user" ? "You: " : "Copilot: "}</span>
                <span className="whitespace-pre-wrap">{m.content}</span>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Thinking...</p>}
          </ScrollArea>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="e.g. Why is lead L1234 flagged for review?"
              className="min-h-16 text-sm"
            />
            <Button onClick={send} disabled={busy}>
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
