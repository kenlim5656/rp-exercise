"""
Shared lookup tables for scripts/lead_pipeline.py.

Kept in a separate module (rather than inlined) so this can be lifted into a
standalone Claude Code skill later without touching the Next.js app.

All maps were built from an actual pass over the inbound leads CSV (not
guessed) -- see the values enumerated below for the exact variants observed.
"""

# Freemail / personal-email providers observed in the sample data. Anything
# else is treated as a work/company domain.
FREEMAIL_DOMAINS = {
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "proton.me",
    # common providers not seen in the sample but worth covering for realism
    "aol.com",
    "mail.com",
    "gmx.com",
    "live.com",
    "ymail.com",
    "protonmail.com",
}

# Named competitor domains from the routing memo -- always suppress.
COMPETITOR_DOMAINS = {
    "gridforge.cloud",
    "tensorhive.ai",
}

# Common disposable/temp-mail domains. None were confirmed in the sample, but
# the memo calls out "invalid or disposable emails" as a suppression case, so
# the check exists and is easy to extend.
DISPOSABLE_DOMAINS = {
    "mailinator.com",
    "tempmail.com",
    "10minutemail.com",
    "guerrillamail.com",
    "yopmail.com",
    "trashmail.com",
    "throwawaymail.com",
    "fakeinbox.com",
}

# .edu (and a couple of other academic TLD conventions) -> treated as the
# memo's "academic" edge case (non-ICP company regardless of title).
ACADEMIC_DOMAIN_SUFFIXES = (".edu", ".ac.uk", ".edu.au")

# country (raw, case-sensitive as seen in the file) -> ISO 3166-1 alpha-2.
# Built directly from the 61 distinct raw values found in
# the inbound leads CSV. Lookups are done case-insensitively by the
# script (the raw keys below are just for readability/traceability).
COUNTRY_ALIASES = {
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
}

# Raw country values that are junk/unusable rather than a mappable alias.
# Normalized to null with an is_suspicious_country flag rather than guessed.
SUSPICIOUS_COUNTRY_VALUES = {"??", "earth", ""}

# ISO alpha-2 codes that are EU members for the purposes of the memo's EU
# consent hard rule. NOTE: GB (United Kingdom) is deliberately excluded --
# post-Brexit the UK is not part of the EU, even though "UK"/"uk"/"GB" are
# heavily represented in the sample data.
EU_COUNTRIES = {"DE", "FR", "NL", "PL", "ES", "IT", "SE", "IE"}

# marketing_consent (raw) -> tri-state ("true", "false", "unknown"). Built
# from the 17 distinct spellings actually observed in the file.
CONSENT_ALIASES = {
    "granted": "true", "true": "true", "yes": "true", "1": "true", "opted_in": "true",
    "false": "false", "no": "false", "0": "false", "opted_out": "false", "unsubscribed": "false",
    "unknown": "unknown", "pending": "unknown", "null": "unknown", "": "unknown",
}

# utm_source / utm_medium / utm_campaign values that are placeholders/test
# artifacts rather than real attribution data -- normalized to null with
# is_placeholder_utm=true rather than treated as a real channel.
UTM_PLACEHOLDER_VALUES = {
    "null", "undefined", "test", "test-campaign-delete", "(none)", "(direct)",
    "{{utm_source}}", "{{utm_medium}}", "{{utm_campaign}}", "",
}

# Casing/format aliases folded to a single canonical value once placeholders
# are removed (applied case-insensitively after trimming whitespace).
UTM_VALUE_ALIASES = {
    "fb": "facebook",
    "facebook ads": "facebook",
    "fb_paid": "facebook",
    "paid-social": "paid_social",
    "e-mail": "email",
    "email blast": "email_blast",
    "email%20blast": "email_blast",
}

# Job-title keyword buckets used by the deterministic ICP scorer (mirrored in
# src/lib/scoring/deterministic.ts). Matching is substring-based on a
# lowercased, whitespace-normalized title.
DECISION_MAKER_TITLE_KEYWORDS = (
    "founder", "co-founder", "ceo", "chief executive", "cto",
    "chief technology officer", "chief ai officer", "chief data officer",
    "vp of", "vp,", "vice president", "svp", "senior vice president",
    "head of", "director of", "director,",
)
DECISION_MAKER_FUNCTION_KEYWORDS = (
    "engineering", "ml", "machine learning", "ai", "artificial intelligence",
    "data", "platform", "infrastructure", "mlops",
)
TECHNICAL_IC_TITLE_KEYWORDS = (
    "engineer", "developer", "scientist", "researcher", "sre",
    "site reliability", "devops", "swe",
)
TECHNICAL_IC_FUNCTION_KEYWORDS = (
    "ml", "machine learning", "ai", "software", "data", "devops", "sre", "research",
)
AMBIGUOUS_TITLE_KEYWORDS = (
    "owner", "consultant", "principal", "advisor", "fractional", "freelancer", "indie hacker",
)
NON_TECHNICAL_TITLE_KEYWORDS = (
    "student", "phd", "ms student", "academic", "professor", "financial analyst",
    "social media", "project manager", "customer success", "sales", "marketing manager",
    "account executive", "recruiter", "hr ", "content writer",
)

# industry (raw) -> is this an ICP-eligible ("technical") industry for the
# memo's tier rules.
TECHNICAL_INDUSTRIES = {"ai/ml software", "software"}
