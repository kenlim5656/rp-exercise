"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function CopilotPanel({ runId, mobile }: { runId: string; mobile?: boolean }) {
  const [open, setOpen] = useState(!mobile);
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

  // Mobile: floating button + drawer
  if (mobile) {
    if (!open) {
      return (
        <div className="fixed bottom-4 right-4 z-50">
          <Button onClick={() => setOpen(true)} className="shadow-lg">
            Ask copilot
          </Button>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-50 flex flex-col">
        {/* Backdrop */}
        <div className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
        {/* Drawer */}
        <div className="flex h-[60vh] flex-col border-t border-[var(--border)] bg-[var(--card)]">
          <CopilotContent
            messages={messages}
            input={input}
            setInput={setInput}
            busy={busy}
            send={send}
            onClose={() => setOpen(false)}
          />
        </div>
      </div>
    );
  }

  // Desktop: sticky sidebar
  return (
    <div className="card-accent-copilot sticky top-6 flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)]" style={{ maxHeight: "calc(100vh - 3rem)" }}>
      <CopilotContent
        messages={messages}
        input={input}
        setInput={setInput}
        busy={busy}
        send={send}
      />
    </div>
  );
}

function CopilotContent({
  messages,
  input,
  setInput,
  busy,
  send,
  onClose,
}: {
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  send: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-copilot)]" />
          <span className="text-sm font-medium">Copilot</span>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ask about a lead, tier, score, cohort, or anything logged in this run.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-3 rounded-md px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-4 bg-[var(--accent)] text-foreground"
                : "mr-4 bg-transparent text-muted-foreground"
            }`}
          >
            <span className="mb-0.5 block text-[0.65rem] font-medium uppercase tracking-wider opacity-60">
              {m.role === "user" ? "You" : "Copilot"}
            </span>
            <span className="whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-copilot)]" />
            Thinking...
          </div>
        )}
      </ScrollArea>
      {/* Input */}
      <div className="border-t border-[var(--border)] p-3">
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
            placeholder="e.g. Why is lead L1234 flagged?"
            className="min-h-14 text-sm"
          />
          <Button onClick={send} disabled={busy} className="self-end">
            Send
          </Button>
        </div>
      </div>
    </>
  );
}
