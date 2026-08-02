# Architecture & Design Decisions

This document records key decisions made during the design and build of the RP Lead Pipeline POC, v1 and v2. Decisions are recorded at the time they were made; where v2 changes or supersedes a v1 decision, both are noted.

---

## Technology choices

### Next.js 16 App Router (not v13/14 patterns)
**Decision**: Build on Next.js 16.2 with App Router.
**Rationale**: App Router gives us true server components (data fetched at request time, no client-side waterfall for initial table renders), route-level streaming, and file-system routing that maps cleanly onto the pipeline's stage hierarchy (`/runs/[runId]/scoring`, etc.). RSC also means zero client-side bundle for heavy data-loading pages.
**Trade-off**: Next.js 16 has breaking API changes (middleware renamed to `proxy.ts`, etc.) vs the more widely documented v13/v14. We added `AGENTS.md` to surface this risk to future AI sessions.

### Turso / libSQL over local SQLite
**Decision**: Use Turso (hosted libSQL) rather than `better-sqlite3` or a local SQLite file.
**Rationale**: `better-sqlite3` is a native addon — it would require a native compile step on Vercel, adding complexity. libSQL via `@libsql/client` is pure JS and works on Vercel's serverless runtime out of the box. Turso also survives a local machine sleep/restart without losing state.
**Trade-off**: Requires a Turso account and credentials (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`). The schema must be applied once manually; subsequent schema changes need a migration script (see `scripts/migrate.ts`).

### Gemini via AI SDK (not OpenAI)
**Decision**: Use `@ai-sdk/google` + Gemini Flash for both probabilistic scoring (stage 6.2) and the copilot chat (stage 9.1).
**Rationale**: Gemini Flash Lite is fast and cheap enough to score ~1900 leads in batches of 25-50 per call without hitting timeout limits on Vercel functions (300s default). The AI SDK's `generateObject` gives us typed, schema-validated structured output via Zod.
**Trade-off**: Requires `GEMINI_API_KEY`. Model output is probabilistic — same input can produce slightly different scores on re-run. Deterministic scoring (spec 6.1) is kept as the authoritative tier; LLM score adds a probabilistic signal for divergence detection.

### Mocked external integrations (Salesforce/HubSpot/BigQuery/Clay in v1; HubSpot/BigQuery/Clay in v2)
**Decision**: Implement Salesforce, HubSpot, BigQuery, and Clay as deterministic in-process mocks rather than real API calls.
**Rationale**: (1) This is a POC — we don't want to touch a live workspace. (2) Determinism: same CSV produces same mock payloads every time, making the app reliable for demos. (3) No API credentials required beyond Gemini and Turso. (4) The mock shapes are faithful to the real API response schemas, so swapping in real calls later is a targeted replacement, not a full redesign.
**See also**: v2 Salesforce removal below.

---

## v2-specific decisions

### Remove Salesforce, consolidate on HubSpot (v2)
**Decision**: Remove `src/lib/mocks/salesforce.ts` entirely. HubSpot is the single source of truth for both CRM (contacts, deals, lifecycle stages) and marketing automation (sequences, campaigns, engagement history).
**Rationale**: The original dual-CRM setup reflected a "what if the customer uses both?" hedging approach. In practice, the vast majority of marketing-ops teams use one primary CRM. HubSpot covers both CRM and MAP natively (via its Marketing Hub + Sales Hub), making it the more natural single system. Simplifying to one source removes the data-merge complexity in `src/lib/stages/crm.ts` and makes the follow-up action execution clearer (all actions target one system).
**Impact**: `crm.ts` stage, `crm/route.ts` API, and `crm/page.tsx` all simplified. The HubSpot mock (`src/lib/mocks/hubspot.ts`) was expanded to include campaign history, deal associations, email engagement, owner assignment, and lead score — previously these came from the Salesforce mock.

### Add follow-up recommendations stage (v2)
**Decision**: Add a new pipeline stage (`followup`) between routing and logs. This stage calls Gemini once per eligible lead (sales_queue, nurture, human_review routing decisions) and generates 2-4 structured, actionable follow-up recommendations.
**Rationale**: Routing tells you *where* a lead goes, but not *what to do* with them. The gap between "nurture" and an actual campaign is significant — marketing teams spend days figuring out the right treatment. By grounding the LLM in (1) the lead's full profile, (2) their HubSpot engagement history, and (3) synthetic historical data from similar leads who converted, we give immediate, specific guidance rather than generic advice.
**Design choices within this**:
- One LLM call per lead (not batched), because recommendations need to be highly personalised and the prompt is long.
- Recommendations are stored as structured JSON (`followup_json` on the lead record), not free-form text.
- Each recommendation includes an `hubspot_action` object specifying exactly which HubSpot API call to make, so execution can be one click.
- Self-serve and suppressed leads are excluded (no actionable follow-up needed).

### Synthetic historical data for recommendation grounding (v2)
**Decision**: Generate a deterministic synthetic dataset of 300 historical leads with profiles, treatment sequences, and conversion outcomes. The follow-up LLM prompt includes the top-10 similar historical leads and a summary of which treatments correlated with conversion.
**Rationale**: Without historical context, the LLM would produce generic recommendations ("send a welcome email"). With concrete examples ("3 similar ML engineers at 50-200 person AI companies converted within 21 days after the GPU Benchmark Report + a demo offer; here are their stats"), the recommendations are specific and credible for a demo context.
**Trade-off**: The historical data is synthetic — in a real deployment, this would come from the actual HubSpot/CRM history. The seed function is deterministic (hash-seeded), so it can be reproduced and reasoned about consistently.

### Execute actions against mock HubSpot (v2)
**Decision**: The "Execute in HubSpot" button on the follow-up page calls a real API route (`/api/runs/[runId]/followup/[leadId]/execute`) which invokes `executeHubSpotAction()` in `src/lib/mocks/hubspot-actions.ts`. This returns a realistic HubSpot response shape and persists the execution record in `followup_executed_json` on the lead record.
**Rationale**: Execution needs to feel complete — pressing a button should produce a visible result (object ID, URL, summary) that the UI can display. The mock keeps this believable without touching a real HubSpot account during the POC.
**Swap path to production**: Replace `executeHubSpotAction` with real HubSpot API calls (`https://api.hubspot.com/crm/v3/objects/tasks`, etc.) using an OAuth token or private app API key. The interface is identical.

### Database migration approach (v2)
**Decision**: Provide `scripts/migrate.ts` as a manual one-time migration script rather than an auto-migration on app startup.
**Rationale**: Auto-migration on startup is risky in serverless environments — multiple cold-start instances could race to apply the same migration. For a POC with a single developer, a manual `npx tsx scripts/migrate.ts` with `OR IGNORE` / try-catch is simpler and safer.

---

## Data decisions

### Deduplication: keep most recent, flag conflicts (not silently drop)
**Decision**: When two rows share a normalised email, keep the one with the most recent `created_date` as the primary, mark others as `is_duplicate_primary = 0`, and set `dedup_conflict_flag = 1` if any non-date field differs between the rows.
**Rationale**: Silently dropping duplicates hides information that a human reviewer might care about (e.g. a lead submitted twice with different job titles). The conflict flag surfaces this for the review queue. The "most recent" heuristic is easy to audit and matches typical CRM dedup practice.

### EU consent hard rule before routing
**Decision**: EU leads with `consent_verified = "ambiguous"` are unconditionally routed to `human_review` regardless of tier, scored as `eu_consent_flag = "EU / Consent Verification Needed"`, and blocked from any marketing follow-up until the flag is cleared.
**Rationale**: GDPR requires a verified legal basis for marketing communication to EU residents. "Ambiguous" means we cannot establish either explicit consent or a legitimate interest basis from the available data. Routing to human review is the only compliant default — not nurture, not sales, not self-serve.

### Score divergence threshold: 30 points (configurable)
**Decision**: Default divergence threshold is 30 points (on a shared 0-100 scale). Configurable via `SCORE_DIVERGENCE_THRESHOLD` env var and the Settings page at runtime.
**Rationale**: 30 points represents a full tier-band distance (e.g. LLM says 75 = Tier 1 territory but deterministic says Tier 2 = midpoint 55; delta = 20 = no flag; but if LLM says 85 and deterministic midpoint is 20 = Tier 3, delta = 65 = clear flag). A 30-point threshold catches true disagreements without over-flagging minor probabilistic variance. The runtime configurability lets operators tune it without a redeploy.

### PII-free audit log
**Decision**: The `audit_log` table and JSONL file strip any key matching a PII pattern (email, name, phone, address, company, website, job_title) from the `detail_json` field. The full lead record is accessible via a separate drill-down link (`/api/runs/[runId]/logs/[entryId]/record`) that requires an explicit click.
**Rationale**: Audit logs are often forwarded to SIEM systems, shared with compliance teams, or aggregated at scale. Keeping PII out of the log body by default prevents accidental PII leakage while still allowing authorised drill-down. This mirrors best-practice in real compliance tooling (Segment Protocols, Snowplow, etc.).
