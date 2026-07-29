import type { LeadRow } from "@/lib/runs";

interface TileProps {
  label: string;
  value: number;
  color: string;
}

function Tile({ label, value, color }: TileProps) {
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

export function RunScorecard({ leads }: { leads: LeadRow[] }) {
  const primary = leads.filter((l) => l.is_duplicate_primary === 1);
  const flagged = primary.filter((l) => l.needs_review);
  const tier1 = primary.filter((l) => l.final_tier === "tier1" || l.deterministic_tier === "tier1");
  const tier2 = primary.filter((l) => l.final_tier === "tier2" || l.deterministic_tier === "tier2");
  const tier3 = primary.filter((l) => l.final_tier === "tier3" || l.deterministic_tier === "tier3");
  const humanReview = primary.filter((l) => l.routing_decision === "human_review");
  const salesQueue = primary.filter((l) => l.routing_decision === "sales_queue");
  const csm = primary.filter((l) => l.routing_decision === "nurture");
  const marketing = primary.filter((l) => l.routing_decision === "self_serve_newsletter");

  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 mt-4">
      <div className="flex flex-wrap gap-3">
        <Tile label="Primary Leads" value={primary.length} color="var(--accent-pipeline)" />
        <Tile label="Flagged" value={flagged.length} color="var(--status-awaiting)" />
        <Tile label="Tier 1" value={tier1.length} color="var(--status-completed)" />
        <Tile label="Tier 2" value={tier2.length} color="var(--accent-pipeline)" />
        <Tile label="Tier 3" value={tier3.length} color="var(--status-pending)" />
        <Tile label="Human Review" value={humanReview.length} color="var(--status-failed)" />
        <Tile label="Sales Queue" value={salesQueue.length} color="var(--status-completed)" />
        <Tile label="Nurture / CSM" value={csm.length} color="var(--accent-copilot)" />
        <Tile label="Return to Mktg" value={marketing.length} color="var(--status-pending)" />
      </div>
    </div>
  );
}
