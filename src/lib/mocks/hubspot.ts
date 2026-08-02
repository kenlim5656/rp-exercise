import type { CsvRecord } from "../csv";
import { hashUnit, hashId, hashPick } from "./seed";

/** Simulated HubSpot CRM + Marketing Automation (v2: HubSpot-only, no Salesforce).
 *  Shaped like HubSpot CRM v3 API responses. */

export interface CampaignInteraction {
  campaign_id: string;
  campaign_name: string;
  channel: "email" | "ads" | "social" | "event" | "content";
  date: string;
  engagement: "opened" | "clicked" | "replied" | "registered" | "attended" | "no_response" | "unsubscribed";
  score_delta: number;
}

export interface HubSpotContact {
  id: string;
  properties: {
    email: string;
    firstname: string;
    lastname: string;
    company: string;
    jobtitle: string;
    lifecyclestage:
      | "subscriber"
      | "lead"
      | "marketingqualifiedlead"
      | "salesqualifiedlead"
      | "opportunity"
      | "customer"
      | "evangelist"
      | "other";
    hs_lead_status: "NEW" | "OPEN" | "IN_PROGRESS" | "OPEN_DEAL" | "UNQUALIFIED" | "CONNECTED" | "BAD_TIMING";
    hs_email_optout: boolean;
    hs_email_last_open_date: string | null;
    hs_email_last_click_date: string | null;
    hs_analytics_num_page_views: number;
    lead_score: number;
    hubspot_owner_id: string | null;
  };
  associations: {
    companies: Array<{ id: string; name: string; domain: string }>;
    deals: Array<{ id: string; dealname: string; amount: number | null; dealstage: string }>;
  };
  campaign_history: CampaignInteraction[];
  notes: string[];
}

export interface HubSpotSearchResponse {
  results: HubSpotContact[];
  total: number;
  paging?: { next?: { after: string } };
}

const LIFECYCLE_POOL = [
  "subscriber",
  "lead",
  "marketingqualifiedlead",
  "salesqualifiedlead",
  "opportunity",
  "customer",
  "other",
] as const;

const LEAD_STATUS_POOL = ["NEW", "OPEN", "IN_PROGRESS", "OPEN_DEAL", "UNQUALIFIED", "CONNECTED", "BAD_TIMING"] as const;

const CAMPAIGN_POOL = [
  { id: "camp_gpu_nonbrand", name: "GPU Cloud – Non-Brand Search", channel: "ads" as const },
  { id: "camp_serverless_launch", name: "Serverless GPU Launch", channel: "email" as const },
  { id: "camp_mlops_guide", name: "MLOps Best Practices Guide", channel: "content" as const },
  { id: "camp_pricing_webinar", name: "Transparent Pricing Webinar", channel: "event" as const },
  { id: "camp_launch_week", name: "Launch Week – AI Infrastructure", channel: "email" as const },
  { id: "camp_competitor_migrate", name: "Competitor Migration Offer", channel: "email" as const },
  { id: "camp_linkedin_ai", name: "LinkedIn AI/ML Audience", channel: "social" as const },
  { id: "camp_docs_cta", name: "Docs → Free Trial CTA", channel: "content" as const },
] as const;

const ENGAGEMENT_POOL = [
  "opened",
  "clicked",
  "replied",
  "registered",
  "attended",
  "no_response",
  "unsubscribed",
] as const;

const OWNER_POOL = ["owner_ae1", "owner_ae2", "owner_sdr1", "owner_sdr2", null] as const;

const DEAL_STAGE_POOL = [
  "appointmentscheduled",
  "qualifiedtobuy",
  "presentationscheduled",
  "decisionmakerboughtin",
  "contractsent",
  "closedwon",
  "closedlost",
] as const;

/** ~30% of leads (seeded by email) are known HubSpot contacts. */
export function hubspotLookup(sanitizedLeads: CsvRecord[]): HubSpotSearchResponse {
  const results: HubSpotContact[] = [];

  for (const lead of sanitizedLeads) {
    const email = lead.email_normalized;
    if (!email) continue;
    if (hashUnit(`hs_exists:${email}`) >= 0.30) continue;

    const lifecycle = hashPick(`hs_stage:${email}`, LIFECYCLE_POOL);
    const leadStatus = hashPick(`hs_status:${email}`, LEAD_STATUS_POOL);
    const optOut = hashUnit(`hs_optout:${email}`) < 0.12;
    const campaignCount = 1 + Math.floor(hashUnit(`hs_campaign_count:${email}`) * 5);
    const hasDeal = lifecycle === "opportunity" || lifecycle === "customer" || hashUnit(`hs_has_deal:${email}`) < 0.2;
    const leadScore = Math.round(hashUnit(`hs_score:${email}`) * 100);

    const lastOpen = !optOut && hashUnit(`hs_has_open:${email}`) > 0.3
      ? new Date(Date.now() - Math.floor(hashUnit(`hs_open_age:${email}`) * 90 * 86400000)).toISOString()
      : null;
    const lastClick = lastOpen && hashUnit(`hs_has_click:${email}`) > 0.5 ? lastOpen : null;

    const campaigns: CampaignInteraction[] = Array.from({ length: campaignCount }, (_, i) => {
      const camp = hashPick(`hs_camp:${email}:${i}`, CAMPAIGN_POOL);
      const eng = optOut ? "unsubscribed" : hashPick(`hs_eng:${email}:${i}`, ENGAGEMENT_POOL);
      const scoreDelta = eng === "clicked" || eng === "replied" || eng === "attended"
        ? Math.floor(hashUnit(`hs_sd:${email}:${i}`) * 15) + 5
        : eng === "opened" || eng === "registered"
        ? Math.floor(hashUnit(`hs_sd:${email}:${i}`) * 5) + 1
        : -2;
      return {
        campaign_id: camp.id,
        campaign_name: camp.name,
        channel: camp.channel,
        date: new Date(Date.now() - Math.floor(hashUnit(`hs_cdate:${email}:${i}`) * 180 * 86400000)).toISOString().slice(0, 10),
        engagement: eng,
        score_delta: scoreDelta,
      };
    });

    const deals = hasDeal
      ? [
          {
            id: hashId("DEAL", email),
            dealname: `${lead.company || "Prospect"} – GPU Cloud`,
            amount: lifecycle === "customer" || lifecycle === "opportunity"
              ? Math.round(hashUnit(`hs_deal_amt:${email}`) * 48000 + 2000)
              : null,
            dealstage: lifecycle === "customer"
              ? "closedwon"
              : lifecycle === "opportunity"
              ? hashPick(`hs_dealstage:${email}`, DEAL_STAGE_POOL)
              : "appointmentscheduled",
          },
        ]
      : [];

    const companyDomain = (lead.company_website || lead.company || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

    results.push({
      id: hashId("HS", email),
      properties: {
        email,
        firstname: (lead.first_name || "").trim(),
        lastname: (lead.last_name || "").trim(),
        company: lead.company || "",
        jobtitle: lead.job_title || "",
        lifecyclestage: lifecycle,
        hs_lead_status: leadStatus,
        hs_email_optout: optOut,
        hs_email_last_open_date: lastOpen,
        hs_email_last_click_date: lastClick,
        hs_analytics_num_page_views: Math.floor(hashUnit(`hs_pv:${email}`) * 80),
        lead_score: leadScore,
        hubspot_owner_id: hasDeal ? hashPick(`hs_owner:${email}`, OWNER_POOL) : null,
      },
      associations: {
        companies: [
          {
            id: hashId("HSCO", companyDomain),
            name: lead.company || "",
            domain: companyDomain,
          },
        ],
        deals,
      },
      campaign_history: campaigns,
      notes: hasDeal && lifecycle !== "customer"
        ? [`SDR note: ${hashPick(`hs_note:${email}`, ["Strong interest, needs budget approval", "Champions internal evaluation", "Evaluating vs competitor", "Requested custom pricing", "Demo completed, positive feedback"] as const)}`]
        : [],
    });
  }

  return { results, total: results.length };
}

/** Mock HubSpot contact for a single email (used by follow-up stage). */
export function hubspotGetContact(email: string, lead: Partial<CsvRecord> = {}): HubSpotContact | null {
  const mockLead = { email_normalized: email, ...lead } as CsvRecord;
  const resp = hubspotLookup([mockLead]);
  return resp.results[0] ?? null;
}
