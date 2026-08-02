import { hashUnit, hashPick } from "./seed";

/** Synthetic historical lead dataset (v2).
 *  ~300 deterministic past leads with full profiles, treatment history, and outcomes.
 *  Used by the follow-up recommendation engine to surface similar leads who converted. */

export type Outcome = "converted" | "churned" | "disqualified" | "still_in_nurture" | "lost_to_competitor";

export type TitleType = "founder_ceo" | "vp_director" | "technical_ic" | "ml_engineer" | "other_technical" | "non_technical";

export interface TreatmentRecord {
  type: "email_sequence" | "sales_outreach" | "webinar_invite" | "demo_offer" | "content_asset" | "event_invite" | "free_trial_offer";
  name: string;
  sent_at: string;
  response: "positive" | "neutral" | "negative" | "no_response";
  days_to_response: number | null;
}

export interface HistoricalLead {
  id: string;
  email_domain: string;
  title_type: TitleType;
  industry: string;
  company_size: string;
  deterministic_tier: "tier1" | "tier2" | "tier3";
  routing_decision: string;
  initial_intent_score: number;
  outcome: Outcome;
  days_to_outcome: number | null;
  arpa_on_conversion: number | null;
  treatments: TreatmentRecord[];
  notes: string;
}

const TITLE_TYPES: TitleType[] = [
  "founder_ceo",
  "vp_director",
  "technical_ic",
  "ml_engineer",
  "other_technical",
  "non_technical",
];

const INDUSTRIES = [
  "AI / ML SaaS",
  "MLOps / DevOps",
  "Data Platform",
  "FinTech",
  "Healthcare AI",
  "EdTech",
  "Gaming / Simulation",
  "Robotics",
  "Autonomous Vehicles",
  "Research / Academia",
  "Enterprise Software",
  "E-commerce",
];

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

const EMAIL_SEQUENCES = [
  "GPU Cloud – Welcome + Quickstart",
  "MLOps Best Practices (5-email drip)",
  "Serverless GPU Use Cases",
  "Transparent Pricing Explainer",
  "Competitor Migration Guide",
  "AI Infrastructure Benchmark Report",
  "Case Study: Training LLMs at Scale",
  "ROI Calculator + Pricing Consult CTA",
  "Launch Week Recap + Trial Extension",
];

const SALES_ACTIONS = [
  "LinkedIn connection + intro note",
  "Cold email – GPU benchmark pitch",
  "Cold email – cost saving angle",
  "Follow-up on webinar registration",
  "Trial activation check-in call",
  "Demo: distributed training demo",
  "Demo: serverless inference demo",
  "Technical POC proposal sent",
  "Pricing / procurement conversation",
];

const CONTENT_ASSETS = [
  "Whitepaper: Scale AI Infra Without Ops Overhead",
  "Benchmark Report: GPU Cloud Comparison 2025",
  "Guide: Reducing GPU Spend by 40%",
  "Case Study: Startup scales LLM training to 1000 GPUs",
];

const TREATMENT_NOTES: Record<Outcome, string[]> = {
  converted: [
    "Responded positively to ROI calculator email; booked demo; converted within 3 weeks",
    "Direct outreach to CTO after whitepaper download; POC completed; closed deal",
    "Enrolled in MLOps drip; clicked pricing link on email 3; sales followed up same day",
    "Attended GPU Cloud webinar; trial activated; upgraded to paid within 2 weeks",
  ],
  churned: [
    "Engaged early but stopped responding after pricing email; unsubscribed",
    "Completed trial; cited competitor pricing; churned after 1 month",
    "Multiple touchpoints; never booked demo; marked cold after 90 days",
  ],
  disqualified: [
    "No budget / wrong stage; student project; removed from active pipeline",
    "Non-technical role; forwarded to wrong person; no further engagement",
  ],
  still_in_nurture: [
    "Opened 4 emails; not yet ready to evaluate; re-engagement scheduled in 30 days",
    "Downloaded whitepaper; monthly newsletter subscriber; no direct engagement",
  ],
  lost_to_competitor: [
    "Evaluated us and Lambda Labs; chose competitor on pricing",
    "Late-stage deal; lost on GPU availability SLA",
  ],
};

function seedStr(id: number): string {
  return `hist_lead_${id}`;
}

function seededDate(seed: string, maxDaysAgo: number): string {
  const daysAgo = Math.floor(hashUnit(seed) * maxDaysAgo);
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

function generateTreatments(id: number, outcome: Outcome, tier: string): TreatmentRecord[] {
  const base = seedStr(id);
  const count = outcome === "converted" ? 3 + Math.floor(hashUnit(`${base}_tc`) * 3)
    : outcome === "disqualified" ? 1
    : 2 + Math.floor(hashUnit(`${base}_tc`) * 2);

  const treatments: TreatmentRecord[] = [];

  // First treatment is always a marketing touchpoint
  const firstType: TreatmentRecord["type"] = tier === "tier1"
    ? hashUnit(`${base}_ft`) < 0.5 ? "demo_offer" : "email_sequence"
    : "email_sequence";

  const firstName = firstType === "demo_offer"
    ? "Personalized GPU Cloud Demo"
    : hashPick(`${base}_seq`, EMAIL_SEQUENCES as unknown as readonly string[]);

  const firstResponse: TreatmentRecord["response"] = outcome === "converted"
    ? hashUnit(`${base}_fr`) < 0.7 ? "positive" : "neutral"
    : outcome === "disqualified"
    ? "no_response"
    : hashPick(`${base}_fres`, ["positive", "neutral", "neutral", "no_response", "negative"] as const);

  treatments.push({
    type: firstType,
    name: firstName,
    sent_at: seededDate(`${base}_t0`, 180),
    response: firstResponse,
    days_to_response: firstResponse !== "no_response" ? 1 + Math.floor(hashUnit(`${base}_dtr0`) * 7) : null,
  });

  // Subsequent treatments
  for (let i = 1; i < count; i++) {
    const treatmentType: TreatmentRecord["type"] = i === count - 1 && tier === "tier1" && outcome === "converted"
      ? "sales_outreach"
      : hashPick(`${base}_tt${i}`, [
          "email_sequence",
          "sales_outreach",
          "webinar_invite",
          "content_asset",
          "free_trial_offer",
        ] as const);

    const treatmentName = treatmentType === "sales_outreach"
      ? hashPick(`${base}_san${i}`, SALES_ACTIONS as unknown as readonly string[])
      : treatmentType === "content_asset"
      ? hashPick(`${base}_con${i}`, CONTENT_ASSETS as unknown as readonly string[])
      : treatmentType === "email_sequence"
      ? hashPick(`${base}_eseq${i}`, EMAIL_SEQUENCES as unknown as readonly string[])
      : treatmentType === "webinar_invite"
      ? "GPU Cloud Office Hours – Live Q&A"
      : "30-day Free Trial Activation";

    const response: TreatmentRecord["response"] = outcome === "converted" && i === count - 1
      ? "positive"
      : hashPick(`${base}_res${i}`, ["positive", "neutral", "no_response", "no_response", "negative"] as const);

    treatments.push({
      type: treatmentType,
      name: treatmentName,
      sent_at: seededDate(`${base}_t${i}`, 150 - i * 20),
      response,
      days_to_response: response !== "no_response" ? 1 + Math.floor(hashUnit(`${base}_dtr${i}`) * 10) : null,
    });
  }

  return treatments;
}

let _cache: HistoricalLead[] | null = null;

/** Returns the full synthetic historical dataset (300 leads), cached after first call. */
export function getHistoricalLeads(): HistoricalLead[] {
  if (_cache) return _cache;

  const leads: HistoricalLead[] = [];

  for (let i = 0; i < 300; i++) {
    const base = seedStr(i);
    const titleType = hashPick(`${base}_title`, TITLE_TYPES as unknown as readonly string[]) as TitleType;
    const industry = hashPick(`${base}_ind`, INDUSTRIES as unknown as readonly string[]);
    const companySize = hashPick(`${base}_cs`, COMPANY_SIZES as unknown as readonly string[]);

    // Tier is correlated with title type and company size
    let tier: "tier1" | "tier2" | "tier3";
    const companyEmployees = parseInt(companySize.split("-")[0].replace("+", ""));
    if (
      (titleType === "founder_ceo" || titleType === "vp_director") &&
      companyEmployees >= 11 &&
      (industry.includes("AI") || industry.includes("ML") || industry.includes("Data") || industry.includes("Robotics"))
    ) {
      tier = hashUnit(`${base}_tier`) < 0.85 ? "tier1" : "tier2";
    } else if (titleType === "ml_engineer" || titleType === "technical_ic" || titleType === "other_technical") {
      tier = hashUnit(`${base}_tier`) < 0.7 ? "tier2" : "tier3";
    } else {
      tier = "tier3";
    }

    const routingPool = tier === "tier1"
      ? ["sales_queue", "sales_queue", "sales_queue", "human_review"]
      : tier === "tier2"
      ? ["nurture", "nurture", "human_review", "sales_queue"]
      : ["nurture", "self_serve_newsletter", "self_serve_newsletter"];

    const routing = hashPick(`${base}_routing`, routingPool as unknown as readonly string[]);

    // Outcome is correlated with tier and routing
    const intentScore = Math.round(hashUnit(`${base}_intent`) * 100);
    let outcomePool: Outcome[];
    if (tier === "tier1" && routing === "sales_queue") {
      outcomePool = ["converted", "converted", "converted", "churned", "lost_to_competitor"];
    } else if (tier === "tier1" && routing === "human_review") {
      outcomePool = ["converted", "churned", "still_in_nurture", "lost_to_competitor"];
    } else if (tier === "tier2") {
      outcomePool = ["converted", "still_in_nurture", "still_in_nurture", "churned", "disqualified"];
    } else {
      outcomePool = ["still_in_nurture", "disqualified", "churned", "converted"];
    }
    const outcome = hashPick(`${base}_outcome`, outcomePool as unknown as readonly string[]) as Outcome;

    const daysToOutcome = outcome === "converted"
      ? 7 + Math.floor(hashUnit(`${base}_dto`) * (tier === "tier1" ? 30 : 90))
      : outcome === "churned" || outcome === "lost_to_competitor"
      ? 14 + Math.floor(hashUnit(`${base}_dto`) * 60)
      : null;

    const arpa = outcome === "converted"
      ? tier === "tier1"
        ? Math.round((2000 + hashUnit(`${base}_arpa`) * 48000) / 100) * 100
        : Math.round((500 + hashUnit(`${base}_arpa`) * 8000) / 100) * 100
      : null;

    const notePool = TREATMENT_NOTES[outcome];
    const note = hashPick(`${base}_note`, notePool as unknown as readonly string[]);

    const emailDomains = [
      "acme-ai.io", "deepmind-alum.co", "mlops-lab.com", "startupai.co",
      "nvidia-partner.tech", "kaggle.io", "huggingface.co", "openai-alumni.com",
      "anthropic-adjacent.ai", "foundry.ai", "scale-infra.com", "modal-labs.io",
      "replicate.dev", "together.ai", "anyscale.com", "vast.ai",
    ];

    leads.push({
      id: `hist_${i.toString().padStart(4, "0")}`,
      email_domain: hashPick(`${base}_domain`, emailDomains as unknown as readonly string[]),
      title_type: titleType,
      industry,
      company_size: companySize,
      deterministic_tier: tier,
      routing_decision: routing,
      initial_intent_score: intentScore,
      outcome,
      days_to_outcome: daysToOutcome,
      arpa_on_conversion: arpa,
      treatments: generateTreatments(i, outcome, tier),
      notes: note,
    });
  }

  _cache = leads;
  return leads;
}

/** Find the N most similar historical leads to a given profile. */
export function findSimilarLeads(
  profile: {
    title_type?: string;
    industry?: string;
    company_size?: string;
    deterministic_tier?: string;
    routing_decision?: string;
    intent_score?: number;
  },
  limit = 10,
): HistoricalLead[] {
  const all = getHistoricalLeads();

  const scored = all.map((h) => {
    let score = 0;
    if (profile.deterministic_tier && h.deterministic_tier === profile.deterministic_tier) score += 4;
    if (profile.routing_decision && h.routing_decision === profile.routing_decision) score += 3;
    if (profile.title_type && h.title_type === profile.title_type) score += 3;
    if (profile.industry && h.industry === profile.industry) score += 2;
    if (profile.company_size && h.company_size === profile.company_size) score += 2;
    if (profile.intent_score !== undefined) {
      const diff = Math.abs(h.initial_intent_score - profile.intent_score);
      score += Math.max(0, 3 - Math.floor(diff / 15));
    }
    return { h, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.h);
}

/** Summarise treatments that led to conversions among a set of historical leads. */
export function extractSuccessfulTreatments(leads: HistoricalLead[]): {
  treatment: string;
  type: TreatmentRecord["type"];
  conversion_rate: number;
  avg_days_to_convert: number;
  sample_count: number;
}[] {
  const converted = leads.filter((l) => l.outcome === "converted");
  if (converted.length === 0) return [];

  const byTreatment = new Map<string, { type: TreatmentRecord["type"]; successes: number; totalDays: number }>();

  for (const lead of converted) {
    for (const t of lead.treatments) {
      if (t.response === "positive") {
        const existing = byTreatment.get(t.name);
        if (existing) {
          existing.successes++;
          existing.totalDays += lead.days_to_outcome ?? 30;
        } else {
          byTreatment.set(t.name, { type: t.type, successes: 1, totalDays: lead.days_to_outcome ?? 30 });
        }
      }
    }
  }

  const totalLeads = leads.length;
  return Array.from(byTreatment.entries())
    .map(([name, data]) => ({
      treatment: name,
      type: data.type,
      conversion_rate: data.successes / totalLeads,
      avg_days_to_convert: Math.round(data.totalDays / data.successes),
      sample_count: data.successes,
    }))
    .filter((t) => t.sample_count >= 2)
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .slice(0, 5);
}
