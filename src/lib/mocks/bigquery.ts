import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MOCK_SEED_ROOT } from "../paths";
import type { CsvRecord } from "../csv";
import { hashUnit, hashId } from "./seed";

const CUSTOMERS_PATH = path.join(MOCK_SEED_ROOT, "bq-customers.json");

let cachedCustomers: MockCustomerRecord[] | null = null;

/**
 * Simulated internal signup/customer database (spec 3.0), since no real BQ
 * table is available for this POC. Generated once, lazily, from whatever
 * sanitized leads are first seen, then persisted to disk and reused for
 * every subsequent run -- this is what makes it behave like a stable backend
 * rather than a per-run fixture, and what makes matches reproducible across
 * repeat runs of the same input file.
 */
export interface MockCustomerRecord {
  customer_id: string;
  email_normalized: string;
  company_normalized: string;
  last_name_normalized: string;
  signup_date: string;
  /** null = not yet scored internally -- exercises spec 4.3's "if not, send to clay" branch. */
  intent_score: number | null;
}

function loadOrInitCustomerTable(sanitizedLeads: CsvRecord[]): MockCustomerRecord[] {
  if (fs.existsSync(CUSTOMERS_PATH)) {
    const loaded = JSON.parse(fs.readFileSync(CUSTOMERS_PATH, "utf-8"));
    cachedCustomers = loaded;
    return loaded;
  }
  const customers: MockCustomerRecord[] = [];
  for (const lead of sanitizedLeads) {
    const email = lead.email_normalized;
    if (!email) continue;
    if (hashUnit(`signup:${email}`) < 0.15) {
      const hasIntent = hashUnit(`hasintent:${email}`) < 0.4;
      customers.push({
        customer_id: hashId("CUST", email),
        email_normalized: email,
        company_normalized: (lead.company || "").trim().toLowerCase(),
        last_name_normalized: (lead.last_name || "").trim().toLowerCase(),
        signup_date: lead.created_date || "",
        intent_score: hasIntent ? Math.round(hashUnit(`score:${email}`) * 100) : null,
      });
    }
  }
  try {
    fs.mkdirSync(MOCK_SEED_ROOT, { recursive: true });
    fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify(customers, null, 2));
  } catch {
    // Filesystem write may fail on Vercel — in-memory generation is sufficient
  }
  cachedCustomers = customers;
  return customers;
}

export interface BqQueryResponse<T> {
  jobReference: { jobId: string };
  jobComplete: boolean;
  schema: { fields: Array<{ name: string; type: string }> };
  rows: T[];
  totalRows: string;
}

export interface SignupMatch {
  email_normalized: string;
  customer_id: string;
  match_method: "exact_email" | "company_name_match";
}

/** BQ `jobs.query`-shaped simulated response for the signup/customer lookup. */
export function bqMatchSignups(sanitizedLeads: CsvRecord[]): {
  response: BqQueryResponse<SignupMatch>;
  matchByEmail: Map<string, MockCustomerRecord & { match_method: SignupMatch["match_method"] }>;
} {
  const customers = loadOrInitCustomerTable(sanitizedLeads);
  const byEmail = new Map(customers.map((c) => [c.email_normalized, c]));
  const byCompanyLastName = new Map(customers.map((c) => [`${c.company_normalized}::${c.last_name_normalized}`, c]));

  const matches: SignupMatch[] = [];
  const matchByEmail = new Map<string, MockCustomerRecord & { match_method: SignupMatch["match_method"] }>();

  for (const lead of sanitizedLeads) {
    const email = lead.email_normalized;
    if (!email) continue;
    let customer = byEmail.get(email);
    let method: SignupMatch["match_method"] = "exact_email";
    if (!customer && lead.email_type === "freemail") {
      const key = `${(lead.company || "").trim().toLowerCase()}::${(lead.last_name || "").trim().toLowerCase()}`;
      customer = byCompanyLastName.get(key);
      method = "company_name_match";
    }
    if (customer) {
      matches.push({ email_normalized: email, customer_id: customer.customer_id, match_method: method });
      matchByEmail.set(email, { ...customer, match_method: method });
    }
  }

  return {
    response: {
      jobReference: { jobId: `job_${randomUUID()}` },
      jobComplete: true,
      schema: {
        fields: [
          { name: "email_normalized", type: "STRING" },
          { name: "customer_id", type: "STRING" },
          { name: "match_method", type: "STRING" },
        ],
      },
      rows: matches,
      totalRows: String(matches.length),
    },
    matchByEmail,
  };
}

/** Looks up a single customer's precomputed intent score (spec 4.3: check
 * internal records before falling back to Clay). Returns null if the lead
 * isn't a known customer or has no internally-recorded score yet. */
export function getInternalIntentScore(emailNormalized: string): number | null {
  let customers = cachedCustomers;
  if (!customers) {
    if (!fs.existsSync(CUSTOMERS_PATH)) return null;
    customers = JSON.parse(fs.readFileSync(CUSTOMERS_PATH, "utf-8"));
    cachedCustomers = customers;
  }
  return customers!.find((c) => c.email_normalized === emailNormalized)?.intent_score ?? null;
}
