import { randomUUID } from "node:crypto";

/** Mock HubSpot action execution (v2).
 *  Simulates the HubSpot Engagements + Workflows + Sequences APIs.
 *  Returns realistic response shapes so the UI can display execution confirmation. */

export type ActionType =
  | "create_task"
  | "enroll_in_sequence"
  | "create_deal"
  | "send_email"
  | "create_campaign"
  | "schedule_meeting";

export interface HubSpotActionRequest {
  action_type: ActionType;
  contact_email: string;
  contact_id?: string;
  params: Record<string, unknown>;
}

export interface HubSpotActionResult {
  success: boolean;
  action_type: ActionType;
  object_id: string;
  object_url: string;
  summary: string;
  executed_at: string;
  raw_response: Record<string, unknown>;
}

const BASE_URL = "https://app.hubspot.com/contacts/12345678";

export function executeHubSpotAction(req: HubSpotActionRequest): HubSpotActionResult {
  const id = randomUUID().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();

  switch (req.action_type) {
    case "create_task": {
      const title = (req.params.title as string) || "Follow up with lead";
      const assignee = (req.params.assignee as string) || "unassigned";
      const dueDate = (req.params.due_date as string) || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      return {
        success: true,
        action_type: "create_task",
        object_id: `TASK-${id}`,
        object_url: `${BASE_URL}/tasks/${id}`,
        summary: `Task created: "${title}" assigned to ${assignee}, due ${dueDate}`,
        executed_at: now,
        raw_response: {
          id,
          properties: {
            hs_task_subject: title,
            hs_task_status: "NOT_STARTED",
            hs_task_priority: req.params.priority || "MEDIUM",
            hubspot_owner_id: req.params.assignee_id || "owner_ae1",
            hs_timestamp: dueDate,
          },
          associations: [{ to: { id: req.contact_id || `HS${id}` }, types: [{ category: "HUBSPOT_DEFINED", typeId: 204 }] }],
        },
      };
    }

    case "enroll_in_sequence": {
      const seqName = (req.params.sequence_name as string) || "Nurture Sequence";
      const seqId = (req.params.sequence_id as string) || `SEQ-${id}`;
      return {
        success: true,
        action_type: "enroll_in_sequence",
        object_id: `ENROLLMENT-${id}`,
        object_url: `${BASE_URL}/sequences/${seqId}/enrollments`,
        summary: `${req.contact_email} enrolled in "${seqName}"`,
        executed_at: now,
        raw_response: {
          id,
          sequenceId: seqId,
          contactId: req.contact_id || `HS${id}`,
          status: "ACTIVE",
          enrolledAt: now,
          currentStepOrder: 1,
        },
      };
    }

    case "create_deal": {
      const dealName = (req.params.deal_name as string) || `${req.contact_email} – GPU Cloud`;
      const amount = (req.params.amount as number) || null;
      const stage = (req.params.deal_stage as string) || "appointmentscheduled";
      const pipeline = (req.params.pipeline as string) || "default";
      return {
        success: true,
        action_type: "create_deal",
        object_id: `DEAL-${id}`,
        object_url: `${BASE_URL}/deals/${id}`,
        summary: `Deal "${dealName}" created in pipeline "${pipeline}", stage: ${stage}${amount ? `, amount: $${amount.toLocaleString()}` : ""}`,
        executed_at: now,
        raw_response: {
          id,
          properties: {
            dealname: dealName,
            amount: amount?.toString() ?? null,
            dealstage: stage,
            pipeline,
            hubspot_owner_id: req.params.owner_id || "owner_ae1",
            createdate: now,
          },
          associations: [{ to: { id: req.contact_id || `HS${id}` }, types: [{ category: "HUBSPOT_DEFINED", typeId: 3 }] }],
        },
      };
    }

    case "send_email": {
      const subject = (req.params.subject as string) || "Following up";
      const template = (req.params.template as string) || "generic_outreach";
      return {
        success: true,
        action_type: "send_email",
        object_id: `EMAIL-${id}`,
        object_url: `${BASE_URL}/email/tracking/${id}`,
        summary: `Email queued: "${subject}" → ${req.contact_email} (template: ${template})`,
        executed_at: now,
        raw_response: {
          id,
          status: "SCHEDULED",
          to: req.contact_email,
          subject,
          templateId: template,
          scheduledAt: now,
        },
      };
    }

    case "create_campaign": {
      const name = (req.params.campaign_name as string) || "Nurture Campaign";
      const type = (req.params.campaign_type as string) || "email";
      return {
        success: true,
        action_type: "create_campaign",
        object_id: `CAMP-${id}`,
        object_url: `${BASE_URL}/campaigns/${id}`,
        summary: `Campaign "${name}" (${type}) created and contact added`,
        executed_at: now,
        raw_response: {
          id,
          name,
          type,
          status: "DRAFT",
          createdAt: now,
          enrolledContacts: [req.contact_email],
        },
      };
    }

    case "schedule_meeting": {
      const title = (req.params.meeting_title as string) || "Discovery Call";
      const date = (req.params.proposed_date as string) || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      return {
        success: true,
        action_type: "schedule_meeting",
        object_id: `MTG-${id}`,
        object_url: `${BASE_URL}/meetings/${id}`,
        summary: `Meeting link sent: "${title}" proposed for ${date}`,
        executed_at: now,
        raw_response: {
          id,
          title,
          proposedDate: date,
          meetingLink: `https://meetings.hubspot.com/acme/${id}`,
          status: "INVITE_SENT",
          contactEmail: req.contact_email,
        },
      };
    }

    default:
      return {
        success: false,
        action_type: req.action_type,
        object_id: "",
        object_url: "",
        summary: `Unknown action type: ${req.action_type}`,
        executed_at: now,
        raw_response: { error: "unknown_action" },
      };
  }
}
