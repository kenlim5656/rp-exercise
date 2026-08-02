import { z } from "zod";
import { getLeads, getStage, setStageStatus, upsertLeads, leadDisplayFields, type LeadRow } from "../runs";
import { logAction } from "../audit";
import { findSimilarLeads, extractSuccessfulTreatments } from "../mocks/historical";
import { generateWithFallback } from "../gemini";

const PRIORITY_ORDER: Record<string, number> = {
  sales_queue: 0,
  human_review: 1,
  nurture: 2,
};

function inferTitleType(title: string | null): string {
  if (!title) return "non_technical";
  const t = title.toLowerCase();
  if (/(founder|ceo|chief executive)/.test(t)) return "founder_ceo";
  if (/(vp|vice president|director|head of|cto|coo|cmo|cpo)/.test(t)) return "vp_director";
  if (/(ml engineer|machine learning engineer|ai engineer)/.test(t)) return "ml_engineer";
  if (/(engineer|developer|architect|scientist|researcher|devops|mlops|sre|platform)/.test(t)) return "technical_ic";
  if (/(manager|analyst|consultant|specialist|coordinator|ops)/.test(t)) return "other_technical";
  return "non_technical";
}

const RecommendationSchema = z.object({
  title: z.string(),
  type: z
    .enum([
      "email_sequence",
      "sales_outreach",
      "demo_offer",
      "content_asset",
      "webinar_invite",
      "free_trial_offer",
      "meeting_request",
      "nurture_campaign",
    ])
    .catch("email_sequence"),
  channel: z
    .enum(["email", "linkedin", "phone", "hubspot_sequence", "hubspot_deal", "hubspot_task"])
    .catch("email"),
  rationale: z.string(),
  talking_points: z.array(z.string()),
  suggested_content: z.string(),
  hubspot_action: z.object({
    action_type: z
      .enum(["create_task", "enroll_in_sequence", "create_deal", "send_email", "create_campaign", "schedule_meeting"])
      .catch("create_task"),
    params: z.record(z.string(), z.unknown()),
  }),
  priority: z.enum(["high", "medium", "low"]).catch("medium"),
  estimated_conversion_lift: z.string(),
});

const FollowupOutputSchema = z.object({
  lead_id: z.string(),
  routing_summary: z.string(),
  key_signals: z.array(z.string()),
  risk_factors: z.array(z.string()),
  recommendations: z.array(RecommendationSchema).min(1).max(4),
});

export type FollowupRecommendation = z.infer<typeof RecommendationSchema>;
export type FollowupOutput = z.infer<typeof FollowupOutputSchema>;

function buildFollowupPrompt(lead: LeadRow, similarLeadsContext: string): string {
  const fields = leadDisplayFields(lead);
  const sanitized = lead.sanitized_json ? JSON.parse(lead.sanitized_json) : {};
  const crm = lead.crm_json ? JSON.parse(lead.crm_json) : {};
  const clay = lead.clay_json ? JSON.parse(lead.clay_json) : {};

  const routingReasons: string[] = lead.review_reasons_json ? JSON.parse(lead.review_reasons_json) : [];
  const deterministicReasons: string[] = lead.deterministic_reasons_json ? JSON.parse(lead.deterministic_reasons_json) : [];

  return `You are a B2B marketing and sales strategist for RP, an AI Developer Cloud (GPU infrastructure for AI/ML training, fine-tuning, and serving). You specialise in designing highly personalised follow-up treatments for inbound leads.

## Your task
Analyse this lead's full profile, their routing outcome, and historical data from similar leads who were in the same situation. Then produce 2-4 specific, actionable follow-up recommendations.

## Lead profile
- **Lead ID**: ${lead.lead_id}
- **Email**: ${fields.email || "(unknown)"}
- **Company**: ${fields.company || "(unknown)"}
- **Title**: ${fields.title || "(unknown)"}
- **Industry**: ${sanitized.industry || "(unknown)"}
- **Company size**: ${sanitized.company_size || "(unknown)"}
- **Country**: ${sanitized.country || "(unknown)"}
- **Cohort**: ${lead.cohort || "unknown"} (${lead.cohort === "existing" ? "known HubSpot contact" : "net-new contact"})

## Scoring outcome
- **Deterministic tier**: ${lead.deterministic_tier || "unknown"} | Reasons: ${deterministicReasons.join("; ") || "none"}
- **LLM probabilistic score**: ${lead.llm_score !== null ? lead.llm_score + "/100" : "not scored"} | Rationale: ${lead.llm_rationale || "N/A"}
- **Score divergence**: ${lead.score_divergence !== null ? lead.score_divergence + " pts" : "N/A"} — ${lead.scores_aligned ? "scores ALIGNED" : "scores DIVERGED"}
- **Final routing**: ${lead.routing_decision || "unknown"}
- **Review reasons**: ${routingReasons.join("; ") || "none"}

## HubSpot CRM / engagement data
${JSON.stringify({
  lifecycle_stage: crm.hubspot?.properties?.lifecyclestage,
  lead_status: crm.hubspot?.properties?.hs_lead_status,
  lead_score: crm.leadScore,
  email_opt_out: crm.hsOptOut,
  last_email_open: crm.hubspot?.properties?.hs_email_last_open_date,
  page_views: crm.hubspot?.properties?.hs_analytics_num_page_views,
  open_deal: crm.openDeal,
  campaign_history: crm.campaignHistory?.slice(0, 5),
  owner_assigned: crm.ownerAssigned,
  notes: crm.hubspot?.notes,
}, null, 2)}

## Clay enrichment
${JSON.stringify({
  intent_score: clay.intentScore,
  intent_signals: clay.intentSignals,
  email_type: clay.emailType,
  company_type: clay.companyType,
}, null, 2)}

## Historical similar leads — what worked
${similarLeadsContext}

## Context by routing decision
${lead.routing_decision === "sales_queue" ? `
**SALES QUEUE**: This is a hot lead. A sales rep will receive a notification. Your recommendations should:
1. Give the rep specific talking points based on this person's exact title, company, and signals.
2. Suggest an outreach message (email or LinkedIn) tailored to their background.
3. If there's divergence, explain what the LLM saw that made this person stand out.
4. Recommend an immediate next action (book a demo, send a technical resource, etc.)
` : lead.routing_decision === "nurture" ? `
**MARKETING NURTURE**: This lead is not yet ready for sales. Your recommendations should:
1. Identify which nurture track fits best (MLOps, infrastructure, cost-savings, etc.) based on signals.
2. Recommend specific HubSpot email sequences or campaigns proven to work for similar leads.
3. Suggest engagement content (whitepaper, benchmark, webinar) most relevant to their role and industry.
4. Define a re-evaluation trigger (intent score threshold, page views, or campaign click) to hand off to sales.
` : lead.routing_decision === "human_review" ? `
**HUMAN REVIEW QUEUE**: There is uncertainty about this lead (divergence, EU consent, or edge case). Your recommendations should:
1. Summarise the key uncertainty and what the reviewer needs to decide.
2. Provide a SALES path (if reviewer decides the lead is hot): specific outreach suggestions.
3. Provide a NURTURE path (if reviewer decides the lead needs more time): nurture track recommendations.
4. Recommend what additional information or verification step would resolve the uncertainty.
` : `
**OTHER ROUTING (${lead.routing_decision})**: Provide appropriate follow-up recommendations.
`}

Produce a JSON response with the schema provided. Be specific — use the person's actual title, company, industry, and signals in your talking points and suggested content. Reference what worked for similar historical leads.`;
}

function buildSimilarLeadsContext(lead: LeadRow): string {
  const sanitized = lead.sanitized_json ? JSON.parse(lead.sanitized_json) : {};
  const clay = lead.clay_json ? JSON.parse(lead.clay_json) : {};

  const profile = {
    title_type: inferTitleType(sanitized.job_title || null),
    industry: sanitized.industry || undefined,
    company_size: sanitized.company_size || undefined,
    deterministic_tier: lead.deterministic_tier || undefined,
    routing_decision: lead.routing_decision || undefined,
    intent_score: clay.intentScore ?? undefined,
  };

  const similar = findSimilarLeads(profile, 15);
  const successfulTreatments = extractSuccessfulTreatments(similar);

  const conversionRate = similar.filter((l) => l.outcome === "converted").length / similar.length;
  const avgDaysToConvert = similar
    .filter((l) => l.outcome === "converted" && l.days_to_outcome)
    .reduce((sum, l, _, arr) => sum + (l.days_to_outcome! / arr.length), 0);

  const lines = [
    `Found ${similar.length} similar historical leads (same tier/routing/title/industry):`,
    `- Conversion rate: ${(conversionRate * 100).toFixed(0)}%`,
    `- Avg days to convert (for converters): ${avgDaysToConvert.toFixed(0)} days`,
    ``,
    `Outcome breakdown: ${JSON.stringify(
      similar.reduce((acc, l) => { acc[l.outcome] = (acc[l.outcome] || 0) + 1; return acc; }, {} as Record<string, number>)
    )}`,
  ];

  if (successfulTreatments.length > 0) {
    lines.push(``, `Top treatments that preceded conversion (by conversion rate):`);
    for (const t of successfulTreatments) {
      lines.push(`- "${t.treatment}" (${t.type}): ${(t.conversion_rate * 100).toFixed(0)}% conversion, ~${t.avg_days_to_convert} days, n=${t.sample_count}`);
    }
  }

  const converterExamples = similar.filter((l) => l.outcome === "converted").slice(0, 3);
  if (converterExamples.length > 0) {
    lines.push(``, `Example converted leads (anonymised):`);
    for (const ex of converterExamples) {
      lines.push(`- ${ex.title_type} at ${ex.company_size}-person ${ex.industry} company, intent=${ex.initial_intent_score}: converted in ${ex.days_to_outcome ?? "?"} days (ARPA $${(ex.arpa_on_conversion ?? 0).toLocaleString()}). Key: ${ex.notes}`);
    }
  }

  return lines.join("\n");
}

async function generateFollowupForLead(lead: LeadRow): Promise<FollowupOutput> {
  const similarContext = buildSimilarLeadsContext(lead);
  const prompt = buildFollowupPrompt(lead, similarContext);
  return generateWithFallback({ schema: FollowupOutputSchema, prompt });
}

function hasValidFollowup(lead: LeadRow): boolean {
  if (!lead.followup_json) return false;
  try {
    const parsed = JSON.parse(lead.followup_json);
    return !parsed.error;
  } catch {
    return false;
  }
}

export async function runFollowupStage(runId: string): Promise<{ processed: number; remaining: number }> {
  const routeStage = await getStage(runId, "route");
  if (routeStage?.status !== "completed") {
    throw new Error("Routing stage must be completed before generating follow-up recommendations.");
  }

  await setStageStatus(runId, "followup", "running");

  try {
    const allLeads = await getLeads(runId);
    const eligibleLeads = allLeads
      .filter(
        (l) =>
          l.is_duplicate_primary === 1 &&
          l.routing_decision &&
          l.routing_decision !== "suppressed" &&
          l.routing_decision !== "self_serve_newsletter",
      )
      .sort((a, b) => {
        const ap = PRIORITY_ORDER[a.routing_decision!] ?? 99;
        const bp = PRIORITY_ORDER[b.routing_decision!] ?? 99;
        return ap - bp;
      });

    const remaining = eligibleLeads.filter((l) => !hasValidFollowup(l));
    const batchLimit = parseInt(process.env.FOLLOWUP_BATCH_LIMIT || "50", 10);
    const batch = remaining.slice(0, batchLimit);

    if (batch.length === 0) {
      await setStageStatus(runId, "followup", "completed");
      return { processed: 0, remaining: 0 };
    }

    const updates: Array<{ lead_id: string; followup_json: string }> = [];
    let processed = 0;
    let failed = 0;

    const BATCH_SIZE = 5;
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk = batch.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(chunk.map((l) => generateFollowupForLead(l)));

      for (let j = 0; j < results.length; j++) {
        const lead = chunk[j];
        const result = results[j];
        if (result.status === "fulfilled") {
          updates.push({ lead_id: lead.lead_id, followup_json: JSON.stringify(result.value) });
          processed++;
        } else {
          updates.push({
            lead_id: lead.lead_id,
            followup_json: JSON.stringify({ error: (result.reason as Error).message }),
          });
          failed++;
        }
      }
    }

    if (updates.length > 0) {
      await upsertLeads(runId, updates);
    }

    const stillRemaining = remaining.length - batch.length;
    await setStageStatus(runId, "followup", "completed");
    await logAction({
      runId,
      stage: "followup",
      action: "followup_recommendations_generated",
      detail: { total_eligible: eligibleLeads.length, processed, failed, still_remaining: stillRemaining },
    });

    return { processed, remaining: stillRemaining };
  } catch (err) {
    await setStageStatus(runId, "followup", "failed", { errorMessage: (err as Error).message });
    throw err;
  }
}
