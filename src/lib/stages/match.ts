import fs from "node:fs";
import path from "node:path";
import { stageDir } from "../paths";
import { getLeads, setStageStatus, upsertLeads, upsertAccounts } from "../runs";
import { logAction } from "../audit";
import { readCsv, writeCsv, type CsvRecord } from "../csv";
import { bqMatchSignups } from "../mocks/bigquery";
import { FREEMAIL_DOMAINS, emailDomain } from "../constants";
import { hashId } from "../mocks/seed";

/** Extract corporate domain from an email, returning null for freemail/disposable. */
function extractCorporateDomain(email: string): string | null {
  const domain = emailDomain(email);
  if (!domain) return null;
  if (FREEMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

/** Infer role from job title for PQL scoring. */
function inferRole(title: string): string {
  if (!title) return "Unknown";
  const t = title.toLowerCase();
  if (/(devops|dev ops)/.test(t)) return "DevOps";
  if (/(mlops|ml ops)/.test(t)) return "MLOps";
  if (/(ml engineer|machine learning engineer)/.test(t)) return "ML Engineer";
  if (/(ai engineer|artificial intelligence)/.test(t)) return "AI Engineer";
  if (/(data scientist|data science)/.test(t)) return "Data Scientist";
  if (/(sre|site reliability)/.test(t)) return "SRE";
  if (/(platform engineer)/.test(t)) return "Platform Engineer";
  if (/(infrastructure)/.test(t)) return "Infrastructure Engineer";
  if (/(backend|back-end)/.test(t)) return "Backend Engineer";
  if (/(founder|ceo|chief executive)/.test(t)) return "Founder/CEO";
  if (/(cto|chief technology)/.test(t)) return "CTO";
  if (/(vp|vice president|svp|head of|director)/.test(t)) return "VP/Director";
  if (/(engineer|developer|architect)/.test(t)) return "Software Engineer";
  if (/(researcher|scientist)/.test(t)) return "Researcher";
  if (/(manager)/.test(t)) return "Manager";
  if (/(analyst)/.test(t)) return "Analyst";
  if (/(consultant|advisor)/.test(t)) return "Consultant";
  return "Other";
}

/** Spec 3.0: match sanitized (primary, non-duplicate) leads against the
 * simulated internal signup/customer database and split into the
 * "cohort-existing users" / "cohort-new users" files.
 *
 * v3: Also performs domain-based user-to-account rollup. */
export async function runMatchStage(runId: string) {
  await setStageStatus(runId, "match", "running");
  try {
    const rows = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
    const leads = rows.map((r) => JSON.parse(r.sanitized_json!) as CsvRecord);

    const { response, matchByEmail } = bqMatchSignups(leads);

    const existing: CsvRecord[] = [];
    const newCohort: CsvRecord[] = [];
    const updates: Array<{
      lead_id: string;
      cohort: string;
      matched_customer_id: string | null;
      role: string;
      account_id: string | null;
    }> = [];

    // Group leads by corporate domain for account rollup
    const domainToLeads = new Map<string, Array<{ lead: CsvRecord; leadId: string }>>();
    const leadIdToRow = new Map(rows.map((r) => [r.lead_id, r]));

    for (const lead of leads) {
      const match = matchByEmail.get(lead.email_normalized);
      const cohort = match ? "existing" : "new";
      const role = inferRole(lead.job_title || "");
      const domain = extractCorporateDomain(lead.email_normalized);

      if (match) {
        existing.push(lead);
      } else {
        newCohort.push(lead);
      }

      updates.push({
        lead_id: lead.lead_id,
        cohort,
        matched_customer_id: match?.customer_id ?? null,
        role,
        account_id: domain ? hashId("acct", `${runId}:${domain}`) : null,
      });

      if (domain) {
        if (!domainToLeads.has(domain)) domainToLeads.set(domain, []);
        domainToLeads.get(domain)!.push({ lead, leadId: lead.lead_id });
      }
    }

    await upsertLeads(runId, updates);

    // Create account records for domains with at least one lead
    const now = new Date().toISOString();
    const accountInserts = Array.from(domainToLeads.entries()).map(([domain, members]) => {
      const firstLead = members[0].lead;
      return {
        id: hashId("acct", `${runId}:${domain}`),
        run_id: runId,
        domain,
        name: firstLead.company || domain.split(".")[0],
        employee_count: null as number | null,
        industry: firstLead.industry || null,
        plan_tier: "free_developer",
        aql_score: null as number | null,
        fit_score: null as number | null,
        usage_score: null as number | null,
        aql_status: "unqualified",
        created_at: now,
      };
    });

    if (accountInserts.length > 0) {
      await upsertAccounts(accountInserts);
    }

    const outDir = stageDir(runId, "match");
    const methodBreakdown = response.rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.match_method] = (acc[r.match_method] ?? 0) + 1;
      return acc;
    }, {});
    try {
      fs.mkdirSync(outDir, { recursive: true });
      writeCsv(path.join(outDir, "cohort-existing.csv"), existing);
      writeCsv(path.join(outDir, "cohort-new.csv"), newCohort);
      fs.writeFileSync(
        path.join(outDir, "match-report.json"),
        JSON.stringify({
          bqResponse: response,
          existing_count: existing.length,
          new_count: newCohort.length,
          method_breakdown: methodBreakdown,
          accounts_created: accountInserts.length,
          multi_user_accounts: Array.from(domainToLeads.entries()).filter(([, m]) => m.length > 1).length,
        }, null, 2),
      );
    } catch {
      // Filesystem write may fail on read-only filesystem (Vercel) — DB is authoritative
    }

    await setStageStatus(runId, "match", "completed", { outputPath: outDir });
    await logAction({
      runId,
      stage: "match",
      action: "bq_signup_match_and_account_rollup",
      detail: {
        matched_count: existing.length,
        new_count: newCohort.length,
        method_breakdown: methodBreakdown,
        accounts_created: accountInserts.length,
        domains_with_multiple_users: Array.from(domainToLeads.entries()).filter(([, m]) => m.length > 1).length,
      },
    });
    return { existing_count: existing.length, new_count: newCohort.length, accounts_created: accountInserts.length };
  } catch (err) {
    await setStageStatus(runId, "match", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}

export async function getCohorts(runId: string): Promise<{ existing: CsvRecord[]; new: CsvRecord[] }> {
  const { getLeads } = await import("../runs");
  const leads = await getLeads(runId);
  const matched = leads.filter((l) => l.is_duplicate_primary === 1 && l.cohort);
  const existing: CsvRecord[] = [];
  const newCohort: CsvRecord[] = [];
  for (const lead of matched) {
    const parsed = lead.sanitized_json ? (JSON.parse(lead.sanitized_json) as CsvRecord) : null;
    if (!parsed) continue;
    if (lead.cohort === "existing") existing.push(parsed);
    else newCohort.push(parsed);
  }
  if (existing.length > 0 || newCohort.length > 0) {
    return { existing, new: newCohort };
  }
  try {
    const outDir = stageDir(runId, "match");
    const existingPath = path.join(outDir, "cohort-existing.csv");
    const newPath = path.join(outDir, "cohort-new.csv");
    return {
      existing: fs.existsSync(existingPath) ? readCsv(existingPath) : [],
      new: fs.existsSync(newPath) ? readCsv(newPath) : [],
    };
  } catch {
    return { existing: [], new: [] };
  }
}
