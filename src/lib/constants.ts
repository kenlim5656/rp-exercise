// TS mirror of scripts/constants.py's cross-cutting lookups that the Node
// side (mocks + scoring) also needs. The pandas script remains the source of
// truth for sanitize-time normalization; this file only covers what the
// Next.js app itself must classify (EU-ness for the consent hard rule,
// freemail/competitor checks used by the mocks and deterministic scorer).

export const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "proton.me",
  "aol.com",
  "mail.com",
  "gmx.com",
  "live.com",
  "ymail.com",
  "protonmail.com",
]);

export const COMPETITOR_DOMAINS = new Set(["gridforge.cloud", "tensorhive.ai"]);

export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
  "throwawaymail.com",
  "fakeinbox.com",
]);

// ISO alpha-2 codes that are EU members for the routing memo's EU consent
// hard rule. GB is deliberately excluded (post-Brexit, UK is not in the EU).
export const EU_COUNTRIES = new Set(["DE", "FR", "NL", "PL", "ES", "IT", "SE", "IE"]);

export const TECHNICAL_INDUSTRIES = new Set(["ai/ml software", "software"]);

export const ACADEMIC_DOMAIN_SUFFIXES = [".edu", ".ac.uk", ".edu.au"];

export function emailDomain(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase().trim();
}

export function isFreemail(email: string): boolean {
  return FREEMAIL_DOMAINS.has(emailDomain(email));
}

export function isCompetitorDomain(email: string): boolean {
  return COMPETITOR_DOMAINS.has(emailDomain(email));
}

export function isDisposableDomain(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(emailDomain(email));
}

export function isAcademicDomain(email: string): boolean {
  const d = emailDomain(email);
  return ACADEMIC_DOMAIN_SUFFIXES.some((suf) => d.endsWith(suf));
}

// Job-title keyword buckets mirroring scripts/constants.py, used by
// src/lib/scoring/deterministic.ts. Matching is substring-based on a
// lowercased, whitespace-normalized title.
export const DECISION_MAKER_TITLE_KEYWORDS = [
  "founder",
  "co-founder",
  "ceo",
  "chief executive",
  "cto",
  "chief technology officer",
  "chief ai officer",
  "chief data officer",
  "vp of",
  "vp,",
  "vice president",
  "svp",
  "senior vice president",
  "head of",
  "director of",
  "director,",
];
export const DECISION_MAKER_FUNCTION_KEYWORDS = [
  "engineering",
  "ml",
  "machine learning",
  "ai",
  "artificial intelligence",
  "data",
  "platform",
  "infrastructure",
  "mlops",
];
export const TECHNICAL_IC_TITLE_KEYWORDS = [
  "engineer",
  "developer",
  "scientist",
  "researcher",
  "sre",
  "site reliability",
  "devops",
  "swe",
];
export const TECHNICAL_IC_FUNCTION_KEYWORDS = ["ml", "machine learning", "ai", "software", "data", "devops", "sre", "research"];
export const AMBIGUOUS_TITLE_KEYWORDS = ["owner", "consultant", "principal", "advisor", "fractional", "freelancer", "indie hacker"];
