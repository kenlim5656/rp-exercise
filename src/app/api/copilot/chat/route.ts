import { NextRequest, NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { buildCopilotTools } from "@/lib/copilot/tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are the RP lead-pipeline copilot. You answer marketing-ops users' questions about a
specific pipeline run: lead scoring (deterministic tier + LLM probabilistic score + how they were reconciled),
cohort assignment, CRM/enrichment status, routing decisions, the human-review queue, and audit history. Always
use your tools to look up real data rather than guessing -- if you're not sure, search or look the lead up.
Be concise and specific (cite lead_ids, tiers, scores). If asked about something outside this run's data, say so.`;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { runId?: string; messages?: ChatMessage[] };
  if (!body.runId || !body.messages?.length) {
    return NextResponse.json({ error: "runId and messages are required" }, { status: 400 });
  }

  const modelId = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const result = await generateText({
      model: google(modelId),
      system: SYSTEM_PROMPT,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: buildCopilotTools(body.runId),
      stopWhen: stepCountIs(4),
    });
    return NextResponse.json({ reply: result.text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
