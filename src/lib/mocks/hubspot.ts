import type { CsvRecord } from "../csv";
import { hashUnit, hashId, hashPick } from "./seed";

/** Simulated HubSpot lookup (spec 5.0), shaped like a CRM v3 contacts response. */

export interface HubSpotContact {
  id: string;
  properties: {
    email: string;
    lifecyclestage: "subscriber" | "lead" | "marketingqualifiedlead" | "salesqualifiedlead" | "opportunity" | "customer" | "other";
    hs_lead_status: "NEW" | "OPEN" | "IN_PROGRESS" | "OPEN_DEAL" | "UNQUALIFIED";
    hs_email_optout: boolean;
  };
  associations: { companies: Array<{ id: string }> };
}

export interface HubSpotSearchResponse {
  results: HubSpotContact[];
  total: number;
}

const LIFECYCLE_POOL = ["subscriber", "lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer", "other"] as const;
const LEAD_STATUS_POOL = ["NEW", "OPEN", "IN_PROGRESS", "OPEN_DEAL", "UNQUALIFIED"] as const;

/** ~25% of leads (seeded by email) are known HubSpot contacts. */
export function hubspotLookup(sanitizedLeads: CsvRecord[]): HubSpotSearchResponse {
  const results: HubSpotContact[] = [];
  for (const lead of sanitizedLeads) {
    const email = lead.email_normalized;
    if (!email) continue;
    if (hashUnit(`hs_exists:${email}`) >= 0.25) continue;

    results.push({
      id: hashId("HS", email),
      properties: {
        email,
        lifecyclestage: hashPick(`hs_stage:${email}`, LIFECYCLE_POOL),
        hs_lead_status: hashPick(`hs_status:${email}`, LEAD_STATUS_POOL),
        hs_email_optout: hashUnit(`hs_optout:${email}`) < 0.15,
      },
      associations: { companies: [{ id: hashId("HSCO", (lead.company || "").toLowerCase()) }] },
    });
  }
  return { results, total: results.length };
}
