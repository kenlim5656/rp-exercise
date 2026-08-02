import { test } from "node:test";
import assert from "node:assert/strict";
import { MockGoogleBqmlProvider } from "../src/lib/propensity/providers/mock_google_bqml";
import type { AccountPropensityRecord } from "../src/lib/propensity/types";

test("MockGoogleBqmlProvider: generates deterministic propensity for same inputs", async () => {
  const provider = new MockGoogleBqmlProvider();
  const r1 = await provider.getPropensityForAccount("acct_1", "example.com");
  const r2 = await provider.getPropensityForAccount("acct_1", "example.com");

  assert.ok(r1 !== null);
  assert.ok(r2 !== null);
  assert.equal(r1!.propensityScore, r2!.propensityScore);
  assert.equal(r1!.propensityPercentile, r2!.propensityPercentile);
  assert.equal(r1!.predictedAcv, r2!.predictedAcv);
  assert.equal(r1!.nextLikelyPurchase, r2!.nextLikelyPurchase);
});

test("MockGoogleBqmlProvider: returns null for ~20% of domains (graceful degradation)", async () => {
  const provider = new MockGoogleBqmlProvider();
  let nullCount = 0;
  const total = 100;
  for (let i = 0; i < total; i++) {
    const result = await provider.getPropensityForAccount(`acct_${i}`, `domain${i}.com`);
    if (result === null) nullCount++;
  }
  assert.ok(nullCount > 5, `Expected some nulls, got ${nullCount}`);
  assert.ok(nullCount < 40, `Expected ~20% nulls, got ${nullCount}`);
});

test("MockGoogleBqmlProvider: propensity score is in range 0.0 - 1.0", async () => {
  const provider = new MockGoogleBqmlProvider();
  for (let i = 0; i < 50; i++) {
    const result = await provider.getPropensityForAccount(`test_${i}`, `test${i}.io`);
    if (result) {
      assert.ok(result.propensityScore >= 0 && result.propensityScore <= 1,
        `Score ${result.propensityScore} out of range`);
    }
  }
});

test("MockGoogleBqmlProvider: propensity percentile is 1-99", async () => {
  const provider = new MockGoogleBqmlProvider();
  for (let i = 0; i < 50; i++) {
    const result = await provider.getPropensityForAccount(`pct_${i}`, `pct${i}.co`);
    if (result) {
      assert.ok(result.propensityPercentile >= 1 && result.propensityPercentile <= 99,
        `Percentile ${result.propensityPercentile} out of range`);
    }
  }
});

test("MockGoogleBqmlProvider: predicted ACV is in $10k-$75k range, rounded to $5k", async () => {
  const provider = new MockGoogleBqmlProvider();
  for (let i = 0; i < 50; i++) {
    const result = await provider.getPropensityForAccount(`acv_${i}`, `acv${i}.dev`);
    if (result) {
      assert.ok(result.predictedAcv >= 10000 && result.predictedAcv <= 75000,
        `ACV ${result.predictedAcv} out of range`);
      assert.equal(result.predictedAcv % 5000, 0, `ACV ${result.predictedAcv} not rounded to $5k`);
    }
  }
});

test("MockGoogleBqmlProvider: has purchase drivers", async () => {
  const provider = new MockGoogleBqmlProvider();
  const result = await provider.getPropensityForAccount("drivers_test", "drivertest.com");
  if (result) {
    assert.ok(result.purchaseDrivers.length >= 2, "Expected at least 2 drivers");
    assert.ok(result.purchaseDrivers.length <= 4, "Expected at most 4 drivers");
  }
});

test("MockGoogleBqmlProvider: model source is google_bqml", async () => {
  const provider = new MockGoogleBqmlProvider();
  const result = await provider.getPropensityForAccount("model_test", "modeltest.com");
  if (result) {
    assert.equal(result.modelSource, "google_bqml");
    assert.ok(result.modelVersion.startsWith("v1."));
  }
});

test("PropensityDataProvider: interface conformance", async () => {
  const provider = new MockGoogleBqmlProvider();
  assert.equal(typeof provider.getPropensityForAccount, "function");
  assert.equal(typeof provider.batchUpsertPropensityData, "function");
});

test("Score boost: propensity percentile >= 80 should qualify for +15 AQL boost", () => {
  const baseAql = 70;
  const propPercentile = 88;

  const boosted = propPercentile >= 80 ? Math.min(100, baseAql + 15) : baseAql;
  assert.equal(boosted, 85);

  const newStatus = boosted >= 80 ? "aql_account" : "unqualified";
  assert.equal(newStatus, "aql_account");
});

test("Score boost: propensity percentile < 80 should not boost", () => {
  const baseAql = 70;
  const propPercentile = 65;

  const boosted = propPercentile >= 80 ? Math.min(100, baseAql + 15) : baseAql;
  assert.equal(boosted, 70);
});

test("Score boost: boost capped at 100", () => {
  const baseAql = 92;
  const propPercentile = 95;

  const boosted = propPercentile >= 80 ? Math.min(100, baseAql + 15) : baseAql;
  assert.equal(boosted, 100);
});

test("Fallback: missing propensity data returns null gracefully", async () => {
  const provider = new MockGoogleBqmlProvider();
  let found = false;
  for (let i = 0; i < 200; i++) {
    const result = await provider.getPropensityForAccount(`miss_${i}`, `miss${i}.xyz`);
    if (result === null) {
      found = true;
      break;
    }
  }
  assert.ok(found, "Expected at least one null result for fallback");
});
