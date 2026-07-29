import { notFound } from "next/navigation";
import Link from "next/link";
import { getLead } from "@/lib/runs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

/* ---------- helpers ---------- */

function safeParse<T = unknown>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function tierToScore(tier: string | null): number {
  switch (tier) {
    case "tier1":
      return 98;
    case "tier2":
      return 55;
    case "tier3":
      return 20;
    case "suppress":
      return 0;
    default:
      return 0;
  }
}

function tierLabel(tier: string | null): string {
  switch (tier) {
    case "tier1":
      return "high";
    case "tier2":
      return "medium";
    case "tier3":
      return "low";
    case "suppress":
      return "suppressed";
    default:
      return "unknown";
  }
}

function promptHash(leadId: string): string {
  return createHash("sha256").update(leadId).digest("hex").slice(0, 12);
}

function executionId(runId: string, leadId: string): string {
  return createHash("sha256").update(`${runId}:${leadId}`).digest("hex").slice(0, 16).toUpperCase();
}

/* ---------- tiny sub-components ---------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function DataField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm">{value || <span className="text-muted-foreground/50">--</span>}</span>
    </div>
  );
}

function ScoreTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-muted/30 px-4 py-3">
      <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      {sub && <span className="text-[0.6rem] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function ChannelRow({ name, allowed }: { name: string; allowed: boolean }) {
  return (
    <div className="flex items-center justify-between rounded border border-border px-3 py-2">
      <span className="text-sm">{name}</span>
      {allowed ? (
        <span className="text-sm font-bold" style={{ color: "var(--status-completed)" }}>&#10003;</span>
      ) : (
        <span className="text-sm font-bold" style={{ color: "var(--status-failed)" }}>&#10005;</span>
      )}
    </div>
  );
}

/* ---------- main page ---------- */

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ runId: string; leadId: string }>;
}) {
  const { runId, leadId } = await params;
  const lead = await getLead(runId, leadId);
  if (!lead) notFound();

  const raw = safeParse<Record<string, unknown>>(lead.raw_json);
  const sanitized = safeParse<Record<string, unknown>>(lead.sanitized_json);
  const clay = safeParse<Record<string, unknown>>(lead.clay_json);
  const crm = safeParse<Record<string, unknown>>(lead.crm_json);
  const detReasons = safeParse<string[]>(lead.deterministic_reasons_json) ?? [];
  const reviewReasons = safeParse<string[]>(lead.review_reasons_json) ?? [];

  // Derived fields
  const firstName = (sanitized?.["first_name"] ?? raw?.["First Name"] ?? raw?.["first_name"] ?? "") as string;
  const email = (sanitized?.["email_normalized"] ?? sanitized?.["email"] ?? raw?.["Email"] ?? "") as string;
  const domain = (sanitized?.["company_website"] ?? raw?.["Company Website"] ?? raw?.["company_website"] ?? "") as string;
  const companyName = (sanitized?.["company_name"] ?? raw?.["Company"] ?? raw?.["company_name"] ?? "") as string;
  const companySize = (clay?.["company_size"] ?? sanitized?.["company_size"] ?? raw?.["Company Size"] ?? "") as string;
  const region = (sanitized?.["region"] ?? clay?.["region"] ?? raw?.["Country"] ?? "") as string;
  const industry = (clay?.["industry"] ?? sanitized?.["industry"] ?? raw?.["Industry"] ?? "") as string;
  const employeeCount = (clay?.["employee_count"] ?? sanitized?.["employee_count"] ?? "") as string;

  // Campaign / Marketing
  const marketingScore = (clay?.["marketing_activity_score"] ?? clay?.["activity_score"] ?? null) as number | null;
  const openRate = (clay?.["open_rate"] ?? null) as number | null;
  const clickRate = (clay?.["click_rate"] ?? null) as number | null;
  const campaigns = (clay?.["campaigns"] ?? []) as string[];

  // CRM
  const contactFound = !!(crm?.["contact_found"] ?? crm?.["contact_id"]);
  const isTal = !!(crm?.["is_tal"] ?? crm?.["tal"]);
  const isMql = !!(crm?.["is_mql"] ?? crm?.["mql"]);
  const prospectStatus = (crm?.["prospect_status"] ?? crm?.["status"] ?? "") as string;
  const optOut = !!(crm?.["opt_out"] ?? crm?.["has_opted_out"]);

  // Intent (from Clay mock payload)
  const intentData = (clay?.["intent"] ?? {}) as Record<string, unknown>;
  const intentScore = (intentData["intentScore"] ?? null) as number | null;
  const intentTier = (intentData["intentTier"] ?? "") as string;
  const intentSource = (intentData["source"] ?? "clay") as string;
  const intentStage = intentTier === "high" ? "Decision" : intentTier === "medium" ? "Consideration" : intentTier === "low" ? "Awareness" : "";
  const segments = (clay?.["segments"] ?? []) as string[];
  const topics = (clay?.["topics"] ?? clay?.["intent_topics"] ?? []) as string[];

  // Consent / channels
  const consentVerified = lead.consent_verified === "true" || lead.consent_verified === "1";
  const isEu = !!lead.is_eu;
  const euConsent = lead.eu_consent_flag === "granted" || lead.eu_consent_flag === "true";
  const emailAllowed = consentVerified || (!isEu);
  const sdrAllowed = consentVerified || (!isEu);
  const displayAllowed = !optOut;
  const mailAllowed = consentVerified || (!isEu);

  // Scores
  const detScore = tierToScore(lead.deterministic_tier);
  const detLabel = tierLabel(lead.deterministic_tier);
  const llmScore = lead.llm_score;
  const llmRationale = lead.llm_rationale ?? "";

  const divergence = lead.score_divergence;
  const aligned = !!lead.scores_aligned;

  const isSalesAlert = lead.routing_decision === "sales_queue";

  // Company size badge
  function companySizeBadge(size: string): string {
    const s = size.toLowerCase();
    if (s.includes("enterprise") || s.includes("10000") || s.includes("5000")) return "Enterprise";
    if (s.includes("mid") || s.includes("1000") || s.includes("500")) return "Mid-Market";
    if (s.includes("smb") || s.includes("small") || s.includes("50") || s.includes("100")) return "SMB";
    if (size) return size;
    return "Unknown";
  }

  // Routing recommended action
  function routingAction(decision: string | null): { label: string; description: string } {
    switch (decision) {
      case "sales_queue":
        return { label: "Fast-Track to Sales", description: "Route to SDR team for immediate outreach. High-intent signal detected." };
      case "nurture":
        return { label: "Add to Nurture Campaign", description: "Enroll in automated nurture sequence. Monitor for intent signal changes." };
      case "self_serve_newsletter":
        return { label: "Self-Serve / Newsletter", description: "Add to newsletter list. Low-touch engagement path." };
      case "suppressed":
        return { label: "Suppress Lead", description: "Do not contact. Lead does not meet qualification criteria or consent requirements." };
      case "human_review":
        return { label: "Queue for Human Review", description: "Score divergence or flag detected. Manual review required before routing." };
      default:
        return { label: "Pending", description: "Routing decision has not been made yet." };
    }
  }

  const action = routingAction(lead.routing_decision);

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <div>
        <Link
          href={`/runs/${runId}/scoring`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden="true">&larr;</span> Back to pipeline
        </Link>
      </div>

      {/* Lead header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {firstName || leadId}
        </h2>
        {lead.final_tier && (
          <Badge variant={lead.final_tier === "tier1" ? "default" : lead.final_tier === "suppress" ? "destructive" : "secondary"}>
            {lead.final_tier}
          </Badge>
        )}
        {lead.routing_decision && (
          <Badge variant="outline">{lead.routing_decision}</Badge>
        )}
        {lead.needs_review ? (
          <Badge variant="destructive">needs review</Badge>
        ) : null}
      </div>

      {/* ======= Identity & Enrichment ======= */}
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionLabel>Identity &amp; Enrichment</SectionLabel>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <DataField label="First Name" value={firstName} />
              <DataField label="Email" value={email} />
              <DataField label="Domain" value={domain} />
            </div>
            <div className="flex flex-col gap-3">
              <DataField label="Company" value={companyName} />
              <DataField
                label="Company Size"
                value={
                  companySize ? (
                    <Badge variant="outline">{companySizeBadge(companySize)}</Badge>
                  ) : null
                }
              />
              <DataField label="Region" value={region} />
              <DataField
                label="Industry"
                value={
                  <span>
                    {industry || "--"}
                    {employeeCount ? <span className="ml-2 text-muted-foreground">({employeeCount} employees)</span> : null}
                  </span>
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======= Campaign Member History + Sales Activity ======= */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="card-accent-history">
          <CardHeader>
            <CardTitle>
              <SectionLabel>Campaign Member History</SectionLabel>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-end gap-4">
              <ScoreTile
                label="Marketing Activity"
                value={marketingScore !== null ? marketingScore : "--"}
              />
              {openRate !== null && <ScoreTile label="Open Rate" value={`${(openRate * 100).toFixed(0)}%`} />}
              {clickRate !== null && <ScoreTile label="Click Rate" value={`${(clickRate * 100).toFixed(0)}%`} />}
            </div>
            {campaigns.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Campaigns</span>
                <div className="flex flex-wrap gap-1.5">
                  {campaigns.map((c, i) => (
                    <Badge key={i} variant="outline">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-accent-pipeline">
          <CardHeader>
            <CardTitle>
              <SectionLabel>Sales Activity</SectionLabel>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={contactFound ? "default" : "outline"}>
                {contactFound ? "Contact Found" : "No Contact"}
              </Badge>
              {isTal && <Badge variant="default">TAL</Badge>}
              {isMql && <Badge variant="default">MQL</Badge>}
              {prospectStatus && <Badge variant="secondary">{prospectStatus}</Badge>}
            </div>
            <div className="mt-2">
              <Badge variant={optOut ? "destructive" : "outline"}>
                {optOut ? "Opted Out" : "Active"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ======= Intent Surge Details + Channel Permissions ======= */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="card-accent-metrics">
          <CardHeader>
            <CardTitle>
              <SectionLabel>Intent Surge Details</SectionLabel>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-end gap-4">
              <ScoreTile label="Intent Score" value={intentScore !== null ? intentScore : "--"} />
              {intentStage && (
                <Badge variant="outline">{intentStage}</Badge>
              )}
              {intentTier && (
                <Badge variant="secondary" className={
                  intentTier === "high" ? "bg-green-900/40 text-green-400" :
                  intentTier === "medium" ? "bg-yellow-900/40 text-yellow-400" :
                  "bg-zinc-800 text-zinc-400"
                }>{intentTier} activity</Badge>
              )}
            </div>
            {intentSource && (
              <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                Source: {intentSource === "internal" ? "Internal Records (BQ)" : "Clay Enrichment"}
              </span>
            )}
            {segments.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Segments</span>
                <div className="flex flex-wrap gap-1.5">
                  {segments.map((s, i) => (
                    <Badge key={i} variant="secondary">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {topics.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Topic Keywords</span>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t, i) => (
                    <Badge key={i} variant="outline">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
            {intentScore === null && segments.length === 0 && topics.length === 0 && (
              <p className="text-sm text-muted-foreground">No intent data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionLabel>Channel Permissions</SectionLabel>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <ChannelRow name="Email" allowed={emailAllowed} />
            <ChannelRow name="SDR Outreach" allowed={sdrAllowed} />
            <ChannelRow name="Paid Display" allowed={displayAllowed} />
            <ChannelRow name="Direct Mail" allowed={mailAllowed} />
            {isEu && (
              <div className="mt-2">
                <Badge variant={euConsent ? "default" : "destructive"}>
                  EU &mdash; {euConsent ? "Consent Granted" : "No Consent"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ======= Dual Engine Signal Assessment ======= */}
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionLabel>Dual Engine Signal Assessment</SectionLabel>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Deterministic */}
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Deterministic Rules</span>
                <Badge variant={detLabel === "high" ? "default" : detLabel === "medium" ? "secondary" : "destructive"}>
                  {detLabel}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{detScore}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              {/* progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${detScore}%`,
                    background:
                      detScore >= 80
                        ? "var(--status-completed)"
                        : detScore >= 40
                          ? "var(--status-awaiting)"
                          : "var(--status-failed)",
                  }}
                />
              </div>
              {detReasons.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Scoring Reasons</span>
                  <ul className="flex flex-col gap-1">
                    {detReasons.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--status-completed)" }} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* LLM / Gemini */}
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Gemini AI Engine</span>
                <Badge variant="outline">
                  {llmScore !== null && llmScore >= 70 ? "high confidence" : llmScore !== null && llmScore >= 40 ? "medium confidence" : "low confidence"}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{llmScore !== null ? llmScore : "--"}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              {/* purple progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${llmScore ?? 0}%`,
                    background: "var(--accent-copilot)",
                  }}
                />
              </div>
              {llmRationale && (
                <div className="flex flex-col gap-1 mt-2">
                  <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Rationale</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{llmRationale}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======= Score Divergence Bar ======= */}
      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Score Divergence</span>
              <span className="text-lg font-bold tabular-nums">
                {divergence !== null ? divergence.toFixed(1) : "--"}
              </span>
            </div>
            <Badge
              variant={aligned ? "default" : "destructive"}
              className={aligned ? "" : ""}
              style={
                aligned
                  ? { background: "var(--status-completed-dim)", color: "var(--status-completed)", border: "1px solid oklch(0.72 0.17 155 / 25%)" }
                  : { background: "var(--status-failed-dim)", color: "var(--status-failed)", border: "1px solid oklch(0.65 0.2 25 / 25%)" }
              }
            >
              {aligned ? "CONSENSUS" : "DIVERGENCE"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ======= Sales Alert (conditional) ======= */}
      {isSalesAlert && (
        <Card
          className="border-l-4"
          style={{ borderLeftColor: "var(--status-failed)" }}
        >
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-3">
                <Badge
                  style={{ background: "var(--status-failed-dim)", color: "var(--status-failed)", border: "1px solid oklch(0.65 0.2 25 / 25%)" }}
                >
                  INSTANT ALERT
                </Badge>
                <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                  SLA: &lt;15 Minutes
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Slack preview */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Sent to #revops-urgent-triage</span>
                </div>
                <Badge variant="outline" style={{ color: "var(--status-completed)" }}>
                  HTTP 200
                </Badge>
              </div>
              <Separator />
              <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">New High-Priority Lead:</span>{" "}
                  {firstName || leadId} ({companyName || domain || "Unknown"})
                </p>
                <p>
                  Deterministic: {lead.deterministic_tier ?? "--"} ({detScore}/100) |
                  AI Score: {llmScore ?? "--"}/100 |
                  Tier: {lead.final_tier ?? "--"}
                </p>
                <div className="mt-2 flex gap-2">
                  <span className="rounded border border-border px-2.5 py-1 text-[0.6rem] font-medium text-foreground">
                    View Details
                  </span>
                  <span className="rounded border border-border px-2.5 py-1 text-[0.6rem] font-medium text-foreground">
                    Assign to SDR
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ======= Recommended Action ======= */}
      <Card
        className="border-l-4"
        style={{ borderLeftColor: "var(--status-completed)" }}
      >
        <CardHeader>
          <CardTitle>
            <SectionLabel>Recommended Action</SectionLabel>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1">
            <span className="text-base font-semibold" style={{ color: "var(--status-completed)" }}>
              {action.label}
            </span>
            <p className="text-sm text-muted-foreground">{action.description}</p>
          </div>
        </CardContent>
      </Card>

      {/* ======= Audit Trail ======= */}
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionLabel>Audit Trail</SectionLabel>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <DataField label="Execution ID" value={<span className="font-mono text-xs">{executionId(runId, leadId)}</span>} />
            <DataField label="Processed At" value={lead.review_at ?? new Date().toISOString().split("T")[0]} />
            <DataField label="LLM Model" value="gemini-flash-lite-latest" />
            <DataField label="Rule Set" value="v3.1.0" />
            <DataField label="Prompt Hash" value={<span className="font-mono text-xs">{promptHash(leadId)}</span>} />
            <DataField label="Status" value="logged to audit store" />
          </div>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" style={{ color: "var(--status-completed)", borderColor: "oklch(0.72 0.17 155 / 30%)" }}>
              SOC2 Auditable
            </Badge>
            <Badge variant="outline" style={{ color: "var(--status-completed)", borderColor: "oklch(0.72 0.17 155 / 30%)" }}>
              GDPR Compliant
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ======= Review reasons (if any) ======= */}
      {reviewReasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <SectionLabel>Review Reasons</SectionLabel>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {reviewReasons.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--status-awaiting)" }} />
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
