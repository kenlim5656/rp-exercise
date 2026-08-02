"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Recommendation {
  title: string;
  type: string;
  channel: string;
  rationale: string;
  talking_points: string[];
  suggested_content: string;
  hubspot_action: {
    action_type: string;
    params: Record<string, unknown>;
  };
  priority: "high" | "medium" | "low";
  estimated_conversion_lift: string;
}

interface FollowupData {
  routing_summary: string;
  key_signals: string[];
  risk_factors: string[];
  recommendations: Recommendation[];
  error?: string;
}

interface LeadEntry {
  lead_id: string;
  routing_decision: string;
  final_tier: string | null;
  deterministic_tier: string | null;
  llm_score: number | null;
  score_divergence: number | null;
  needs_review: boolean;
  email: string;
  company: string;
  title: string;
  followup: FollowupData | null;
  executed: Record<string, { success: boolean; summary: string; object_url: string }>;
}

const ROUTING_LABELS: Record<string, { label: string; color: string }> = {
  sales_queue: { label: "Sales Queue", color: "var(--status-completed)" },
  nurture: { label: "Nurture", color: "var(--status-running)" },
  human_review: { label: "Human Review", color: "var(--status-awaiting)" },
  self_serve_newsletter: { label: "Self-Serve", color: "var(--status-pending)" },
  suppressed: { label: "Suppressed", color: "var(--status-failed)" },
};

const CHANNEL_ICONS: Record<string, string> = {
  email: "✉",
  linkedin: "in",
  phone: "☎",
  hubspot_sequence: "⚡",
  hubspot_deal: "💼",
  hubspot_task: "✓",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "text-[var(--status-completed)] border-[var(--status-completed)]",
  medium: "text-[var(--status-awaiting)] border-[var(--status-awaiting)]",
  low: "text-[var(--status-pending)] border-[var(--status-pending)]",
};

export default function FollowupPage({ params }: { params: Promise<{ runId: string }> }) {
  const [runId, setRunId] = useState<string>("");
  const [leads, setLeads] = useState<LeadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [filterRouting, setFilterRouting] = useState<string>("all");

  useEffect(() => {
    params.then((p) => {
      setRunId(p.runId);
    });
  }, [params]);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    const res = await fetch(`/api/runs/${runId}/followup`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    if (runId) load();
  }, [runId, load]);

  async function executeAction(leadId: string, recIndex: number, rec: Recommendation) {
    const key = `${leadId}_${recIndex}`;
    setExecuting(key);
    try {
      const res = await fetch(`/api/runs/${runId}/followup/${leadId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation_index: recIndex,
          action_type: rec.hubspot_action.action_type,
          params: rec.hubspot_action.params,
        }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setExecuting(null);
    }
  }

  const filtered = filterRouting === "all" ? leads : leads.filter((l) => l.routing_decision === filterRouting);
  const routingCounts = leads.reduce((acc, l) => {
    acc[l.routing_decision] = (acc[l.routing_decision] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const withRecs = leads.filter((l) => l.followup && !l.followup.error).length;

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-8 text-muted-foreground">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-pipeline)] border-t-transparent" />
        Loading follow-up recommendations...
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
        <div className="mb-3 text-3xl">🤖</div>
        <p className="text-muted-foreground">No follow-up data yet — run the follow-up stage to generate LLM recommendations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(ROUTING_LABELS).map(([key, { label, color }]) => {
          const count = routingCounts[key] || 0;
          if (count === 0) return null;
          return (
            <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color }}>{count}</div>
            </div>
          );
        })}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recommendations Ready</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--accent-copilot)]">{withRecs}/{leads.length}</div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterRouting("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterRouting === "all" ? "border-[var(--accent-pipeline)] bg-[var(--accent-pipeline)]/15 text-[var(--accent-pipeline)]" : "border-[var(--border)] text-muted-foreground hover:border-[var(--accent-pipeline)]"}`}
        >
          All ({leads.length})
        </button>
        {Object.entries(ROUTING_LABELS).map(([key, { label, color }]) => {
          const count = routingCounts[key] || 0;
          if (!count) return null;
          return (
            <button
              key={key}
              onClick={() => setFilterRouting(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterRouting === key ? "border-current bg-current/10" : "border-[var(--border)] text-muted-foreground hover:border-current"}`}
              style={{ color: filterRouting === key ? color : undefined }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Lead cards */}
      <div className="space-y-3">
        {filtered.map((lead) => {
          const rd = ROUTING_LABELS[lead.routing_decision] ?? { label: lead.routing_decision, color: "var(--status-pending)" };
          const isExpanded = expandedLead === lead.lead_id;
          const hasRecs = lead.followup && !lead.followup.error && lead.followup.recommendations?.length > 0;
          const executedCount = Object.keys(lead.executed).length;

          return (
            <div
              key={lead.lead_id}
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-all"
            >
              {/* Lead header — always visible */}
              <button
                className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-[var(--table-row-hover)]"
                onClick={() => setExpandedLead(isExpanded ? null : lead.lead_id)}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/runs/${runId}/leads/${lead.lead_id}?from=followup`}
                      className="font-mono text-xs text-muted-foreground hover:text-[var(--accent-pipeline)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {lead.lead_id}
                    </Link>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: rd.color, borderColor: rd.color + "50", background: rd.color + "15" }}
                    >
                      {rd.label}
                    </span>
                    {lead.score_divergence !== null && lead.score_divergence > 25 && (
                      <span className="rounded-full border border-[var(--status-awaiting)]/40 bg-[var(--status-awaiting)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--status-awaiting)]">
                        ⚠ Diverged {lead.score_divergence.toFixed(0)}pts
                      </span>
                    )}
                    {executedCount > 0 && (
                      <span className="rounded-full border border-[var(--status-completed)]/40 bg-[var(--status-completed)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--status-completed)]">
                        ✓ {executedCount} action{executedCount > 1 ? "s" : ""} taken
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-foreground">{lead.title || "(no title)"}</div>
                  <div className="text-xs text-muted-foreground">{lead.email} · {lead.company}</div>
                  {lead.followup?.routing_summary && !isExpanded && (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{lead.followup.routing_summary}</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {lead.llm_score !== null && (
                    <span className="text-sm font-semibold" style={{ color: lead.llm_score >= 70 ? "var(--status-completed)" : lead.llm_score >= 40 ? "var(--status-awaiting)" : "var(--status-failed)" }}>
                      {lead.llm_score}/100
                    </span>
                  )}
                  {hasRecs && (
                    <span className="text-xs text-muted-foreground">{lead.followup!.recommendations.length} rec{lead.followup!.recommendations.length > 1 ? "s" : ""}</span>
                  )}
                  <span className="mt-1 text-lg">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-[var(--border)] p-4 pt-3">
                  {!lead.followup ? (
                    <p className="text-sm text-muted-foreground">Recommendations not generated yet for this lead.</p>
                  ) : lead.followup.error ? (
                    <div className="rounded-md border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 p-3 text-sm text-[var(--status-failed)]">
                      Error generating recommendations: {lead.followup.error}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Summary row */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {lead.followup.key_signals?.length > 0 && (
                          <div>
                            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--status-completed)]">Key signals</div>
                            <ul className="space-y-0.5">
                              {lead.followup.key_signals.map((s, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <span className="mt-0.5 shrink-0 text-[var(--status-completed)]">●</span>{s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {lead.followup.risk_factors?.length > 0 && (
                          <div>
                            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--status-awaiting)]">Risk factors</div>
                            <ul className="space-y-0.5">
                              {lead.followup.risk_factors.map((r, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <span className="mt-0.5 shrink-0 text-[var(--status-awaiting)]">△</span>{r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Routing summary */}
                      <p className="text-sm text-muted-foreground">{lead.followup.routing_summary}</p>

                      {/* Recommendations */}
                      <div className="space-y-3">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-pipeline)]">
                          Recommended Actions ({lead.followup.recommendations.length})
                        </div>
                        {lead.followup.recommendations.map((rec, i) => {
                          const recKey = `${lead.lead_id}_${i}`;
                          const isRecExpanded = expandedRec === recKey;
                          const executedRec = lead.executed[`rec_${i}`];
                          const isBusy = executing === recKey;

                          return (
                            <div
                              key={i}
                              className={`rounded-lg border transition-all ${executedRec ? "border-[var(--status-completed)]/40 bg-[var(--status-completed)]/5" : "border-[var(--border)] bg-[var(--muted)]/30"}`}
                            >
                              <button
                                className="flex w-full items-start justify-between gap-3 p-3 text-left"
                                onClick={() => setExpandedRec(isRecExpanded ? null : recKey)}
                              >
                                <div className="flex min-w-0 flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--border)] text-[10px] font-bold text-muted-foreground">
                                      {CHANNEL_ICONS[rec.channel] || rec.channel[0].toUpperCase()}
                                    </span>
                                    <span className="text-sm font-medium text-foreground">{rec.title}</span>
                                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${PRIORITY_STYLES[rec.priority]}`}>
                                      {rec.priority}
                                    </span>
                                    {executedRec && (
                                      <span className="text-[10px] font-medium text-[var(--status-completed)]">✓ Done</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{rec.rationale}</div>
                                </div>
                                <span className="shrink-0 text-muted-foreground">{isRecExpanded ? "▲" : "▼"}</span>
                              </button>

                              {isRecExpanded && (
                                <div className="space-y-3 border-t border-[var(--border)] px-3 pb-3 pt-3">
                                  {/* Talking points */}
                                  {rec.talking_points?.length > 0 && (
                                    <div>
                                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Talking points</div>
                                      <ul className="space-y-1">
                                        {rec.talking_points.map((tp, j) => (
                                          <li key={j} className="flex items-start gap-1.5 text-xs text-foreground">
                                            <span className="mt-0.5 shrink-0 text-[var(--accent-pipeline)]">→</span>{tp}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Suggested content */}
                                  {rec.suggested_content && (
                                    <div>
                                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Suggested content</div>
                                      <div className="whitespace-pre-wrap rounded-md bg-[var(--muted)] p-3 text-xs text-foreground">
                                        {rec.suggested_content}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs text-muted-foreground">
                                      <span className="font-medium">Est. lift:</span> {rec.estimated_conversion_lift}
                                    </div>

                                    {executedRec ? (
                                      <div className="space-y-1 text-right">
                                        <div className="text-xs font-medium text-[var(--status-completed)]">✓ Executed in HubSpot</div>
                                        <div className="text-[10px] text-muted-foreground">{executedRec.summary}</div>
                                        <a
                                          href={executedRec.object_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[10px] text-[var(--accent-pipeline)] hover:underline"
                                        >
                                          View in HubSpot →
                                        </a>
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        disabled={isBusy}
                                        onClick={() => executeAction(lead.lead_id, i, rec)}
                                        className="gap-1.5 bg-[var(--accent-pipeline)] text-black hover:bg-[var(--accent-pipeline)]/80"
                                      >
                                        {isBusy ? (
                                          <>
                                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                            Executing...
                                          </>
                                        ) : (
                                          <>
                                            <span>⚡</span>
                                            Execute in HubSpot
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
