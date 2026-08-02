import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, setStageStatus, upsertLeads } from "../runs";
import { logAction } from "../audit";
import { writeCsv, type CsvRecord } from "../csv";
import { hubspotLookup } from "../mocks/hubspot";
import { EU_COUNTRIES } from "../constants";

type ConsentVerified = "verified_in" | "verified_out" | "ambiguous";

/** Spec 5.0 (v2): HubSpot-only CRM + MAP lookup.
 *  Salesforce removed in v2 — HubSpot is the single source of truth for both
 *  CRM status and marketing engagement history.
 *  Applies the 5.3 hard rule: EU leads with ambiguous consent are flagged for
 *  human review before any follow-up can be sent. */
export async function runCrmStage(runId: string) {
  await setStageStatus(runId, "crm", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const leads = rows.map((r) => JSON.parse(r.sanitized_json!) as CsvRecord);

    const hs = hubspotLookup(leads);
    const outDir = stageDir(runId, "crm");
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "hubspot-lookup.json"), JSON.stringify(hs, null, 2));
    } catch {
      // Filesystem write may fail on read-only filesystem (Vercel) — DB is authoritative
    }

    const hsByEmail = new Map(hs.results.map((r) => [r.properties.email, r]));

    let euAmbiguousCount = 0;
    const merged: CsvRecord[] = [];
    const crmUpdates: Array<{
      lead_id: string;
      crm_json: string;
      is_eu: number;
      consent_verified: string;
      eu_consent_flag: string | null;
    }> = [];

    for (const lead of leads) {
      const hsRec = hsByEmail.get(lead.email_normalized);
      const isEu = EU_COUNTRIES.has((lead.country || "").trim());
      const consentNormalized = lead.consent_normalized;
      const hsOptOut = hsRec?.properties.hs_email_optout ?? null;

      let consentVerified: ConsentVerified;
      if (hsOptOut === true || consentNormalized === "false") {
        consentVerified = "verified_out";
      } else if (consentNormalized === "true" || hsOptOut === false) {
        consentVerified = "verified_in";
      } else {
        consentVerified = "ambiguous";
      }

      let euConsentFlag: string | null = null;
      if (isEu && consentVerified === "ambiguous") {
        euConsentFlag = "EU / Consent Verification Needed";
        euAmbiguousCount++;
      }

      const lifecycle = hsRec?.properties.lifecyclestage;
      const isExistingCustomer = lifecycle === "customer" || lifecycle === "evangelist";
      const isActiveOpportunity = !!hsRec?.associations.deals.some(
        (d) => !["closedwon", "closedlost"].includes(d.dealstage),
      );
      const isChurned = hsRec?.properties.hs_lead_status === "UNQUALIFIED";

      const crmJson = {
        hubspot: hsRec ?? null,
        isExistingCustomer: !!isExistingCustomer,
        isActiveOpportunity,
        isLead: !isExistingCustomer && !!hsRec,
        isChurned: !!isChurned,
        campaignHistory: hsRec?.campaign_history ?? [],
        openDeal: hsRec?.associations.deals.find((d) => !["closedwon", "closedlost"].includes(d.dealstage)) ?? null,
        hsOptOut,
        dncFlag: hsOptOut === true,
        leadScore: hsRec?.properties.lead_score ?? null,
        ownerAssigned: !!hsRec?.properties.hubspot_owner_id,
      };

      crmUpdates.push({
        lead_id: lead.lead_id,
        crm_json: JSON.stringify(crmJson),
        is_eu: isEu ? 1 : 0,
        consent_verified: consentVerified,
        eu_consent_flag: euConsentFlag,
      });

      merged.push({
        ...lead,
        is_eu: String(isEu),
        consent_verified: consentVerified,
        eu_consent_flag: euConsentFlag ?? "",
        is_existing_customer: String(!!isExistingCustomer),
        is_churned: String(!!isChurned),
      });
    }

    if (crmUpdates.length > 0) {
      await upsertLeads(runId, crmUpdates);
    }

    try {
      writeCsv(path.join(outDir, "crm-merged.csv"), merged);
    } catch {
      /* read-only fs */
    }

    await setStageStatus(runId, "crm", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "crm",
      action: "crm_lookup_completed",
      detail: {
        hubspot_matches: hs.results.length,
        eu_ambiguous_count: euAmbiguousCount,
        existing_customers: hs.results.filter((r) => ["customer", "evangelist"].includes(r.properties.lifecyclestage)).length,
        open_deals: hs.results.filter((r) => r.associations.deals.some((d) => !["closedwon", "closedlost"].includes(d.dealstage))).length,
      },
    });
  } catch (err) {
    await setStageStatus(runId, "crm", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
