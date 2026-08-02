"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function SortHead({
  k,
  sortKey,
  sortDir,
  onSort,
  children,
}: {
  k: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <TableHead className="cursor-pointer select-none" onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </TableHead>
  );
}

interface CrmLead {
  lead_id: string;
  email: string;
  company: string;
  title: string;
  is_eu: boolean;
  consent_verified: string;
  eu_consent_flag: string | null;
  crm: {
    isExistingCustomer: boolean;
    isActiveOpportunity: boolean;
    isLead: boolean;
    isChurned: boolean;
    dncFlag: boolean;
    leadScore: number | null;
    ownerAssigned: boolean;
    campaignHistory: unknown[];
  };
}

export default function CrmPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [sortKey, setSortKey] = useState<string>("lead_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch(`/api/runs/${runId}/crm`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? null));
  }, [runId]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (!leads) return <p className="text-muted-foreground">Loading CRM status...</p>;
  if (leads.length === 0) {
    return (
      <Alert>
        <AlertTitle>Not looked up yet</AlertTitle>
        <AlertDescription>Proceed to CRM/MAP lookup from the enrichment page first.</AlertDescription>
      </Alert>
    );
  }

  const euAmbiguous = leads.filter((l) => l.eu_consent_flag).length;

  const filtered =
    filter === "eu" ? leads.filter((l) => l.is_eu) : filter === "dnc" ? leads.filter((l) => l.crm.dncFlag) : leads;

  const sorted = [...filtered].sort((a, b) => {
    const av = (a as unknown as Record<string, string>)[sortKey] ?? "";
    const bv = (b as unknown as Record<string, string>)[sortKey] ?? "";
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>HubSpot CRM / MAP lookup (5.0)</CardTitle>
          <CardDescription>
            {leads.length} leads checked &middot; {euAmbiguous} EU leads with ambiguous consent (hard rule 5.3)
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {["all", "eu", "dnc"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-[var(--accent)] text-foreground"
                    : "bg-[var(--card)] text-muted-foreground hover:text-foreground border border-[var(--border)]"
                }`}
              >
                {f === "all" ? "All" : f === "eu" ? "EU only" : "DNC only"}
              </button>
            ))}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="lead_id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Lead ID</SortHead>
                <SortHead k="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Email</SortHead>
                <SortHead k="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Company</SortHead>
                <SortHead k="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Title</SortHead>
                <SortHead k="is_eu" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>EU</SortHead>
                <TableHead>Consent</TableHead>
                <TableHead>CRM Status</TableHead>
                <TableHead>HS Score</TableHead>
                <TableHead>DNC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>
                    <Link href={`/runs/${runId}/leads/${l.lead_id}?from=crm`} className="text-[var(--accent-pipeline)] underline-offset-2 hover:underline">
                      {l.lead_id}
                    </Link>
                  </TableCell>
                  <TableCell>{l.email}</TableCell>
                  <TableCell>{l.company}</TableCell>
                  <TableCell>{l.title}</TableCell>
                  <TableCell>{l.is_eu ? "EU" : "-"}</TableCell>
                  <TableCell>
                    {l.eu_consent_flag ? (
                      <Badge variant="destructive">{l.eu_consent_flag}</Badge>
                    ) : (
                      <Badge variant="outline">{l.consent_verified}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.crm.isExistingCustomer ? "Customer" : l.crm.isActiveOpportunity ? "Open Opp" : l.crm.isChurned ? "Churned" : l.crm.isLead ? "Lead" : "Net-new"}
                  </TableCell>
                  <TableCell>{l.crm.leadScore !== null ? l.crm.leadScore : "-"}</TableCell>
                  <TableCell>{l.crm.dncFlag ? <Badge variant="destructive">DNC</Badge> : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
