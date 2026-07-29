"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CrmLead {
  lead_id: string;
  is_eu: boolean;
  consent_verified: string;
  eu_consent_flag: string | null;
  crm: {
    isExistingCustomer: boolean;
    isLead: boolean;
    isChurned: boolean;
    dncFlag: boolean;
    campaignHistory: unknown[];
  };
}

export default function CrmPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/crm`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? null));
  }, [runId]);

  async function proceedToScore() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/score`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/runs/${runId}/scoring`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Salesforce & HubSpot lookup (5.0)</CardTitle>
          <CardDescription>
            {leads.length} leads checked &middot; {euAmbiguous} EU leads with ambiguous consent (hard rule 5.3)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={proceedToScore} disabled={busy}>
            {busy ? "Scoring..." : "Proceed to Scoring (6.0)"}
          </Button>
          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>EU</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Customer / Lead / Churned</TableHead>
                <TableHead>DNC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.slice(0, 100).map((l) => (
                <TableRow key={l.lead_id}>
                  <TableCell>{l.lead_id}</TableCell>
                  <TableCell>{l.is_eu ? "EU" : "-"}</TableCell>
                  <TableCell>
                    {l.eu_consent_flag ? (
                      <Badge variant="destructive">{l.eu_consent_flag}</Badge>
                    ) : (
                      <Badge variant="outline">{l.consent_verified}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.crm.isExistingCustomer ? "Customer" : l.crm.isChurned ? "Churned" : l.crm.isLead ? "Lead" : "Unknown"}
                  </TableCell>
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
