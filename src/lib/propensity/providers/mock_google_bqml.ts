import type { AccountPropensityRecord, PropensityDataProvider } from "../types";
import { getDb } from "../../db";

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

const PURCHASE_OPTIONS = [
  "Dedicated Compute Nodes",
  "Enterprise Security & SOC2 Package",
  "SSO/SAML Integration",
  "Dedicated VPC & Network Isolation",
  "Multi-Region Cluster Deployment",
  "Premium GPU Allocation (A100/H100)",
  "Managed MLOps Pipeline",
  "Custom SLA & Support Tier",
  "Training Job Orchestration",
  "Inference Endpoint Autoscaling",
];

const DRIVER_POOL = [
  "compute_growth_100_pct",
  "compute_growth_50_pct",
  "high_compute_velocity",
  "sso_settings_viewed",
  "sso_page_visits",
  "multi_region_clusters",
  "3_active_devs",
  "5_active_devs",
  "quota_near_limit",
  "prod_deployment_active",
  "training_jobs_increasing",
  "inference_endpoints_created",
  "security_docs_visited",
  "compliance_page_viewed",
  "api_key_rotation_frequent",
  "team_growth_30_pct",
  "billing_page_frequent",
  "enterprise_plan_page_viewed",
  "gpu_hours_above_threshold",
  "multiple_environments",
];

function generatePropensity(accountId: string, domain: string): AccountPropensityRecord {
  const seed = hashStr(domain + accountId);
  const score = 0.15 + (seed % 850) / 1000;
  const clampedScore = Math.min(0.98, Math.max(0.05, score));
  const percentile = Math.min(99, Math.max(1, Math.round(clampedScore * 100)));

  const acvBase = 10000 + (seed % 65000);
  const acvRounded = Math.round(acvBase / 5000) * 5000;

  const driverCount = 2 + (seed % 3);
  const drivers: string[] = [];
  for (let i = 0; i < driverCount; i++) {
    const d = pick(DRIVER_POOL, seed + i * 7);
    if (!drivers.includes(d)) drivers.push(d);
  }

  return {
    accountId,
    domain,
    propensityScore: Math.round(clampedScore * 100) / 100,
    propensityPercentile: percentile,
    predictedAcv: acvRounded,
    nextLikelyPurchase: pick(PURCHASE_OPTIONS, seed + 3),
    purchaseDrivers: drivers,
    modelSource: "google_bqml",
    modelVersion: "v1.2-2026-08",
    lastUpdatedAt: new Date().toISOString(),
  };
}

export class MockGoogleBqmlProvider implements PropensityDataProvider {
  async getPropensityForAccount(accountId: string, domain: string): Promise<AccountPropensityRecord | null> {
    const seed = hashStr(domain);
    if (seed % 100 < 20) return null;
    return generatePropensity(accountId, domain);
  }

  async batchUpsertPropensityData(records: AccountPropensityRecord[]): Promise<{ ingested: number }> {
    const db = getDb();
    let ingested = 0;

    const BATCH = 80;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const stmts = batch.map((r) => ({
        sql: `INSERT INTO account_propensity (id, account_id, domain, propensity_score, propensity_percentile,
              predicted_acv, next_likely_purchase, purchase_drivers_json, model_source, model_version, last_updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(account_id) DO UPDATE SET
                propensity_score = excluded.propensity_score,
                propensity_percentile = excluded.propensity_percentile,
                predicted_acv = excluded.predicted_acv,
                next_likely_purchase = excluded.next_likely_purchase,
                purchase_drivers_json = excluded.purchase_drivers_json,
                model_source = excluded.model_source,
                model_version = excluded.model_version,
                last_updated_at = excluded.last_updated_at`,
        args: [
          `prop_${r.accountId}`,
          r.accountId,
          r.domain,
          r.propensityScore,
          r.propensityPercentile,
          r.predictedAcv,
          r.nextLikelyPurchase,
          JSON.stringify(r.purchaseDrivers),
          r.modelSource,
          r.modelVersion,
          r.lastUpdatedAt,
        ] as import("@libsql/client").InValue[],
      }));
      await db.batch(stmts, "write");
      ingested += batch.length;
    }

    return { ingested };
  }
}

export function createMockProvider(): PropensityDataProvider {
  return new MockGoogleBqmlProvider();
}
