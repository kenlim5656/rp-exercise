import {
  AMBIGUOUS_TITLE_KEYWORDS,
  DECISION_MAKER_FUNCTION_KEYWORDS,
  TECHNICAL_IC_TITLE_KEYWORDS,
  TECHNICAL_INDUSTRIES,
  isAcademicDomain,
} from "../constants";

/** Standalone C-level/founder titles that are decision-makers on their own,
 * without needing a separate function keyword (per the memo's own phrasing:
 * "founder, CEO, CTO, chief AI officer, or VP/SVP/head/director of
 * engineering/ML/AI/..."). "chief data officer" is a reasonable analogous
 * extension, not verbatim in the memo. */
const STANDALONE_DECISION_MAKER_KEYWORDS = ["founder", "co-founder", "ceo", "chief executive", "cto", "chief technology officer", "chief ai officer", "chief data officer"];
const FUNCTION_QUALIFIED_DECISION_MAKER_KEYWORDS = ["vp of", "vp,", "vice president", "svp", "senior vice president", "head of", "director of", "director,"];

export type Tier = "tier1" | "tier2" | "tier3" | "suppress";

export interface DeterministicScoringInput {
  jobTitle: string;
  company: string;
  companySize: string; // '', '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'
  industry: string; // '', 'Software', 'AI/ML software', ...
  emailNormalized: string;
  emailType: "freemail" | "work";
  isCompetitorDomain: boolean;
  isDisposableDomain: boolean;
  isSuspiciousFake: boolean;
}

export interface DeterministicScoringResult {
  tier: Tier;
  reasons: string[];
  reviewFlag: boolean;
  reviewReason: string | null;
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase();
}

function isDecisionMaker(title: string): boolean {
  if (STANDALONE_DECISION_MAKER_KEYWORDS.some((k) => title.includes(k))) return true;
  const hasFunctionQualifier = FUNCTION_QUALIFIED_DECISION_MAKER_KEYWORDS.some((k) => title.includes(k));
  const hasFunction = DECISION_MAKER_FUNCTION_KEYWORDS.some((k) => title.includes(k));
  return hasFunctionQualifier && hasFunction;
}

function isTechnicalIC(title: string): boolean {
  return TECHNICAL_IC_TITLE_KEYWORDS.some((k) => title.includes(k));
}

function isAmbiguousTitle(title: string): boolean {
  return AMBIGUOUS_TITLE_KEYWORDS.some((k) => title.includes(k));
}

/**
 * Pure function implementing the RP Inbound Routing Rules Memo's tier
 * tree, including every named edge case. See
 * "RP Inbound Routing Rules Memo.docx" for the source rules.
 */
export function scoreDeterministic(input: DeterministicScoringInput): DeterministicScoringResult {
  const reasons: string[] = [];

  // 0. Suppression rules first -- these always win outright.
  if (input.isCompetitorDomain) {
    return { tier: "suppress", reasons: ["competitor domain"], reviewFlag: false, reviewReason: null };
  }
  if (input.isSuspiciousFake) {
    return { tier: "suppress", reasons: ["clearly fake/spam record"], reviewFlag: false, reviewReason: null };
  }
  if (input.isDisposableDomain) {
    return { tier: "suppress", reasons: ["disposable/invalid email domain"], reviewFlag: false, reviewReason: null };
  }

  const title = norm(input.jobTitle);
  const company = (input.company || "").trim();
  const industry = norm(input.industry);
  const sizeStr = (input.companySize || "").trim();

  // 1. Missing job title.
  if (!title) {
    return { tier: "tier3", reasons: ["missing job title"], reviewFlag: true, reviewReason: "missing job title" };
  }

  // 2. Academic domain (.edu and similar) -- student/academic, non-ICP.
  if (isAcademicDomain(input.emailNormalized)) {
    return { tier: "tier3", reasons: ["academic (.edu) domain"], reviewFlag: false, reviewReason: null };
  }

  const decisionMaker = isDecisionMaker(title);
  const technicalIC = isTechnicalIC(title);
  const ambiguous = isAmbiguousTitle(title);

  const technicalCompany = TECHNICAL_INDUSTRIES.has(industry);
  const companyMissing = company === "";
  const industryUnknown = industry === "";
  const unverifiableCompany = companyMissing || industryUnknown;
  const sizeKnown = sizeStr !== "";
  const sizeMicro = sizeStr === "1-10";

  if (decisionMaker) {
    reasons.push("decision-maker title");
    if (unverifiableCompany) {
      return {
        tier: "tier2",
        reasons: [...reasons, "company missing or unverifiable"],
        reviewFlag: true,
        reviewReason: "decision-maker title but company missing or unverifiable",
      };
    }
    if (!technicalCompany) {
      return { tier: "tier3", reasons: [...reasons, "company outside AI/ML or software"], reviewFlag: false, reviewReason: null };
    }
    if (sizeMicro) {
      return { tier: "tier2", reasons: [...reasons, "1-10 employee company"], reviewFlag: false, reviewReason: null };
    }
    if (!sizeKnown) {
      return {
        tier: "tier2",
        reasons: [...reasons, "company size unverifiable"],
        reviewFlag: true,
        reviewReason: "decision-maker title, technical company, but company size unverifiable",
      };
    }
    // Confirmed Tier 1: decision-maker, technical company, 11+ employees.
    if (input.emailType === "freemail") {
      return {
        tier: "tier1",
        reasons: [...reasons, "11+ employee AI/ML-or-software company", "personal email"],
        reviewFlag: true,
        reviewReason: "personal email but Tier-1 title and company signals",
      };
    }
    return { tier: "tier1", reasons: [...reasons, "11+ employee AI/ML-or-software company"], reviewFlag: false, reviewReason: null };
  }

  if (ambiguous) {
    if (technicalCompany) {
      return {
        tier: "tier2",
        reasons: ["ambiguous title (owner/consultant/principal/advisor/fractional)", "AI/ML-or-software company"],
        reviewFlag: true,
        reviewReason: "ambiguous title defaults to Tier 2 for human review",
      };
    }
    return { tier: "tier3", reasons: ["ambiguous title", "non-technical company"], reviewFlag: false, reviewReason: null };
  }

  if (technicalIC) {
    if (technicalCompany) {
      return { tier: "tier2", reasons: ["technical IC", "AI/ML-or-software company"], reviewFlag: false, reviewReason: null };
    }
    if (unverifiableCompany) {
      return {
        tier: "tier2",
        reasons: ["technical IC", "company/industry unverifiable"],
        reviewFlag: true,
        reviewReason: "technical IC title but company/industry unverifiable",
      };
    }
    return { tier: "tier3", reasons: ["technical IC", "company outside AI/ML or software"], reviewFlag: false, reviewReason: null };
  }

  return { tier: "tier3", reasons: ["non-technical role"], reviewFlag: false, reviewReason: null };
}
