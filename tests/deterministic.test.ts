import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreDeterministic } from "../src/lib/scoring/deterministic";

function base() {
  return {
    jobTitle: "",
    company: "",
    companySize: "",
    industry: "",
    emailNormalized: "",
    emailType: "work" as const,
    isCompetitorDomain: false,
    isDisposableDomain: false,
    isSuspiciousFake: false,
  };
}

test("competitor domain is always suppressed regardless of title", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "ml engineer",
    company: "GRIDFORGE CLOUD",
    industry: "AI/ML software",
    companySize: "201-500",
    emailNormalized: "egarcia@gridforge.cloud",
    isCompetitorDomain: true,
  });
  assert.equal(r.tier, "suppress");
  assert.equal(r.reviewFlag, false);
});

test("clearly fake record is suppressed", () => {
  const r = scoreDeterministic({ ...base(), isSuspiciousFake: true, emailNormalized: "aaa@bbb.cc" });
  assert.equal(r.tier, "suppress");
});

test("CTO at a 1000+ employee software company on a work email is a clean Tier 1", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "Chief Technology Officer",
    company: "Loopware",
    industry: "Software",
    companySize: "1000+",
    emailNormalized: "jack_singh@loopware.io",
    emailType: "work",
  });
  assert.equal(r.tier, "tier1");
  assert.equal(r.reviewFlag, false);
});

test("decision-maker title at a 1-10 employee AI/ML company routes to Tier 2 (no sales motion yet)", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "Director of Platform Engineering",
    company: "Finetune Labs",
    industry: "AI/ML software",
    companySize: "1-10",
    emailNormalized: "donaldf@finetunelabs.com",
  });
  assert.equal(r.tier, "tier2");
  assert.equal(r.reviewFlag, false);
});

test("missing job title is Tier 3 and flagged for review", () => {
  const r = scoreDeterministic({ ...base(), emailNormalized: "someone@example.com" });
  assert.equal(r.tier, "tier3");
  assert.equal(r.reviewFlag, true);
  assert.match(r.reviewReason ?? "", /missing job title/);
});

test("decision-maker title with missing company is Tier 2 and flagged", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "VP of Engineering",
    company: "",
    industry: "",
    emailNormalized: "vp@example.com",
  });
  assert.equal(r.tier, "tier2");
  assert.equal(r.reviewFlag, true);
});

test("Tier 1 signals on a personal/freemail email keep Tier 1 but flag for review", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "Founder & CEO",
    company: "Voxel Dynamics",
    industry: "AI/ML software",
    companySize: "51-200",
    emailNormalized: "founder@gmail.com",
    emailType: "freemail",
  });
  assert.equal(r.tier, "tier1");
  assert.equal(r.reviewFlag, true);
  assert.match(r.reviewReason ?? "", /personal email/);
});

test("ambiguous title at a technical company defaults to Tier 2 and is flagged", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "Principal Consultant",
    company: "Databarn",
    industry: "AI/ML software",
    companySize: "51-200",
    emailNormalized: "someone@databarn.io",
  });
  assert.equal(r.tier, "tier2");
  assert.equal(r.reviewFlag, true);
});

test("non-technical role at any company is Tier 3", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "Financial Analyst",
    company: "Gradient Peak",
    industry: "AI/ML software",
    companySize: "201-500",
    emailNormalized: "kevinl@gradientpeak.ai",
  });
  assert.equal(r.tier, "tier3");
});

test("academic (.edu) domain is Tier 3 regardless of title", () => {
  const r = scoreDeterministic({
    ...base(),
    jobTitle: "Director of AI Research",
    company: "State University",
    industry: "Education",
    emailNormalized: "prof@stateuniv.edu",
  });
  assert.equal(r.tier, "tier3");
});
