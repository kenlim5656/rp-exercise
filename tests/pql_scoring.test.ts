import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePQL, scoreAQL } from "../src/lib/scoring/pql";
import { applyTimeDecay } from "../src/lib/scoring/pql_config";
import type { PostHogGroupAnalytics } from "../src/lib/mocks/posthog";

function recentEvent(event: string, props: Record<string, unknown> = {}) {
  return { event, timestamp: new Date().toISOString(), properties: props };
}

function oldEvent(event: string, daysAgo: number, props: Record<string, unknown> = {}) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { event, timestamp: d.toISOString(), properties: props };
}

test("PQL: target role gets role weight", () => {
  const result = scorePQL({ role: "ML Engineer", industry: "other", companySize: "50", events: [] });
  assert.ok(result.pqlScore >= 12);
  assert.ok(result.signals.some((s) => s.includes("Target role")));
});

test("PQL: non-target role gets no role bonus", () => {
  const result = scorePQL({ role: "Marketing Manager", industry: "other", companySize: "50", events: [] });
  assert.equal(result.pqlScore, 0);
});

test("PQL: target industry adds score", () => {
  const result = scorePQL({ role: "other", industry: "AI/ML Software", companySize: "50", events: [] });
  assert.ok(result.pqlScore >= 8);
});

test("PQL: api_key_created event adds score", () => {
  const result = scorePQL({ role: "other", industry: "other", companySize: "50", events: [recentEvent("api_key_created")] });
  assert.ok(result.pqlScore >= 5);
});

test("PQL: resource_deployed to prod gets bonus", () => {
  const result = scorePQL({
    role: "other",
    industry: "other",
    companySize: "50",
    events: [recentEvent("resource_deployed", { environment: "prod" })],
  });
  assert.ok(result.pqlScore >= 30);
  assert.ok(result.signals.some((s) => s.includes("production")));
});

test("PQL: old events decay", () => {
  const recent = scorePQL({ role: "other", industry: "other", companySize: "50", events: [recentEvent("resource_deployed")] });
  const old = scorePQL({ role: "other", industry: "other", companySize: "50", events: [oldEvent("resource_deployed", 28)] });
  assert.ok(recent.pqlScore > old.pqlScore, `recent ${recent.pqlScore} should be > old ${old.pqlScore}`);
});

test("PQL: score capped at 100", () => {
  const events = [
    recentEvent("resource_deployed", { environment: "prod" }),
    recentEvent("api_key_created"),
    recentEvent("inference_endpoint_created"),
    recentEvent("training_job_started"),
    recentEvent("usage_threshold_reached", { threshold_pct: 90 }),
  ];
  const result = scorePQL({ role: "ML Engineer", industry: "AI/ML Software", companySize: "50", events });
  assert.ok(result.pqlScore <= 100);
});

test("time decay: half-life halves score", () => {
  const decayed = applyTimeDecay(10, 14, 14);
  assert.ok(Math.abs(decayed - 5) < 0.01);
});

test("time decay: zero days returns full score", () => {
  const decayed = applyTimeDecay(10, 0, 14);
  assert.equal(decayed, 10);
});

function basePH(): PostHogGroupAnalytics {
  return {
    group_key: "test.com",
    active_member_count: 1,
    total_compute_hours: 10,
    quota_used_pct: 20,
    environments: ["staging"],
    has_prod_deployment: false,
    sso_initiated: false,
    weekly_growth: { compute_hours_delta_pct: 5, member_delta: 0, deployment_delta: 0 },
    events: [],
  };
}

test("AQL: unqualified with no signals", () => {
  const result = scoreAQL({
    domain: "tiny.io",
    employeeCount: 5,
    industry: "Retail",
    fundingStage: null,
    posthog: null,
    leadCount: 1,
    avgPqlScore: 10,
  });
  assert.equal(result.aqlStatus, "unqualified");
  assert.ok(result.aqlScore < 80);
});

test("AQL: large company + target industry + high usage = aql_account", () => {
  const ph = basePH();
  ph.active_member_count = 5;
  ph.quota_used_pct = 90;
  ph.has_prod_deployment = true;
  ph.sso_initiated = true;
  ph.total_compute_hours = 200;
  ph.events = [recentEvent("resource_deployed"), recentEvent("resource_deployed"), recentEvent("resource_deployed")];
  ph.weekly_growth = { compute_hours_delta_pct: 50, member_delta: 2, deployment_delta: 1 };

  const result = scoreAQL({
    domain: "bigcorp.ai",
    employeeCount: 500,
    industry: "AI/ML Software",
    fundingStage: "Series C",
    posthog: ph,
    leadCount: 4,
    avgPqlScore: 60,
  });
  assert.equal(result.aqlStatus, "aql_account");
  assert.ok(result.aqlScore >= 80);
});

test("AQL: pql_user status when avg PQL high but AQL below threshold", () => {
  const result = scoreAQL({
    domain: "small.dev",
    employeeCount: 10,
    industry: "Software",
    fundingStage: null,
    posthog: null,
    leadCount: 2,
    avgPqlScore: 65,
  });
  assert.equal(result.aqlStatus, "pql_user");
});

test("AQL: employee_count > 100 adds fit score", () => {
  const result = scoreAQL({
    domain: "mid.co",
    employeeCount: 200,
    industry: "other",
    fundingStage: null,
    posthog: null,
    leadCount: 1,
    avgPqlScore: 10,
  });
  assert.ok(result.fitScore >= 10);
  assert.ok(result.signals.some((s) => s.includes("employees")));
});

test("AQL: funding stage B+ adds fit score", () => {
  const result = scoreAQL({
    domain: "funded.co",
    employeeCount: 50,
    industry: "other",
    fundingStage: "Series B",
    posthog: null,
    leadCount: 1,
    avgPqlScore: 10,
  });
  assert.ok(result.fitScore >= 6);
  assert.ok(result.signals.some((s) => s.includes("Funding")));
});
