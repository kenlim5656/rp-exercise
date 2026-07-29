import { tool } from "ai";
import { z } from "zod";
import { getLead, getLeads, getRun, getStages } from "../runs";
import { listAuditLog } from "../audit";

/**
 * Copilot tools (spec 9.1), scoped to one run via closure. The model only
 * ever sees real run data through these tool results -- grounded answers,
 * not hallucinated ones. PII (email/name/company) is fine to return here
 * since it reaches the model server-side within a tool result, never a
 * client-side DB connection.
 */
export function buildCopilotTools(runId: string) {
  return {
    getRunSummary: tool({
      description: "Get the overall status of the current run: stage progress, row counts, cohort split, and routing counts.",
      inputSchema: z.object({}),
      execute: async () => {
        const run = await getRun(runId);
        const stages = await getStages(runId);
        const leads = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
        const routing: Record<string, number> = {};
        let needsReview = 0;
        let existing = 0;
        let newCohort = 0;
        for (const l of leads) {
          if (l.routing_decision) routing[l.routing_decision] = (routing[l.routing_decision] ?? 0) + 1;
          if (l.needs_review) needsReview++;
          if (l.cohort === "existing") existing++;
          if (l.cohort === "new") newCohort++;
        }
        return { run, stages, total_primary_leads: leads.length, cohorts: { existing, new: newCohort }, routing, needs_review: needsReview };
      },
    }),

    getLeadById: tool({
      description: "Look up one lead's full record by lead_id: sanitized fields, Clay enrichment, CRM status, scores, and routing decision.",
      inputSchema: z.object({ leadId: z.string() }),
      execute: async ({ leadId }) => {
        const lead = await getLead(runId, leadId);
        if (!lead) return { error: `lead ${leadId} not found in this run` };
        return {
          ...lead,
          sanitized: lead.sanitized_json ? JSON.parse(lead.sanitized_json) : null,
          clay: lead.clay_json ? JSON.parse(lead.clay_json) : null,
          crm: lead.crm_json ? JSON.parse(lead.crm_json) : null,
          deterministic_reasons: lead.deterministic_reasons_json ? JSON.parse(lead.deterministic_reasons_json) : [],
          review_reasons: lead.review_reasons_json ? JSON.parse(lead.review_reasons_json) : [],
        };
      },
    }),

    searchLeads: tool({
      description: "Search/filter leads in this run by tier, cohort, review status, or routing decision. Returns a summarized list (not full records) -- use getLeadById for details on a specific lead.",
      inputSchema: z.object({
        tier: z.enum(["tier1", "tier2", "tier3", "suppress"]).optional(),
        cohort: z.enum(["existing", "new"]).optional(),
        needsReview: z.boolean().optional(),
        routingDecision: z.enum(["sales_queue", "nurture", "self_serve_newsletter", "suppressed", "human_review"]).optional(),
        limit: z.number().min(1).max(200).default(50),
      }),
      execute: async ({ tier, cohort, needsReview, routingDecision, limit }) => {
        let leads = (await getLeads(runId)).filter((l) => l.is_duplicate_primary === 1);
        if (tier) leads = leads.filter((l) => l.deterministic_tier === tier || l.final_tier === tier);
        if (cohort) leads = leads.filter((l) => l.cohort === cohort);
        if (needsReview !== undefined) leads = leads.filter((l) => !!l.needs_review === needsReview);
        if (routingDecision) leads = leads.filter((l) => l.routing_decision === routingDecision);
        return {
          total_matching: leads.length,
          leads: leads.slice(0, limit).map((l) => ({
            lead_id: l.lead_id,
            cohort: l.cohort,
            deterministic_tier: l.deterministic_tier,
            llm_score: l.llm_score,
            routing_decision: l.routing_decision,
            needs_review: !!l.needs_review,
          })),
        };
      },
    }),

    getAuditTrail: tool({
      description: "Get recent audit-log entries for this run (PII-free actions/counts with timestamps).",
      inputSchema: z.object({ limit: z.number().min(1).max(100).default(20) }),
      execute: async ({ limit }) => {
        const rows = (await listAuditLog(runId)).slice(0, limit);
        return rows.map((r) => ({ stage: r.stage, action: r.action, entity_ref: r.entity_ref, detail: JSON.parse(r.detail_json), created_at: r.created_at }));
      },
    }),
  };
}
