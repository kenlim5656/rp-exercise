"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";

interface ScorecardData {
  primaryLeads: number;
  flagged: number;
  tier1: number;
  tier2: number;
  tier3: number;
  humanReview: number;
  salesQueue: number;
  nurture: number;
  selfServe: number;
  enterpriseSales: number;
  totalAccounts: number;
  aqlQualified: number;
  pqlActive: number;
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0 && !["Primary Leads", "Flagged"].includes(label)) return null;
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 min-w-[100px]">
      <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

export function LiveScorecard({ runId, initialData }: { runId: string; initialData: ScorecardData }) {
  const [data, setData] = useState(initialData);
  const pathname = usePathname();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const json = await res.json();
      const s = json.summary;
      setData({
        primaryLeads: s.primary_leads ?? 0,
        flagged: s.needs_review ?? 0,
        tier1: s.tiers?.tier1 ?? 0,
        tier2: s.tiers?.tier2 ?? 0,
        tier3: s.tiers?.tier3 ?? 0,
        humanReview: s.routing?.human_review ?? 0,
        salesQueue: s.routing?.sales_queue ?? 0,
        nurture: s.routing?.nurture ?? 0,
        selfServe: s.routing?.self_serve_newsletter ?? 0,
        enterpriseSales: s.routing?.enterprise_sales ?? 0,
        totalAccounts: s.accounts?.total ?? 0,
        aqlQualified: s.accounts?.aql_qualified ?? 0,
        pqlActive: s.accounts?.pql_active ?? 0,
      });
    } catch {}
  }, [runId]);

  useEffect(() => { fetchData(); }, [fetchData, pathname]);
  useEffect(() => {
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 mt-4">
      <div className="flex flex-wrap gap-3">
        <Tile label="Primary Leads" value={data.primaryLeads} color="var(--accent-pipeline)" />
        <Tile label="Flagged" value={data.flagged} color="var(--status-awaiting)" />
        <Tile label="Tier 1" value={data.tier1} color="var(--status-completed)" />
        <Tile label="Tier 2" value={data.tier2} color="var(--accent-pipeline)" />
        <Tile label="Tier 3" value={data.tier3} color="var(--status-pending)" />
        <Tile label="Human Review" value={data.humanReview} color="var(--status-failed)" />
        <Tile label="Sales Queue" value={data.salesQueue} color="var(--status-completed)" />
        <Tile label="Enterprise Sales" value={data.enterpriseSales} color="var(--status-completed)" />
        <Tile label="Nurture / CSM" value={data.nurture} color="var(--accent-copilot)" />
        <Tile label="Return to Mktg" value={data.selfServe} color="var(--status-pending)" />
        <Tile label="Accounts" value={data.totalAccounts} color="var(--status-running)" />
        <Tile label="AQL Qualified" value={data.aqlQualified} color="var(--status-completed)" />
        <Tile label="PQL Active" value={data.pqlActive} color="var(--accent-pipeline)" />
      </div>
    </div>
  );
}
