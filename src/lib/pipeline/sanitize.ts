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
// Regex patterns
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REPEATED_CHAR_RE = /^(.)\1*$/;

// ---------------------------------------------------------------------------
// Helpers (same as analyze.ts, duplicated to keep each file self-contained)
// ---------------------------------------------------------------------------

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeNameLike(raw: string): string {
  const v = collapseWhitespace(raw);
  if (v === v.toUpperCase() || v === v.toLowerCase()) {
    return v.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
  }
  return v;
}

function isMalformedEmail(email: string): boolean {
  return !EMAIL_RE.test(email.trim());
}

function isSuspiciousFakeEmail(email: string): boolean {
  const local = email.includes("@") ? email.split("@", 2)[0] : email;
  const domainLabel = email.includes("@") ? emailDomain(email).split(".", 1)[0] : "";
  return REPEATED_CHAR_RE.test(local) || (domainLabel !== "" && REPEATED_CHAR_RE.test(domainLabel));
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
// Override application (mirrors Python apply_overrides)
// ---------------------------------------------------------------------------

// We work on mutable copies of the constant sets/maps so callers' overrides
// don't leak across invocations.  The copies are made inside sanitizeLeads
// and passed here.
interface MutableConstants {
  countryAliases: Record<string, string>;
  consentAliases: Record<string, string>;
  utmValueAliases: Record<string, string>;
  utmPlaceholderValues: Set<string>;
  freemailDomains: Set<string>;
  competitorDomains: Set<string>;
  disposableDomains: Set<string>;
}

function applyOverrides(
  instructions: { notes?: string; overrides?: Record<string, unknown> } | undefined,
  mc: MutableConstants,
): string[] {
  const applied: string[] = [];
  if (!instructions) return applied;
  const overrides = (instructions.overrides ?? {}) as Record<string, unknown>;

  for (const [key, value] of Object.entries(overrides)) {
    if (key === "country_aliases" && typeof value === "object" && value !== null) {
      Object.assign(mc.countryAliases, value);
      applied.push(key);
    } else if (key === "consent_aliases" && typeof value === "object" && value !== null) {
      Object.assign(mc.consentAliases, value);
      applied.push(key);
    } else if (key === "utm_value_aliases" && typeof value === "object" && value !== null) {
      Object.assign(mc.utmValueAliases, value);
      applied.push(key);
    } else if (key === "utm_placeholder_values" && Array.isArray(value)) {
      for (const v of value) mc.utmPlaceholderValues.add(String(v));
      applied.push(key);
    } else if (key === "freemail_domains" && Array.isArray(value)) {
      for (const v of value) mc.freemailDomains.add(String(v));
      applied.push(key);
    } else if (key === "competitor_domains" && Array.isArray(value)) {
      for (const v of value) mc.competitorDomains.add(String(v));
      applied.push(key);
    } else if (key === "disposable_domains" && Array.isArray(value)) {
      for (const v of value) mc.disposableDomains.add(String(v));
      applied.push(key);
    }
  }
  return applied;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SanitizedRow {
  [key: string]: string;
}

export interface SanitizeReport {
  meta: {
    input_file: string;
    row_count_in: number;
    generated_at: string;
  };
  row_count_out: number;
  transformations_applied: Record<string, number>;
  instructions_applied: string[];
  instructions_notes: string;
}

// ---------------------------------------------------------------------------
// Main sanitize function
// ---------------------------------------------------------------------------

export function sanitizeLeads(
  records: Record<string, string>[],
  instructions?: { notes?: string; overrides?: Record<string, unknown> },
): { rows: SanitizedRow[]; report: SanitizeReport } {
  const n = records.length;

  // Make mutable copies of constants so overrides don't leak
  const mc: MutableConstants = {
    countryAliases: { ...COUNTRY_ALIASES },
    consentAliases: { ...CONSENT_ALIASES },
    utmValueAliases: { ...UTM_VALUE_ALIASES },
    utmPlaceholderValues: new Set(UTM_PLACEHOLDER_VALUES),
    freemailDomains: new Set(FREEMAIL_DOMAINS),
    competitorDomains: new Set(COMPETITOR_DOMAINS),
    disposableDomains: new Set(DISPOSABLE_DOMAINS),
  };

  const appliedOverrides = applyOverrides(instructions, mc);

  // Work on a mutable copy of each record
  const rows: SanitizedRow[] = records.map((r) => ({ ...r }));
  const counts: Record<string, number> = {};

  // --- name/company/job_title normalization ---
  for (const field of ["first_name", "last_name", "company", "job_title"] as const) {
    const rawCol = `${field}_raw`;
    let changed = 0;
    for (const row of rows) {
      const original = row[field] ?? "";
      row[rawCol] = original;
      const cleaned = (field === "first_name" || field === "last_name")
        ? normalizeNameLike(original)
        : collapseWhitespace(original);
      if (cleaned !== original) changed++;
      row[field] = cleaned;
    }
    counts[`${field}_normalized`] = changed;
  }

  // --- country ---
  {
    let changed = 0;
    let suspicious = 0;
    for (const row of rows) {
      const original = row["country"] ?? "";
      row["country_raw"] = original;

      const v = original.trim();
      if (mc.utmPlaceholderValues /* reuse suspicious check logic */ && false) {
        // placeholder -- handled below
      }

      // Inline normalizeCountry with mutable constants
      let countryResult: { value: string; suspicious: boolean };
      if (SUSPICIOUS_COUNTRY_VALUES.has(v.toLowerCase()) || v === "") {
        countryResult = { value: "", suspicious: v !== "" && v.toLowerCase() !== "" };
      } else {
        const iso = mc.countryAliases[v.toLowerCase()];
        if (iso) {
          countryResult = { value: iso, suspicious: false };
        } else {
          countryResult = { value: v, suspicious: false };
        }
      }

      row["country"] = countryResult.value;
      row["is_suspicious_country"] = String(countryResult.suspicious);
      if (row["country"] !== original) changed++;
      if (countryResult.suspicious) suspicious++;
    }
    counts["country_normalized"] = changed;
    counts["country_suspicious"] = suspicious;
  }

  // --- marketing_consent ---
  {
    let changed = 0;
    for (const row of rows) {
      const original = row["marketing_consent"] ?? "";
      row["marketing_consent_raw"] = original;
      const normalized = mc.consentAliases[original.trim().toLowerCase()] ?? "unknown";
      row["consent_normalized"] = normalized;
      if (normalized !== original) changed++;
    }
    counts["consent_normalized"] = changed;
  }

  // --- utm fields ---
  for (const field of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const rawCol = `${field}_raw`;
    let placeholderCount = 0;
    for (const row of rows) {
      const original = row[field] ?? "";
      row[rawCol] = original;

      const decoded = decodeURIComponent(original).trim();
      let result: { value: string; is_placeholder: boolean };

      if (mc.utmPlaceholderValues.has(decoded.toLowerCase())) {
        result = { value: "", is_placeholder: true };
      } else {
        const folded = mc.utmValueAliases[decoded.toLowerCase()];
        if (folded) {
          result = { value: folded, is_placeholder: false };
        } else {
          let cleaned = collapseWhitespace(decoded).toLowerCase();
          const sep = field === "utm_campaign" ? "-" : "_";
          cleaned = cleaned.replace(/ /g, sep);
          result = { value: cleaned, is_placeholder: false };
        }
      }

      row[field] = result.value;
      row[`is_placeholder_${field}`] = String(result.is_placeholder);
      if (result.is_placeholder) placeholderCount++;
    }
    counts[`${field}_placeholder`] = placeholderCount;
  }

  // --- email ---
  {
    let competitorCount = 0;
    let disposableCount = 0;
    let malformedCount = 0;
    let suspiciousFakeCount = 0;

    for (const row of rows) {
      const original = row["email"] ?? "";
      row["email_raw"] = original;

      const e = original.trim().toLowerCase();
      const domain = emailDomain(e);

      row["email_normalized"] = e;
      row["email_type"] = mc.freemailDomains.has(domain) ? "freemail" : "work";

      const isCompetitor = mc.competitorDomains.has(domain);
      const isDisposable = mc.disposableDomains.has(domain);
      const isAcademic = ACADEMIC_DOMAIN_SUFFIXES.some((suf) => domain.endsWith(suf));
      const malformed = isMalformedEmail(e);
      const isFake = isSuspiciousFakeEmail(e);

      row["is_competitor_domain"] = String(isCompetitor);
      row["is_disposable_domain"] = String(isDisposable);
      row["is_academic_domain"] = String(isAcademic);
      row["is_malformed_email"] = String(malformed);
      row["is_suspicious_fake"] = String(isFake);

      if (isCompetitor) competitorCount++;
      if (isDisposable) disposableCount++;
      if (malformed) malformedCount++;
      if (isFake) suspiciousFakeCount++;
    }

    counts["email_competitor_domain"] = competitorCount;
    counts["email_disposable_domain"] = disposableCount;
    counts["email_malformed"] = malformedCount;
    counts["email_suspicious_fake"] = suspiciousFakeCount;
  }

  // --- company_website ---
  {
    let changed = 0;
    for (const row of rows) {
      const original = row["company_website"] ?? "";
      row["company_website_raw"] = original;
      const r = normalizeWebsite(original);
      row["company_website"] = r.value;
      row["company_website_valid"] = String(r.valid);
      if (row["company_website"] !== original) changed++;
    }
    counts["company_website_normalized"] = changed;
  }

  // --- dedup: one record per person, keep most-recent created_date, flag conflicts ---
  // Initialize dedup columns
  for (const row of rows) {
    row["dedup_group_id"] = "";
    row["is_duplicate_primary"] = "true";
    row["dedup_conflict_flag"] = "false";
    row["dedup_conflict_fields"] = "";
  }

  const conflictCheckFields = ["company", "job_title", "company_size", "industry", "country", "consent_normalized"];

  // Group by email_normalized
  const emailGroups = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const key = rows[i]["email_normalized"] ?? "";
    if (!emailGroups.has(key)) {
      emailGroups.set(key, []);
    }
    emailGroups.get(key)!.push(i);
  }

  let dupeGroups = 0;
  let conflictGroups = 0;

  for (const [key, indices] of emailGroups) {
    if (!key || indices.length < 2) continue;
    dupeGroups++;

    // Sort by created_date descending (most recent first)
    const sorted = [...indices].sort((a, b) => {
      const dateA = new Date(rows[a]["created_date"] ?? "").getTime();
      const dateB = new Date(rows[b]["created_date"] ?? "").getTime();
      // If invalid date, push to end
      const validA = !isNaN(dateA);
      const validB = !isNaN(dateB);
      if (!validA && !validB) return 0;
      if (!validA) return 1;
      if (!validB) return -1;
      return dateB - dateA;
    });

    const primaryIdx = sorted[0];

    // Mark all in group
    for (const idx of indices) {
      rows[idx]["dedup_group_id"] = key;
      rows[idx]["is_duplicate_primary"] = "false";
    }
    rows[primaryIdx]["is_duplicate_primary"] = "true";

    // Check for conflicting field values across the group
    const conflictingFields: string[] = [];
    for (const f of conflictCheckFields) {
      const distinctVals = new Set<string>();
      for (const idx of indices) {
        const v = rows[idx][f] ?? "";
        if (v !== "" && v !== undefined) {
          distinctVals.add(v);
        }
      }
      if (distinctVals.size > 1) {
        conflictingFields.push(f);
      }
    }

    if (conflictingFields.length > 0) {
      conflictGroups++;
      for (const idx of indices) {
        rows[idx]["dedup_conflict_flag"] = "true";
        rows[idx]["dedup_conflict_fields"] = conflictingFields.join(",");
      }
    }
  }

  counts["duplicate_groups_found"] = dupeGroups;
  counts["duplicate_conflict_groups"] = conflictGroups;

  // Count primaries for row_count_out
  const rowCountOut = rows.filter((r) => r["is_duplicate_primary"] === "true").length;

  const report: SanitizeReport = {
    meta: {
      input_file: "(in-memory)",
      row_count_in: n,
      generated_at: nowIso(),
    },
    row_count_out: rowCountOut,
    transformations_applied: counts,
    instructions_applied: appliedOverrides,
    instructions_notes: (instructions ?? {}).notes ?? "",
  };

  return { rows, report };
}
