# User Manual — RP Lead Pipeline v2

## What you need

| Prerequisite | Notes |
|---|---|
| Node.js 18+ | `node --version` to check |
| A Turso account | Free tier at [turso.tech](https://turso.tech) — one database is enough |
| A Gemini API key | [aistudio.google.com](https://aistudio.google.com) → API Keys |
| A lead CSV | The pipeline expects the standard inbound lead format (see §4) |

---

## 1. Local setup

### Clone and install

```bash
git clone <repo-url> rp-lead-pipeline
cd rp-lead-pipeline
npm install
```

### Create your environment file

Create `.env.local` in the project root (never commit this file):

```
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=eyJ...
GEMINI_API_KEY=AIza...

# Optional — defaults shown
GEMINI_MODEL=gemini-flash-lite-latest
SCORE_DIVERGENCE_THRESHOLD=30
APP_PASSWORD=yourpassword
```

**Getting Turso credentials**:
1. Install the Turso CLI: `brew install tursodatabase/tap/turso`
2. Login: `turso auth login`
3. Create a database: `turso db create rp-pipeline`
4. Get the URL: `turso db show rp-pipeline --url`
5. Create a token: `turso db tokens create rp-pipeline`

**Getting the Gemini API key**:
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click "Get API key" → "Create API key"
3. Copy the key into `.env.local`

### Initialise the database

The database schema is applied automatically on first use. If you are upgrading from v1, run the migration first:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/migrate.ts
```

### Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If `APP_PASSWORD` is set, you'll be prompted for it first.

---

## 2. Running the pipeline

### Step 1: Upload a lead file

1. Go to **New Upload** in the top nav
2. Drag and drop your lead CSV onto the upload area (or click to browse)
3. The file is uploaded and stage 1 (Analysis) starts automatically

### Step 2: Review the analysis report

The analysis page shows:
- **Duplicate emails**: how many, and which ones conflict
- **Country anomalies**: which values need alias mapping
- **Consent anomalies**: how many non-standard consent values were found
- **UTM placeholders**: `test`, `null`, `{{utm_source}}` etc.
- **Suspicious emails**: invalid format, disposable domains, competitor domains

You can add **optional cleaning instructions** in the text box (e.g. "treat all `owner` titles as Tier 2 not Tier 1"). These are passed to the sanitize stage.

Click **Approve & Sanitize** to proceed.

### Step 3: Sanitize

The sanitize page shows:
- A diff of the cleaned data (original vs. sanitized)
- A downloadable sanitized CSV

Click **Proceed to Matching** to continue.

### Step 4–7: Remaining pipeline stages

From the Cohorts page onwards, you can either:
- **Step through manually**: click the "Proceed to..." button on each page
- **Run all stages**: click the **Run All Stages** button in the right sidebar

Run All Stages executes Sanitize → Cohorts → Enrichment → CRM → Scoring → Routing → Follow-up in sequence with automatic approvals. It takes 1-5 minutes depending on CSV size (the LLM scoring and follow-up stages are the slowest steps).

### Step 5: CRM / MAP (HubSpot)

This page shows each lead's HubSpot status: lifecycle stage, open deals, email opt-out, DNC flag, and HubSpot lead score. EU leads with ambiguous consent are highlighted — these cannot be contacted until the flag is resolved in the human review queue.

### Step 6: Scoring

The scoring page shows both engines' outputs side by side:
- **Deterministic tier** (rules-based, from the ICP memo)
- **LLM score** (0-100, Gemini probabilistic)
- **Divergence** (highlighted in amber if > threshold)
- **Final tier** (what routing will use)

Click any lead ID to see the full scoring rationale.

### Step 7: Routing

The routing page shows the final routing decision for each lead:
- **Sales queue**: hot leads going to a rep
- **Nurture**: leads needing more time
- **Human review**: flagged leads (divergence, EU consent, edge cases)
- **Self-serve / newsletter**: low-intent, self-directed
- **Suppressed**: invalid, competitor, or DNC

### Step 8: Follow-up Recommendations *(v2 feature)*

This is the key new page in v2. For each lead in the sales queue, nurture track, or human review queue, the LLM generates 2-4 specific, actionable follow-up recommendations.

**Reading a recommendation card:**
- The **title** and **channel** tell you what kind of action it is
- The **rationale** explains why — often referencing historical similar leads
- **Talking points** are specific to this person's role, company, and signals
- **Suggested content** is a draft email or message you can customise
- **Estimated conversion lift** gives context on expected impact

**Executing a recommendation:**
Click **Execute in HubSpot** to run the recommended action. The system creates the task, deal, or sequence enrollment in HubSpot (currently mocked — see deployment notes for production wiring) and shows you the confirmation with a link to the object.

**Filtering by routing decision:**
Use the filter chips at the top to view only sales queue leads, only nurture leads, etc.

### Review queue

Click **Review** in the stepper to open the human review queue. Here you can:
- See all leads flagged for human review and why
- Approve or reject each lead (with an optional reason)
- Filter by tier (Tier 1, Tier 2, Tier 3) or review status (pending, approved, rejected)

### Logs

The Logs page shows the PII-free audit trail for this run. Click any entry's "full record" link to see the complete lead record for that log event.

---

## 3. The copilot

The copilot panel (right sidebar on desktop, slide-up button on mobile) lets you ask free-form questions about the current run. Examples:

- *"Why is lead L0042 in the human review queue?"*
- *"How many Tier 1 leads are in the EU?"*
- *"Which leads have an LLM score above 80 but a Tier 3 deterministic tier?"*
- *"List all leads from companies with more than 200 employees"*
- *"What's the breakdown of routing decisions by industry?"*

The copilot is grounded in that run's actual data — it uses database query tools rather than guessing.

---

## 4. Lead CSV format

The pipeline expects a CSV with these columns (extra columns are ignored):

| Column | Required | Notes |
|---|---|---|
| `first_name` | ✓ | |
| `last_name` | ✓ | |
| `email` | ✓ | Can be messy; will be normalised |
| `company` | ✓ | |
| `company_website` | | With or without `https://` |
| `job_title` | | Used for tier assignment |
| `company_size` | | E.g. "11-50", "201-500" |
| `industry` | | E.g. "SaaS", "AI/ML" |
| `country` | | Any common format; normalised to ISO alpha-2 |
| `marketing_consent` | | Any common format; normalised to true/false/unknown |
| `utm_source` | | |
| `utm_medium` | | |
| `utm_campaign` | | |
| `created_date` | | Used for dedup tie-breaking |
| `lead_id` | | Auto-generated if missing |

---

## 5. Settings

Go to **Settings** to configure:
- **Score divergence threshold**: how many points apart the deterministic and LLM scores need to be before a lead is flagged for review (default: 30)
- **Slack webhook URL**: for notifications when the review queue has new items
- **Email notifications**: for daily summary emails

---

## 6. Deployment to Vercel

### Pre-deployment checklist

- [ ] `.env.local` is in `.gitignore` (it is by default)
- [ ] Source CSV and DOCX files are not in the repo (check `data/` directory)
- [ ] Gemini API key, Turso credentials are set only in `.env.local` / Vercel env vars
- [ ] Run `npm run build` locally to catch any build errors before deploying

### Deploy

```bash
npm i -g vercel@latest
vercel login
vercel --prod
```

During the first deploy, Vercel will prompt for environment variables. Add:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `GEMINI_API_KEY`
- `APP_PASSWORD` (if you want the password gate)
- `GEMINI_MODEL` (optional — defaults to `gemini-flash-lite-latest`)
- `SCORE_DIVERGENCE_THRESHOLD` (optional — defaults to `30`)

### Post-deploy

1. The database schema is applied automatically on first request
2. If upgrading from v1: run the migration once after deploy:
   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/migrate.ts
   ```
3. Visit your Vercel URL to confirm the app loads and the password gate works

### Subsequent deploys

```bash
vercel --prod
```

Or push to the connected GitHub branch if you've set up Vercel's GitHub integration.

---

## 7. Running tests

```bash
npm test
```

Runs unit tests for the deterministic ICP scoring engine (`src/lib/scoring/deterministic.ts`) against known rows. Tests cover:
- All three tiers (Tier 1, Tier 2, Tier 3)
- All suppress rules (competitor domains, invalid emails)
- All named edge cases (missing title, personal email + Tier 1 signals, etc.)

---

## 8. Troubleshooting

**The app shows "TURSO_DATABASE_URL is not set"**
→ Check your `.env.local` file exists in the project root and contains the correct variable names (no extra spaces, no quotes around values).

**Scoring stage times out**
→ Large CSV files (1500+ leads) can hit the 300s Vercel function timeout on the scoring stage. Try running scoring from the local dev server instead of Vercel for very large files.

**"Module not found" error after adding/removing files**
→ Stop the dev server, delete `.next/`, and restart: `rm -rf .next && npm run dev`.

**Follow-up recommendations not generating**
→ (1) Ensure the routing stage has completed first. (2) Check that `GEMINI_API_KEY` is set and valid. (3) Check the server logs for Gemini API errors.

**Turso "too many connections" error**
→ The libSQL client is module-level-singleton in `src/lib/db.ts`. This should not happen in practice — if it does, check for multiple `getDb()` import paths causing multiple client instances.
