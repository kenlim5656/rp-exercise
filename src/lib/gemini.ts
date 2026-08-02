import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { z } from "zod";

function primaryModel() {
  const modelId = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return google(modelId);
}

function backupModel() {
  const modelId = process.env.KIMI_MODEL || "moonshot-v1-32k";
  const kimi = createOpenAI({
    baseURL: "https://api.moonshot.cn/v1",
    apiKey: process.env.KIMI_API_KEY,
  });
  return kimi(modelId);
}

function isQuotaError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("credits") ||
    msg.includes("billing")
  );
}

/** generateObject with automatic Kimi fallback on Gemini quota errors. */
export async function generateWithFallback<T>(opts: {
  schema: z.ZodType<T>;
  prompt: string;
}): Promise<T> {
  try {
    const { object } = await generateObject({
      model: primaryModel(),
      schema: opts.schema,
      prompt: opts.prompt,
    });
    return object;
  } catch (primary) {
    if (isQuotaError(primary) && process.env.KIMI_API_KEY) {
      console.warn("[gemini] quota error — retrying with Kimi backup:", (primary as Error).message);
      const { object } = await generateObject({
        model: backupModel(),
        schema: opts.schema,
        prompt: opts.prompt,
      });
      return object;
    }
    throw primary;
  }
}
