import type { CsvRecord } from "../csv";
import { hashUnit, hashId, hashPick } from "./seed";

/** Simulated Salesforce lookup (spec 5.0), shaped like a SOQL query result. */

export interface CampaignHistoryEntry {
  campaign: string;
  date: string;
  response: "opened" | "clicked" | "responded" | "no_response";
}

export interface SalesforceRecord {
  attributes: { type: "Lead" | "Contact" | "Opportunity"; url: string };
  Id: string;
  Email: string;
  Status: "New" | "Working" | "Qualified" | "Converted" | "Closed Lost" | "Unknown";
  CampaignHistory: CampaignHistoryEntry[];
  HasOptedOutOfEmail: boolean;
  HasOpenOpportunity: boolean;
}

export interface SalesforceQueryResponse {
  totalSize: number;
  done: boolean;
  records: SalesforceRecord[];
}

const STATUS_POOL = ["New", "Working", "Qualified", "Converted", "Closed Lost"] as const;
const CAMPAIGN_POOL = ["gpu-cloud-nonbrand", "serverless-launch", "docs-cta", "pricing-post", "launch-week"] as const;
const RESPONSE_POOL = ["opened", "clicked", "responded", "no_response"] as const;

/** ~20% of leads (seeded by email) are known Salesforce records. */
export function salesforceLookup(sanitizedLeads: CsvRecord[]): SalesforceQueryResponse {
  const records: SalesforceRecord[] = [];
  for (const lead of sanitizedLeads) {
    const email = lead.email_normalized;
    if (!email) continue;
    if (hashUnit(`sf_exists:${email}`) >= 0.2) continue;

    const status = hashPick(`sf_status:${email}`, STATUS_POOL);
    const campaignCount = 1 + Math.floor(hashUnit(`sf_campaign_count:${email}`) * 3);
    const campaignHistory: CampaignHistoryEntry[] = Array.from({ length: campaignCount }, (_, i) => ({
      campaign: hashPick(`sf_campaign:${email}:${i}`, CAMPAIGN_POOL),
      date: lead.created_date || "",
      response: hashPick(`sf_response:${email}:${i}`, RESPONSE_POOL),
    }));

    records.push({
      attributes: { type: status === "Converted" ? "Contact" : "Lead", url: `/services/data/v60.0/sobjects/Lead/${hashId("00Q", email)}` },
      Id: hashId("00Q", email),
      Email: email,
      Status: status,
      CampaignHistory: campaignHistory,
      HasOptedOutOfEmail: hashUnit(`sf_optout:${email}`) < 0.15,
      HasOpenOpportunity: status === "Qualified" && hashUnit(`sf_openopp:${email}`) < 0.5,
    });
  }
  return { totalSize: records.length, done: true, records };
}
