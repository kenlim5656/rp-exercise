"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Settings {
  score_divergence_threshold: string;
  slack_webhook_url: string;
  notification_emails: string;
  notify_new_lead_review: string;
  notify_lead_assigned: string;
  notify_daily_summary: string;
}

const DEFAULTS: Settings = {
  score_divergence_threshold: "30",
  slack_webhook_url: "",
  notification_emails: "",
  notify_new_lead_review: "true",
  notify_lead_assigned: "true",
  notify_daily_summary: "true",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings({ ...DEFAULTS, ...d.settings }));
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function update(key: keyof Settings, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function toggleNotif(key: keyof Settings) {
    setSettings((s) => ({ ...s, [key]: s[key] === "true" ? "false" : "true" }));
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="flex flex-col gap-6">
        {/* Scoring */}
        <Card className="card-accent-pipeline">
          <CardHeader>
            <CardTitle className="text-base">Scoring</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">
                Score divergence threshold (0–100)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={settings.score_divergence_threshold}
                onChange={(e) => update("score_divergence_threshold", e.target.value)}
                className="w-32 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--accent-pipeline)]"
              />
              <span className="text-xs text-muted-foreground">
                Leads with a deterministic vs. probabilistic score gap exceeding this value are flagged for human review.
              </span>
            </label>
          </CardContent>
        </Card>

        {/* Slack */}
        <Card className="card-accent-copilot">
          <CardHeader>
            <CardTitle className="text-base">Slack notifications (webhook)</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">Incoming webhook URL</span>
              <input
                type="text"
                value={settings.slack_webhook_url}
                onChange={(e) => update("slack_webhook_url", e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--accent-copilot)]"
              />
              <span className="text-xs text-muted-foreground">
                Notifications are sent as Slack messages via this webhook when enabled below.
              </span>
            </label>
          </CardContent>
        </Card>

        {/* Email */}
        <Card className="card-accent-history">
          <CardHeader>
            <CardTitle className="text-base">Email notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">
                Recipient emails (comma-separated)
              </span>
              <input
                type="text"
                value={settings.notification_emails}
                onChange={(e) => update("notification_emails", e.target.value)}
                placeholder="ops@company.com, lead-team@company.com"
                className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--accent-history)]"
              />
            </label>
          </CardContent>
        </Card>

        {/* Notification types */}
        <Card className="card-accent-metrics">
          <CardHeader>
            <CardTitle className="text-base">Notification types</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {([
              ["notify_new_lead_review", "New lead flagged for review"],
              ["notify_lead_assigned", "Lead assigned to queue"],
              ["notify_daily_summary", "Daily summary of records processed"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => toggleNotif(key)}
                  className={`h-5 w-5 rounded border transition-colors flex items-center justify-center ${
                    settings[key] === "true"
                      ? "bg-[var(--status-completed)] border-[var(--status-completed)]"
                      : "border-[var(--border)] bg-transparent"
                  }`}
                >
                  {settings[key] === "true" && (
                    <svg className="h-3 w-3 text-black" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2.5 6l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save settings"}
          </Button>
          {saved && (
            <Alert className="badge-completed inline-flex w-auto border-0 px-3 py-1">
              <AlertDescription className="text-xs">Saved</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
