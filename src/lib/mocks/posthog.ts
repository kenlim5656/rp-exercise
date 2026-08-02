import { hashUnit, hashPick, hashId } from "./seed";

export interface PostHogEvent {
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

export interface PostHogGroupAnalytics {
  domain: string;
  group_id: string;
  active_member_count: number;
  total_compute_hours: number;
  total_bandwidth_gb: number;
  quota_used_pct: number;
  environments: string[];
  has_prod_deployment: boolean;
  sso_initiated: boolean;
  plan: string;
  events: PostHogEvent[];
  weekly_growth: {
    compute_hours_delta_pct: number;
    seats_delta: number;
    deployments_delta: number;
  };
}

const EVENT_TYPES = [
  "user_signed_up",
  "api_key_created",
  "resource_deployed",
  "team_member_joined",
  "usage_threshold_reached",
  "workspace_created",
  "model_uploaded",
  "training_job_started",
  "inference_endpoint_created",
  "billing_upgraded",
] as const;

const ENVIRONMENTS = ["dev", "staging", "prod"] as const;

const PLANS = ["free_developer", "pro", "enterprise"] as const;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function generateEvents(domain: string, memberCount: number): PostHogEvent[] {
  const eventCount = 3 + Math.floor(hashUnit(`${domain}:event_count`) * 12);
  const events: PostHogEvent[] = [];

  for (let i = 0; i < eventCount; i++) {
    const seed = `${domain}:event:${i}`;
    const eventType = hashPick(seed, EVENT_TYPES);
    const dayOffset = Math.floor(hashUnit(`${seed}:day`) * 60);
    const env = hashPick(`${seed}:env`, ENVIRONMENTS);

    const props: Record<string, unknown> = {
      environment: env,
      distinct_id: `user_${hashId("u", `${domain}:member:${Math.floor(hashUnit(`${seed}:member`) * memberCount)}`)}`,
    };

    if (eventType === "resource_deployed") {
      props.resource_type = hashPick(`${seed}:res`, ["gpu_pod", "serverless_endpoint", "template", "network_volume"]);
      props.gpu_type = hashPick(`${seed}:gpu`, ["A100", "H100", "RTX_4090", "A40", "L40S"]);
      props.compute_hours = Math.round(hashUnit(`${seed}:hours`) * 500);
    } else if (eventType === "usage_threshold_reached") {
      props.threshold_pct = hashPick(`${seed}:pct`, [50, 75, 80, 90, 95]);
      props.resource = hashPick(`${seed}:threshold_res`, ["compute", "bandwidth", "storage"]);
    } else if (eventType === "team_member_joined") {
      props.role = hashPick(`${seed}:role`, ["admin", "developer", "viewer"]);
    } else if (eventType === "training_job_started") {
      props.framework = hashPick(`${seed}:fw`, ["pytorch", "tensorflow", "jax", "huggingface"]);
      props.gpu_count = hashPick(`${seed}:gpus`, [1, 2, 4, 8]);
    }

    events.push({
      event: eventType,
      timestamp: daysAgo(dayOffset),
      properties: props,
    });
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function posthogLookup(domain: string): PostHogGroupAnalytics | null {
  const matchRate = hashUnit(`posthog:match:${domain}`);
  if (matchRate > 0.55) return null;

  const seed = `posthog:${domain}`;
  const memberCount = 1 + Math.floor(hashUnit(`${seed}:members`) * 15);
  const computeHours = Math.round(hashUnit(`${seed}:compute`) * 2000);
  const bandwidthGb = Math.round(hashUnit(`${seed}:bandwidth`) * 500);
  const quotaPct = Math.round(hashUnit(`${seed}:quota`) * 100);
  const hasProd = hashUnit(`${seed}:prod`) > 0.4;
  const ssoInitiated = hashUnit(`${seed}:sso`) > 0.7;

  const envs: string[] = ["dev"];
  if (hashUnit(`${seed}:has_staging`) > 0.3) envs.push("staging");
  if (hasProd) envs.push("prod");

  const plan = hashPick(`${seed}:plan`, PLANS);

  const events = generateEvents(domain, memberCount);

  const computeDelta = Math.round((hashUnit(`${seed}:compute_delta`) - 0.3) * 100);
  const seatsDelta = Math.floor((hashUnit(`${seed}:seats_delta`) - 0.2) * 5);
  const deployDelta = Math.floor((hashUnit(`${seed}:deploy_delta`) - 0.2) * 8);

  return {
    domain,
    group_id: hashId("grp", domain),
    active_member_count: memberCount,
    total_compute_hours: computeHours,
    total_bandwidth_gb: bandwidthGb,
    quota_used_pct: quotaPct,
    environments: envs,
    has_prod_deployment: hasProd,
    sso_initiated: ssoInitiated,
    plan,
    events,
    weekly_growth: {
      compute_hours_delta_pct: computeDelta,
      seats_delta: seatsDelta,
      deployments_delta: deployDelta,
    },
  };
}

export function posthogBatchLookup(domains: string[]): Map<string, PostHogGroupAnalytics> {
  const results = new Map<string, PostHogGroupAnalytics>();
  for (const domain of domains) {
    const data = posthogLookup(domain);
    if (data) results.set(domain, data);
  }
  return results;
}
