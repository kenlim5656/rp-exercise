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

export const COUNTRY_ALIASES: Record<string, string> = {
  "australia": "AU", "au": "AU",
  "singapore": "SG", "sg": "SG",
  "japan": "JP", "jp": "JP",
  "brazil": "BR", "br": "BR",
  "india": "IN", "in": "IN",
  "uk": "GB", "gb": "GB", "united kingdom": "GB",
  "canada": "CA", "ca": "CA",
  "us": "US", "usa": "US", "united states": "US", "u.s.": "US", "u.s.a.": "US",
  "sweden": "SE", "se": "SE",
  "ireland": "IE", "ie": "IE",
  "netherlands": "NL", "the netherlands": "NL", "nl": "NL",
  "poland": "PL", "pl": "PL",
  "germany": "DE", "deutschland": "DE", "de": "DE", "deu": "DE",
  "espana": "ES", "españa": "ES", "spain": "ES", "es": "ES",
  "france": "FR", "fr": "FR", "fra": "FR",
  "italy": "IT", "italia": "IT", "it": "IT",
};

export const SUSPICIOUS_COUNTRY_VALUES = new Set(["??", "earth", ""]);

export const CONSENT_ALIASES: Record<string, string> = {
  "granted": "true", "true": "true", "yes": "true", "1": "true", "opted_in": "true",
  "false": "false", "no": "false", "0": "false", "opted_out": "false", "unsubscribed": "false",
  "unknown": "unknown", "pending": "unknown", "null": "unknown", "": "unknown",
};

export const UTM_PLACEHOLDER_VALUES = new Set([
  "null", "undefined", "test", "test-campaign-delete", "(none)", "(direct)",
  "{{utm_source}}", "{{utm_medium}}", "{{utm_campaign}}", "",
]);

export const UTM_VALUE_ALIASES: Record<string, string> = {
  "fb": "facebook",
  "facebook ads": "facebook",
  "fb_paid": "facebook",
  "paid-social": "paid_social",
  "e-mail": "email",
  "email blast": "email_blast",
  "email%20blast": "email_blast",
};
