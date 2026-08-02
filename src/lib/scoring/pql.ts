import { getConfig, applyTimeDecay } from "./pql_config";
import type { PostHogGroupAnalytics } from "../mocks/posthog";
import { TECHNICAL_INDUSTRIES } from "../constants";

export interface PQLInput {
  role: string;
  industry: string;
  companySize: string;
  events: Array<{ event: string; timestamp: string; properties: Record<string, unknown> }>;
}

export interface PQLResult {
  pqlScore: number;
  signals: string[];
}

export interface AQLInput {
  domain: string;
  employeeCount: number | null;
  industry: string | null;
  fundingStage: string | null;
  posthog: PostHogGroupAnalytics | null;
  leadCount: number;
  avgPqlScore: number;
}

export interface AQLResult {
  fitScore: number;
  usageScore: number;
  aqlScore: number;
  aqlStatus: "unqualified" | "pql_user" | "aql_account" | "customer";
  signals: string[];
}

const TARGET_ROLES = new Set([
  "devops", "mlops", "ml engineer", "machine learning engineer",
  "ai engineer", "data scientist", "platform engineer", "sre",
  "infrastructure engineer", "backend engineer", "cto", "vp engineering",
  "head of engineering", "head of ml", "head of ai", "director of engineering",
  "software engineer",
]);

function normalizeRole(title: string): string {
  return (title || "").toLowerCase().trim();
}

function isTargetRole(role: string): boolean {
  const r = normalizeRole(role);
  return TARGET_ROLES.has(r) || Array.from(TARGET_ROLES).some((t) => r.includes(t));
}

export function scorePQL(input: PQLInput): PQLResult {
  const config = getConfig();
  let score = 0;
  const signals: string[] = [];
  const now = Date.now();

  if (isTargetRole(input.role)) {
    score += config.weights.firmographic.target_role;
    signals.push(`Target role: ${input.role}`);
  }

  const industry = (input.industry || "").toLowerCase().trim();
  if (TECHNICAL_INDUSTRIES.has(industry)) {
    score += config.weights.firmographic.target_industry;
    signals.push(`Target industry: ${input.industry}`);
  }

  for (const event of input.events) {
    const daysSince = Math.max(0, (now - new Date(event.timestamp).getTime()) / (1000 * 60 * 60 * 24));

    let eventScore = 0;
    const eventName = event.event;

    if (eventName === "api_key_created") {
      eventScore = config.weights.usage.api_key_created;
    } else if (eventName === "resource_deployed") {
      eventScore = config.weights.usage.resource_deployed;
      if (event.properties.environment === "prod") {
        eventScore += config.weights.usage.prod_deployment;
        signals.push("Deployed to production");
      }
    } else if (eventName === "usage_threshold_reached") {
      const pct = (event.properties.threshold_pct as number) ?? 0;
      if (pct >= 80) {
        eventScore = config.weights.usage.quota_threshold_80_pct;
        signals.push(`Reached ${pct}% quota`);
      }
    } else if (eventName === "training_job_started") {
      eventScore = 8;
      signals.push("Started training job");
    } else if (eventName === "inference_endpoint_created") {
      eventScore = 10;
      signals.push("Created inference endpoint");
    }

    score += applyTimeDecay(eventScore, daysSince, config.time_decay_half_life_days);
  }

  return { pqlScore: Math.min(100, Math.round(score)), signals: [...new Set(signals)] };
}

export function scoreAQL(input: AQLInput): AQLResult {
  const config = getConfig();
  let fitScore = 0;
  let usageScore = 0;
  const signals: string[] = [];

  if (input.employeeCount && input.employeeCount > 100) {
    fitScore += config.weights.firmographic.employee_count_gt_100;
    signals.push(`${input.employeeCount}+ employees`);
  }

  if (input.industry && TECHNICAL_INDUSTRIES.has(input.industry.toLowerCase().trim())) {
    fitScore += config.weights.firmographic.target_industry;
    signals.push(`Target industry: ${input.industry}`);
  }

  if (input.fundingStage) {
    const fs = input.fundingStage.toLowerCase();
    if (fs.includes("series b") || fs.includes("series c") || fs.includes("series d") || fs.includes("ipo") || fs.includes("growth")) {
      fitScore += config.weights.firmographic.funding_stage_b_plus;
      signals.push(`Funding: ${input.fundingStage}`);
    }
  }

  if (input.leadCount >= 3) {
    fitScore += config.weights.usage.active_seats_gte_3;
    signals.push(`${input.leadCount} team members active`);
  }

  if (input.posthog) {
    const ph = input.posthog;

    if (ph.active_member_count >= 3) {
      usageScore += config.weights.usage.active_seats_gte_3;
      signals.push(`${ph.active_member_count} active workspace members`);
    }

    if (ph.quota_used_pct >= 80) {
      usageScore += config.weights.usage.quota_threshold_80_pct;
      signals.push(`Quota at ${ph.quota_used_pct}%`);
    }

    if (ph.has_prod_deployment) {
      usageScore += config.weights.usage.prod_deployment;
      signals.push("Production deployment active");
    }

    if (ph.sso_initiated) {
      usageScore += config.weights.usage.sso_initiated;
      signals.push("SSO initiated (enterprise signal)");
    }

    if (ph.total_compute_hours > 100) {
      usageScore += config.weights.usage.compute_hours_gt_100;
      signals.push(`${ph.total_compute_hours} compute hours used`);
    }

    const deployCount = ph.events.filter((e) => e.event === "resource_deployed").length;
    if (deployCount >= 3) {
      usageScore += config.weights.usage.resource_deployed;
      signals.push(`${deployCount} resources deployed`);
    }

    if (ph.weekly_growth.compute_hours_delta_pct > 30) {
      usageScore += 8;
      signals.push(`Usage velocity: +${ph.weekly_growth.compute_hours_delta_pct}% compute growth`);
    }
  }

  const aqlScore = Math.min(100, fitScore + usageScore);

  let aqlStatus: AQLResult["aqlStatus"];
  if (aqlScore >= config.thresholds.aql_account_min) {
    aqlStatus = "aql_account";
  } else if (input.avgPqlScore >= config.thresholds.pql_user_min) {
    aqlStatus = "pql_user";
  } else {
    aqlStatus = "unqualified";
  }

  return { fitScore, usageScore, aqlScore, aqlStatus, signals: [...new Set(signals)] };
}
