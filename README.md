# RP Lead Pipeline POC

A marketing-ops proof-of-concept that ingests an inbound lead CSV, cleans it, matches it against
internal systems, enriches/scores it, and routes each lead to the right follow-up treatment
(sales, nurture, self-serve, suppression, or human review) — with a human-in-the-loop review
queue and a PII-safe audit trail throughout.

## What's real vs. simulated

- **Real**: the Next.js app itself, the pandas ingestion/sanitize script, the deterministic ICP
  scoring engine, and the Gemini calls for probabilistic scoring (6.2) and the copilot chat (9.1).
- **Simulated**: Salesforce, HubSpot, BigQuery, and Clay. Each has a mock module
  (`src/lib/mocks/*.ts`) that returns realistic, deterministic payloads shaped like the real APIs,
  seeded from the input file so re-running the same CSV produces the same matches/scores every
  time. None of these call any real external service.

## Prerequisites

- Node.js 18+ and npm
- Python 3 with `pandas` installed (`python3 -c "import pandas"` should not error)
- A Gemini API key in `.env.local`:

  ```
  GEMINI_API_KEY=...
  GEMINI_MODEL=gemini-flash-lite-latest
  SCORE_DIVERGENCE_THRESHOLD=30
  ```

  `GEMINI_MODEL` and `SCORE_DIVERGENCE_THRESHOLD` are optional (defaults shown above).
  `SCORE_DIVERGENCE_THRESHOLD` controls how far apart the deterministic tier and the LLM's
  probabilistic score (both normalized to 0-100) can be before a lead is flagged for human
  review (spec 6.3/6.4).

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), which redirects to `/runs`. Upload a lead CSV
from `/runs/new` — this automatically runs the pandas anomaly analysis (stage 1.1/1.2). From
there, each stage page has a button to review results and advance to the next stage:

1. **Analysis** → review anomalies, add optional cleaning instructions, approve sanitize
2. **Sanitize** → review the diff, download the cleaned CSV, proceed to matching
3. **Cohorts** → simulated BigQuery signup match, split into existing/new user cohorts
4. **Enrichment** → simulated Clay identity resolution + firmographics + intent scoring
5. **CRM/MAP** → simulated Salesforce + HubSpot lookup, EU consent hard-rule enforcement
6. **Scoring** → deterministic ICP tier + Gemini probabilistic score + divergence reconciliation
7. **Routing** → final routing decision per the ICP memo, EU/divergence/edge-case review gating
8. **Logs** → PII-free audit trail with drill-down to the full linked record

The **Review queue** (linked from the stepper) is where a human approves or rejects any lead
routed there, and the **copilot** (bottom-right of any run page) answers questions about that
run's leads, scores, and history using tool calls grounded in the run's actual data.

## Tests

```bash
npm test
```

Runs unit tests for the deterministic ICP scoring engine (`src/lib/scoring/deterministic.ts`)
against real rows and edge cases from the inbound leads CSV.

## Data layout

- `scripts/lead_pipeline.py` — the pandas CLI (`analyze` / `sanitize` subcommands), self-contained
  so it can be lifted into a standalone tool/skill later without changes.
- `db/schema.sql` — SQLite schema (runs, run_stages, leads, review_actions, audit_log), applied
  idempotently on first use. `db/rp.db` is gitignored.
- `data/mock-seed/` — the simulated internal signup/customer database and Clay ground truth,
  generated once (lazily) and reused across runs for reproducibility. Gitignored.
- `data/runs/<runId>/` — per-run artifacts: the raw upload, analysis/sanitize reports, cohort
  files, mock request/response payloads, and the audit-log JSONL mirror. Gitignored.

## Deploying

This POC is designed to run locally via `next dev`. Deploying to Vercel is a deliberate later
step, not part of this build — `better-sqlite3` and the Python subprocess call would need to be
swapped for Vercel Postgres/Blob and either a ported TypeScript implementation or Vercel Sandbox,
respectively, before a real deployment.
