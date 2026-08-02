# RP Lead Pipeline — Technical Writeup

## What this is

A marketing operations platform that takes a messy inbound lead CSV, cleans it, matches and enriches each lead against internal and third-party systems, scores it using dual MQL + PQL/AQL engines, routes it to the appropriate treatment with enterprise routing overrides, enriches accounts with ML-driven propensity predictions, and uses an LLM grounded in historical data + propensity signals to generate specific, executable follow-up playbooks.

Built for: a live working session with the Runpod marketing ops team.

---

## The problem it solves

Marketing ops teams receive inbound lead files that are:
- **Dirty**: inconsistent country spellings, 17+ spellings of consent status, placeholder UTM values, company websites with/without `https://`
- **Duplicated**: the same person submitted multiple times with slightly different details
- **Unscored**: no signal on who is actually high-intent vs. low-intent
- **Unrouted**: "export to Salesforce" is not a routing strategy — you need to know who gets a sales call vs. a nurture email vs. suppression

The pipeline automates the entire journey from raw CSV to actionable, prioritised lead lists, with a human-in-the-loop review step for edge cases.

---

## The pipeline (9 stages)

### Stage 1: Analysis
The uploaded CSV is parsed and analysed for anomalies: duplicate emails, inconsistent country formats, consent value chaos, UTM placeholders, invalid emails, competitor domains. The analysis report gives the operator specific counts and examples for each anomaly type, and the LLM suggests cleaning instructions.

### Stage 2: Sanitize
Applies deterministic transformations:
- Country → ISO alpha-2 (via alias map: `UK` → `GB`, `usa` → `US`, etc.)
- Consent → tri-state boolean (`granted`/`TRUE`/`yes`/`1`/`opted_in` → `true`)
- UTM placeholders and casing normalised
- Emails normalised, classified as freemail/work, competitor-domain-flagged
- Deduplication by normalised email: keep most-recent `created_date` as primary, flag cross-record field conflicts

Produces a sanitized CSV and a diff report showing every transformation applied.

### Stage 3: Cohorts (BigQuery match)
A mock BigQuery customer table (deterministically seeded from the input) is queried to split leads into:
- **Existing cohort**: email or company+domain matches a known customer/signup record
- **New cohort**: net-new contacts

This matters for scoring and routing — existing customers with an active deal are handled differently from cold inbound leads.

### Stage 4: Enrichment (Clay + Propensity)
A mock Clay integration runs three workflows for each lead:
- **Identity resolution** (freemail emails only): maps a personal email to their work identity
- **Firmographic enrichment**: company headcount, industry, funding stage, tech stack
- **Intent scoring**: a 0-100 score based on simulated in-market signals (job postings, content engagement, G2 reviews, competitive research)

*(v3)* After Clay enrichment, the active `PropensityDataProvider` is called for each account. The mock BQML provider generates deterministic propensity scores, predicted ACV, next likely purchase, and behavioral drivers. Records are persisted to the `account_propensity` table. If the provider returns null for an account (~20% rate), the pipeline continues without propensity data for that account.

### Stage 5: CRM / MAP (HubSpot)
The HubSpot mock looks up each lead by normalised email and returns:
- Lifecycle stage (subscriber → customer)
- Open deal value and stage
- Campaign engagement history (emails opened/clicked, webinar registrations, etc.)
- Email opt-out / DNC status
- Lead score and owner assignment

**Hard rule (spec 5.3)**: EU leads with ambiguous consent are immediately flagged `"EU / Consent Verification Needed"` and routed to human review regardless of tier. No follow-up is allowed until the flag is manually cleared.

### Stage 6: Scoring
Three scoring phases run in sequence:

**Deterministic tier engine** (`src/lib/scoring/deterministic.ts`):
Implements the ICP routing memo's tier rules as a pure function:
- Tier 1 (sales queue): decision-maker title at AI/ML company with 11+ employees
- Tier 2 (nurture): technical ICs, decision-makers at small AI companies, ambiguous titles
- Tier 3 (self-serve): non-technical roles, non-software companies, students
- Suppress: invalid emails, competitor domains

Handles every named edge case: missing title → Tier 3, personal email + Tier 1 signals → keep Tier 1, decision-maker without verifiable company → Tier 2 + review flag.

**Probabilistic LLM engine** (`src/lib/scoring/llm.ts`):
Calls Gemini Flash with all available signals (title, company, cohort, Clay enrichment, HubSpot history) and returns a 0-100 score plus rationale. Processed in batches of 25-50 to stay within timeout limits.

**Divergence reconciliation**:
Both scores are mapped to a shared 0-100 scale (Tier 1 midpoint = 90, Tier 2 = 55, Tier 3 = 20). If `|llm_score - tier_midpoint| > THRESHOLD` (default 30 points), the lead is flagged for human review with the reason "Score divergence: deterministic vs. probabilistic".

**Phase 2: PQL/AQL scoring** *(v3)*:
After MQL scoring, leads are grouped into accounts by email domain (freemail domains excluded). Each user gets a PQL score based on role relevance (+12 for target roles like ML Engineer, DevOps, CTO), industry match (+8 for AI/ML), and product events from PostHog (API key creation, resource deployment, training jobs) with 14-day half-life time decay. Each account gets an AQL score combining firmographic fit (employee count, target industry, funding stage) with product usage (active seats, quota, prod deployment, SSO, compute hours). Status thresholds: `aql_account` (≥80), `pql_user` (avg PQL ≥50), `unqualified`.

**Phase 3: Propensity AQL boost** *(v3)*:
After PQL/AQL scoring, accounts with propensity data in the 80th+ percentile receive a +15 AQL point boost (capped at 100). If the boosted score reaches ≥80, the account status is upgraded to `aql_account`. This ensures high-propensity accounts receive prioritized routing even when their raw AQL score is slightly below threshold.

### Stage 7: Routing
Applies precedence rules:
1. Suppression (always wins)
2. EU consent hard gate (→ human_review)
3. Deterministic review flags (ambiguous title, etc.)
4. Score divergence flag
5. Aligned tier-based routing (Tier1→sales_queue, Tier2→nurture, Tier3→self_serve_newsletter)

### Stage 8: Follow-up Recommendations *(v2, enhanced in v3)*
For each lead routed to `sales_queue`, `nurture`, or `human_review`, Gemini generates 2-4 specific, actionable follow-up recommendations. Each recommendation includes:
- What to do (email sequence, demo invite, content asset, sales outreach, etc.)
- Why (rationale grounded in the lead's specific signals)
- Talking points or suggested email content
- A one-click HubSpot action to execute (create task, enroll in sequence, create deal, etc.)
- Estimated conversion lift based on similar historical leads

The LLM prompt includes a summary of 10-15 similar historical leads, their outcomes, and which treatments correlated with conversion — so recommendations aren't generic ("send a welcome email") but specific ("the GPU Benchmark Report + a follow-up demo offer converted 3 out of 4 similar ML engineers at 50-200 person AI companies within 3 weeks").

*(v3)* When propensity data is available for a lead's account, the follow-up prompt is enriched with a `## Propensity & Next Likely Purchase` section containing the percentile rank, predicted ACV, next likely product purchase, and behavioral drivers. The LLM uses this to generate product-specific pitch angles: "Account is in the 88th percentile to buy Dedicated VPC ($35k ACV). Offer a technical architecture review."

### Stage 9: Logs
A PII-free audit trail of every action taken in every stage, dual-written to the database and a JSONL file (simulating a BigQuery streaming insert). Each log entry has a drill-down link to the full lead record.

---

## The follow-up execution flow (v2 highlight)

When the operator clicks "Execute in HubSpot" on a recommendation:
1. The UI calls `POST /api/runs/[runId]/followup/[leadId]/execute` with the action type and parameters
2. The API route calls `executeHubSpotAction()` in `src/lib/mocks/hubspot-actions.ts`
3. The mock returns a realistic HubSpot response (object ID, URL, confirmation summary)
4. The result is persisted in `followup_executed_json` on the lead record
5. The UI updates to show the execution confirmation and a (mock) "View in HubSpot" link

In production, step 2 would be replaced with a real HubSpot API call using a Private App token. The interface is identical.

Supported actions:
- **create_task**: assigns a follow-up task to a sales rep with due date and priority
- **enroll_in_sequence**: enrolls the contact in a HubSpot email sequence
- **create_deal**: creates a new deal in the HubSpot pipeline with stage and estimated value
- **send_email**: queues a personalised email to the contact
- **create_campaign**: creates a new marketing campaign and adds the contact
- **schedule_meeting**: sends a meeting invite link to the contact

---

## Architecture decisions

See [decisions.md](decisions.md) for the full decision log. Key choices:
- **Next.js App Router**: server components for data-heavy pages, client components only where interactivity is needed
- **Turso/libSQL**: zero native-addon, works on Vercel serverless
- **Mocked integrations**: all external systems (BigQuery, Clay, HubSpot) are deterministic in-process mocks with realistic response shapes — swap in real calls by replacing one function per integration
- **HubSpot-only (v2)**: Salesforce removed in favour of HubSpot as the single CRM+MAP source
- **Gemini for LLM calls**: AI SDK `generateObject` with Zod schemas for type-safe structured output
- **Synthetic historical data**: 300 seeded leads with outcomes and treatment history, used to ground follow-up recommendations

---

## What makes this non-trivial

1. **The sanitize logic is real**: the country alias map, consent normalisation, UTM placeholder detection, and dedup logic are not toy examples — they handle the actual messy patterns in the source CSV (103 raw duplicate emails, 17+ consent spellings, 6 country alias variants for US alone).

2. **Three scoring layers that interact**: the deterministic tier engine encodes real business rules from the ICP memo; the LLM adds probabilistic signal; PQL/AQL adds product-usage depth; and propensity adds ML-predicted purchase intent. The divergence reconciliation step surfaces genuine disagreements for human review rather than silently picking one.

3. **The follow-up stage is grounded in multiple data sources**: the LLM isn't given an empty prompt — it receives the lead's full profile, HubSpot engagement history, routing decision, similar historical leads, and (v3) propensity predictions with specific product/ACV targets. The recommendations it produces are specific to that lead and grounded in a predicted expansion opportunity.

4. **The propensity engine is source-agnostic**: the `PropensityDataProvider` adapter means the app works identically whether propensity data comes from Google BQML, a custom Python XGBoost pipeline, or a third-party vendor. Swapping data sources requires implementing one interface (two methods), not touching pipeline or UI code.

5. **Graceful degradation everywhere**: missing propensity data doesn't break the pipeline — the AQL boost is skipped, the UI shows empty fields, and follow-ups fall back to non-propensity recommendations. The ~20% null rate in the mock provider specifically tests this path.

6. **The review queue is functional**: human reviewers can approve or reject leads, add reasons, and the decision is persisted and audited. The audit trail is PII-free at the log level with a separate drill-down link for the full record.

7. **Everything is live-updating**: the stepper, sidebar progress, and scorecard tiles poll for updates every few seconds — so the operator can watch stages complete in real time without refreshing.

---

## What would change in production

| POC | Production |
|---|---|
| Turso/libSQL (hosted) | Postgres (Neon, Supabase, or RDS) |
| Mock BigQuery | Real BigQuery with customer table |
| Mock Clay | Clay MCP or Clay API with real enrichment |
| Mock HubSpot | HubSpot API v3 with Private App token |
| Mock PostHog | Real PostHog Group Analytics API |
| Mock BQML propensity provider | Real BQML/MindsDB/6sense/Pocus adapter |
| `src/proxy.ts` password gate | Real auth (Clerk, Auth0, or Workos) |
| Synthetic historical data | Real HubSpot/Salesforce campaign history |
| Single-file CSV | Webhook ingest or Zapier/n8n trigger |
| Gemini Flash Lite | Gemini Pro or Claude Sonnet (for higher-stakes scoring) |
| Manual migration script | Auto-migration on deploy (e.g. Drizzle) |

---

## v3: PQL/AQL scoring and propensity engine

### Account-centric data model
Leads are grouped into accounts by email domain (freemail domains excluded). Each account accumulates firmographic data, PostHog product telemetry, and propensity predictions. The `accounts` table stores AQL scores and status; the `account_propensity` table stores ML-predicted purchase propensity.

### PQL/AQL dual scoring
- **PQL (per-user)**: scores based on role relevance (target roles like ML Engineer, DevOps, CTO get +12), industry match (+8), and product events (API key creation, resource deployment, training jobs). Events have time decay (14-day half-life) so recent activity weights higher.
- **AQL (per-account)**: combines firmographic fit (employee count, target industry, funding stage) with product usage from PostHog (active seats, quota usage, prod deployment, SSO, compute hours). Status thresholds: `aql_account` (≥80), `pql_user` (avg PQL ≥50), `unqualified`.

### Propensity engine (adapter pattern)
The `PropensityDataProvider` interface decouples the app from any specific ML pipeline:
```typescript
interface PropensityDataProvider {
  getPropensityForAccount(accountId, domain): Promise<AccountPropensityRecord | null>;
  batchUpsertPropensityData(records): Promise<{ ingested: number }>;
}
```
The reference implementation (`MockGoogleBqmlProvider`) generates deterministic propensity scores simulating Google's GA4/IaaS BQML toolkit. Each account gets:
- **Propensity score** (0.0 - 1.0) and **percentile rank** (1-99)
- **Predicted expansion ACV** ($10k-$75k, rounded to $5k)
- **Next likely purchase** (e.g. "Dedicated VPC & Network Isolation", "SSO/SAML Integration")
- **Key behavioral drivers** (e.g. "compute_growth_100_pct", "sso_settings_viewed")

### Ingestion webhook
External ML pipelines can POST pre-computed propensity data via `POST /api/ingest/propensity`:
```json
{
  "source": "google_bqml",
  "records": [
    {
      "accountId": "acct_123",
      "domain": "bigcorp.ai",
      "propensityScore": 0.88,
      "propensityPercentile": 88,
      "predictedAcv": 35000,
      "nextLikelyPurchase": "Dedicated VPC & SOC2 Compliance",
      "purchaseDrivers": ["compute_growth_100_pct", "security_docs_visited"],
      "modelSource": "google_bqml",
      "modelVersion": "v1.2-2026-08"
    }
  ]
}
```

### Pipeline integration
- **Enrichment (stage 4)**: After Clay enrichment, the active `PropensityDataProvider` is called for all accounts. Records are persisted to `account_propensity`. Graceful degradation if provider returns null.
- **Scoring (stage 6)**: Phase 3 applies a +15 AQL boost for accounts in the 80th+ propensity percentile.
- **Follow-up (stage 8)**: Propensity data injected into Gemini prompts with specific pitch guidance: "Account is in the 88th percentile to buy Dedicated VPC ($35k ACV). Offer a technical architecture review."

### UI enhancements
- **Account list**: propensity percentile badges (High/Med/Low), estimated ACV, next likely purchase tags
- **Account detail**: dedicated propensity section with percentile, ACV, NLP tag, and driver chips
- **Copilot**: `getHighPropensityAccounts` and `getRevenuePotentialSummary` tools for natural-language queries like "Which accounts have the highest propensity to buy enterprise compliance upgrades?"
