import { parse } from "csv-parse/sync";
import {
  FREEMAIL_DOMAINS,
  COMPETITOR_DOMAINS,
  DISPOSABLE_DOMAINS,
  ACADEMIC_DOMAIN_SUFFIXES,
  COUNTRY_ALIASES,
  SUSPICIOUS_COUNTRY_VALUES,
  CONSENT_ALIASES,
  UTM_PLACEHOLDER_VALUES,
  UTM_VALUE_ALIASES,
  emailDomain,
} from "../constants";

// ---------------------------------------------------------------------------
// Regex patterns (mirroring Python)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WHITESPACE_ISSUE_RE = /^\s|\s$|\s{2,}/;
const REPEATED_CHAR_RE = /^(.)\1*$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function isMalformedEmail(email: string): boolean {
  return !EMAIL_RE.test(email.trim());
}

function isSuspiciousFakeEmail(email: string): boolean {
  const local = email.includes("@") ? email.split("@", 2)[0] : email;
  const domain = email.includes("@") ? emailDomain(email).split(".", 1)[0] : "";
  return REPEATED_CHAR_RE.test(local) || (domain !== "" && REPEATED_CHAR_RE.test(domain));
}

function classifyEmail(email: string): {
  email_normalized: string;
  malformed: boolean;
  domain: string;
  is_freemail: boolean;
  is_competitor_domain: boolean;
  is_disposable_domain: boolean;
  is_academic_domain: boolean;
  is_suspicious_fake: boolean;
} {
  const e = email.trim().toLowerCase();
  const domain = emailDomain(e);
  return {
    email_normalized: e,
    malformed: isMalformedEmail(e),
    domain,
    is_freemail: FREEMAIL_DOMAINS.has(domain),
    is_competitor_domain: COMPETITOR_DOMAINS.has(domain),
    is_disposable_domain: DISPOSABLE_DOMAINS.has(domain),
    is_academic_domain: ACADEMIC_DOMAIN_SUFFIXES.some((suf) => domain.endsWith(suf)),
    is_suspicious_fake: isSuspiciousFakeEmail(e),
  };
}

function normalizeCountry(raw: string): { value: string; suspicious: boolean; raw: string; unmapped?: boolean } {
  const v = raw.trim();
  if (SUSPICIOUS_COUNTRY_VALUES.has(v.toLowerCase()) || v === "") {
    return { value: "", suspicious: v !== "" && v.toLowerCase() !== "", raw };
  }
  const iso = COUNTRY_ALIASES[v.toLowerCase()];
  if (iso) {
    return { value: iso, suspicious: false, raw };
  }
  return { value: v, suspicious: false, unmapped: true, raw };
}

function normalizeConsent(raw: string): string {
  return CONSENT_ALIASES[raw.trim().toLowerCase()] ?? "unknown";
}

function normalizeUtm(raw: string, field: string): { value: string; is_placeholder: boolean } {
  const decoded = decodeURIComponent(raw).trim();
  if (UTM_PLACEHOLDER_VALUES.has(decoded.toLowerCase())) {
    return { value: "", is_placeholder: true };
  }
  const folded = UTM_VALUE_ALIASES[decoded.toLowerCase()];
  if (folded) {
    return { value: folded, is_placeholder: false };
  }
  let cleaned = collapseWhitespace(decoded).toLowerCase();
  const sep = field === "utm_campaign" ? "-" : "_";
  cleaned = cleaned.replace(/ /g, sep);
  return { value: cleaned, is_placeholder: false };
}

function normalizeWebsite(raw: string): { value: string; valid: boolean; had_protocol: boolean } {
  const v = raw.trim();
  if (!v) {
    return { value: "", valid: false, had_protocol: false };
  }
  const had_protocol = /^https?:\/\//i.test(v);
  let bare = v.replace(/^https?:\/\//i, "");
  bare = bare.replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
  const valid = bare.includes(".") && !bare.includes(" ");
  return { value: bare, valid, had_protocol };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnInfo {
  name: string;
  dtype: string;
  null_count: number;
  null_pct: number;
  distinct_count: number;
}

export interface DuplicateGroup {
  email_normalized: string;
  lead_ids: string[];
  created_dates: string[];
}

export interface Recommendation {
  field: string;
  issue: string;
  proposed_fix: string;
  affected_rows: number;
}

export interface AnalysisReport {
  meta: {
    input_file: string;
    row_count: number;
    column_count: number;
    generated_at: string;
  };
  columns: ColumnInfo[];
  duplicates: {
    exact_email_dupes: number;
    normalized_email_dupes: number;
    sample_groups: DuplicateGroup[];
  };
  anomalies: {
    country: {
      distinct_raw_values: number;
      grouped_variants: Record<string, string[]>;
      suspicious_value_count: number;
      unmapped_values: string[];
    };
    utm: Record<string, {
      placeholder_counts: Record<string, number>;
      placeholder_total: number;
      distinct_real_values_after_normalization: number;
    }>;
    marketing_consent: {
      distinct_spellings: number;
      value_counts: Record<string, number>;
      proposed_boolean_mapping: Record<string, string>;
    };
    job_title: {
      null_count: number;
      whitespace_issue_count: number;
      case_issue_count: number;
    };
    company: {
      whitespace_issue_count: number;
      variant_groups: Array<{ normalized: string; variants: string[] }>;
    };
    email: {
      malformed_count: number;
      competitor_domain_hits: number;
      disposable_domain_hits: number;
      suspicious_fake_hits: number;
      freemail_count: number;
      work_domain_count: number;
    };
    company_website: {
      missing_count: number;
      protocol_missing_count: number;
      malformed_count: number;
    };
  };
  recommendations: Recommendation[];
}

// ---------------------------------------------------------------------------
// Main analyze function
// ---------------------------------------------------------------------------

export function analyzeLeadsCsv(csvContent: string): AnalysisReport {
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  const n = records.length;
  const columnNames = n > 0 ? Object.keys(records[0]) : [];

  // --- columns ---
  const columns: ColumnInfo[] = columnNames.map((col) => {
    let blank = 0;
    const distinctVals = new Set<string>();
    for (const row of records) {
      const v = (row[col] ?? "").trim();
      if (v === "") blank++;
      distinctVals.add(row[col] ?? "");
    }
    return {
      name: col,
      dtype: "string",
      null_count: blank,
      null_pct: n ? Math.round((100 * blank) / n * 100) / 100 : 0,
      distinct_count: distinctVals.size,
    };
  });

  // --- duplicates ---
  const emailCounts = new Map<string, number>();
  const normEmailCounts = new Map<string, number>();
  const normEmailGroups = new Map<string, number[]>();

  for (let i = 0; i < records.length; i++) {
    const raw = records[i]["email"] ?? "";
    const norm = raw.trim().toLowerCase();

    emailCounts.set(raw, (emailCounts.get(raw) ?? 0) + 1);
    normEmailCounts.set(norm, (normEmailCounts.get(norm) ?? 0) + 1);

    if (!normEmailGroups.has(norm)) {
      normEmailGroups.set(norm, []);
    }
    normEmailGroups.get(norm)!.push(i);
  }

  let rawEmailDupes = 0;
  for (const count of emailCounts.values()) {
    if (count > 1) rawEmailDupes += count - 1;
  }

  let normalizedDupes = 0;
  for (const count of normEmailCounts.values()) {
    if (count > 1) normalizedDupes += count - 1;
  }

  const sampleGroups: DuplicateGroup[] = [];
  for (const [key, indices] of normEmailGroups) {
    if (indices.length < 2) continue;
    sampleGroups.push({
      email_normalized: key,
      lead_ids: indices.map((i) => records[i]["lead_id"] ?? ""),
      created_dates: indices.map((i) => records[i]["created_date"] ?? ""),
    });
    if (sampleGroups.length >= 15) break;
  }

  // --- country ---
  const countryVariants = new Map<string, Set<string>>();
  let suspiciousCount = 0;
  const unmappedValues = new Set<string>();

  for (const row of records) {
    const raw = row["country"] ?? "";
    const r = normalizeCountry(raw);
    if (r.suspicious) {
      suspiciousCount++;
    } else if (r.unmapped) {
      unmappedValues.add(raw.trim());
    } else if (r.value) {
      if (!countryVariants.has(r.value)) {
        countryVariants.set(r.value, new Set());
      }
      countryVariants.get(r.value)!.add(raw.trim());
    }
  }

  const groupedVariants: Record<string, string[]> = {};
  for (const [k, v] of countryVariants) {
    if (v.size > 1) {
      groupedVariants[k] = [...v].sort();
    }
  }

  // --- utm ---
  const utmReport: Record<string, {
    placeholder_counts: Record<string, number>;
    placeholder_total: number;
    distinct_real_values_after_normalization: number;
  }> = {};

  for (const field of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const placeholderCounts = new Map<string, number>();
    const realValues = new Set<string>();

    for (const row of records) {
      const raw = row[field] ?? "";
      const r = normalizeUtm(raw, field);
      if (r.is_placeholder) {
        placeholderCounts.set(raw, (placeholderCounts.get(raw) ?? 0) + 1);
      } else if (r.value) {
        realValues.add(r.value);
      }
    }

    let placeholderTotal = 0;
    const placeholderCountsObj: Record<string, number> = {};
    for (const [k, v] of placeholderCounts) {
      placeholderCountsObj[k] = v;
      placeholderTotal += v;
    }

    utmReport[field] = {
      placeholder_counts: placeholderCountsObj,
      placeholder_total: placeholderTotal,
      distinct_real_values_after_normalization: realValues.size,
    };
  }

  // --- marketing_consent ---
  const consentCounts: Record<string, number> = {};
  for (const row of records) {
    const v = row["marketing_consent"] ?? "";
    consentCounts[v] = (consentCounts[v] ?? 0) + 1;
  }
  const proposedMapping: Record<string, string> = {};
  for (const k of Object.keys(consentCounts)) {
    proposedMapping[k] = normalizeConsent(k);
  }

  // --- job_title ---
  let jtBlank = 0;
  let jtWsIssue = 0;
  let jtCaseIssue = 0;
  for (const row of records) {
    const v = row["job_title"] ?? "";
    if (v.trim() === "") jtBlank++;
    if (WHITESPACE_ISSUE_RE.test(v)) jtWsIssue++;
    if (v !== "" && (v === v.toUpperCase() || v === v.toLowerCase())) jtCaseIssue++;
  }

  // --- company ---
  let companyWsIssue = 0;
  const companyGroups = new Map<string, Set<string>>();
  for (const row of records) {
    const v = row["company"] ?? "";
    if (WHITESPACE_ISSUE_RE.test(v)) companyWsIssue++;
    const key = collapseWhitespace(v).toLowerCase();
    if (key) {
      if (!companyGroups.has(key)) {
        companyGroups.set(key, new Set());
      }
      companyGroups.get(key)!.add(v);
    }
  }

  const companyVariantGroups: Array<{ normalized: string; variants: string[] }> = [];
  for (const [k, v] of companyGroups) {
    if (v.size > 1) {
      companyVariantGroups.push({ normalized: k, variants: [...v].sort() });
      if (companyVariantGroups.length >= 20) break;
    }
  }

  // --- email ---
  let malformed = 0;
  let competitorHits = 0;
  let disposableHits = 0;
  let freemailCount = 0;
  let workCount = 0;
  let suspiciousFakeHits = 0;

  for (const row of records) {
    const raw = row["email"] ?? "";
    const c = classifyEmail(raw);
    if (c.malformed) malformed++;
    if (c.is_competitor_domain) competitorHits++;
    if (c.is_disposable_domain) disposableHits++;
    if (c.is_suspicious_fake) suspiciousFakeHits++;
    if (c.is_freemail) {
      freemailCount++;
    } else {
      workCount++;
    }
  }

  // --- company_website ---
  let siteMissing = 0;
  let siteNoProtocol = 0;
  let siteMalformed = 0;

  for (const row of records) {
    const raw = row["company_website"] ?? "";
    const r = normalizeWebsite(raw);
    if (r.value === "") {
      siteMissing++;
    } else {
      if (!r.had_protocol) siteNoProtocol++;
      if (!r.valid) siteMalformed++;
    }
  }

  // --- recommendations ---
  const recommendations: Recommendation[] = [
    {
      field: "email",
      issue: "duplicate records (case/whitespace variants of the same address)",
      proposed_fix: "normalize to lowercase/trimmed and dedupe, keeping the most recent created_date per group",
      affected_rows: normalizedDupes,
    },
    {
      field: "country",
      issue: "same country spelled multiple ways (name vs. ISO code vs. casing)",
      proposed_fix: "map to ISO 3166-1 alpha-2 via an alias table",
      affected_rows: Array.from(countryVariants.values()).reduce((sum, v) => sum + v.size, 0),
    },
    {
      field: "country",
      issue: "junk/unusable values ('??', 'earth', blank)",
      proposed_fix: "null out and flag as suspicious rather than guess",
      affected_rows: suspiciousCount,
    },
    {
      field: "marketing_consent",
      issue: "17 distinct spellings of what should be a boolean-ish field",
      proposed_fix: "map to a tri-state true/false/unknown via an alias table",
      affected_rows: n - (consentCounts[""] ?? 0),
    },
    {
      field: "utm_source/utm_medium/utm_campaign",
      issue: "placeholder/test values (null, undefined, {{...}}, (direct), test)",
      proposed_fix: "normalize placeholders to null and flag with is_placeholder_utm",
      affected_rows: Object.values(utmReport).reduce((sum, v) => sum + v.placeholder_total, 0),
    },
    {
      field: "job_title/company",
      issue: "leading/trailing/doubled whitespace",
      proposed_fix: "trim and collapse internal whitespace",
      affected_rows: jtWsIssue + companyWsIssue,
    },
    {
      field: "company_website",
      issue: "inconsistent scheme/www formatting or missing values",
      proposed_fix: "normalize to a canonical bare-domain form",
      affected_rows: siteNoProtocol + siteMissing,
    },
    {
      field: "email",
      issue: "leads from named competitor domains",
      proposed_fix: "suppress at routing time per the ICP memo",
      affected_rows: competitorHits,
    },
    {
      field: "email/first_name/last_name/company",
      issue: "clearly fake/spam test records (e.g. aaa@bbb.cc with blank company/title/industry)",
      proposed_fix: "suppress at routing time per the ICP memo's 'spam and clearly fake records' rule",
      affected_rows: suspiciousFakeHits,
    },
  ];

  return {
    meta: {
      input_file: "(in-memory)",
      row_count: n,
      column_count: columnNames.length,
      generated_at: nowIso(),
    },
    columns,
    duplicates: {
      exact_email_dupes: rawEmailDupes,
      normalized_email_dupes: normalizedDupes,
      sample_groups: sampleGroups,
    },
    anomalies: {
      country: {
        distinct_raw_values: new Set(records.map((r) => r["country"] ?? "")).size,
        grouped_variants: groupedVariants,
        suspicious_value_count: suspiciousCount,
        unmapped_values: [...unmappedValues].sort(),
      },
      utm: utmReport,
      marketing_consent: {
        distinct_spellings: Object.keys(consentCounts).length,
        value_counts: consentCounts,
        proposed_boolean_mapping: proposedMapping,
      },
      job_title: {
        null_count: jtBlank,
        whitespace_issue_count: jtWsIssue,
        case_issue_count: jtCaseIssue,
      },
      company: {
        whitespace_issue_count: companyWsIssue,
        variant_groups: companyVariantGroups,
      },
      email: {
        malformed_count: malformed,
        competitor_domain_hits: competitorHits,
        disposable_domain_hits: disposableHits,
        suspicious_fake_hits: suspiciousFakeHits,
        freemail_count: freemailCount,
        work_domain_count: workCount,
      },
      company_website: {
        missing_count: siteMissing,
        protocol_missing_count: siteNoProtocol,
        malformed_count: siteMalformed,
      },
    },
    recommendations,
  };
}
