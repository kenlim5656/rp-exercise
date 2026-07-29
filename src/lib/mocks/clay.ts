import type { CsvRecord } from "../csv";
import { hashUnit, hashId, hashPick } from "./seed";

/**
 * Simulated Clay workflows (spec 4.0). The real Clay MCP connection
 * available in this environment is intentionally not used -- per the user's
 * decision, Clay is mocked identically to Salesforce/HubSpot/BigQuery so the
 * POC stays deterministic and never touches the live Clay workspace.
 *
 * Payload shapes loosely mirror Clay's actual enrichment response envelope:
 * `{status, matches: [{provider, confidence, data}]}`.
 */

export interface ClayMatch<T> {
  provider: string;
  confidence: number;
  data: T;
}
export interface ClayWorkflowResponse<T> {
  status: "completed";
  workflow: string;
  matches: Array<ClayMatch<T>>;
}

export interface IdentityResolutionResult {
  lead_id: string;
  email_normalized: string;
  resolved: boolean;
  resolved_account_company: string | null;
  confidence: number;
}

/**
 * Identity resolution (4.1.1): only runs for freemail/personal emails --
 * work-domain emails are skipped per spec, since the company is already
 * known from the domain itself.
 */
export function clayIdentityResolution(freemailLeads: CsvRecord[]): ClayWorkflowResponse<IdentityResolutionResult> {
  const matches = freemailLeads.map((lead) => {
    const email = lead.email_normalized;
    const resolved = hashUnit(`identity:${email}`) < 0.6;
    const confidence = Math.round(hashUnit(`identity_conf:${email}`) * 30 + 65) / 100; // 0.65-0.95
    return {
      provider: "clay_identity_graph",
      confidence: resolved ? confidence : 0,
      data: {
        lead_id: lead.lead_id,
        email_normalized: email,
        resolved,
        // stays internally consistent with the input rather than inventing data
        resolved_account_company: resolved ? lead.company || null : null,
        confidence,
      } satisfies IdentityResolutionResult,
    };
  });
  return { status: "completed", workflow: "identity_resolution", matches };
}

export interface FirmographicEnrichment {
  lead_id: string;
  company_size: string | null;
  industry: string | null;
  geo: string | null;
}

const COMPANY_SIZE_POOL = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
const INDUSTRY_POOL = ["AI/ML software", "Software", "AI/ML software", "Software", "Data infrastructure"] as const;
const GEO_POOL = ["US", "GB", "DE", "SG", "AU", "CA", "IN"] as const;

/**
 * Firmographic enrichment (4.1.2): only for freemail leads that identity
 * resolution matched to an account; backfills company_size/industry/geo
 * where the sanitized record is missing them.
 */
export function clayFirmographicEnrichment(
  resolvedLeads: Array<{ lead: CsvRecord; resolution: IdentityResolutionResult }>,
): ClayWorkflowResponse<FirmographicEnrichment> {
  const matches = resolvedLeads
    .filter((r) => r.resolution.resolved)
    .map(({ lead }) => {
      const key = lead.email_normalized;
      const data: FirmographicEnrichment = {
        lead_id: lead.lead_id,
        company_size: lead.company_size?.trim() || hashPick(`size:${key}`, COMPANY_SIZE_POOL),
        industry: lead.industry?.trim() || hashPick(`industry:${key}`, INDUSTRY_POOL),
        geo: lead.country?.trim() || hashPick(`geo:${key}`, GEO_POOL),
      };
      return { provider: "clay_firmographics", confidence: 0.8, data };
    });
  return { status: "completed", workflow: "firmographic_enrichment", matches };
}

export interface IntentScoreResult {
  accountId: string;
  intentScore: number;
  intentTier: "low" | "medium" | "high";
  surging: boolean;
  signals: string[];
  asOf: string;
}

const SIGNAL_POOL = [
  "increased docs traffic",
  "pricing page visits up",
  "GPU usage trial spike",
  "competitor tool churn signal",
  "hiring for ML roles",
  "recent funding round",
  "expanded infra footprint",
] as const;

/** Intent scoring (4.1.3 / 4.3 fallback): "is the account surging" scoring,
 * seeded per lead/account so it's stable across re-runs. */
export function clayIntentScore(key: string): IntentScoreResult {
  const score = Math.round(hashUnit(`intent:${key}`) * 100);
  const tier: IntentScoreResult["intentTier"] = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  const signalCount = tier === "high" ? 3 : tier === "medium" ? 2 : 1;
  const signals = Array.from({ length: signalCount }, (_, i) => hashPick(`signal:${key}:${i}`, SIGNAL_POOL));
  return {
    accountId: hashId("ACC", key),
    intentScore: score,
    intentTier: tier,
    surging: score >= 70,
    signals: Array.from(new Set(signals)),
    asOf: new Date().toISOString(),
  };
}
