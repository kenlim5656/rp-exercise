import { NextResponse } from "next/server";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { MockGoogleBqmlProvider } from "@/lib/propensity/providers/mock_google_bqml";
import type { AccountPropensityRecord } from "@/lib/propensity/types";

const RecordSchema = z.object({
  accountId: z.string().min(1),
  domain: z.string().min(1),
  propensityScore: z.number().min(0).max(1),
  propensityPercentile: z.number().int().min(0).max(100),
  predictedAcv: z.number().int().min(0),
  nextLikelyPurchase: z.string().min(1),
  purchaseDrivers: z.array(z.string()),
  modelSource: z.string().min(1),
  modelVersion: z.string().min(1),
  lastUpdatedAt: z.string().optional(),
});

const PayloadSchema = z.object({
  source: z.string().min(1),
  records: z.array(RecordSchema).min(1).max(5000),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = PayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { source, records } = parsed.data;

    const enriched: AccountPropensityRecord[] = records.map((r) => ({
      ...r,
      lastUpdatedAt: r.lastUpdatedAt || new Date().toISOString(),
    }));

    const provider = new MockGoogleBqmlProvider();
    const result = await provider.batchUpsertPropensityData(enriched);

    await logAction({
      runId: "system",
      stage: "enrich",
      action: "propensity_data_ingested",
      detail: {
        source,
        records_submitted: records.length,
        records_ingested: result.ingested,
      },
    });

    return NextResponse.json({
      success: true,
      source,
      ingested: result.ingested,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Ingestion failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
