import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { CsvRecord } from "../csv";
import type { LeadRow } from "../runs";

const LeadScoreSchema = z.object({
  leadId: z.string(),
  probabilisticScore: z.number().min(0).max(100),
  rationale: z.string(),
  agreesWithDeterministicTier: z.boolean(),
  riskFlags: z.array(z.string()),
});

const BatchScoreSchema = z.object({ scores: z.array(LeadScoreSchema) });

export type LeadScore = z.infer<typeof LeadScoreSchema>;

function model() {
  const modelId = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return google(modelId);
}

export interface LlmScoringContext {
  lead: CsvRecord;
  cohort: string | null;
  claySummary: Record<string, unknown> | null;
  crmSummary: Record<string, unknown> | null;
  deterministicTier: string;
  deterministicReasons: string[];
}

function buildPrompt(batch: LlmScoringContext[]): string {
  const rows = batch.map((c) => ({
    leadId: c.lead.lead_id,
    jobTitle: c.lead.job_title,
    company: c.lead.company,
    companySize: c.lead.company_size,
    industry: c.lead.industry,
    country: c.lead.country,
    emailType: c.lead.email_type,
    cohort: c.cohort,
    clay: c.claySummary,
    crm: c.crmSummary,
    deterministicTier: c.deterministicTier,
    deterministicReasons: c.deterministicReasons,
  }));

  return `You are scoring inbound leads for RP, an AI Developer Cloud selling GPU infrastructure for
training/fine-tuning/serving AI models. For each lead below, produce a probabilistic score from 0-100
estimating how likely this lead is to be a good near-term sales/product-led-growth opportunity, based on
ALL available signals: title seniority and technical relevance, company profile, signup/CRM history,
campaign engagement, and intent/surge signals. Also state whether your score agrees with the
deterministic tier already assigned by a rules engine (tier1=sales queue, tier2=nurture, tier3=self-serve,
suppress=spam/competitor). Disagreement is fine and expected sometimes -- flag it honestly rather than
anchoring to the deterministic tier. List any risk flags you notice (e.g. sparse data, contradictory
signals, likely spam).

Leads (JSON):
${JSON.stringify(rows, null, 2)}

Return one score object per lead, in the same order, using the provided leadId values exactly.`;
}

/** Batched Gemini call (spec 6.2): scores a batch of leads at once to keep
 * latency/cost reasonable across ~1900 rows rather than one call per lead. */
export async function scoreLlmBatch(batch: LlmScoringContext[]): Promise<LeadScore[]> {
  if (batch.length === 0) return [];
  const { object } = await generateObject({
    model: model(),
    schema: BatchScoreSchema,
    prompt: buildPrompt(batch),
  });
  return object.scores;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type { LeadRow };
