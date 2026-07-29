import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, setStageStatus, upsertLeads } from "../runs";
import { logAction } from "../audit";
import { writeCsv, type CsvRecord } from "../csv";
import { salesforceLookup, type SalesforceRecord } from "../mocks/salesforce";
import { hubspotLookup, type HubSpotContact } from "../mocks/hubspot";
import { EU_COUNTRIES } from "../constants";

type ConsentVerified = "verified_in" | "verified_out" | "ambiguous";

/** Spec 5.0: Salesforce + HubSpot status lookup, merged into flat CRM
 * fields, plus the 5.3 hard rule -- EU leads must have a verified opt-out
 * status before any follow-up; ambiguous EU consent gets a dedicated flag
 * consumed unconditionally by the routing stage (7.0). */
export async function runCrmStage(runId: string) {
  await setStageStatus(runId, "crm", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const leads = rows.map((r) => JSON.parse(r.sanitized_json!) as CsvRecord);

    const sf = salesforceLookup(leads);
    const hs = hubspotLookup(leads);
    const outDir = stageDir(runId, "crm");
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "salesforce-lookup.json"), JSON.stringify(sf, null, 2));
      fs.writeFileSync(path.join(outDir, "hubspot-lookup.json"), JSON.stringify(hs, null, 2));
    } catch {
      // Filesystem write may fail on read-only filesystem (Vercel) — DB is authoritative
    }

    const sfByEmail = new Map(sf.records.map((r) => [r.Email, r]));
    const hsByEmail = new Map(hs.results.map((r) => [r.properties.email, r]));

    let euAmbiguousCount = 0;
    const merged: CsvRecord[] = [];

    for (const lead of leads) {
      const sfRec: SalesforceRecord | undefined = sfByEmail.get(lead.email_normalized);
      const hsRec: HubSpotContact | undefined = hsByEmail.get(lead.email_normalized);
      const isEu = EU_COUNTRIES.has((lead.country || "").trim());
      const consentNormalized = lead.consent_normalized;
      const sfOptOut = sfRec?.HasOptedOutOfEmail ?? null;
      const hsOptOut = hsRec?.properties.hs_email_optout ?? null;

      let consentVerified: ConsentVerified;
      if (sfOptOut === true || hsOptOut === true || consentNormalized === "false") {
        consentVerified = "verified_out";
      } else if (consentNormalized === "true" || sfOptOut === false || hsOptOut === false) {
        consentVerified = "verified_in";
      } else {
        consentVerified = "ambiguous";
      }

      let euConsentFlag: string | null = null;
      if (isEu && consentVerified === "ambiguous") {
        euConsentFlag = "EU / Consent Verification Needed";
        euAmbiguousCount++;
      }

      const isExistingCustomer = sfRec?.Status === "Converted" || hsRec?.properties.lifecyclestage === "customer";
      const isLeadStatus =
        (!!sfRec && sfRec.Status !== "Converted" && sfRec.Status !== "Closed Lost") ||
        (!!hsRec && ["lead", "marketingqualifiedlead", "salesqualifiedlead"].includes(hsRec.properties.lifecyclestage));
      const isChurned = sfRec?.Status === "Closed Lost" || hsRec?.properties.lifecyclestage === "other";

      const crmJson = {
        salesforce: sfRec ?? null,
        hubspot: hsRec ?? null,
        isExistingCustomer: !!isExistingCustomer,
        isLead: !!isLeadStatus,
        isChurned: !!isChurned,
        campaignHistory: sfRec?.CampaignHistory ?? [],
        openOpportunity: sfRec?.HasOpenOpportunity ?? false,
        sfOptOut,
        hsOptOut,
        dncFlag: sfOptOut === true || hsOptOut === true,
      };

      await upsertLeads(runId, [
        {
          lead_id: lead.lead_id,
          crm_json: JSON.stringify(crmJson),
          is_eu: isEu ? 1 : 0,
          consent_verified: consentVerified,
          eu_consent_flag: euConsentFlag,
        },
      ]);

      merged.push({
        ...lead,
        is_eu: String(isEu),
        consent_verified: consentVerified,
        eu_consent_flag: euConsentFlag ?? "",
        is_existing_customer: String(!!isExistingCustomer),
        is_churned: String(!!isChurned),
      });
    }

    try { writeCsv(path.join(outDir, "crm-merged.csv"), merged); } catch { /* read-only fs */ }

    await setStageStatus(runId, "crm", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "crm",
      action: "crm_lookup_completed",
      detail: { sf_matches: sf.records.length, hubspot_matches: hs.results.length, eu_ambiguous_count: euAmbiguousCount },
    });
  } catch (err) {
    await setStageStatus(runId, "crm", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
