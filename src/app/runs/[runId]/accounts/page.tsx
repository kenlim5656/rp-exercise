"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AccountLead {
  lead_id: string;
  email: string;
  company: string;
  title: string;
  role: string | null;
  pql_score: number | null;
  routing_decision: string | null;
  deterministic_tier: string | null;
  llm_score: number | null;
}

interface AccountEntry {
  id: string;
  domain: string;
  name: string | null;
  employee_count: number | null;
  industry: string | null;
  plan_tier: string;
  aql_score: number | null;
  fit_score: number | null;
  usage_score: number | null;
  aql_status: string;
  routing_decision: string | null;
  lead_count: number;
  leads: AccountLead[];
}

const AQL_STATUS_STYLES: Record<string, { label: string; color: string }> = {
  aql_account: { label: "AQL Qualified", color: "var(--status-completed)" },
  pql_user: { label: "PQL Active", color: "var(--status-running)" },
  customer: { label: "Customer", color: "var(--accent-copilot)" },
  unqualified: { label: "Unqualified", color: "var(--status-pending)" },
};

const ROUTING_STYLES: Record<string, { label: string; color: string }> = {
  enterprise_sales: { label: "Enterprise Sales", color: "var(--status-completed)" },
  self_serve_expansion: { label: "Self-Serve Expansion", color: "var(--status-running)" },
  existing_customer: { label: "Existing Customer", color: "var(--accent-copilot)" },
  unqualified: { label: "Unqualified", color: "var(--status-pending)" },
};

export default function AccountsPage({ params }: { params: Promise<{ runId: string }> }) {
  const [runId, setRunId] = useState("");
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"aql_score" | "lead_count" | "domain">("aql_score");

  useEffect(() => { params.then((p) => setRunId(p.runId)); }, [params]);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    const res = await fetch(`/api/runs/${runId}/accounts`);
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => { if (runId) load(); }, [runId, load]);

  const filtered = filterStatus === "all"
    ? accounts
    : accounts.filter((a) => a.aql_status === filterStatus);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "aql_score") return (b.aql_score ?? 0) - (a.aql_score ?? 0);
    if (sortBy === "lead_count") return b.lead_count - a.lead_count;
    return a.domain.localeCompare(b.domain);
  });

  const statusCounts = accounts.reduce((acc, a) => {
    acc[a.aql_status] = (acc[a.aql_status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-8 text-muted-foreground">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-pipeline)] border-t-transparent" />
        Loading accounts...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Account View (AQL)</h2>
        <div className="flex gap-2 text-xs">
          <span className="text-muted-foreground">{accounts.length} accounts</span>
          <span className="text-muted-foreground">|</span>
          <button onClick={() => setSortBy("aql_score")} className={`${sortBy === "aql_score" ? "text-[var(--accent-pipeline)]" : "text-muted-foreground"}`}>
            Sort: Score
          </button>
          <button onClick={() => setSortBy("lead_count")} className={`${sortBy === "lead_count" ? "text-[var(--accent-pipeline)]" : "text-muted-foreground"}`}>
            Members
          </button>
          <button onClick={() => setSortBy("domain")} className={`${sortBy === "domain" ? "text-[var(--accent-pipeline)]" : "text-muted-foreground"}`}>
            Domain
          </button>
        </div>
      </div>

      {/* Stats tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(AQL_STATUS_STYLES).map(([key, { label, color }]) => {
          const count = statusCounts[key] || 0;
          return (
            <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStatus("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterStatus === "all" ? "border-[var(--accent-pipeline)] bg-[var(--accent-pipeline)]/15 text-[var(--accent-pipeline)]" : "border-[var(--border)] text-muted-foreground hover:border-[var(--accent-pipeline)]"}`}
        >
          All ({accounts.length})
        </button>
        {Object.entries(AQL_STATUS_STYLES).map(([key, { label, color }]) => {
          const count = statusCounts[key] || 0;
          if (!count) return null;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterStatus === key ? "border-current bg-current/10" : "border-[var(--border)] text-muted-foreground hover:border-current"}`}
              style={{ color: filterStatus === key ? color : undefined }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Account cards */}
      <div className="space-y-3">
        {sorted.map((account) => {
          const isExpanded = expandedAccount === account.id;
          const status = AQL_STATUS_STYLES[account.aql_status] ?? { label: account.aql_status, color: "var(--status-pending)" };
          const routing = ROUTING_STYLES[account.routing_decision ?? "unqualified"] ?? { label: account.routing_decision ?? "-", color: "var(--status-pending)" };

          return (
            <div key={account.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-all">
              <button
                className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-[var(--table-row-hover)]"
                onClick={() => setExpandedAccount(isExpanded ? null : account.id)}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{account.name || account.domain}</span>
                    <span className="font-mono text-xs text-muted-foreground">{account.domain}</span>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: status.color, borderColor: status.color + "50", background: status.color + "15" }}
                    >
                      {status.label}
                    </span>
                    {account.lead_count >= 3 && (
                      <span className="rounded-full border border-[var(--status-running)]/40 bg-[var(--status-running)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--status-running)]">
                        {account.lead_count} members
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {account.industry && <span>{account.industry}</span>}
                    {account.employee_count && <span>{account.employee_count} employees</span>}
                    <span style={{ color: routing.color }}>{routing.label}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {account.aql_score !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">AQL</span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: account.aql_score >= 80 ? "var(--status-completed)" : account.aql_score >= 50 ? "var(--status-awaiting)" : "var(--status-pending)" }}
                      >
                        {account.aql_score}/100
                      </span>
                    </div>
                  )}
                  <span className="text-lg text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--border)] p-4">
                  <div className="mb-3 grid grid-cols-3 gap-3">
                    <div className="rounded-md border border-[var(--border)] p-2 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">Fit Score</div>
                      <div className="text-lg font-semibold text-[var(--accent-pipeline)]">{account.fit_score ?? "-"}</div>
                    </div>
                    <div className="rounded-md border border-[var(--border)] p-2 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">Usage Score</div>
                      <div className="text-lg font-semibold text-[var(--status-running)]">{account.usage_score ?? "-"}</div>
                    </div>
                    <div className="rounded-md border border-[var(--border)] p-2 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">AQL Score</div>
                      <div className="text-lg font-semibold text-[var(--status-completed)]">{account.aql_score ?? "-"}</div>
                    </div>
                  </div>

                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Team Members ({account.lead_count})
                  </div>
                  <div className="overflow-auto rounded border border-[var(--border)]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left text-muted-foreground">
                          <th className="px-3 py-1.5">Lead</th>
                          <th className="px-3 py-1.5">Role</th>
                          <th className="px-3 py-1.5">Title</th>
                          <th className="px-3 py-1.5">PQL</th>
                          <th className="px-3 py-1.5">Routing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.leads.map((lead) => (
                          <tr key={lead.lead_id} className="border-b border-[var(--border)] last:border-0">
                            <td className="px-3 py-1.5">
                              <Link
                                href={`/runs/${runId}/leads/${lead.lead_id}?from=accounts`}
                                className="font-mono text-[var(--accent-pipeline)] hover:underline"
                              >
                                {lead.lead_id}
                              </Link>
                            </td>
                            <td className="px-3 py-1.5">{lead.role ?? "-"}</td>
                            <td className="px-3 py-1.5">{lead.title}</td>
                            <td className="px-3 py-1.5">
                              {lead.pql_score !== null && (
                                <span style={{ color: lead.pql_score >= 50 ? "var(--status-completed)" : "var(--status-pending)" }}>
                                  {lead.pql_score}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 capitalize">{lead.routing_decision?.replace(/_/g, " ") ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-right">
                    <Link
                      href={`/runs/${runId}/accounts/${account.id}`}
                      className="text-xs text-[var(--accent-pipeline)] hover:underline"
                    >
                      View full account details →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
