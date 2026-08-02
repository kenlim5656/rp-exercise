"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface EventEntry {
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

interface AccountDetail {
  id: string;
  domain: string;
  name: string | null;
  employee_count: number | null;
  industry: string | null;
  funding_stage: string | null;
  plan_tier: string;
  aql_score: number | null;
  fit_score: number | null;
  usage_score: number | null;
  aql_status: string;
  routing_decision: string | null;
  posthog: {
    active_member_count: number;
    total_compute_hours: number;
    total_bandwidth_gb: number;
    quota_used_pct: number;
    environments: string[];
    has_prod_deployment: boolean;
    sso_initiated: boolean;
    plan: string;
    events: EventEntry[];
    weekly_growth: {
      compute_hours_delta_pct: number;
      seats_delta: number;
      deployments_delta: number;
    };
  } | null;
}

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
  event_summary: { signals: string[]; event_count: number } | null;
}

export default function AccountDetailPage({ params }: { params: Promise<{ runId: string; accountId: string }> }) {
  const [runId, setRunId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [leads, setLeads] = useState<AccountLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => {
      setRunId(p.runId);
      setAccountId(p.accountId);
    });
  }, [params]);

  const load = useCallback(async () => {
    if (!runId || !accountId) return;
    setLoading(true);
    const res = await fetch(`/api/runs/${runId}/accounts/${accountId}`);
    if (res.ok) {
      const data = await res.json();
      setAccount(data.account);
      setLeads(data.leads);
    }
    setLoading(false);
  }, [runId, accountId]);

  useEffect(() => { if (runId && accountId) load(); }, [runId, accountId, load]);

  if (loading || !account) {
    return (
      <div className="flex items-center gap-3 p-8 text-muted-foreground">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-pipeline)] border-t-transparent" />
        Loading account...
      </div>
    );
  }

  const ph = account.posthog;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href={`/runs/${runId}/accounts`} className="text-xs text-muted-foreground hover:text-[var(--accent-pipeline)]">
        ← Back to accounts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{account.name || account.domain}</h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono">{account.domain}</span>
            {account.industry && <span>| {account.industry}</span>}
            {account.employee_count && <span>| {account.employee_count} employees</span>}
            {account.funding_stage && <span>| {account.funding_stage}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[var(--accent-pipeline)]">{account.aql_score ?? "-"}/100</div>
          <div className="text-xs text-muted-foreground">AQL Score</div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Fit Score</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--accent-pipeline)]">{account.fit_score ?? "-"}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Usage Score</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--status-running)]">{account.usage_score ?? "-"}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</div>
          <div className="mt-1 text-sm font-semibold capitalize text-[var(--status-completed)]">{account.aql_status.replace(/_/g, " ")}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Routing</div>
          <div className="mt-1 text-sm font-semibold capitalize text-[var(--status-awaiting)]">{account.routing_decision?.replace(/_/g, " ") ?? "-"}</div>
        </div>
      </div>

      {/* PostHog telemetry */}
      {ph && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-semibold">Product Usage (PostHog)</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Active Members</div>
              <div className="text-lg font-semibold">{ph.active_member_count}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Compute Hours</div>
              <div className="text-lg font-semibold">{ph.total_compute_hours.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Quota Used</div>
              <div className={`text-lg font-semibold ${ph.quota_used_pct >= 80 ? "text-[var(--status-failed)]" : ""}`}>{ph.quota_used_pct}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Bandwidth</div>
              <div className="text-lg font-semibold">{ph.total_bandwidth_gb} GB</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${ph.has_prod_deployment ? "bg-[var(--status-completed)]" : "bg-[var(--status-pending)]"}`} />
              Prod deployment: {ph.has_prod_deployment ? "Yes" : "No"}
            </div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${ph.sso_initiated ? "bg-[var(--status-completed)]" : "bg-[var(--status-pending)]"}`} />
              SSO: {ph.sso_initiated ? "Initiated" : "No"}
            </div>
            <div className="flex items-center gap-2">
              Envs: {ph.environments.join(", ")}
            </div>
          </div>

          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="text-[10px] uppercase text-muted-foreground mb-2">Weekly Growth</div>
            <div className="flex gap-6 text-xs">
              <span className={ph.weekly_growth.compute_hours_delta_pct > 0 ? "text-[var(--status-completed)]" : "text-[var(--status-failed)]"}>
                Compute: {ph.weekly_growth.compute_hours_delta_pct > 0 ? "+" : ""}{ph.weekly_growth.compute_hours_delta_pct}%
              </span>
              <span className={ph.weekly_growth.seats_delta > 0 ? "text-[var(--status-completed)]" : "text-muted-foreground"}>
                Seats: {ph.weekly_growth.seats_delta > 0 ? "+" : ""}{ph.weekly_growth.seats_delta}
              </span>
              <span className={ph.weekly_growth.deployments_delta > 0 ? "text-[var(--status-completed)]" : "text-muted-foreground"}>
                Deployments: {ph.weekly_growth.deployments_delta > 0 ? "+" : ""}{ph.weekly_growth.deployments_delta}
              </span>
            </div>
          </div>

          {/* Event timeline */}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="text-[10px] uppercase text-muted-foreground mb-2">Event Timeline (last {ph.events.length} events)</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {ph.events.slice(0, 20).map((evt, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="shrink-0 text-muted-foreground">{new Date(evt.timestamp).toLocaleDateString()}</span>
                  <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px]">{evt.event}</span>
                  {evt.properties.environment ? (
                    <span className="text-muted-foreground">{String(evt.properties.environment)}</span>
                  ) : null}
                  {evt.properties.gpu_type ? (
                    <span className="text-[var(--accent-pipeline)]">{String(evt.properties.gpu_type)}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Team members */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 text-sm font-semibold">Team Members ({leads.length})</h3>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-muted-foreground">
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">PQL</th>
                <th className="px-3 py-2">MQL Tier</th>
                <th className="px-3 py-2">Routing</th>
                <th className="px-3 py-2">Signals</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.lead_id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--table-row-hover)]">
                  <td className="px-3 py-2">
                    <Link href={`/runs/${runId}/leads/${lead.lead_id}?from=accounts/${accountId}`} className="font-mono text-[var(--accent-pipeline)] hover:underline">
                      {lead.lead_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{lead.email}</td>
                  <td className="px-3 py-2">{lead.role ?? "-"}</td>
                  <td className="px-3 py-2">{lead.title}</td>
                  <td className="px-3 py-2">
                    <span style={{ color: (lead.pql_score ?? 0) >= 50 ? "var(--status-completed)" : "var(--status-pending)" }}>
                      {lead.pql_score ?? "-"}
                    </span>
                  </td>
                  <td className="px-3 py-2 capitalize">{lead.deterministic_tier?.replace("tier", "T") ?? "-"}</td>
                  <td className="px-3 py-2 capitalize">{lead.routing_decision?.replace(/_/g, " ") ?? "-"}</td>
                  <td className="px-3 py-2">
                    {lead.event_summary?.signals?.slice(0, 2).map((s, i) => (
                      <span key={i} className="mr-1 rounded border border-[var(--border)] px-1 py-0.5 text-[10px]">{s}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
